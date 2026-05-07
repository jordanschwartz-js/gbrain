import type { BrainEngine } from '../core/engine.ts';
import { embedBatch } from '../core/embedding.ts';
import { getEmbeddingModel } from '../core/ai/gateway.ts';
import type { ChunkInput } from '../core/types.ts';
import { chunkText } from '../core/chunkers/recursive.ts';
import { createProgress } from '../core/progress.ts';
import { getCliOptions, cliOptsToProgressOptions } from '../core/cli-options.ts';

export interface EmbedOpts {
  /** Embed ALL pages (every chunk). */
  all?: boolean;
  /** Embed only stale chunks (missing embedding). */
  stale?: boolean;
  /** Embed specific pages by slug. */
  slugs?: string[];
  /** Embed a single page. */
  slug?: string;
  /** Optional source scope for slug-targeted embedding. */
  sourceId?: string;
  /**
   * Dry run: enumerate what WOULD be embedded (stale chunk counts)
   * without calling the embedding model or writing to the engine.
   * Safe to call with no API key. Used by runCycle's dryRun propagation.
   */
  dryRun?: boolean;
  /**
   * Optional progress callback. Called after each page. CLI wrappers
   * supply a reporter.tick()-backed implementation; Minion handlers
   * supply a job.updateProgress()-backed one so per-job progress lives
   * in the DB where `gbrain jobs get` can read it.
   */
  onProgress?: (done: number, total: number, embedded: number) => void;
}

/**
 * Structured result from a library-level embed run.
 *
 * In dryRun mode, `embedded = 0` and `would_embed` holds the count of
 * stale chunks that WOULD have been sent to the embedding model. In
 * non-dryRun mode, `embedded` holds the real count and `would_embed = 0`.
 * `skipped` counts chunks that already had embeddings (nothing to do).
 */
export interface EmbedResult {
  /** Chunks newly embedded in this run (0 in dryRun). */
  embedded: number;
  /** Chunks with pre-existing embeddings, skipped. */
  skipped: number;
  /** Chunks that would be embedded if not for dryRun (0 in non-dryRun). */
  would_embed: number;
  /** Total chunks considered across all processed pages. */
  total_chunks: number;
  /** Number of pages processed (whether or not they had stale chunks). */
  pages_processed: number;
  /** True if this run was a dry-run. */
  dryRun: boolean;
}

/**
 * Library-level embed. Throws on validation errors; per-page embed failures
 * are logged to stderr but do not throw (matches the existing CLI semantics
 * for batch runs). Safe to call from Minions handlers — no process.exit.
 *
 * Returns EmbedResult with accurate counts so callers (runCycle, sync
 * auto-embed step) can report embeddings in their own structured output.
 */
export async function runEmbedCore(engine: BrainEngine, opts: EmbedOpts): Promise<EmbedResult> {
  const result: EmbedResult = {
    embedded: 0,
    skipped: 0,
    would_embed: 0,
    total_chunks: 0,
    pages_processed: 0,
    dryRun: !!opts.dryRun,
  };

  if (opts.slugs && opts.slugs.length > 0) {
    for (const s of opts.slugs) {
      try {
        await embedPage(engine, s, !!opts.dryRun, result, opts.sourceId);
      } catch (e: unknown) {
        console.error(`  Error embedding ${opts.sourceId ? `${opts.sourceId}:` : ''}${s}: ${e instanceof Error ? e.message : e}`);
      }
    }
    return result;
  }
  if (opts.all || opts.stale) {
    await embedAll(engine, !!opts.stale, !!opts.dryRun, result, opts.onProgress, opts.sourceId);
    return result;
  }
  if (opts.slug) {
    await embedPage(engine, opts.slug, !!opts.dryRun, result, opts.sourceId);
    return result;
  }
  throw new Error('No embed target specified. Pass { slug }, { slugs }, { all }, or { stale }.');
}

