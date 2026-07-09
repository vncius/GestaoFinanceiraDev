import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { AccountsFileRepository } from '../modules/accounts/accounts.file-repository';
import { AccountTypesFileRepository } from '../modules/account-types/account-types.file-repository';
import { CategoriesFileRepository } from '../modules/categories/categories.file-repository';
import { CategoryType } from '../modules/categories/categories.types';
import { SettingsFileRepository } from '../modules/settings/settings.file-repository';
import { generateId } from '../shared/utils/id.utils';
import { nowISO } from '../shared/utils/date.utils';
import { DEFAULT_TENANT_ID } from '../shared/tenant/tenant.constants';

const accountsRepo = new AccountsFileRepository();
const accountTypesRepo = new AccountTypesFileRepository();
const categoriesRepo = new CategoriesFileRepository();
const settingsRepo = new SettingsFileRepository();

async function seedAccountTypes() {
  const existing = await accountTypesRepo.findAll(DEFAULT_TENANT_ID);
  if (existing.length > 0) {
    console.log('  [account-types] Já existem tipos — pulando seed.');
    return existing;
  }

  const now = nowISO();
  const names = ['Conta Principal', 'Reserva de Emergência'];
  const types = [];
  for (const name of names) {
    const created = await accountTypesRepo.create({
      id: generateId(),
      tenantId: DEFAULT_TENANT_ID,
      name,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    types.push(created);
    console.log(`  [account-types] Criado: ${name}`);
  }
  return types;
}

async function seedAccounts(mainTypeId: string, reserveTypeId: string) {
  const existing = await accountsRepo.findAll(DEFAULT_TENANT_ID);
  if (existing.length > 0) {
    console.log('  [accounts] Já existem contas — pulando seed.');
    return existing;
  }

  const now = nowISO();
  const accounts = [
    {
      id: generateId(),
      tenantId: DEFAULT_TENANT_ID,
      name: 'Conta Principal',
      accountTypeId: mainTypeId,
      initialBalance: 0,
      initialBalanceDate: now,
      active: true,
      autoReserveEnabled: false,
      autoReservePercentage: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      tenantId: DEFAULT_TENANT_ID,
      name: 'Reserva de Emergência',
      accountTypeId: reserveTypeId,
      initialBalance: 0,
      initialBalanceDate: now,
      active: true,
      autoReserveEnabled: true,
      autoReservePercentage: 30,
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const account of accounts) {
    await accountsRepo.create(account);
    console.log(`  [accounts] Criada: ${account.name}`);
  }

  return accounts;
}

async function seedCategories() {
  const existing = await categoriesRepo.findAll(DEFAULT_TENANT_ID);
  if (existing.length > 0) {
    console.log('  [categories] Já existem categorias — pulando seed.');
    return;
  }

  const now = nowISO();

  const incomeCategories = [
    'Projeto PJ',
    'Nota fiscal',
    'Serviço avulso',
    'Reembolso',
    'Rendimento',
    'Ajuste positivo',
    'Outros recebimentos',
  ];

  const expenseCategories = [
    'Moradia',
    'Alimentação',
    'Transporte',
    'Carro',
    'Sophia',
    'Saúde',
    'Lazer',
    'Impostos',
    'Educação',
    'Assinaturas',
    'Viagem',
    'Emergência',
    'Cartão de crédito',
    'Outros pagamentos',
  ];

  for (const name of incomeCategories) {
    await categoriesRepo.create({
      id: generateId(),
      tenantId: DEFAULT_TENANT_ID,
      name,
      type: CategoryType.INCOME,
      active: true,
      protected: name === 'Nota fiscal',
      createdAt: now,
      updatedAt: now,
    });
    console.log(`  [categories] Recebimento: ${name}`);
  }

  for (const name of expenseCategories) {
    await categoriesRepo.create({
      id: generateId(),
      tenantId: DEFAULT_TENANT_ID,
      name,
      type: CategoryType.EXPENSE,
      active: true,
      protected: false,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`  [categories] Pagamento: ${name}`);
  }
}

async function seedSettings(mainAccountId: string) {
  const existing = await settingsRepo.get(DEFAULT_TENANT_ID);
  if (existing) {
    console.log('  [settings] Configuração já existe — pulando seed.');
    return;
  }

  const now = nowISO();
  const today = new Date();

  await settingsRepo.upsert({
    id: generateId(),
    tenantId: DEFAULT_TENANT_ID,
    mainAccountId,
    minimumMainBalance: 0,
    annualRevenueLimit: 0,
    controlStartMonth: today.getMonth() + 1,
    controlStartYear: today.getFullYear(),
    pjLimitControlEnabled: true,
    createdAt: now,
    updatedAt: now,
  });

  console.log('  [settings] Configuração padrão criada');
}

async function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });
}

async function main() {
  console.log('\n🌱 Iniciando seed...\n');

  await ensureDataDir();

  const [mainType, reserveType] = await seedAccountTypes();
  const accounts = await seedAccounts(mainType.id, reserveType.id);
  await seedCategories();

  const main = accounts.find((a) => a.accountTypeId === mainType.id);

  if (main) {
    await seedSettings(main.id);
  }

  console.log('\n✅ Seed concluído!\n');
}

main().catch((err) => {
  console.error('\n❌ Erro no seed:', err);
  process.exit(1);
});
