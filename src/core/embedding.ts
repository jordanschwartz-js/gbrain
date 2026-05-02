/**
 * Embedding Service
 * Ported from production Ruby implementation (embedding_service.rb, 190 LOC)
 *
 * OpenAI text-embedding-3-large at 1536 dimensions by default.
 * Local MLX/Qwen3 embeddings can be enabled with:
 * GBRAIN_EMBEDDING_PROVIDER=mlx-qwen3
 * Retry with exponential backoff (4s base, 120s cap, 5 retries).
 * 8000 character input truncation.
 */

import OpenAI from 'openai';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const OPENAI_MODEL = 'text-embedding-3-large';
const MLX_QWEN3_MODEL = process.env.GBRAIN_MLX_EMBED_MODEL || 'mlx-community/Qwen3-Embedding-4B-mxfp8';
const DIMENSIONS = 1536;
const MAX_CHARS = 8000;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 4000;
const MAX_DELAY_MS = 120000;
const BATCH_SIZE = 100;
const parsedMlxBatchSize = parseInt(process.env.GBRAIN_MLX_EMBED_BATCH_SIZE || '32', 10);
const MLX_BATCH_SIZE = Number.isFinite(parsedMlxBatchSize) && parsedMlxBatchSize > 0
  ? parsedMlxBatchSize
  : 32;
const PROVIDER = process.env.GBRAIN_EMBEDDING_PROVIDER === 'mlx-qwen3' ? 'mlx-qwen3' : 'openai';
const MODEL = PROVIDER === 'mlx-qwen3' ? MLX_QWEN3_MODEL : OPENAI_MODEL;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI();
  }
  return client;
}

export async function embed(text: string): Promise<Float32Array> {
  const truncated = text.slice(0, MAX_CHARS);
  const result = await embedBatch([truncated]);
  return result[0];
}

export interface EmbedBatchOptions {
  /**
   * Optional callback fired after each 100-item sub-batch completes.
   * CLI wrappers tick a reporter; Minion handlers can call
   * job.updateProgress here instead of hooking the per-page callback.
   */
  onBatchComplete?: (done: number, total: number) => void;
}

export async function embedBatch(
  texts: string[],
  options: EmbedBatchOptions = {},
): Promise<Float32Array[]> {
  const truncated = texts.map(t => t.slice(0, MAX_CHARS));
  const results: Float32Array[] = [];
  const batchSize = PROVIDER === 'mlx-qwen3' ? MLX_BATCH_SIZE : BATCH_SIZE;

  for (let i = 0; i < truncated.length; i += batchSize) {
    const batch = truncated.slice(i, i + batchSize);
    const batchResults = await embedBatchForProvider(batch);
    results.push(...batchResults);
    options.onBatchComplete?.(results.length, truncated.length);
  }

  return results;
}

async function embedBatchForProvider(texts: string[]): Promise<Float32Array[]> {
  if (PROVIDER === 'mlx-qwen3') {
    return await getMlxEmbedder().embed(texts);
  }
  return await embedBatchWithRetry(texts);
}

async function embedBatchWithRetry(texts: string[]): Promise<Float32Array[]> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await getClient().embeddings.create({
        model: MODEL,
        input: texts,
        dimensions: DIMENSIONS,
      });

      // Sort by index to maintain order
      const sorted = response.data.sort((a, b) => a.index - b.index);
      return sorted.map(d => new Float32Array(d.embedding));
    } catch (e: unknown) {
      if (attempt === MAX_RETRIES - 1) throw e;

      // Check for rate limit with Retry-After header
      let delay = exponentialDelay(attempt);

      if (e instanceof OpenAI.APIError && e.status === 429) {
        const retryAfter = e.headers?.['retry-after'];
        if (retryAfter) {
          const parsed = parseInt(retryAfter, 10);
          if (!isNaN(parsed)) {
            delay = parsed * 1000;
          }
        }
      }

      await sleep(delay);
    }
  }

  // Should not reach here
  throw new Error('Embedding failed after all retries');
}

interface MlxRequest {
  texts: string[];
  dimensions: number;
}

interface MlxResponse {
  embeddings?: number[][];
  error?: string;
}

class MlxEmbedder {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private idleTimer: NodeJS.Timeout | null = null;
  private pending: Array<{
    resolve: (value: Float32Array[]) => void;
    reject: (error: Error) => void;
  }> = [];

