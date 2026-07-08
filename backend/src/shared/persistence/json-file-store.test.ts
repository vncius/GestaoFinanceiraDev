import { promises as fs } from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonFileStore } from './json-file-store';

interface Item {
  id: string;
  value: number;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const createdFiles: string[] = [];

function makeStore(): { store: JsonFileStore<Item>; fileName: string } {
  const fileName = `__test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  createdFiles.push(fileName);
  return { store: new JsonFileStore<Item>(fileName), fileName };
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
    expect(await store.findAll()).toEqual([]);
  });

  it('persists created items and reads them back', async () => {
    const { store } = makeStore();
    await store.create({ id: '1', value: 10 });
    await store.create({ id: '2', value: 20 });
    const all = await store.findAll();
    expect(all).toEqual([
      { id: '1', value: 10 },
      { id: '2', value: 20 },
    ]);
  });

  it('createMany writes all items with a single append', async () => {
    const { store } = makeStore();
    await store.create({ id: '0', value: 0 });
    const created = await store.createMany([
      { id: '1', value: 10 },
      { id: '2', value: 20 },
      { id: '3', value: 30 },
    ]);
    expect(created).toHaveLength(3);
    const all = await store.findAll();
    expect(all.map((i) => i.id)).toEqual(['0', '1', '2', '3']);
  });

  it('createMany with an empty list is a no-op', async () => {
    const { store } = makeStore();
    await store.create({ id: '1', value: 10 });
    await store.createMany([]);
    expect(await store.findAll()).toEqual([{ id: '1', value: 10 }]);
  });

  it('update merges fields and preserves the rest', async () => {
    const { store } = makeStore();
    await store.create({ id: '1', value: 10 });
    const updated = await store.update('1', { value: 99 });
    expect(updated).toEqual({ id: '1', value: 99 });
  });

  it('delete removes only the matching item', async () => {
    const { store } = makeStore();
    await store.create({ id: '1', value: 10 });
    await store.create({ id: '2', value: 20 });
    await store.delete('1');
    expect(await store.findAll()).toEqual([{ id: '2', value: 20 }]);
  });

  it('never leaves a .tmp file behind after a write', async () => {
    const { store, fileName } = makeStore();
    await store.create({ id: '1', value: 10 });
    await store.update('1', { value: 20 });
    const dirEntries = await fs.readdir(DATA_DIR);
    const leftoverTmp = dirEntries.filter((f) => f.startsWith(fileName) && f.endsWith('.tmp'));
    expect(leftoverTmp).toEqual([]);
  });

  it('does not corrupt the file when writes race concurrently (serialized via lock)', async () => {
    const { store } = makeStore();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.create({ id: String(i), value: i })),
    );
    const all = await store.findAll();
    expect(all).toHaveLength(20);
    expect(new Set(all.map((i) => i.id)).size).toBe(20);
  });
});