export async function runEmbed(engine: BrainEngine, args: string[]): Promise<EmbedResult | undefined> {
  const slugsIdx = args.indexOf('--slugs');
  const all = args.includes('--all');
  const stale = args.includes('--stale');
  const dryRun = args.includes('--dry-run');
  const sourceId = parseFlag(args, '--source');

  let opts: EmbedOpts;
  if (slugsIdx >= 0) {
    opts = { slugs: parseSlugs(args, slugsIdx), dryRun, sourceId };
  } else if (all || stale) {
    opts = { all, stale, dryRun, sourceId };
  } else {
    const slug = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--source');
    if (!slug) {
      console.error('Usage: gbrain embed [<slug>|--all|--stale|--slugs s1 s2 ...] [--source id] [--dry-run]');
      process.exit(1);
    }
    opts = { slug, dryRun, sourceId };
  }

  // CLI path: wire a reporter so --progress-json / --quiet / TTY rendering
  // all work. Minion handlers call runEmbedCore directly with their own
  // onProgress (see jobs.ts).
  const progress = createProgress(cliOptsToProgressOptions(getCliOptions()));
  let progressStarted = false;
  opts.onProgress = (done, total, _embedded) => {
    if (!progressStarted) {
      progress.start('embed.pages', total);
      progressStarted = true;
    }
    progress.tick(1);
  };

  try {
    const result = await runEmbedCore(engine, opts);
    if (progressStarted) progress.finish();
    return result;
  } catch (e) {
    if (progressStarted) progress.finish();
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

export function resolveEmbedConcurrency(model?: string): number {
  const explicit = parsePositiveInt(process.env.GBRAIN_EMBED_CONCURRENCY);
  if (explicit !== null) return explicit;

  const configuredModel = (model ?? safeConfiguredEmbeddingModel() ?? '').toLowerCase();
  if (configuredModel.startsWith('ollama:')) return 1;
  return 20;
}

function safeConfiguredEmbeddingModel(): string | undefined {
  try {
    return getEmbeddingModel();
  } catch {
    return process.env.GBRAIN_EMBEDDING_MODEL;
  }
}

function parsePositiveInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx < 0 || idx + 1 >= args.length || args[idx + 1].startsWith('--')) return undefined;
  return args[idx + 1];
}

function parseSlugs(args: string[], slugsIdx: number): string[] {
  const slugs: string[] = [];
  for (let i = slugsIdx + 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--source') {
      i++;
      continue;
    }
    if (arg.startsWith('--')) continue;
    slugs.push(arg);
  }
  return slugs;
}

