// Dados FICTÍCIOS para demonstração e prints do portfólio (U21 do plano de UX).
//
// Uso (sempre num banco separado, nunca o de produção):
//   MONGODB_DB_NAME=gestao_financeira_demo npm run seed:demo
//
// 1. Suba o backend apontando para o banco de demo e faça login uma vez (cria
//    o usuário/tenant).
// 2. Rode este script: ele APAGA os dados do tenant desse usuário e recria
//    três meses de movimentação verossímil (contas, cartão, parcelas, fixos,
//    transferência, reserva automática, itens atrasados e a vencer).
// Pode ser rodado de novo quantas vezes quiser (sempre recria do zero).
import 'dotenv/config';
import { connectMongo, closeMongo, getDb } from '../shared/persistence/mongo-client';
import { AccountsMongoRepository } from '../modules/accounts/accounts.mongo-repository';
import { AccountTypesMongoRepository } from '../modules/account-types/account-types.mongo-repository';
import { CategoriesMongoRepository } from '../modules/categories/categories.mongo-repository';
import { FinancialTransactionsMongoRepository } from '../modules/financial-transactions/financial-transactions.mongo-repository';
import {
  CreditCardsMongoRepository,
  CreditCardEntriesMongoRepository,
  CreditCardInstallmentsMongoRepository,
  CreditCardInvoicesMongoRepository,
} from '../modules/credit-cards/credit-cards.mongo-repository';
import { OnboardingStateMongoRepository } from '../modules/onboarding/onboarding.mongo-repository';
import { AccountsService } from '../modules/accounts/accounts.service';
import { AccountTypesService } from '../modules/account-types/account-types.service';
import { CategoriesService } from '../modules/categories/categories.service';
import { TenantBootstrapService } from '../modules/tenant-bootstrap/tenant-bootstrap.service';
import { TransfersService } from '../modules/transfers/transfers.service';
import { CashFlowService } from '../modules/cash-flow/cash-flow.service';
import { CreditCardsService } from '../modules/credit-cards/credit-cards.service';
import { CardEntryType } from '../modules/credit-cards/credit-cards.types';
import { RecurrenceType, TransactionStatus, TransactionType } from '../modules/financial-transactions/financial-transactions.types';
import { createEmptyDraft, OnboardingStatus } from '../modules/onboarding/onboarding.types';
import { generateId } from '../shared/utils/id.utils';
import { nowISO } from '../shared/utils/date.utils';

const TENANT_COLLECTIONS = [
  'accounts', 'account_types', 'categories', 'settings', 'financial_transactions',
  'credit_cards', 'credit_card_entries', 'credit_card_installments', 'credit_card_invoices',
  'onboarding_states', 'onboarding_messages',
];

const reais = (v: number) => Math.round(v * 100);

