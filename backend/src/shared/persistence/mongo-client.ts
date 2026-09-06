import { MongoClient, ServerApiVersion, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;
let connecting: Promise<Db> | null = null;

// Conexão única, reaproveitada por todos os MongoStore da aplicação.
export function connectMongo(): Promise<Db> {
  if (db) return Promise.resolve(db);
  if (connecting) return connecting;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI não configurada. Defina-a no arquivo .env.');
  }
  const dbName = process.env.MONGODB_DB_NAME ?? 'gestao_financeira';

  connecting = (async () => {
    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    console.log('[mongo] Conectado ao MongoDB Atlas.');
    db = client.db(dbName);
    return db;
  })();

  return connecting;
}

// Exposto para o controle de transações (mongo-transaction.ts), que precisa
// abrir sessões no client — e devolve null antes do bootstrap, para que a
// execução sem Mongo (testes com repositórios em memória) degrade sozinha.
export function getClient(): MongoClient | null {
  return client;
}

export function getDb(): Db {
  if (!db) {
    throw new Error('MongoDB ainda não conectado. Chame connectMongo() no bootstrap do servidor.');
  }
  return db;
}

export async function closeMongo(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
  connecting = null;
}
