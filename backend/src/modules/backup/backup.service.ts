import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { AccountsRepository } from '../accounts/accounts.repository';
import { AccountTypesRepository } from '../account-types/account-types.repository';
import { CategoriesRepository } from '../categories/categories.repository';
import { SettingsRepository } from '../settings/settings.repository';
import { OnboardingStateRepository, OnboardingMessagesRepository } from '../onboarding/onboarding.repository';
import { FinancialTransactionsRepository } from '../financial-transactions/financial-transactions.repository';
import {
  FinancialTransaction,
  RecurrenceType,
  TransactionStatus,
  TransactionType,
} from '../financial-transactions/financial-transactions.types';
import {
  CreditCardsRepository,
  CreditCardEntriesRepository,
  CreditCardInstallmentsRepository,
  CreditCardInvoicesRepository,
} from '../credit-cards/credit-cards.repository';
import { BACKUP_VERSION, BackupBundle, ParsedStatementEntry } from './backup.types';
import { ExportCsvQuery, ImportStatementInput } from './backup.schemas';

const TX_TYPE_LABELS: Record<TransactionType, string> = {
  [TransactionType.INCOME]: 'Entrada',
  [TransactionType.PAYMENT]: 'Pagamento',
  [TransactionType.EXTRA_EXPENSE]: 'Gasto Extra',
  [TransactionType.CREDIT_CARD_PAYMENT]: 'Fatura Cartão',
  [TransactionType.RESERVE]: 'Reserva',
  [TransactionType.TRANSFER]: 'Transferência',
  [TransactionType.ADJUSTMENT]: 'Ajuste',
};

export class BackupService {
  constructor(
    private readonly accountsRepo: AccountsRepository,
    private readonly accountTypesRepo: AccountTypesRepository,
    private readonly categoriesRepo: CategoriesRepository,
    private readonly settingsRepo: SettingsRepository,
    private readonly transactionsRepo: FinancialTransactionsRepository,
    private readonly creditCardsRepo: CreditCardsRepository,
    private readonly creditCardEntriesRepo: CreditCardEntriesRepository,
    private readonly creditCardInstallmentsRepo: CreditCardInstallmentsRepository,
    private readonly creditCardInvoicesRepo: CreditCardInvoicesRepository,
    private readonly onboardingStateRepo: OnboardingStateRepository,
    private readonly onboardingMessagesRepo: OnboardingMessagesRepository,
  ) {}

  // ─── Backup completo (JSON) ────────────────────────────────────────────────────

  async exportBackup(tenantId: string): Promise<BackupBundle> {
    const [
      accounts,
      categories,
      settings,
      financialTransactions,
      creditCards,
      creditCardEntries,
      creditCardInstallments,
      creditCardInvoices,
    ] = await Promise.all([
      this.accountsRepo.findAll(tenantId),
      this.categoriesRepo.findAll(tenantId),
      this.settingsRepo.get(tenantId),
      this.transactionsRepo.findAll(tenantId),
      this.creditCardsRepo.findAll(tenantId),
      this.creditCardEntriesRepo.findAll(tenantId),
      this.creditCardInstallmentsRepo.findAll(tenantId),
      this.creditCardInvoicesRepo.findAll(tenantId),
    ]);

    return {
      version: BACKUP_VERSION,
      exportedAt: nowISO(),
      data: {
        accounts,
        categories,
        settings: settings ? [settings] : [],
        financialTransactions,
        creditCards,
        creditCardEntries,
        creditCardInstallments,
        creditCardInvoices,
      },
    };
  }

  // Restauração é destrutiva: substitui TODOS os dados do tenant atual pelos
  // do bundle. O tenantId de cada registro é sempre re-carimbado com o
  // tenant de quem está importando — nunca confiamos no tenantId gravado
  // dentro do arquivo.
  async importBackup(tenantId: string, bundle: BackupBundle): Promise<{ counts: Record<string, number> }> {
    const stamp = <T extends { tenantId: string }>(items: T[]): T[] =>
      items.map((item) => ({ ...item, tenantId }));

    const { data } = bundle;

    await Promise.all([
      this.accountsRepo.replaceAll(tenantId, stamp(data.accounts)),
      this.categoriesRepo.replaceAll(tenantId, stamp(data.categories)),
      this.transactionsRepo.replaceAll(tenantId, stamp(data.financialTransactions)),
      this.creditCardsRepo.replaceAll(tenantId, stamp(data.creditCards)),
      this.creditCardEntriesRepo.replaceAll(tenantId, stamp(data.creditCardEntries)),
      this.creditCardInstallmentsRepo.replaceAll(tenantId, stamp(data.creditCardInstallments)),
      this.creditCardInvoicesRepo.replaceAll(tenantId, stamp(data.creditCardInvoices)),
    ]);

    if (data.settings[0]) {
      await this.settingsRepo.upsert({ ...data.settings[0], tenantId });
    }

    return {
      counts: {
        accounts: data.accounts.length,
        categories: data.categories.length,
        settings: data.settings.length,
        financialTransactions: data.financialTransactions.length,
        creditCards: data.creditCards.length,
        creditCardEntries: data.creditCardEntries.length,
        creditCardInstallments: data.creditCardInstallments.length,
        creditCardInvoices: data.creditCardInvoices.length,
      },
    };
  }

