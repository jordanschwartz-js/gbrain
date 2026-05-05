/**
 * Embedding Service
 * Ported from production Ruby implementation (embedding_service.rb, 190 LOC)
 *
 * OpenAI text-embedding-3-large at 2560 dimensions by default.
 * Ollama local embeddings are supported via GBRAIN_EMBEDDING_PROVIDER=ollama.
 * Retry with exponential backoff (4s base, 120s cap, 5 retries).
 * 8000 character input truncation.
 */

import OpenAI from 'openai';
import { loadConfig } from './config.ts';
import type { BrainEngine } from './engine.ts';

type EmbeddingProvider = 'openai' | 'ollama';
type EmbeddingConfigOverride = {
  provider?: EmbeddingProvider;
  model?: string;
  dimensions?: number;
  ollamaEmbedUrl?: string;
};
type ResolvedEmbeddingConfig = Required<EmbeddingConfigOverride>;

const OPENAI_DEFAULT_MODEL = 'text-embedding-3-large';
const OPENAI_DEFAULT_DIMENSIONS = 2560;
const OLLAMA_DEFAULT_MODEL = 'qwen3-embedding:4b';
const OLLAMA_DEFAULT_DIMENSIONS = 2560;
const OLLAMA_DEFAULT_EMBED_URL = 'http://127.0.0.1:11434/api/embed';
const MAX_CHARS = 8000;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 4000;
const MAX_DELAY_MS = 120000;
const BATCH_SIZE = 100;

let client: OpenAI | null = null;
let runtimeConfigOverride: EmbeddingConfigOverride = {};

function isEmbeddingProvider(value: string | null | undefined): value is EmbeddingProvider {
  return value === 'openai' || value === 'ollama';
}

function resolveEmbeddingConfig(): ResolvedEmbeddingConfig {
  const config = loadConfig();
  const providerValue = process.env.GBRAIN_EMBEDDING_PROVIDER
    || runtimeConfigOverride.provider
    || config?.embedding_provider
    || 'openai';
  const provider = isEmbeddingProvider(providerValue) ? providerValue : 'openai';

  if (provider === 'ollama') {
    return {
      provider,
      model: process.env.GBRAIN_EMBEDDING_MODEL || runtimeConfigOverride.model || config?.embedding_model || OLLAMA_DEFAULT_MODEL,
      dimensions: parseInt(
        process.env.GBRAIN_EMBEDDING_DIMENSIONS
          || String(runtimeConfigOverride.dimensions || config?.embedding_dimensions || OLLAMA_DEFAULT_DIMENSIONS),
        10,
      ),
      ollamaEmbedUrl: process.env.GBRAIN_OLLAMA_EMBED_URL
        || runtimeConfigOverride.ollamaEmbedUrl
        || config?.ollama_embed_url
        || OLLAMA_DEFAULT_EMBED_URL,
    };
  }

  return {
    provider: 'openai' as const,
    model: process.env.GBRAIN_EMBEDDING_MODEL || runtimeConfigOverride.model || config?.embedding_model || OPENAI_DEFAULT_MODEL,
    dimensions: parseInt(
      process.env.GBRAIN_EMBEDDING_DIMENSIONS
        || String(runtimeConfigOverride.dimensions || config?.embedding_dimensions || OPENAI_DEFAULT_DIMENSIONS),
      10,
    ),
    ollamaEmbedUrl: OLLAMA_DEFAULT_EMBED_URL,
  };
}

export function setEmbeddingConfigOverride(overrides: EmbeddingConfigOverride): void {
  runtimeConfigOverride = { ...runtimeConfigOverride, ...overrides };
}

export function resetEmbeddingConfigOverride(): void {
  runtimeConfigOverride = {};
}

