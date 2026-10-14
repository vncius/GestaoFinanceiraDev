import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Coleção falsa em memória, só com o que o MongoStore usa. Filtros por
// igualdade simples — o suficiente para conferir que toda operação filtra
// por tenantId e o que de fato é gravado no banco.
type Doc = Record<string, unknown>;
const stored = vi.hoisted(() => ({ docs: [] as Record<string, unknown>[] }));

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([k, v]) => doc[k] === v);
}
function strip(doc: Doc): Doc {
  const { _id: _ignored, ...rest } = doc;
  return { ...rest };
}

vi.mock('./mongo-client', () => ({
  getDb: () => ({
    collection: () => ({
      createIndex: async () => 'ok',
      find: (filter: Doc) => ({ toArray: async () => stored.docs.filter((d) => matches(d, filter)).map(strip) }),
      findOne: async (filter: Doc) => {
        const d = stored.docs.find((x) => matches(x, filter));
        return d ? strip(d) : null;
      },
      insertOne: async (doc: Doc) => void stored.docs.push({ ...doc }),
      insertMany: async (docs: Doc[]) => void stored.docs.push(...docs.map((d) => ({ ...d }))),
      findOneAndUpdate: async (filter: Doc, update: { $set: Doc }) => {
        const d = stored.docs.find((x) => matches(x, filter));
        if (!d) return null;
        Object.assign(d, update.$set);
        return strip(d);
      },
      deleteOne: async (filter: Doc) => {
        stored.docs = stored.docs.filter((d) => !matches(d, filter));
      },
      deleteMany: async (filter: Doc) => {
        stored.docs = stored.docs.filter((d) => !matches(d, filter));
      },
    }),
  }),
}));
vi.mock('./mongo-transaction', () => ({ getActiveSession: () => undefined }));

import { MongoStore } from './mongo-store';

interface Tx {
  id: string;
  tenantId: string;
  description: string;
  notes: string | null;
  amount: number;
}

const tx = (id: string, tenantId: string, description = 'Aluguel'): Tx => ({
  id,
  tenantId,
  description,
  notes: 'apto 12',
  amount: 150000,
});

describe('MongoStore', () => {
  const originalKey = process.env.ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });
  afterAll(() => {
    process.env.ENCRYPTION_KEY = originalKey;
  });
  beforeEach(() => {
    stored.docs = [];
  });

  const store = new MongoStore<Tx>('financial_transactions', [], { encryptedFields: ['description', 'notes'] });

  it('grava descrição/observações criptografadas e devolve legível', async () => {
    await store.create(tx('t1', 'A'));

    expect(stored.docs[0].description).toMatch(/^enc:v1:/);
    expect(stored.docs[0].notes).toMatch(/^enc:v1:/);
    expect(stored.docs[0].amount).toBe(150000);
    expect(JSON.stringify(stored.docs)).not.toContain('Aluguel');

    expect(await store.findById('t1', 'A')).toEqual(tx('t1', 'A'));
    expect(await store.findAll('A')).toEqual([tx('t1', 'A')]);
  });

  it('update criptografa o que muda e devolve legível', async () => {
    await store.create(tx('t1', 'A'));
    const updated = await store.update('t1', { description: 'Condomínio' }, 'A');
    expect(updated.description).toBe('Condomínio');
    expect(stored.docs[0].description).toMatch(/^enc:v1:/);
  });

  it('lê registro antigo ainda em texto puro', async () => {
    stored.docs.push({ ...tx('t0', 'A', 'Antigo') });
    expect((await store.findById('t0', 'A'))?.description).toBe('Antigo');
  });

  it('isolamento: nunca lê, altera ou apaga registro de outro tenant', async () => {
    await store.createMany([tx('t1', 'A'), tx('t2', 'B')]);

    expect((await store.findAll('A')).map((t) => t.id)).toEqual(['t1']);
    expect(await store.findById('t2', 'A')).toBeNull();
    await expect(store.update('t2', { amount: 1 }, 'A')).rejects.toThrow();
    await store.delete('t2', 'A');
    await store.replaceAllForTenant('A', []);

    expect(stored.docs.map((d) => d.id)).toEqual(['t2']);
    expect(stored.docs[0].amount).toBe(150000);
  });
});
