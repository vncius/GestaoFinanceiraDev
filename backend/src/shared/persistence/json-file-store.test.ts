import { promises as fs } from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonFileStore } from './json-file-store';
import { DEFAULT_TENANT_ID } from '../tenant/tenant.constants';

interface Item {
  id: string;
  tenantId: string;
  value: number;
}

const TENANT_A = DEFAULT_TENANT_ID;
const TENANT_B = '00000000-0000-0000-0000-000000000002';

const DATA_DIR = path.join(process.cwd(), 'data');
const createdFiles: string[] = [];

function makeStore(): { store: JsonFileStore<Item>; fileName: string; filePath: string } {
  const fileName = `__test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  createdFiles.push(fileName);
  return { store: new JsonFileStore<Item>(fileName), fileName, filePath: path.join(DATA_DIR, fileName) };
}

afterEach(async () => {
  await Promise.all(
    createdFiles.splice(0).map((f) =>
      fs.rm(path.join(DATA_DIR, f), { force: true }),
    ),
  );
});

describe('JsonFileStore', () => {
  it('creates the file empty and reads an empty list', async () => {
    const { store } = makeStore();
    expect(await store.findAll(TENANT_A)).toEqual([]);
  });

  it('persists created items and reads them back', async () => {
    const { store } = makeStore();
    await store.create({ id: '1', tenantId: TENANT_A, value: 10 });
    await store.create({ id: '2', tenantId: TENANT_A, value: 20 });
    const all = await store.findAll(TENANT_A);
    expect(all).toEqual([
      { id: '1', tenantId: TENANT_A, value: 10 },
      { id: '2', tenantId: TENANT_A, value: 20 },
    ]);
  });

  it('createMany writes all items with a single append', async () => {
    const { store } = makeStore();
    await store.create({ id: '0', tenantId: TENANT_A, value: 0 });
    const created = await store.createMany([
      { id: '1', tenantId: TENANT_A, value: 10 },
      { id: '2', tenantId: TENANT_A, value: 20 },
      { id: '3', tenantId: TENANT_A, value: 30 },
    ]);
    expect(created).toHaveLength(3);
    const all = await store.findAll(TENANT_A);
    expect(all.map((i) => i.id)).toEqual(['0', '1', '2', '3']);
  });

  it('createMany with an empty list is a no-op', async () => {
    const { store } = makeStore();
    await store.create({ id: '1', tenantId: TENANT_A, value: 10 });
    await store.createMany([]);
    expect(await store.findAll(TENANT_A)).toEqual([{ id: '1', tenantId: TENANT_A, value: 10 }]);
  });

  it('update merges fields and preserves the rest', async () => {
    const { store } = makeStore();
    await store.create({ id: '1', tenantId: TENANT_A, value: 10 });
    const updated = await store.update('1', { value: 99 }, TENANT_A);
    expect(updated).toEqual({ id: '1', tenantId: TENANT_A, value: 99 });
  });

  it('delete removes only the matching item', async () => {
    const { store } = makeStore();
    await store.create({ id: '1', tenantId: TENANT_A, value: 10 });
    await store.create({ id: '2', tenantId: TENANT_A, value: 20 });
    await store.delete('1', TENANT_A);
    expect(await store.findAll(TENANT_A)).toEqual([{ id: '2', tenantId: TENANT_A, value: 20 }]);
  });

  it('never leaves a .tmp file behind after a write', async () => {
    const { store, fileName } = makeStore();
    await store.create({ id: '1', tenantId: TENANT_A, value: 10 });
    await store.update('1', { value: 20 }, TENANT_A);
    const dirEntries = await fs.readdir(DATA_DIR);
    const leftoverTmp = dirEntries.filter((f) => f.startsWith(fileName) && f.endsWith('.tmp'));
    expect(leftoverTmp).toEqual([]);
  });

  it('does not corrupt the file when writes race concurrently (serialized via lock)', async () => {
    const { store } = makeStore();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.create({ id: String(i), tenantId: TENANT_A, value: i })),
    );
    const all = await store.findAll(TENANT_A);
    expect(all).toHaveLength(20);
    expect(new Set(all.map((i) => i.id)).size).toBe(20);
  });

  describe('tenant isolation', () => {
    it('findAll only returns records belonging to the given tenant', async () => {
      const { store } = makeStore();
      await store.create({ id: '1', tenantId: TENANT_A, value: 10 });
      await store.create({ id: '2', tenantId: TENANT_B, value: 20 });

      expect(await store.findAll(TENANT_A)).toEqual([{ id: '1', tenantId: TENANT_A, value: 10 }]);
      expect(await store.findAll(TENANT_B)).toEqual([{ id: '2', tenantId: TENANT_B, value: 20 }]);
    });

    it('findById/update/delete cannot see or touch another tenant\'s record', async () => {
      const { store } = makeStore();
      await store.create({ id: '1', tenantId: TENANT_A, value: 10 });

      expect(await store.findById('1', TENANT_B)).toBeNull();
      await expect(store.update('1', { value: 99 }, TENANT_B)).rejects.toThrow();
      await store.delete('1', TENANT_B);
      expect(await store.findAll(TENANT_A)).toEqual([{ id: '1', tenantId: TENANT_A, value: 10 }]);
    });

    it('treats legacy records without tenantId as belonging to DEFAULT_TENANT_ID', async () => {
      const { store, filePath } = makeStore();
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(filePath, JSON.stringify([{ id: 'legacy', value: 42 }]), 'utf-8');

      const all = await store.findAll(DEFAULT_TENANT_ID);
      expect(all).toEqual([{ id: 'legacy', tenantId: DEFAULT_TENANT_ID, value: 42 }]);
    });

    it('replaceAllForTenant swaps only the target tenant\'s records', async () => {
      const { store } = makeStore();
      await store.create({ id: '1', tenantId: TENANT_A, value: 10 });
      await store.create({ id: '2', tenantId: TENANT_B, value: 20 });

      await store.replaceAllForTenant(TENANT_A, [{ id: '3', tenantId: TENANT_A, value: 30 }]);

      expect(await store.findAll(TENANT_A)).toEqual([{ id: '3', tenantId: TENANT_A, value: 30 }]);
      expect(await store.findAll(TENANT_B)).toEqual([{ id: '2', tenantId: TENANT_B, value: 20 }]);
    });
  });
});