async function embedPage(
  engine: BrainEngine,
  slug: string,
  dryRun: boolean,
  result: EmbedResult,
  sourceId?: string,
) {
  const sourceOpts = sourceId ? { sourceId } : undefined;
  const page = await engine.getPage(slug, sourceOpts);
  if (!page) {
    throw new Error(`Page not found: ${sourceId ? `${sourceId}:` : ''}${slug}`);
  }

  // Get existing chunks or create new ones.
  // In dryRun, we still chunk the text locally to count what WOULD be
  // embedded — but we never write chunks or call the embedding model.
  let chunks = await engine.getChunks(slug, sourceOpts);
  if (chunks.length === 0) {
    const inputs: ChunkInput[] = [];
    if (page.compiled_truth.trim()) {
      for (const c of chunkText(page.compiled_truth)) {
        inputs.push({ chunk_index: inputs.length, chunk_text: c.text, chunk_source: 'compiled_truth' });
      }
    }
    if (page.timeline.trim()) {
      for (const c of chunkText(page.timeline)) {
        inputs.push({ chunk_index: inputs.length, chunk_text: c.text, chunk_source: 'timeline' });
      }
    }

    if (dryRun) {
      // Count what chunking WOULD produce, without writing.
      result.total_chunks += inputs.length;
      result.would_embed += inputs.length;
      result.pages_processed++;
      return;
    }

    if (inputs.length > 0) {
      await engine.upsertChunks(slug, inputs, sourceOpts);
      chunks = await engine.getChunks(slug, sourceOpts);
    }
  }

  // Embed chunks without embeddings
  const toEmbed = chunks.filter(c => !c.embedded_at);
  result.total_chunks += chunks.length;
  result.skipped += chunks.length - toEmbed.length;

  if (toEmbed.length === 0) {
    console.log(`${slug}: all ${chunks.length} chunks already embedded`);
    result.pages_processed++;
    return;
  }

  if (dryRun) {
    result.would_embed += toEmbed.length;
    result.pages_processed++;
    return;
  }

  const embeddings = await embedBatch(toEmbed.map(c => c.chunk_text));
  const embeddingMap = new Map<number, Float32Array>();
  for (let j = 0; j < toEmbed.length; j++) {
    embeddingMap.set(toEmbed[j].chunk_index, embeddings[j]);
  }
  const updated: ChunkInput[] = chunks.map(c => chunkToInput(c, embeddingMap.get(c.chunk_index)));

  await engine.upsertChunks(slug, updated, sourceOpts);
  result.embedded += toEmbed.length;
  result.pages_processed++;
  console.log(`${slug}: embedded ${toEmbed.length} chunks`);
}

async function embedAll(
  engine: BrainEngine,
  staleOnly: boolean,
  dryRun: boolean,
  result: EmbedResult,
  onProgress?: (done: number, total: number, embedded: number) => void,
  sourceId?: string,
) {
  // ─────────────────────────────────────────────────────────────
  // Stale-only fast path: avoid the listPages + per-page getChunks
  // bomb that pulled every page row + every chunk's embedding column
  // (~76 MB on a 1.5K-page brain) only to client-side-filter for
  // chunks where embedding IS NULL. The new path issues one SQL
  // pre-check + at most one slug-grouped SELECT excluding the
  // (always-null on stale rows) embedding column. On a 100%-embedded
  // brain (the autopilot common case) we exit after ~50 bytes wire.
  //
  // For --all (staleOnly=false) we keep the original behavior — the
  // user is explicitly asking to re-embed everything, including
  // chunks that already have embeddings.
  // ─────────────────────────────────────────────────────────────
  if (staleOnly) {
    return await embedAllStale(engine, dryRun, result, onProgress, sourceId);
  }

  const pages = await engine.listPages({ limit: 100000, sourceId });
  let processed = 0;

  // Concurrency limit for parallel page embedding.
  // Each worker pulls pages from a shared queue and makes independent
  // embedBatch calls to the configured provider + upsertChunks to the engine.
  //
  // Hosted providers keep the historical default of 20. Local Ollama defaults
  // to one worker so autopilot cannot saturate the local model server.
  // Users can tune via GBRAIN_EMBED_CONCURRENCY when they know their setup.
  const CONCURRENCY = resolveEmbedConcurrency();

  async function embedOnePage(page: typeof pages[number]) {
    const sourceOpts = page.source_id ? { sourceId: page.source_id } : undefined;
    const chunks = await engine.getChunks(page.slug, sourceOpts);
    const toEmbed = chunks; // staleOnly path handled above via embedAllStale

    result.total_chunks += chunks.length;
    result.skipped += chunks.length - toEmbed.length;

    if (toEmbed.length === 0) {
      processed++;
      result.pages_processed++;
      onProgress?.(processed, pages.length, result.embedded);
      return;
    }

    if (dryRun) {
      result.would_embed += toEmbed.length;
      processed++;
      result.pages_processed++;
      onProgress?.(processed, pages.length, result.embedded);
      return;
    }

    try {
      const embeddings = await embedBatch(toEmbed.map(c => c.chunk_text));
      // Build a map of new embeddings by chunk_index
      const embeddingMap = new Map<number, Float32Array>();
      for (let j = 0; j < toEmbed.length; j++) {
        embeddingMap.set(toEmbed[j].chunk_index, embeddings[j]);
      }
      // Preserve ALL chunks, only update embeddings for stale ones
      const updated: ChunkInput[] = chunks.map(c => chunkToInput(c, embeddingMap.get(c.chunk_index)));
      await engine.upsertChunks(page.slug, updated, sourceOpts);
      result.embedded += toEmbed.length;
    } catch (e: unknown) {
      console.error(`\n  Error embedding ${page.slug}: ${e instanceof Error ? e.message : e}`);
    }

    processed++;
    result.pages_processed++;
    onProgress?.(processed, pages.length, result.embedded);
  }

  // Sliding worker pool: N workers share a queue and each pulls the
  // next page as soon as it finishes its current one. This handles
  // uneven per-page workloads (some pages have 1 chunk, others have 50)
  // much better than a fixed-window Promise.all, since fast workers
  // don't wait for slow workers to finish an entire window.
  let nextIdx = 0;
  async function worker() {
    while (nextIdx < pages.length) {
      const idx = nextIdx++;
      await embedOnePage(pages[idx]);
    }
  }

  const numWorkers = Math.min(CONCURRENCY, pages.length);
  await Promise.all(Array.from({ length: numWorkers }, () => worker()));

  // Stdout summary preserved for scripts/tests that grep for counts.
  if (dryRun) {
    console.log(`[dry-run] Would embed ${result.would_embed} chunks across ${pages.length} pages`);
  } else {
    console.log(`Embedded ${result.embedded} chunks across ${pages.length} pages`);
  }
}

