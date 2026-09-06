import { AsyncLocalStorage } from 'async_hooks';
import { ClientSession } from 'mongodb';
import { getClient } from './mongo-client';

// A sessão fica em AsyncLocalStorage em vez de virar parâmetro de todo método
// de repositório: qualquer operação do MongoStore feita dentro do callback de
// runInTransaction entra na transação automaticamente, sem que as ~15
// interfaces de repositório precisem carregar um `session?` que só o Mongo usa.
const storage = new AsyncLocalStorage<ClientSession>();

// Transações exigem replica set (Atlas tem; um mongod standalone de dev, não).
// Descoberto na primeira tentativa e memorizado, para não pagar o custo de
// abrir/abortar sessão a cada escrita num ambiente que não suporta.
let transactionsSupported: boolean | null = null;

export function getActiveSession(): ClientSession | undefined {
  return storage.getStore();
}

function isUnsupportedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: number } | null)?.code;
  return (
    code === 20 ||
    /Transaction numbers are only allowed on a replica set member or mongos/i.test(message) ||
    /transactions are not supported/i.test(message)
  );
}

/**
 * Executa `fn` como uma unidade atômica: ou todas as escritas feitas dentro
 * dela são aplicadas, ou nenhuma. Usado pelas operações que tocam as duas
 * pernas de uma transferência, onde uma falha no meio deixaria origem e
 * destino com status divergentes.
 *
 * Degrada com segurança: sem conexão Mongo (testes com repositórios em
 * memória) ou num deployment sem replica set, apenas executa `fn` direto.
 * Reentrante — uma chamada aninhada reaproveita a sessão já ativa em vez de
 * abrir uma transação dentro de outra, o que o Mongo não permite.
 */
export async function runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (storage.getStore()) return fn();

  const client = getClient();
  if (!client || transactionsSupported === false) return fn();

  const session = client.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await storage.run(session, fn);
    });
    transactionsSupported = true;
    return result!;
  } catch (err) {
    if (isUnsupportedError(err)) {
      transactionsSupported = false;
      return fn();
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
