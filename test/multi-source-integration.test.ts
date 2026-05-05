/**
 * v0.18.0 Step 9 — multi-source integration test against real PGLite.
 *
 * Exercises the full Step-1-through-Step-7 surface:
 *   - migration v16 seeds the default source with federated=true
 *   - migration v17 adds pages.source_id + composite UNIQUE
 *   - migration v18 adds links.resolution_type column
 *   - putPage implicitly targets the default source via the
 *     schema DEFAULT 'default' clause
 *   - raw INSERT can write pages to a non-default source and the
 *     composite UNIQUE allows same-slug pages across sources
 *   - sources CLI add/list/federate operations are reflected in DB
 *   - federated flag distinguishes unqualified-search-visibility
 *
 * PGLite-only (fast + zero deps). Real Postgres parity lives in
 * test/e2e/mechanical.test.ts when DATABASE_URL is set.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { PGLiteEngine } from '../src/core/pglite-engine.ts';
import { runSources } from '../src/commands/sources.ts';
import { runSync } from '../src/commands/sync.ts';
import { resolveSourceId } from '../src/core/source-resolver.ts';
import { importCodeFile } from '../src/core/import-file.ts';
import { scanBrainSources } from '../src/core/brain-writer.ts';

let engine: PGLiteEngine;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({ type: 'pglite' } as never);
  await engine.initSchema();
}, 60_000); // OAuth v25 + full migration chain needs breathing room

afterAll(async () => {
  if (engine) await engine.disconnect();
}, 60_000);

describe('v0.18.0 — sources table seeded with default row on fresh PGLite', () => {
  test("sources('default') exists after initSchema + migration", async () => {
    const rows = await engine.executeRaw<{ id: string; name: string; config: string | Record<string, unknown> }>(
      `SELECT id, name, config FROM sources WHERE id = 'default'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('default');
    const config = typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config;
    expect(config.federated).toBe(true);
  });

  test('pages.source_id column exists with DEFAULT default', async () => {
    const rows = await engine.executeRaw<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns
        WHERE table_name = 'pages' AND column_name = 'source_id'`,
    );
    expect(rows.length).toBe(1);
    // PGLite normalizes the default literal.
    expect(rows[0].column_default).toContain('default');
  });

  test('composite UNIQUE (source_id, slug) is installed', async () => {
    const rows = await engine.executeRaw<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conname = 'pages_source_slug_key'`,
    );
    expect(rows.length).toBe(1);
  });
});

describe('v0.18.0 — putPage implicitly writes to default source', () => {
  test('putPage without explicit source → source_id = default', async () => {
    await engine.putPage('topics/step9-auto', {
      type: 'concept',
      title: 'Step 9 Auto',
      compiled_truth: 'Auto-defaulted to default source.',
    });
    const rows = await engine.executeRaw<{ source_id: string; slug: string }>(
      `SELECT source_id, slug FROM pages WHERE slug = 'topics/step9-auto'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].source_id).toBe('default');
  });
});

describe('v0.18.0 — composite UNIQUE allows same-slug across sources', () => {
  test('same slug in two different sources coexists (regression: Codex critical)', async () => {
    // Insert a second source via sources CLI.
    await runSources(engine, ['add', 'testsrc', '--no-federated']);

    // Sanity: default already has this slug from the previous test.
    // Raw INSERT keeps this test focused on the composite UNIQUE itself.
    await engine.executeRaw(
      `INSERT INTO pages (source_id, slug, type, title, compiled_truth, timeline, frontmatter, content_hash)
       VALUES ('testsrc', 'topics/step9-auto', 'concept', 'Step 9 Auto (testsrc variant)',
               'A different page with the same slug in a different source.',
               '', '{}'::jsonb, 'hash2')`,
    );

    // Both rows must exist under the composite unique.
    const rows = await engine.executeRaw<{ source_id: string; slug: string; title: string }>(
      `SELECT source_id, slug, title FROM pages
        WHERE slug = 'topics/step9-auto'
        ORDER BY source_id`,
    );
    expect(rows.length).toBe(2);
    expect(rows.map(r => r.source_id).sort()).toEqual(['default', 'testsrc']);
  });

  test('inserting THIRD row with same (source_id, slug) hits composite UNIQUE', async () => {
    let err: Error | null = null;
    try {
      await engine.executeRaw(
        `INSERT INTO pages (source_id, slug, type, title, compiled_truth, timeline, frontmatter, content_hash)
         VALUES ('testsrc', 'topics/step9-auto', 'concept', 'Dup attempt',
                 'Should fail', '', '{}'::jsonb, 'hash3')`,
      );
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message.toLowerCase()).toMatch(/unique|duplicate/);
  });
});

describe('v0.18.0 + v0.19.0 — source-aware code import', () => {
  test('importCodeFile writes page, chunks, and tags under the requested source', async () => {
    await runSources(engine, ['add', 'codesrc', '--no-federated']);

    const result = await importCodeFile(
      engine,
      'src/source-aware.ts',
      'export function sourceAwareImport() { return 42; }\n',
      { noEmbed: true, sourceId: 'codesrc' },
    );
    expect(result.status).toBe('imported');

    const pages = await engine.executeRaw<{ source_id: string; slug: string }>(
      `SELECT source_id, slug FROM pages WHERE slug = 'src-source-aware-ts' ORDER BY source_id`,
    );
    expect(pages).toEqual([{ source_id: 'codesrc', slug: 'src-source-aware-ts' }]);

    const chunks = await engine.executeRaw<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM content_chunks cc
         JOIN pages p ON p.id = cc.page_id
        WHERE p.source_id = 'codesrc'
          AND p.slug = 'src-source-aware-ts'`,
    );
    expect(Number(chunks[0].count)).toBeGreaterThan(0);

    const tags = await engine.getTags('src-source-aware-ts', { sourceId: 'codesrc' });
    expect(tags).toContain('code');
    expect(tags).toContain('typescript');
  });

  test('frontmatter audit skips code-only sources', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gbrain-code-source-'));
    try {
      writeFileSync(join(dir, 'README.md'), '# Plain repo README\n\nNo brain frontmatter here.\n');
      await runSources(engine, ['add', 'codeaudit', '--path', dir, '--federated']);
      const result = await importCodeFile(
        engine,
        'src/code-audit.ts',
        'export const codeAudit = 1;\n',
        { noEmbed: true, sourceId: 'codeaudit' },
      );
      expect(result.status).toBe('imported');

      const report = await scanBrainSources(engine, { sourceId: 'codeaudit' });
      expect(report.ok).toBe(true);
      expect(report.total).toBe(0);
      expect(report.per_source).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('source-scoped delete and rename leave same-slug pages in other sources alone', async () => {
    await runSources(engine, ['add', 'scopeops', '--no-federated']);
    await engine.putPage('shared/source-scope', {
      type: 'concept',
      title: 'Default Shared',
      compiled_truth: 'Default source page should survive scoped code operations.',
    });
    await engine.putPage('shared/source-scope', {
      source_id: 'scopeops',
      type: 'code',
      page_kind: 'code',
      title: 'shared/source-scope.ts',
      compiled_truth: 'export const scoped = true;\n',
      frontmatter: { language: 'typescript' },
    });

    await engine.updateSlug('shared/source-scope', 'shared/source-scope-renamed', { sourceId: 'scopeops' });

    let rows = await engine.executeRaw<{ source_id: string; slug: string }>(
      `SELECT source_id, slug FROM pages
        WHERE slug IN ('shared/source-scope', 'shared/source-scope-renamed')
        ORDER BY source_id, slug`,
    );
    expect(rows).toEqual([
      { source_id: 'default', slug: 'shared/source-scope' },
      { source_id: 'scopeops', slug: 'shared/source-scope-renamed' },
    ]);

    await engine.deletePage('shared/source-scope-renamed', { sourceId: 'scopeops' });

    rows = await engine.executeRaw<{ source_id: string; slug: string }>(
      `SELECT source_id, slug FROM pages
        WHERE slug IN ('shared/source-scope', 'shared/source-scope-renamed')
        ORDER BY source_id, slug`,
    );
    expect(rows).toEqual([{ source_id: 'default', slug: 'shared/source-scope' }]);
  });

  test('sync dry-run does not persist requested source strategy', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gbrain-dry-run-source-'));
    try {
      spawnSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
      writeFileSync(join(dir, 'index.ts'), 'export const dryRunStrategy = true;\n');
      spawnSync('git', ['add', 'index.ts'], { cwd: dir, stdio: 'ignore' });
      const commit = spawnSync(
        'git',
        ['-c', 'user.email=test@example.com', '-c', 'user.name=Test User', 'commit', '-m', 'init'],
        { cwd: dir, stdio: 'ignore' },
      );
      expect(commit.status).toBe(0);

      await runSources(engine, ['add', 'drycodesrc', '--path', dir, '--federated']);
      await runSync(engine, ['--source', 'drycodesrc', '--strategy', 'code', '--dry-run', '--no-pull']);

      const rows = await engine.executeRaw<{ config: string | Record<string, unknown> }>(
        `SELECT config FROM sources WHERE id = 'drycodesrc'`,
      );
      const config = typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config;
      expect(config.strategy).toBeUndefined();
      expect(config.sync_strategy).toBeUndefined();
      expect(config.source_kind).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('v0.18.0 — sources CLI manipulates the sources table', () => {
  test('sources federate flips config.federated true', async () => {
    await runSources(engine, ['federate', 'testsrc']);
    const rows = await engine.executeRaw<{ config: string | Record<string, unknown> }>(
      `SELECT config FROM sources WHERE id = 'testsrc'`,
    );
    const config = typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config;
    expect(config.federated).toBe(true);
  });

  test('sources unfederate flips config.federated false', async () => {
    await runSources(engine, ['unfederate', 'testsrc']);
    const rows = await engine.executeRaw<{ config: string | Record<string, unknown> }>(
      `SELECT config FROM sources WHERE id = 'testsrc'`,
    );
    const config = typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config;
    expect(config.federated).toBe(false);
  });

  test('sources rename changes name but keeps id immutable', async () => {
    await runSources(engine, ['rename', 'testsrc', 'Test Source']);
    const rows = await engine.executeRaw<{ id: string; name: string }>(
      `SELECT id, name FROM sources WHERE id = 'testsrc'`,
    );
    expect(rows[0].id).toBe('testsrc');
    expect(rows[0].name).toBe('Test Source');
  });
});

describe('v0.18.0 — source resolution priority (integration)', () => {
  test('explicit --source flag wins when the source exists', async () => {
    const id = await resolveSourceId(engine, 'testsrc');
    expect(id).toBe('testsrc');
  });

  test('GBRAIN_SOURCE env wins when no flag', async () => {
    process.env.GBRAIN_SOURCE = 'testsrc';
    try {
      const id = await resolveSourceId(engine, null);
      expect(id).toBe('testsrc');
    } finally {
      delete process.env.GBRAIN_SOURCE;
    }
  });

  test('fallback to default when nothing is set', async () => {
    const id = await resolveSourceId(engine, null, '/nowhere-registered');
    expect(id).toBe('default');
  });

  test('rejects unregistered explicit source with an actionable error', async () => {
    await expect(resolveSourceId(engine, 'ghost-source')).rejects.toThrow(/not found/);
  });
});

describe('v0.18.0 — sources remove cascades to pages', () => {
  test('removing a source cascade-deletes its pages', async () => {
    const before = await engine.executeRaw<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pages WHERE source_id = 'testsrc'`,
    );
    expect(before[0].n).toBeGreaterThan(0);

    // v0.26.5: populated sources require --confirm-destructive; --yes alone is rejected.
    await runSources(engine, ['remove', 'testsrc', '--confirm-destructive']);

    const after = await engine.executeRaw<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pages WHERE source_id = 'testsrc'`,
    );
    expect(after[0].n).toBe(0);

    const src = await engine.executeRaw<{ id: string }>(
      `SELECT id FROM sources WHERE id = 'testsrc'`,
    );
    expect(src.length).toBe(0);

    // Default source is untouched.
    const defaultPages = await engine.executeRaw<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pages WHERE source_id = 'default'`,
    );
    expect(defaultPages[0].n).toBeGreaterThan(0);
  });
});

describe('v0.18.0 — links.resolution_type column exists (Step 4)', () => {
  test('links table accepts qualified/unqualified resolution_type', async () => {
    // Create two pages, insert a link with resolution_type='qualified'.
    await engine.putPage('topics/qf-a', {
      type: 'concept', title: 'QA', compiled_truth: 'a',
    });
    await engine.putPage('topics/qf-b', {
      type: 'concept', title: 'QB', compiled_truth: 'b',
    });
    await engine.executeRaw(
      `INSERT INTO links (from_page_id, to_page_id, link_type, context, link_source, resolution_type)
       SELECT a.id, b.id, 'ref', '', 'markdown', 'qualified'
         FROM pages a, pages b
        WHERE a.slug = 'topics/qf-a' AND b.slug = 'topics/qf-b'
          AND a.source_id = 'default' AND b.source_id = 'default'`,
    );
    const rows = await engine.executeRaw<{ resolution_type: string }>(
      `SELECT l.resolution_type
         FROM links l
         JOIN pages a ON a.id = l.from_page_id
        WHERE a.slug = 'topics/qf-a'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].resolution_type).toBe('qualified');
  });

  test('links CHECK constraint rejects invalid resolution_type values', async () => {
    let err: Error | null = null;
    try {
      await engine.executeRaw(
        `INSERT INTO links (from_page_id, to_page_id, link_type, resolution_type)
         SELECT a.id, a.id, 'self', 'bogus-value'
           FROM pages a WHERE a.slug = 'topics/qf-a' AND a.source_id = 'default'`,
      );
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message.toLowerCase()).toMatch(/check|constraint/);
  });
});