/**
 * SQL-side stale path: replaces the listPages + per-page getChunks
 * walk with a count + slug-grouped SELECT. Preserves the existing
 * functional contract (every chunk where embedding IS NULL gets
 * embedded; nothing else is touched) without paying egress on
 * already-embedded chunks.
 *
 * Why a separate function: the staleOnly path doesn't need
 * listPages at all and groups by slug differently. Forking the
 * function makes the read-bytes path explicit and keeps the --all
 * path verbatim from prior behavior.
 *
 * Staleness predicate: `embedding IS NULL`. We deliberately do NOT
 * use `embedded_at IS NULL` here — the bulk-import path can leave
 * embedded_at populated while embedding is NULL (see upsertChunks
 * consistency notes), and `embedding IS NULL` is the truth source
 * for "this chunk needs an embedding".
 */
async function embedAllStale(
  engine: BrainEngine,
  dryRun: boolean,
  result: EmbedResult,
  onProgress?: (done: number, total: number, embedded: number) => void,
  sourceId?: string,
) {
  // Pre-flight: 0 stale chunks → nothing to do, no further DB reads.
  // Cheapest possible exit on the autopilot common case.
  const sourceOpts = sourceId ? { sourceId } : undefined;
  const staleCount = await engine.countStaleChunks(sourceOpts);
  if (staleCount === 0) {
    if (dryRun) {
      console.log('[dry-run] Would embed 0 chunks (0 stale found)');
    } else {
      console.log('Embedded 0 chunks (0 stale found)');
    }
    return;
  }

  // Pull only the stale chunks (no embedding column).
  const staleRows = await engine.listStaleChunks(sourceOpts);
  // Group by source+slug so same-slug pages in different sources do not collide.
  const byPage = new Map<string, typeof staleRows>();
  for (const row of staleRows) {
    const list = byPage.get(stalePageKey(row.source_id, row.slug));
    if (list) list.push(row);
    else byPage.set(stalePageKey(row.source_id, row.slug), [row]);
  }

  const stalePages = Array.from(byPage.values()).map(rows => ({
    sourceId: rows[0].source_id,
    slug: rows[0].slug,
  }));
  const totalStaleChunks = staleRows.length;
  result.total_chunks += totalStaleChunks;
  // skipped is "chunks we considered and skipped due to having an embedding".
  // We never considered the non-stale chunks here, so leave skipped at 0.
  // Callers reading EmbedResult who care about coverage should call
  // engine.getStats() / engine.getHealth() afterward.

  if (dryRun) {
    result.would_embed += totalStaleChunks;
    result.pages_processed += stalePages.length;
    if (onProgress) {
      // Emit a single tick to satisfy the contract (CLI progress reporters
      // expect at least one start/finish pair).
      onProgress(stalePages.length, stalePages.length, 0);
    }
    console.log(`[dry-run] Would embed ${totalStaleChunks} chunks across ${stalePages.length} pages`);
    return;
  }

  const CONCURRENCY = resolveEmbedConcurrency();
  let processed = 0;

  async function embedOnePage(page: { sourceId?: string; slug: string }) {
    const sourceOpts = page.sourceId ? { sourceId: page.sourceId } : undefined;
    const stale = byPage.get(stalePageKey(page.sourceId, page.slug))!;
    try {
      const embeddings = await embedBatch(stale.map(c => c.chunk_text));
      // CRITICAL: passing ONLY the stale indices to upsertChunks would
      // delete every non-stale chunk on the same page (the != ALL filter
      // wipes any chunk_index NOT in the input). To preserve them, we
      // re-fetch existing chunks for this page and merge. Bounded by the
      // stale slug count, not by total slugs — autopilot common case
      // is 0 stale (pre-flight short-circuit, never reaches this path).
      const existing = await engine.getChunks(page.slug, sourceOpts);
      const staleIdxToEmbedding = new Map<number, Float32Array>();
      for (let j = 0; j < stale.length; j++) {
        staleIdxToEmbedding.set(stale[j].chunk_index, embeddings[j]);
      }
      const merged: ChunkInput[] = existing.map(c => chunkToInput(c, staleIdxToEmbedding.get(c.chunk_index)));
      await engine.upsertChunks(page.slug, merged, sourceOpts);
      result.embedded += stale.length;
    } catch (e: unknown) {
      console.error(`\n  Error embedding ${page.sourceId ? `${page.sourceId}:` : ''}${page.slug}: ${e instanceof Error ? e.message : e}`);
    }
    processed++;
    result.pages_processed++;
    onProgress?.(processed, stalePages.length, result.embedded);
  }

  let nextIdx = 0;
  async function worker() {
    while (nextIdx < stalePages.length) {
      const idx = nextIdx++;
      await embedOnePage(stalePages[idx]);
    }
  }

  const numWorkers = Math.min(CONCURRENCY, stalePages.length);
  await Promise.all(Array.from({ length: numWorkers }, () => worker()));

  console.log(`Embedded ${result.embedded} chunks across ${stalePages.length} pages`);
}

function stalePageKey(sourceId: string | undefined, slug: string): string {
  return `${sourceId ?? ''}\0${slug}`;
}

function chunkToInput(
  chunk: Awaited<ReturnType<BrainEngine['getChunks']>>[number],
  embedding?: Float32Array,
): ChunkInput {
  return {
    chunk_index: chunk.chunk_index,
    chunk_text: chunk.chunk_text,
    chunk_source: chunk.chunk_source,
    embedding,
    token_count: chunk.token_count || Math.ceil(chunk.chunk_text.length / 4),
    language: chunk.language ?? undefined,
    symbol_name: chunk.symbol_name ?? undefined,
    symbol_type: chunk.symbol_type ?? undefined,
    start_line: chunk.start_line ?? undefined,
    end_line: chunk.end_line ?? undefined,
    parent_symbol_path: chunk.parent_symbol_path ?? undefined,
    doc_comment: chunk.doc_comment ?? undefined,
    symbol_name_qualified: chunk.symbol_name_qualified ?? undefined,
  };
}
