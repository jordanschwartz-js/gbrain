import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'fs';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  mock.restore();
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  delete process.env.GBRAIN_EMBEDDING_PROVIDER;
  delete process.env.GBRAIN_EMBEDDING_MODEL;
  delete process.env.GBRAIN_EMBEDDING_DIMENSIONS;
  delete process.env.GBRAIN_OLLAMA_EMBED_URL;
  const mod = await import('../src/core/embedding.ts');
  mod.resetEmbeddingConfigOverride?.();
});

describe('embedding provider', () => {
  test('uses Ollama provider and preserves returned dimensions', async () => {
    process.env.GBRAIN_EMBEDDING_PROVIDER = 'ollama';
    process.env.GBRAIN_EMBEDDING_MODEL = 'qwen3-embedding:4b';
    process.env.GBRAIN_OLLAMA_EMBED_URL = 'http://ollama.test/api/embed';

    const seen: { url?: string; body?: unknown } = {};
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.url = String(url);
      seen.body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        embeddings: [
          new Array(2560).fill(0.1),
          new Array(2560).fill(0.5),
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const modulePath = `../src/core/embedding.ts?provider-test=${Date.now()}`;
    const { embedBatch, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } =
      await import(modulePath);

    expect(EMBEDDING_MODEL).toBe('qwen3-embedding:4b');
    expect(EMBEDDING_DIMENSIONS).toBe(2560);

    const embeddings = await embedBatch(['alpha', 'beta']);

    expect(seen.url).toBe('http://ollama.test/api/embed');
    expect(seen.body).toEqual({
      model: 'qwen3-embedding:4b',
      input: ['alpha', 'beta'],
      dimensions: 2560,
    });
    expect(embeddings.map((v: Float32Array) => v.length)).toEqual([2560, 2560]);
    expect(embeddings[0][0]).toBeCloseTo(0.1);
    expect(embeddings[1][0]).toBeCloseTo(0.5);
  });

  test('rejects embeddings that do not match configured dimensions', async () => {
    process.env.GBRAIN_EMBEDDING_PROVIDER = 'ollama';
    process.env.GBRAIN_EMBEDDING_MODEL = 'qwen3-embedding:4b';
    process.env.GBRAIN_EMBEDDING_DIMENSIONS = '2560';
    process.env.GBRAIN_OLLAMA_EMBED_URL = 'http://ollama.test/api/embed';

    globalThis.fetch = (async () => new Response(JSON.stringify({
      embeddings: [
        new Array(1536).fill(0.1),
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    const modulePath = `../src/core/embedding.ts?provider-test=${Date.now()}`;
    const { embedBatch } = await import(modulePath);

    await expect(embedBatch(['alpha'])).rejects.toThrow('expected 2560 dimensions, got 1536');
  });

  test('put_page auto-embedding gate accepts local Ollama provider without OpenAI key', () => {
    const source = readFileSync(new URL('../src/core/operations.ts', import.meta.url), 'utf8');

    expect(source).not.toContain('const noEmbed = !process.env.OPENAI_API_KEY;');
    expect(source).toContain("embedding_provider === 'ollama'");
  });

  test('embed command configures provider from brain config before embedding', () => {
    const source = readFileSync(new URL('../src/commands/embed.ts', import.meta.url), 'utf8');

    expect(source).toContain('await configureEmbeddingFromEngine(engine);');
    expect(source).toContain('getEmbeddingModel()');
  });

  test('embedding service reads Ollama provider from brain config', async () => {
    const seen: { url?: string; body?: unknown } = {};
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.url = String(url);
      seen.body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        embeddings: [new Array(2560).fill(0.25)],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const engine = {
      getConfig: async (key: string) => ({
        embedding_provider: 'ollama',
        embedding_model: 'qwen3-embedding:4b',
        embedding_dimensions: '2560',
        ollama_embed_url: 'http://ollama.test/api/embed',
      } as Record<string, string>)[key] ?? null,
    };

    const modulePath = `../src/core/embedding.ts?db-config-test=${Date.now()}`;
    const { configureEmbeddingFromEngine, embedBatch, getEmbeddingModel } = await import(modulePath);
    await configureEmbeddingFromEngine(engine as any);
    const embeddings = await embedBatch(['local embedding smoke']);

    expect(seen.url).toBe('http://ollama.test/api/embed');
    expect(seen.body).toEqual({
      model: 'qwen3-embedding:4b',
      input: ['local embedding smoke'],
      dimensions: 2560,
    });
    expect(getEmbeddingModel()).toBe('qwen3-embedding:4b');
    expect(embeddings[0].length).toBe(2560);
  });

  test('hybrid query uses Ollama vector search without an OpenAI key', async () => {
    delete process.env.OPENAI_API_KEY;

    globalThis.fetch = (async () => new Response(JSON.stringify({
      embeddings: [new Array(2560).fill(0.1)],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

    let vectorCalls = 0;
    const engine = {
      getConfig: async (key: string) => ({
        embedding_provider: 'ollama',
        embedding_model: 'qwen3-embedding:4b',
        embedding_dimensions: '2560',
        ollama_embed_url: 'http://ollama.test/api/embed',
      } as Record<string, string>)[key] ?? null,
      searchKeyword: async () => [{
        slug: 'keyword',
        page_id: 1,
        title: 'Keyword',
        type: 'concept',
        chunk_text: 'keyword result',
        chunk_source: 'compiled_truth',
        chunk_id: 1,
        chunk_index: 0,
        score: 0.5,
        stale: false,
      }],
      searchVector: async () => {
        vectorCalls++;
        return [{
          slug: 'vector',
          page_id: 2,
          title: 'Vector',
          type: 'concept',
          chunk_text: 'vector result',
          chunk_source: 'compiled_truth',
          chunk_id: 2,
          chunk_index: 0,
          score: 0.9,
          stale: false,
        }];
      },
      getEmbeddingsByChunkIds: async () => new Map([[2, new Float32Array(2560).fill(0.1)]]),
      getBacklinkCounts: async () => new Map(),
    };

    const modulePath = `../src/core/search/hybrid.ts?ollama-query-test=${Date.now()}`;
    const { hybridSearch } = await import(modulePath);
    const results = await hybridSearch(engine as any, 'semantic query', { limit: 5 });

    expect(vectorCalls).toBe(1);
    expect(results.some((r: { slug: string }) => r.slug === 'vector')).toBe(true);
  });
});