async function main() {
  const dbName = process.env.MONGODB_DB_NAME ?? '';
  if (!dbName.includes('demo')) {
    throw new Error(`Recusado: MONGODB_DB_NAME="${dbName}". Este script apaga dados e só roda num banco com "demo" no nome.`);
  }
  await connectMongo();
  const db = getDb();

  const users = await db.collection('users').find({}).toArray();
  const email = process.argv.find((a) => a.startsWith('--email='))?.slice('--email='.length);
  const user = email ? users.find((u) => u.email === email) : users.length === 1 ? users[0] : null;
  if (!user) {
    throw new Error(users.length === 0
      ? 'Nenhum usuário no banco de demo: faça login uma vez com o backend apontando para ele.'
      : 'Mais de um usuário: informe --email=<email>.');
  }
  const tenantId = user.tenantId as string;
  console.log(`[demo] Banco ${dbName}, tenant ${tenantId}`);

  for (const name of TENANT_COLLECTIONS) {
    await db.collection(name).deleteMany({ tenantId });
  }

  // ── Serviços (mesma montagem do container) ────────────────────────────────
  const accountsRepo = new AccountsMongoRepository();
  const accountTypesRepo = new AccountTypesMongoRepository();
  const categoriesRepo = new CategoriesMongoRepository();
  const transactionsRepo = new FinancialTransactionsMongoRepository();
  const cardsRepo = new CreditCardsMongoRepository();
  const entriesRepo = new CreditCardEntriesMongoRepository();
  const installmentsRepo = new CreditCardInstallmentsMongoRepository();
  const invoicesRepo = new CreditCardInvoicesMongoRepository();
  const accounts = new AccountsService(accountsRepo, cardsRepo);
  const categories = new CategoriesService(categoriesRepo);
  const bootstrap = new TenantBootstrapService(new AccountTypesService(accountTypesRepo), accounts, categories);
  const transfers = new TransfersService(transactionsRepo, accountsRepo);
  const cashFlow = new CashFlowService(transactionsRepo, accountsRepo, invoicesRepo, cardsRepo, transfers, categoriesRepo);
  const cards = new CreditCardsService(cardsRepo, entriesRepo, installmentsRepo, invoicesRepo, transactionsRepo, categoriesRepo, accountsRepo);

  // Onboarding concluído: o app abre direto no Início.
  const now = nowISO();
  await new OnboardingStateMongoRepository().upsert({
    id: generateId(), tenantId, status: OnboardingStatus.COMPLETED_MANUAL, draft: createEmptyDraft(),
    conversationSummary: null, language: null, appliedEntityIds: {}, confirmIdempotencyKey: null,
    appliedAt: null, createdAt: now, updatedAt: now,
  });

  // ── Base: tipos, categorias e conta principal ─────────────────────────────
  await bootstrap.seedDefaults(tenantId);
  const cat = new Map((await categoriesRepo.findAll(tenantId)).map((c) => [c.name, c.id]));
  const c = (name: string) => {
    const id = cat.get(name);
    if (!id) throw new Error(`categoria ${name}`);
    return id;
  };

  const [main] = await accountsRepo.findAll(tenantId);
  const pessoal = await accounts.update(main.id, { name: 'Conta corrente', initialBalance: reais(4200) }, tenantId);
  const noReserve = { autoReserveEnabled: false, autoReservePercentage: 0 };
  const reserva = await accounts.create(tenantId, { name: 'Reserva de emergência', initialBalance: reais(15000), ...noReserve });
  const pj = await accounts.create(tenantId, { name: 'Conta PJ', initialBalance: reais(6500), ...noReserve });
  // 10% de toda entrada recebida na PJ vai sozinho para a reserva.
  await accounts.update(pj.id, { autoReserveEnabled: true, autoReservePercentage: 10, autoReserveTargetAccountId: reserva.id }, tenantId);

  // ── Datas: dois meses atrás, mês passado e mês atual ──────────────────────
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const monthAt = (offset: number) => {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  };
  const day = (offset: number, d: number) => {
    const { month, year } = monthAt(offset);
    return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00.000Z`;
  };

  // Fixos (criados no primeiro mês; a recorrência gera os seguintes).
  const fixed = RecurrenceType.FIXED;
  const unique = RecurrenceType.UNIQUE;
  await cashFlow.createIncome(tenantId, pj.id, { description: 'Projeto — Cliente Alfa', categoryId: c('Projeto PJ'), amount: reais(9800), expectedDate: day(-2, 5), recurrence: fixed });
  await cashFlow.createPayment(tenantId, pessoal.id, { description: 'Aluguel', categoryId: c('Moradia'), amount: reais(2300), expectedDate: day(-2, 10), recurrence: fixed });
  await cashFlow.createPayment(tenantId, pessoal.id, { description: 'Internet fibra', categoryId: c('Moradia'), amount: reais(129.9), expectedDate: day(-2, 15), recurrence: fixed });
  await cashFlow.createPayment(tenantId, pessoal.id, { description: 'Plano de saúde', categoryId: c('Saúde'), amount: reais(489), expectedDate: day(-2, 8), recurrence: fixed });
  await cashFlow.createPayment(tenantId, pessoal.id, { description: 'Academia', categoryId: c('Saúde'), amount: reais(119.9), expectedDate: day(-2, 12), recurrence: fixed });
  await cashFlow.createPayment(tenantId, pj.id, { description: 'DAS — Simples Nacional', categoryId: c('Impostos'), amount: reais(588), expectedDate: day(-2, 20), recurrence: fixed });

  // Variáveis, mês a mês.
  const variable: [number, string, string, number, number][] = [
    // [mês, descrição, categoria, valor, dia]
    [-2, 'Supermercado', 'Alimentação', 742.35, 7], [-2, 'Feira', 'Alimentação', 168.4, 21], [-2, 'Conta de luz', 'Moradia', 231.18, 18], [-2, 'Combustível', 'Transporte', 310, 14],
    [-1, 'Supermercado', 'Alimentação', 689.9, 6], [-1, 'Feira', 'Alimentação', 151.2, 20], [-1, 'Conta de luz', 'Moradia', 248.6, 18], [-1, 'Combustível', 'Transporte', 285.5, 13], [-1, 'Cinema e jantar', 'Lazer', 214, 23],
    [0, 'Supermercado', 'Alimentação', 712.4, 5], [0, 'Combustível', 'Transporte', 298, 11], [0, 'Conta de luz', 'Moradia', 239.75, 18], [0, 'Feira', 'Alimentação', 160, 24],
  ];
  for (const [m, description, category, value, d] of variable) {
    await cashFlow.createPayment(tenantId, pessoal.id, { description, categoryId: c(category), amount: reais(value), expectedDate: day(m, d), recurrence: unique });
  }
  await cashFlow.createExtraExpense(tenantId, pessoal.id, { description: 'Conserto do carro', categoryId: c('Carro'), amount: reais(1450), expectedDate: day(-1, 16), recurrence: unique });
  await cashFlow.createExtraExpense(tenantId, pessoal.id, { description: 'Presente de aniversário', categoryId: c('Outros pagamentos'), amount: reais(260), expectedDate: day(0, 27), recurrence: unique });
  await cashFlow.createIncome(tenantId, pessoal.id, { description: 'Reembolso de despesas', categoryId: c('Reembolso'), amount: reais(420), expectedDate: day(0, 26), recurrence: unique });

  // Pró-labore: da PJ para a conta pessoal, todo mês.
  for (const m of [-2, -1, 0]) {
    await transfers.createTransfer(tenantId, { sourceAccountId: pj.id, targetAccountId: pessoal.id, amount: reais(6000), date: day(m, 6), description: 'Pró-labore' });
  }

  // ── Cartão ────────────────────────────────────────────────────────────────
  const card = await cards.create(tenantId, { name: 'Platinum', bank: 'Banco Digital', closingDay: 3, dueDay: 10, limit: reais(12000), defaultPaymentAccountId: pessoal.id });
  const purchase = async (description: string, category: string, value: number, date: string, type: CardEntryType, installmentsCount?: number) =>
    cards.createEntry(card.id, tenantId, { description, expenseCategoryId: c(category), totalAmount: reais(value), purchaseDate: date, entryType: type, ...(installmentsCount ? { installmentsCount } : {}) });
  await purchase('Notebook', 'Educação', 4800, day(-2, 2), CardEntryType.INSTALLMENT, 10);
  await purchase('Streaming de música', 'Assinaturas', 21.9, day(-2, 2), CardEntryType.FIXED);
  await purchase('Streaming de vídeo', 'Assinaturas', 44.9, day(-2, 2), CardEntryType.FIXED);
  await purchase('Restaurante', 'Lazer', 186.5, day(-2, 18), CardEntryType.CASH);
  await purchase('Farmácia', 'Saúde', 97.3, day(-1, 9), CardEntryType.CASH);
  await purchase('Passagens aéreas', 'Viagem', 1890, day(-1, 22), CardEntryType.INSTALLMENT, 6);
  await purchase('Livraria', 'Educação', 132.8, day(0, 4), CardEntryType.CASH);

  // ── Efetiva o passado: tudo até alguns dias atrás, exceto um atraso ───────
  const settleBefore = todayKey;
  const keepOverdue = new Set(['Plano de saúde']); // fica atrasado no mês atual, de propósito (vence dia 8)
  for (const offset of [-2, -1, 0]) {
    const { month, year } = monthAt(offset);
    await cashFlow.loadDataset(tenantId, month, year); // materializa os fixos do mês
    const txs = await transactionsRepo.findAll(tenantId);
    for (const t of txs) {
      if (t.status !== TransactionStatus.PENDING || t.type === TransactionType.TRANSFER) continue;
      const key = t.expectedDate.slice(0, 10);
      if (key.slice(0, 7) !== `${year}-${String(month).padStart(2, '0')}` || key >= settleBefore) continue;
      if (offset === 0 && keepOverdue.has(t.description)) continue;
      if (t.type === TransactionType.INCOME) await cashFlow.receiveIncome(t.id, tenantId, {});
      else if (t.type === TransactionType.PAYMENT) await cashFlow.payPayment(t.id, tenantId, {});
      else if (t.type === TransactionType.EXTRA_EXPENSE) await cashFlow.payExtraExpense(t.id, tenantId, {});
    }
    for (const t of txs) {
      if (t.type === TransactionType.TRANSFER && t.status === TransactionStatus.PENDING && t.transferGroupId && t.expectedDate.slice(0, 10) < settleBefore) {
        await transfers.settleTransfer(t.transferGroupId, tenantId).catch(() => undefined);
      }
    }
  }
  // Faturas já vencidas: pagas pela conta corrente.
  for (const inv of await invoicesRepo.findAll(tenantId)) {
    if (inv.totalAmount > 0 && inv.status !== 'PAID' && inv.dueDate.slice(0, 10) < settleBefore) {
      await cards.payInvoice(card.id, inv.id, tenantId, { paymentAccountId: pessoal.id });
    }
  }

  const count = await db.collection('financial_transactions').countDocuments({ tenantId });
  console.log(`[demo] Pronto: 3 contas, 1 cartão, ${count} lançamentos.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeMongo());
