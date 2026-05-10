/**
 * Search source visibility.
 *
 * Default search should only see federated sources. Private/raw corpora can be
 * indexed as non-federated and searched only when explicitly scoped.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { PGLiteEngine } from '../src/core/pglite-engine.ts';
import { hybridSearch } from '../src/core/search/hybrid.ts';
import { resetPgliteState } from './helpers/reset-pglite.ts';

describe('search source visibility', () => {
  let engine: PGLiteEngine;

  beforeAll(async () => {
    engine = new PGLiteEngine();
    await engine.connect({ type: 'pglite' } as never);
    await engine.initSchema();
  }, 60_000);

  afterAll(async () => {
    if (engine) await engine.disconnect();
  }, 60_000);

  beforeEach(async () => {
    await resetPgliteState(engine);
    await engine.executeRaw(
      `INSERT INTO sources (id, name, config)
       VALUES
         ('federated-src', 'Federated source', '{"federated": true}'::jsonb),
         ('isolated-src', 'Isolated source', '{"federated": false}'::jsonb),
         ('unset-src', 'Unset source', '{}'::jsonb)`,
    );

    await addPage('topics/default-visible', 'default', 'sourcetesttoken default visible');
    await addPage('topics/federated-visible', 'federated-src', 'sourcetesttoken federated visible');
    await addPage('topics/isolated-hidden', 'isolated-src', 'sourcetesttoken isolated hidden');
    await addPage('topics/unset-hidden', 'unset-src', 'sourcetesttoken unset hidden');
  });

  async function addPage(slug: string, sourceId: string, text: string): Promise<void> {
    await engine.putPage(slug, {
      type: 'concept',
      title: slug,
      compiled_truth: text,
    }, { sourceId });
    await engine.upsertChunks(slug, [
      { chunk_index: 0, chunk_text: text, chunk_source: 'compiled_truth' },
    ], { sourceId });
  }

  test('unqualified keyword search returns only federated sources', async () => {
    const results = await engine.searchKeyword('sourcetesttoken', { limit: 10 });
    const slugs = results.map(r => r.slug).sort();

    expect(slugs).toContain('topics/default-visible');
    expect(slugs).toContain('topics/federated-visible');
    expect(slugs).not.toContain('topics/isolated-hidden');
    expect(slugs).not.toContain('topics/unset-hidden');
  });

  test('explicit source keyword search returns isolated source results', async () => {
    const results = await engine.searchKeyword('sourcetesttoken', {
      limit: 10,
      sourceId: 'isolated-src',
    });
    const slugs = results.map(r => r.slug).sort();

    expect(slugs).toEqual(['topics/isolated-hidden']);
  });

  test('__all__ keyword search returns every non-archived source', async () => {
    const results = await engine.searchKeyword('sourcetesttoken', {
      limit: 10,
      sourceId: '__all__',
    });
    const slugs = results.map(r => r.slug).sort();

    expect(slugs).toEqual([
      'topics/default-visible',
      'topics/federated-visible',
      'topics/isolated-hidden',
      'topics/unset-hidden',
    ]);
  });

  test('explicit source survives hybrid keyword fallback', async () => {
    const results = await hybridSearch(engine, 'sourcetesttoken', {
      limit: 10,
      sourceId: 'isolated-src',
    });
    const slugs = results.map(r => r.slug).sort();

    expect(slugs).toEqual(['topics/isolated-hidden']);
  });
});
