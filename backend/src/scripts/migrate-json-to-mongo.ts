// Migração única: importa os arquivos JSON legados de backend/data/ para as
// coleções correspondentes no MongoDB. Idempotente — usa upsert por `id`,
// então pode ser executado mais de uma vez sem duplicar registros.
import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { connectMongo, closeMongo } from '../shared/persistence/mongo-client';
import { DEFAULT_TENANT_ID } from '../shared/tenant/tenant.constants';

const DATA_DIR = path.join(process.cwd(), 'data');

const FILE_TO_COLLECTION: Record<string, string> = {
  'accounts.json': 'accounts',
  'account-types.json': 'account_types',
  'categories.json': 'categories',
  'settings.json': 'settings',
  'financial-transactions.json': 'financial_transactions',
  'credit-cards.json': 'credit_cards',
  'credit-card-entries.json': 'credit_card_entries',
  'credit-card-installments.json': 'credit_card_installments',
  'credit-card-invoices.json': 'credit_card_invoices',
};

async function migrateFile(db: Awaited<ReturnType<typeof connectMongo>>, fileName: string, collectionName: string) {
  const filePath = path.join(DATA_DIR, fileName);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch {
    console.log(`  [skip] ${fileName} não encontrado.`);
    return;
  }

  const content = raw.replace(/^﻿/, '').trim();
  if (!content) {
    console.log(`  [skip] ${fileName} vazio.`);
    return;
  }

  const items = (JSON.parse(content) as Array<Record<string, unknown>>).map((item) =>
    item.tenantId ? item : { ...item, tenantId: DEFAULT_TENANT_ID },
  );

  if (items.length === 0) {
    console.log(`  [skip] ${fileName} sem registros.`);
    return;
  }

  const collection = db.collection(collectionName);
  await collection.createIndex({ tenantId: 1, id: 1 }, { unique: true });

  const result = await collection.bulkWrite(
    items.map((item) => ({
      replaceOne: {
        filter: { id: item.id },
        replacement: item,
        upsert: true,
      },
    })),
  );

  console.log(
    `  [ok] ${fileName} → ${collectionName}: ${items.length} registro(s) (${result.upsertedCount} novo(s), ${result.modifiedCount} atualizado(s)).`,
  );
}

async function main() {
  console.log('\n📦 Migrando dados de backend/data/*.json para o MongoDB...\n');

  const db = await connectMongo();

  for (const [fileName, collectionName] of Object.entries(FILE_TO_COLLECTION)) {
    await migrateFile(db, fileName, collectionName);
  }

  console.log('\n✅ Migração concluída!\n');
}

main()
  .catch((err) => {
    console.error('\n❌ Erro na migração:', err);
    process.exitCode = 1;
  })
  .finally(() => closeMongo());
