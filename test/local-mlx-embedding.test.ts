import { describe, expect, test } from 'bun:test';
import { PGLiteEngine } from '../src/core/pglite-engine.ts';
import { embed, EMBEDDING_MODEL, EMBEDDING_PROVIDER } from '../src/core/embedding.ts';
import { runEmbedCore } from '../src/commands/embed.ts';
import { hybridSearch } from '../src/core/search/hybrid.ts';

const runLocalMlx =
  process.env.GBRAIN_EMBEDDING_PROVIDER === 'mlx-qwen3' &&
  Boolean(process.env.GBRAIN_MLX_EMBED_PYTHON);

const maybeDescribe = runLocalMlx ? describe : describe.skip;

maybeDescribe('local MLX/Qwen3 embeddings', () => {
  test('store 1536-dim local vectors and retrieve semantically when keyword search is weak', async () => {
    const engine = new PGLiteEngine();
    await engine.connect({ engine: 'pglite' });
    await engine.initSchema();

    try {
      await seedChunk(engine, {
        slug: 'policies/release-watch-consent',
        title: 'Release watch consent',
        text: 'OpenClaw release monitors must summarize changes and ask before installing, updating, pulling, restarting, or changing services.',
      });
      await seedChunk(engine, {
        slug: 'policies/dream-synthesis',
        title: 'Dream synthesis',
        text: 'Dream synthesis remains dry-run only until it has an approved model provider and write allow-list.',
      });
      await seedChunk(engine, {
        slug: 'channels/telegram-ack',
        title: 'Telegram acknowledgement',
        text: 'Telegram uses an eye reaction to acknowledge messages while Steve prepares a reply.',
      });

      const embedResult = await runEmbedCore(engine, { stale: true });
      expect(embedResult.embedded).toBe(3);

      const rowResult = await engine.db.query(
        'select vector_dims(embedding) as dims, model from content_chunks order by chunk_index limit 1',
      );
      expect(rowResult.rows[0]).toMatchObject({
        dims: 1536,
        model: EMBEDDING_MODEL,
      });
      expect(EMBEDDING_PROVIDER).toBe('mlx-qwen3');

      const fuzzyQuery = 'Can the updater do unattended upgrades?';
      const keywordResults = await engine.searchKeyword(fuzzyQuery, { limit: 3 });
      expect(keywordResults.map(result => result.slug)).not.toContain('policies/release-watch-consent');

      const vectorResults = await engine.searchVector(await embed(fuzzyQuery), { limit: 3 });
      expect(vectorResults[0]?.slug).toBe('policies/release-watch-consent');

      const savedOpenAiKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      try {
        let vectorEnabled: boolean | undefined;
        const hybridResults = await hybridSearch(engine, fuzzyQuery, {
          limit: 3,
          onMeta: m => {
            vectorEnabled = m.vector_enabled;
          },
        });
        expect(vectorEnabled).toBe(true);
        expect(hybridResults[0]?.slug).toBe('policies/release-watch-consent');
      } finally {
        if (savedOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = savedOpenAiKey;
      }
    } finally {
      await engine.disconnect();
    }
  }, 120_000);
});

async function seedChunk(
  engine: PGLiteEngine,
  input: { slug: string; title: string; text: string },
) {
  await engine.putPage(input.slug, {
    type: 'note',
    title: input.title,
    compiled_truth: input.text,
    timeline: '',
  });
  await engine.upsertChunks(input.slug, [
    {
      chunk_index: 0,
      chunk_text: input.text,
      chunk_source: 'compiled_truth',
      token_count: Math.ceil(input.text.length / 4),
    },
  ]);
}
