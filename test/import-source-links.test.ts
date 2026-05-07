import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { PGLiteEngine } from '../src/core/pglite-engine.ts';
import { importFromContent } from '../src/core/import-file.ts';

describe('markdown import code links in multi-source brains', () => {
  let engine: PGLiteEngine;

  beforeEach(async () => {
    engine = new PGLiteEngine();
    await engine.connect({});
    await engine.initSchema();
    await (engine as any).db.query(
      `INSERT INTO sources (id, name) VALUES ('alt', 'alt')
       ON CONFLICT (id) DO NOTHING`,
    );
  });

  afterAll(async () => {
    await engine?.disconnect();
  });

  test('imports source-scoped doc-code links when the same slugs exist in another source', async () => {
    await engine.putPage('docs/guide', {
      type: 'note',
      title: 'Guide default',
      compiled_truth: '',
      timeline: '',
    });
    await engine.putPage('src-core-foo-ts', {
      type: 'code',
      title: 'Foo default',
      compiled_truth: '',
      timeline: '',
    });
    await engine.putPage('src-core-foo-ts', {
      type: 'code',
      title: 'Foo alt',
      compiled_truth: '',
      timeline: '',
      source_id: 'alt',
    });

    await importFromContent(
      engine,
      'docs/guide',
      'This guide cites `src/core/foo.ts:12` for the implementation.',
      { noEmbed: true, sourceId: 'alt' },
    );

    const rows = await (engine as any).db.query(
      `SELECT f.source_id AS from_source, f.slug AS from_slug,
              t.source_id AS to_source, t.slug AS to_slug,
              o.source_id AS origin_source
         FROM links l
         JOIN pages f ON f.id = l.from_page_id
         JOIN pages t ON t.id = l.to_page_id
         LEFT JOIN pages o ON o.id = l.origin_page_id
        ORDER BY f.slug, t.slug`,
    );

    expect(rows.rows).toEqual([
      {
        from_source: 'alt',
        from_slug: 'docs/guide',
        to_source: 'alt',
        to_slug: 'src-core-foo-ts',
        origin_source: 'alt',
      },
      {
        from_source: 'alt',
        from_slug: 'src-core-foo-ts',
        to_source: 'alt',
        to_slug: 'docs/guide',
        origin_source: 'alt',
      },
    ]);
  });
});