  // ─── Redefinição de conta ──────────────────────────────────────────────────────

  // Apaga TODOS os dados e parametrizações do tenant. A collection de usuários
  // não é tocada — o login continua válido. As configurações padrão são
  // recriadas automaticamente no próximo GET /settings. O estado e a conversa
  // de onboarding também são apagados, para que o tenant volte a ser tratado
  // como "vazio" e possa refazer o onboarding (com IA ou manual) do zero.
  async resetTenant(tenantId: string): Promise<void> {
    await Promise.all([
      this.accountsRepo.replaceAll(tenantId, []),
      this.accountTypesRepo.replaceAll(tenantId, []),
      this.categoriesRepo.replaceAll(tenantId, []),
      this.transactionsRepo.replaceAll(tenantId, []),
      this.creditCardsRepo.replaceAll(tenantId, []),
      this.creditCardEntriesRepo.replaceAll(tenantId, []),
      this.creditCardInstallmentsRepo.replaceAll(tenantId, []),
      this.creditCardInvoicesRepo.replaceAll(tenantId, []),
      this.settingsRepo.deleteAll(tenantId),
      this.onboardingStateRepo.deleteAll(tenantId),
      this.onboardingMessagesRepo.deleteAll(tenantId),
    ]);
  }

  // ─── Exportação CSV de lançamentos ─────────────────────────────────────────────

