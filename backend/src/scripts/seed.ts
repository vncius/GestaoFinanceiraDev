import 'dotenv/config';
import { connectMongo, closeMongo } from '../shared/persistence/mongo-client';
import { AccountsMongoRepository } from '../modules/accounts/accounts.mongo-repository';
import { AccountTypesMongoRepository } from '../modules/account-types/account-types.mongo-repository';
import { CategoriesMongoRepository } from '../modules/categories/categories.mongo-repository';
import { CategoryType } from '../modules/categories/categories.types';
import { SettingsMongoRepository } from '../modules/settings/settings.mongo-repository';
import { generateId } from '../shared/utils/id.utils';
import { nowISO } from '../shared/utils/date.utils';
import { DEFAULT_TENANT_ID } from '../shared/tenant/tenant.constants';

const accountsRepo = new AccountsMongoRepository();
const accountTypesRepo = new AccountTypesMongoRepository();
const categoriesRepo = new CategoriesMongoRepository();
const settingsRepo = new SettingsMongoRepository();

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
      autoReserveTargetAccountId: null,
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
      // Regra de reserva automática (E8) precisa ser configurada manualmente
      // depois do seed — precisa apontar da conta de origem para esta conta,
      // e a conta de origem só existe a partir daqui.
      autoReserveEnabled: false,
      autoReservePercentage: 0,
      autoReserveTargetAccountId: null,
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
      createdAt: now,
      updatedAt: now,
    });
    console.log(`  [categories] Pagamento: ${name}`);
  }
}

async function seedSettings() {
  const existing = await settingsRepo.get(DEFAULT_TENANT_ID);
  if (existing) {
    console.log('  [settings] Configuração já existe — pulando seed.');
    return;
  }

  const now = nowISO();

  await settingsRepo.upsert({
    id: generateId(),
    tenantId: DEFAULT_TENANT_ID,
    dashboardScope: 'CONSOLIDATED',
    createdAt: now,
    updatedAt: now,
  });

  console.log('  [settings] Configuração padrão criada');
}

async function main() {
  console.log('\n🌱 Iniciando seed...\n');

  await connectMongo();

  const [mainType, reserveType] = await seedAccountTypes();
  await seedAccounts(mainType.id, reserveType.id);
  await seedCategories();
  await seedSettings();

  console.log('\n✅ Seed concluído!\n');
}

main()
  .catch((err) => {
    console.error('\n❌ Erro no seed:', err);
    process.exitCode = 1;
  })
  .finally(() => closeMongo());