  embed(texts: string[]): Promise<Float32Array[]> {
    const child = this.ensureChild();
    this.clearIdleTimer();
    const request: MlxRequest = { texts, dimensions: DIMENSIONS };
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      child.stdin.write(`${JSON.stringify(request)}\n`, error => {
        if (error) {
          const next = this.pending.shift();
          next?.reject(error);
        }
      });
    });
  }

  shutdown() {
    this.clearIdleTimer();
    this.child?.kill();
    this.child = null;
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;

    const python = process.env.GBRAIN_MLX_EMBED_PYTHON || 'python3';
    const script =
      process.env.GBRAIN_MLX_EMBED_SCRIPT ||
      fileURLToPath(new URL('../../scripts/mlx_embed_stdio.py', import.meta.url));
    const env = {
      ...process.env,
      GBRAIN_MLX_EMBED_MODEL: MLX_QWEN3_MODEL,
    };
    const child = spawn(python, [script], { env });
    this.child = child;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      this.buffer += chunk;
      let newline = this.buffer.indexOf('\n');
      while (newline !== -1) {
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        if (line) this.handleLine(line);
        newline = this.buffer.indexOf('\n');
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      process.stderr.write(`[gbrain mlx] ${chunk}`);
    });

    child.on('error', error => this.rejectAll(error));
    child.on('exit', (code, signal) => {
      this.child = null;
      if (this.pending.length > 0) {
        this.rejectAll(new Error(`MLX embedding process exited (${code ?? signal ?? 'unknown'})`));
      }
    });

    return child;
  }

  private handleLine(line: string) {
    const next = this.pending.shift();
    if (!next) return;

    try {
      const parsed = JSON.parse(line) as MlxResponse;
      if (parsed.error) {
        next.reject(new Error(parsed.error));
        return;
      }
      if (!parsed.embeddings || !Array.isArray(parsed.embeddings)) {
        next.reject(new Error('MLX embedding response did not include embeddings'));
        return;
      }
      next.resolve(parsed.embeddings.map(values => new Float32Array(values)));
      this.scheduleIdleShutdown();
    } catch (error) {
      next.reject(error instanceof Error ? error : new Error(String(error)));
      this.scheduleIdleShutdown();
    }
  }

  private rejectAll(error: Error) {
    this.clearIdleTimer();
    const pending = this.pending.splice(0);
    for (const next of pending) next.reject(error);
  }

  private scheduleIdleShutdown() {
    if (this.pending.length > 0) return;
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => this.shutdown(), 1000);
    this.idleTimer.unref?.();
  }

  private clearIdleTimer() {
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}

let mlxEmbedder: MlxEmbedder | null = null;

function getMlxEmbedder(): MlxEmbedder {
  if (!mlxEmbedder) {
    mlxEmbedder = new MlxEmbedder();
  }
  return mlxEmbedder;
}

process.once('exit', () => {
  mlxEmbedder?.shutdown();
});

function exponentialDelay(attempt: number): number {
  const delay = BASE_DELAY_MS * Math.pow(2, attempt);
  return Math.min(delay, MAX_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export {
  PROVIDER as EMBEDDING_PROVIDER,
  MODEL as EMBEDDING_MODEL,
  DIMENSIONS as EMBEDDING_DIMENSIONS,
};

/**
 * v0.20.0 Cathedral II Layer 8 (D1): USD cost per 1k tokens for
 * text-embedding-3-large. Used by `gbrain sync --all` cost preview and
 * the reindex-code backfill command to surface expected spend before
 * the agent/user accepts an expensive operation.
 *
 * Value: $0.00013 / 1k tokens as of 2026. Update when OpenAI changes
 * pricing. Single source of truth — every cost-preview surface reads
 * this constant, so a pricing change is a one-line edit.
 */
export const EMBEDDING_COST_PER_1K_TOKENS = PROVIDER === 'mlx-qwen3' ? 0 : 0.00013;

/** True when the active embedding provider has the required local/cloud credential path. */
export function isEmbeddingProviderConfigured(): boolean {
  if (PROVIDER === 'mlx-qwen3') return true;
  return Boolean(process.env.OPENAI_API_KEY);
}

/** Compute USD cost estimate for embedding `tokens` at current model rate. */
export function estimateEmbeddingCostUsd(tokens: number): number {
  return (tokens / 1000) * EMBEDDING_COST_PER_1K_TOKENS;
}
