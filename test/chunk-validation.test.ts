import { describe, expect, test } from 'bun:test';
import { assertUniqueChunkIndices } from '../src/core/chunk-validation.ts';

describe('assertUniqueChunkIndices', () => {
  test('throws a source-scoped error for duplicate chunk indices', () => {
    expect(() => assertUniqueChunkIndices('shared/page', [
      { chunk_index: 0, chunk_text: 'first', chunk_source: 'compiled_truth' },
      { chunk_index: 0, chunk_text: 'second', chunk_source: 'compiled_truth' },
    ], { sourceId: 'source-a' })).toThrow(/source-a:shared\/page.*0/);
  });

  test('allows unique chunk indices', () => {
    expect(() => assertUniqueChunkIndices('shared/page', [
      { chunk_index: 0, chunk_text: 'first', chunk_source: 'compiled_truth' },
      { chunk_index: 1, chunk_text: 'second', chunk_source: 'compiled_truth' },
    ])).not.toThrow();
  });
});
