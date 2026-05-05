import { describe, test, expect } from 'bun:test';
import { getPGLiteSchema, PGLITE_SCHEMA_SQL } from '../../src/core/pglite-schema.ts';

describe('getPGLiteSchema', () => {
  test('default produces v0.13-compatible schema (1536d + text-embedding-3-large)', () => {
    const sql = getPGLiteSchema();
    expect(sql).toMatch(/vector\(1536\)/);
    expect(sql).toMatch(/'text-embedding-3-large'/);
    expect(sql).not.toMatch(/__EMBEDDING_DIMS__/);
    expect(sql).not.toMatch(/__EMBEDDING_MODEL__/);
  });

  test('Gemini 768d substitution', () => {
    const sql = getPGLiteSchema(768, 'gemini-embedding-001');
    expect(sql).toMatch(/vector\(768\)/);
    expect(sql).toMatch(/'gemini-embedding-001'/);
    expect(sql).not.toMatch(/vector\(1536\)/);
  });

  test('Voyage 1024d substitution', () => {
    const sql = getPGLiteSchema(1024, 'voyage-3-large');
    expect(sql).toMatch(/vector\(1024\)/);
    expect(sql).toMatch(/'voyage-3-large'/);
  });

  test('large local embeddings use halfvec-compatible HNSW indexes', () => {
    const sql = getPGLiteSchema(2560, 'qwen3-embedding:4b');
    expect(sql).toMatch(/halfvec\(2560\)/);
    expect(sql).toMatch(/halfvec_cosine_ops/);
    expect(sql).not.toMatch(/vector\(2560\)/);
    expect(sql).not.toMatch(/embedding vector_cosine_ops/);
  });

  test('PGLITE_SCHEMA_SQL back-compat constant is the default-dim schema', () => {
    expect(PGLITE_SCHEMA_SQL).toBe(getPGLiteSchema());
  });
});