  async exportTransactionsCsv(tenantId: string, query: ExportCsvQuery): Promise<string> {
    const [transactions, categories] = await Promise.all([
      this.transactionsRepo.findAll(tenantId),
      this.categoriesRepo.findAll(tenantId),
    ]);

    const categoryName = new Map(categories.map((c) => [c.id, c.name]));

    const inRange = (dateISO: string): boolean => {
      if (query.all) return true;
      const day = dateISO.slice(0, 10);
      return day >= query.from! && day <= query.to!;
    };

    type Row = { date: string; type: string; description: string; category: string; amount: number; status: string };

    const rows: Row[] = transactions
      .filter((t) => inRange(t.expectedDate))
      .map((t) => ({
        date: t.expectedDate.slice(0, 10),
        type: TX_TYPE_LABELS[t.type] ?? t.type,
        description: t.description,
        category: t.categoryId ? categoryName.get(t.categoryId) ?? '' : '',
        amount: t.amount,
        status: t.status,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const header = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor', 'Status'];
    const lines = [header, ...rows.map((r) => [
      formatDateBR(r.date),
      r.type,
      r.description,
      r.category,
      formatAmountBR(r.amount),
      r.status,
    ])];

    return lines.map((cols) => cols.map(csvEscape).join(';')).join('\r\n');
  }

  // ─── Importação de extrato bancário ────────────────────────────────────────────

  async parseStatement(tenantId: string, filename: string, content: string): Promise<ParsedStatementEntry[]> {
    const isOfx = /\.ofx$/i.test(filename) || /<OFX>/i.test(content);
    const parsed = isOfx ? parseOfxStatement(content) : parseCsvStatement(content);
    if (parsed.length === 0) {
      throw new AppError('Não foi possível reconhecer nenhum lançamento no arquivo enviado.', 400, 'backup.noEntriesRecognized');
    }

    const existing = await this.transactionsRepo.findAll(tenantId);
    const existingKeys = new Set(
      existing.map((t) => `${t.expectedDate.slice(0, 10)}|${t.amount}|${t.description.trim().toLowerCase()}`),
    );

    return parsed.map((entry) => ({
      ...entry,
      possibleDuplicate: existingKeys.has(
        `${entry.date}|${entry.amount}|${entry.description.trim().toLowerCase()}`,
      ),
    }));
  }

  async importStatementEntries(tenantId: string, input: ImportStatementInput): Promise<{ created: number }> {
    const account = await this.accountsRepo.findById(input.accountId, tenantId);
    if (!account) throw new AppError('Conta não encontrada.', 404, 'backup.accountNotFound');

    const now = nowISO();
    const toCreate: FinancialTransaction[] = input.entries.map((entry) => ({
      id: generateId(),
      tenantId,
      type: entry.type === 'INCOME' ? TransactionType.INCOME : TransactionType.EXTRA_EXPENSE,
      description: entry.description,
      categoryId: null,
      amount: entry.amount,
      expectedDate: entry.date,
      actualDate: entry.date,
      status: entry.type === 'INCOME' ? TransactionStatus.RECEIVED : TransactionStatus.PAID,
      sourceAccountId: entry.type === 'EXPENSE' ? input.accountId : null,
      targetAccountId: entry.type === 'INCOME' ? input.accountId : null,
      originType: null,
      originId: null,
      transferGroupId: null,
      notes: 'Importado de extrato bancário',
      recurrence: RecurrenceType.UNIQUE,
      recurringGroupId: null,
      recurringActive: true,
      createdAt: now,
      updatedAt: now,
    }));

    await this.transactionsRepo.createMany(toCreate);
    return { created: toCreate.length };
  }
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (/[;"\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function formatAmountBR(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

// ─── Parsers de extrato ─────────────────────────────────────────────────────────

function splitCsvLine(line: string, delimiter: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cols.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}

function parseAmountLoose(raw: string): number {
  const cleaned = raw.replace(/[R$\s]/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(',', '.'));
  }
  return parseFloat(cleaned);
}

function normalizeDateLoose(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return trimmed;
}

const CSV_HEADER_DATE = ['data', 'date'];
const CSV_HEADER_DESC = ['descricao', 'descrição', 'description', 'historico', 'histórico'];
const CSV_HEADER_AMOUNT = ['valor', 'amount', 'value'];

function parseCsvStatement(content: string): ParsedStatementEntry[] {
  const rawLines = content.split(/\r\n|\n/).map((l) => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return [];

  const delimiter = rawLines[0].includes(';') ? ';' : ',';
  const rows = rawLines.map((line) => splitCsvLine(line, delimiter));

  const firstRowLower = rows[0].map((c) => c.trim().toLowerCase());
  const allHeaders = [...CSV_HEADER_DATE, ...CSV_HEADER_DESC, ...CSV_HEADER_AMOUNT];
  const looksLikeHeader = firstRowLower.some((c) => allHeaders.includes(c));

  let dateIdx = 0;
  let descIdx = 1;
  let amountIdx = 2;
  let dataRows = rows;

  if (looksLikeHeader) {
    dataRows = rows.slice(1);
    const findIdx = (names: string[]) => firstRowLower.findIndex((c) => names.includes(c));
    const d = findIdx(CSV_HEADER_DATE);
    const desc = findIdx(CSV_HEADER_DESC);
    const amt = findIdx(CSV_HEADER_AMOUNT);
    if (d >= 0) dateIdx = d;
    if (desc >= 0) descIdx = desc;
    if (amt >= 0) amountIdx = amt;
  }

  return dataRows
    .map((cols): ParsedStatementEntry | null => {
      const rawDate = cols[dateIdx]?.trim() ?? '';
      const description = cols[descIdx]?.trim() ?? '';
      const rawAmount = cols[amountIdx]?.trim() ?? '';
      if (!rawDate || !description || !rawAmount) return null;

      const amountFloat = parseAmountLoose(rawAmount);
      if (Number.isNaN(amountFloat)) return null;

      return {
        date: normalizeDateLoose(rawDate),
        description,
        amount: Math.round(Math.abs(amountFloat) * 100),
        type: amountFloat >= 0 ? 'INCOME' : 'EXPENSE',
        possibleDuplicate: false,
      };
    })
    .filter((e): e is ParsedStatementEntry => e !== null);
}

// Parser simples de OFX 1.x (SGML): os campos dentro de <STMTTRN> não têm
// tag de fechamento própria, mas o bloco <STMTTRN>...</STMTTRN> em si
// fecha corretamente — cobre a maioria dos extratos de bancos brasileiros.
function parseOfxStatement(content: string): ParsedStatementEntry[] {
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];

  return blocks
    .map((block): ParsedStatementEntry | null => {
      const dtPosted = block.match(/<DTPOSTED>([^\s<]+)/i)?.[1] ?? '';
      const trnAmt = block.match(/<TRNAMT>([^\s<]+)/i)?.[1] ?? '';
      const name = block.match(/<NAME>([^\r\n<]+)/i)?.[1]?.trim();
      const memo = block.match(/<MEMO>([^\r\n<]+)/i)?.[1]?.trim();
      const description = name || memo || '';

      if (!dtPosted || !trnAmt || !description) return null;

      const amountFloat = parseFloat(trnAmt);
      if (Number.isNaN(amountFloat)) return null;

      const date = dtPosted.length >= 8
        ? `${dtPosted.slice(0, 4)}-${dtPosted.slice(4, 6)}-${dtPosted.slice(6, 8)}`
        : '';
      if (!date) return null;

      return {
        date,
        description,
        amount: Math.round(Math.abs(amountFloat) * 100),
        type: amountFloat >= 0 ? 'INCOME' : 'EXPENSE',
        possibleDuplicate: false,
      };
    })
    .filter((e): e is ParsedStatementEntry => e !== null);
}
