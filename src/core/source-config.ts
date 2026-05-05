import type { BrainEngine } from './engine.ts';
import type { SyncStrategy } from './sync.ts';

export type SourceConfig = Record<string, unknown>;

/**
 * sources.config has existed through a few storage shapes in the wild:
 * a jsonb object, a JSON string, and occasionally a double-encoded JSON
 * string. Normalize all of them before making routing decisions.
 */
export function parseSourceConfig(raw: unknown): SourceConfig {
  let value = raw;
  for (let i = 0; i < 2 && typeof value === 'string'; i++) {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as SourceConfig) };
}

export function sourceConfigWithStrategy(raw: unknown, strategy: SyncStrategy): SourceConfig {
  const config = parseSourceConfig(raw);
  config.strategy = strategy;
  config.sync_strategy = strategy;
  if (strategy === 'code') {
    config.source_kind = 'code';
  } else if (config.source_kind === 'code') {
    delete config.source_kind;
  }
  return config;
}

export function isCodeSourceLike(
  rawConfig: unknown,
  hints: { codePages?: number; markdownPages?: number } = {},
): boolean {
  const config = parseSourceConfig(rawConfig);
  const kind = String(
    config.source_kind ?? config.strategy ?? config.sync_strategy ?? config.page_kind ?? '',
  ).toLowerCase();
  if (kind === 'code') return true;

  const codePages = Number(hints.codePages ?? 0);
  const markdownPages = Number(hints.markdownPages ?? 0);
  return codePages > 0 && markdownPages === 0;
}

export async function markSourceStrategy(
  engine: BrainEngine,
  sourceId: string,
  strategy: SyncStrategy,
): Promise<void> {
  const rows = await engine.executeRaw<{ config: unknown }>(
    `SELECT config FROM sources WHERE id = $1`,
    [sourceId],
  );
  if (rows.length === 0) return;

  const config = sourceConfigWithStrategy(rows[0]!.config, strategy);
  await engine.executeRaw(
    `UPDATE sources SET config = $1::jsonb WHERE id = $2`,
    [JSON.stringify(config), sourceId],
  );
}
