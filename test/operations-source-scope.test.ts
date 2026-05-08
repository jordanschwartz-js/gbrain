import { describe, expect, test } from 'bun:test';
import { operations, type OperationContext } from '../src/core/operations.ts';

function testContext(engine: any): OperationContext {
  return {
    engine,
    config: { engine: 'postgres' },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    dryRun: false,
    remote: false,
  };
}

describe('page operations source scoping', () => {
  test('delete_page forwards source_id to softDeletePage', async () => {
    const calls: unknown[] = [];
    const engine = {
      softDeletePage: async (slug: string, opts?: { sourceId?: string }) => {
        calls.push({ method: 'softDeletePage', slug, opts });
        return { slug };
      },
    };
    const op = operations.find(o => o.name === 'delete_page')!;

    const result = await op.handler(testContext(engine), {
      slug: 'shared/page',
      source_id: 'default',
    });

    expect(calls).toEqual([
      { method: 'softDeletePage', slug: 'shared/page', opts: { sourceId: 'default' } },
    ]);
    expect(result).toMatchObject({ status: 'soft_deleted', slug: 'shared/page', source_id: 'default' });
  });

  test('delete_page uses source_id for include-deleted disambiguation', async () => {
    const calls: unknown[] = [];
    const engine = {
      softDeletePage: async (slug: string, opts?: { sourceId?: string }) => {
        calls.push({ method: 'softDeletePage', slug, opts });
        return null;
      },
      getPage: async (slug: string, opts?: { sourceId?: string; includeDeleted?: boolean }) => {
        calls.push({ method: 'getPage', slug, opts });
        return { slug, deleted_at: new Date('2026-05-07T00:00:00Z') };
      },
    };
    const op = operations.find(o => o.name === 'delete_page')!;

    const result = await op.handler(testContext(engine), {
      slug: 'shared/page',
      source_id: 'default',
    });

    expect(calls).toEqual([
      { method: 'softDeletePage', slug: 'shared/page', opts: { sourceId: 'default' } },
      { method: 'getPage', slug: 'shared/page', opts: { sourceId: 'default', includeDeleted: true } },
    ]);
    expect(result).toMatchObject({ status: 'already_soft_deleted', slug: 'shared/page', source_id: 'default' });
  });

  test('restore_page forwards source_id to restorePage and getPage', async () => {
    const calls: unknown[] = [];
    const engine = {
      restorePage: async (slug: string, opts?: { sourceId?: string }) => {
        calls.push({ method: 'restorePage', slug, opts });
        return false;
      },
      getPage: async (slug: string, opts?: { sourceId?: string; includeDeleted?: boolean }) => {
        calls.push({ method: 'getPage', slug, opts });
        return { slug, deleted_at: null };
      },
    };
    const op = operations.find(o => o.name === 'restore_page')!;

    const result = await op.handler(testContext(engine), {
      slug: 'shared/page',
      source_id: 'default',
    });

    expect(calls).toEqual([
      { method: 'restorePage', slug: 'shared/page', opts: { sourceId: 'default' } },
      { method: 'getPage', slug: 'shared/page', opts: { sourceId: 'default', includeDeleted: true } },
    ]);
    expect(result).toMatchObject({ status: 'already_active', slug: 'shared/page', source_id: 'default' });
  });
});