export async function configureEmbeddingFromEngine(engine: Pick<BrainEngine, 'getConfig'>): Promise<void> {
  const [provider, model, dimensions, ollamaEmbedUrl] = await Promise.all([
    engine.getConfig('embedding_provider').catch(() => null),
    engine.getConfig('embedding_model').catch(() => null),
    engine.getConfig('embedding_dimensions').catch(() => null),
    engine.getConfig('ollama_embed_url').catch(() => null),
  ]);

  const overrides: EmbeddingConfigOverride = {};
  if (isEmbeddingProvider(provider)) overrides.provider = provider;
  if (model) overrides.model = model;
  if (dimensions) {
    const parsed = parseInt(dimensions, 10);
    if (!Number.isNaN(parsed)) overrides.dimensions = parsed;
  }
  if (ollamaEmbedUrl) overrides.ollamaEmbedUrl = ollamaEmbedUrl;
  runtimeConfigOverride = overrides;
}

export function getEmbeddingConfig(): ResolvedEmbeddingConfig {
  return resolveEmbeddingConfig();
}

export function getEmbeddingModel(): string {
  return resolveEmbeddingConfig().model;
}

export function getEmbeddingDimensions(): number {
  return resolveEmbeddingConfig().dimensions;
}

const INITIAL_EMBEDDING_CONFIG = resolveEmbeddingConfig();
const MODEL = INITIAL_EMBEDDING_CONFIG.model;
const DIMENSIONS = INITIAL_EMBEDDING_CONFIG.dimensions;

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

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < truncated.length; i += BATCH_SIZE) {
    const batch = truncated.slice(i, i + BATCH_SIZE);
    const batchResults = await embedBatchWithRetry(batch);
    results.push(...batchResults);
    options.onBatchComplete?.(results.length, truncated.length);
  }

  return results;
}

async function embedBatchWithRetry(texts: string[]): Promise<Float32Array[]> {
  const embeddingConfig = resolveEmbeddingConfig();
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (embeddingConfig.provider === 'ollama') {
        return await embedBatchWithOllama(texts, embeddingConfig);
      }

      const response = await getClient().embeddings.create({
        model: embeddingConfig.model,
        input: texts,
        dimensions: embeddingConfig.dimensions,
      });

      // Sort by index to maintain order
      const sorted = response.data.sort((a, b) => a.index - b.index);
      return validateEmbeddingDimensions(sorted.map(d => new Float32Array(d.embedding)), embeddingConfig);
    } catch (e: unknown) {
      if (e instanceof EmbeddingDimensionError) throw e;
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

async function embedBatchWithOllama(
  texts: string[],
  embeddingConfig: ResolvedEmbeddingConfig,
): Promise<Float32Array[]> {
  const response = await fetch(embeddingConfig.ollamaEmbedUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: embeddingConfig.model,
      input: texts,
      dimensions: embeddingConfig.dimensions,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Ollama embedding request failed (${response.status}): ${body}`);
  }

  const data = await response.json() as { embeddings?: number[][] };
  if (!Array.isArray(data.embeddings)) {
    throw new Error('Ollama embedding response missing embeddings array');
  }

  return validateEmbeddingDimensions(
    data.embeddings.map(embedding => new Float32Array(embedding)),
    embeddingConfig,
  );
}

function validateEmbeddingDimensions(
  embeddings: Float32Array[],
  embeddingConfig: ResolvedEmbeddingConfig,
): Float32Array[] {
  for (let i = 0; i < embeddings.length; i++) {
    const actual = embeddings[i].length;
    if (actual !== embeddingConfig.dimensions) {
      throw new EmbeddingDimensionError(
        `Embedding dimension mismatch for ${embeddingConfig.model} at index ${i}: ` +
        `expected ${embeddingConfig.dimensions} dimensions, got ${actual}. ` +
        `Set GBRAIN_EMBEDDING_DIMENSIONS to match the model or reconfigure the embedding provider.`,
      );
    }
  }
  return embeddings;
}

class EmbeddingDimensionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingDimensionError';
  }
}

function exponentialDelay(attempt: number): number {
  const delay = BASE_DELAY_MS * Math.pow(2, attempt);
  return Math.min(delay, MAX_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { MODEL as EMBEDDING_MODEL, DIMENSIONS as EMBEDDING_DIMENSIONS };
