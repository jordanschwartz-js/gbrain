import type { ChunkInput } from './types.ts';

export function assertUniqueChunkIndices(
  slug: string,
  chunks: ChunkInput[],
  opts?: { sourceId?: string },
): void {
  const seen = new Set<number>();
  const duplicates = new Set<number>();

  for (const chunk of chunks) {
    if (seen.has(chunk.chunk_index)) {
      duplicates.add(chunk.chunk_index);
    } else {
      seen.add(chunk.chunk_index);
    }
  }

  if (duplicates.size > 0) {
    const label = opts?.sourceId ? `${opts.sourceId}:${slug}` : slug;
    throw new Error(`Duplicate chunk_index for ${label}: ${Array.from(duplicates).sort((a, b) => a - b).join(', ')}`);
  }
}
