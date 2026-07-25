import { AppError } from '../../shared/errors/app-error';
import { generateId } from '../../shared/utils/id.utils';
import { nowISO } from '../../shared/utils/date.utils';
import { getInvoiceMonth, addMonths } from './credit-cards.date-utils';
import { CreditCardsService } from './credit-cards.service';
import {
  CreditCardEntriesRepository,
  CreditCardInstallmentsRepository,
  CreditCardInvoicesRepository,
} from './credit-cards.repository';
import {
  CardEntryType,
  CreditCardEntry,
  CreditCardInstallment,
  CreditCardInvoice,
  InstallmentStatus,
  InvoiceStatus,
} from './credit-cards.types';
import { CategoriesRepository } from '../categories/categories.repository';
import { CategoryType } from '../categories/categories.types';
import { AiProvider } from '../ai/ai-provider.types';
import { AiConfig } from '../ai/ai.config';
import { logAiAudit } from '../ai/ai-audit.log';
import { parseInvoiceOfx } from './credit-card-invoice-import-ofx.parser';
import { InvoiceImportPreviewEntry, ParsedOfxCardTransaction } from './credit-card-invoice-import.types';
import { ConfirmInvoiceImportEntry, ConfirmInvoiceImportInput } from './credit-card-invoice-import.schemas';

// Reconhece a categoria "outros/outras" já cadastrada (ex.: "Outros
// pagamentos", do seed padrão) para usar como fallback — casa "outro",
// "outros", "outra", "outras" em qualquer posição do nome, sem acento.
const FALLBACK_CATEGORY_NAME_PATTERN = /outr[oa]s?/i;

export class CreditCardInvoiceImportService {
  constructor(
    private readonly creditCardsService: CreditCardsService,
    private readonly entriesRepo: CreditCardEntriesRepository,
    private readonly installmentsRepo: CreditCardInstallmentsRepository,
    private readonly invoicesRepo: CreditCardInvoicesRepository,
    private readonly categoriesRepo: CategoriesRepository,
    private readonly aiProvider: AiProvider,
    private readonly aiConfig: AiConfig,
  ) {}

  // A importação nunca cria uma categoria nova — reaproveita uma categoria
  // EXPENSE ativa já cadastrada pelo usuário/seed cujo nome sugira "outros"
  // (ex.: "Outros pagamentos"). Se o tenant não tiver nenhuma, retorna null
  // e o lançamento fica sem sugestão automática (usuário escolhe manualmente).
  private async findFallbackCategoryId(tenantId: string): Promise<string | null> {
    const categories = await this.categoriesRepo.findByType(tenantId, CategoryType.EXPENSE);
    const match = categories.find((c) => c.active && FALLBACK_CATEGORY_NAME_PATTERN.test(c.name));
    return match?.id ?? null;
  }

  // ─── Parse (preview) ────────────────────────────────────────────────────────

  async parseInvoice(
    cardId: string,
    tenantId: string,
    filename: string,
    content: string,
  ): Promise<InvoiceImportPreviewEntry[]> {
    const card = await this.creditCardsService.findById(cardId, tenantId);

    const isOfx = /\.ofx$/i.test(filename) || /<OFX>/i.test(content);
    if (!isOfx) {
      throw new AppError('Apenas arquivos .ofx são aceitos para importação de fatura.', 400, 'creditCardImport.onlyOfx');
    }

    const parsed = parseInvoiceOfx(content);
    if (parsed.length === 0) {
      throw new AppError('Não foi possível reconhecer nenhum lançamento no arquivo enviado.', 400, 'creditCardImport.noEntriesRecognized');
    }

    const existingEntries = await this.entriesRepo.findByCardId(tenantId, cardId);
    // Só entries ativos participam da checagem de duplicado: um entry
    // "limpo" (soft-deleted via deleteEntry) foi removido deliberadamente
    // pelo usuário e não deve bloquear reimportação do mesmo FITID. Também
    // exclui PAYMENT (lançamento interno de baixa da fatura, nunca vem de
    // FITID de compra) por clareza, embora seu externalRef seja sempre null.
    const activeEntries = existingEntries.filter(
      (e) => e.active && e.entryType !== CardEntryType.PAYMENT,
    );
    // Map (não Set) porque a reimportação com sobrescrita precisa saber QUAL
    // entry ativo corresponde ao FITID já existente.
    const existingExternalRefs = new Map(
      activeEntries
        .filter((e): e is CreditCardEntry & { externalRef: string } => !!e.externalRef)
        .map((e) => [e.externalRef, e.id]),
    );

    // Chave fraca por mês/ano/valor, SEM depender da descrição: o usuário
    // pode editar a descrição no preview antes de confirmar a importação, e
    // uma reimportação futura do mesmo arquivo ainda traz a descrição
    // original do banco — se a chave dependesse da descrição, uma edição
    // quebraria a detecção de duplicata em importações seguintes. FITID
    // (externalRef, ver acima) continua sendo o sinal forte quando o banco
    // o fornece; esta chave é só o fallback para quando ele não vem no OFX.
    const activeEntryIds = new Set(activeEntries.map((e) => e.id));
    const existingInstallments = await this.installmentsRepo.findAll(tenantId);
    const weakKeys = new Set(
      existingInstallments
        .filter((i) => activeEntryIds.has(i.creditCardEntryId) && i.status !== InstallmentStatus.CANCELED)
        .map((i) => `${i.month}|${i.year}|${i.amount}`),
    );

    const fallbackCategoryId = await this.findFallbackCategoryId(tenantId);
    const categories = await this.categoriesRepo.findByType(tenantId, CategoryType.EXPENSE);
    const activeCategories = categories.filter((c) => c.active);

    const suggestions = await this.suggestCategories(parsed, activeCategories, fallbackCategoryId);

    return parsed.map((tx, index): InvoiceImportPreviewEntry => {
      const { month: targetMonth, year: targetYear } = getInvoiceMonth(tx.date, card.closingDay);

      const existingEntryId = tx.externalRef ? existingExternalRefs.get(tx.externalRef) ?? null : null;
      const strongDuplicate = !!existingEntryId;
      // installment.amount é persistido com o sinal invertido em relação ao
      // OFX (compra: negativa no banco -> positiva salva; estorno: positiva
      // no banco -> negativa salva, ver createSingleInstallmentEntry), então
      // a chave precisa do mesmo sinal invertido para bater com weakKeys.
      const weakKey = `${targetMonth}|${targetYear}|${-tx.amountCents}`;
      const possibleDuplicate = strongDuplicate || weakKeys.has(weakKey);

      const suggestedEntryType =
        tx.amountCents > 0
          ? 'REFUND'
          : tx.installmentInfo
          ? 'INSTALLMENT'
          : 'CASH';

      return {
        key: `row-${index}`,
        date: tx.date,
        description: tx.description,
        amountCents: tx.amountCents,
        suggestedEntryType,
        installmentInfo: tx.installmentInfo,
        suggestedCategoryId: suggestions[index] ?? fallbackCategoryId,
        possibleDuplicate,
        existingEntryId,
        possiblePreviousInvoicePayment: tx.possiblePreviousInvoicePayment,
        externalRef: tx.externalRef,
        targetMonth,
        targetYear,
      };
    });
  }

  // Sugestão de categoria via IA: uma única chamada para todo o lote. Nunca
  // deixa a falha da IA derrubar o parse — na pior das hipóteses, o preview
  // volta sem sugestão e o usuário escolhe a categoria manualmente.
  private async suggestCategories(
    entries: ParsedOfxCardTransaction[],
    categories: { id: string; name: string }[],
    fallbackCategoryId: string | null,
  ): Promise<Record<number, string | null>> {
    // Sem uma categoria "outros" já cadastrada para usar de fallback, um
    // índice não resolvido pela IA fica null — o usuário escolhe manualmente
    // no preview (a importação nunca cria uma categoria nova).
    const allFallback: Record<number, string | null> = {};
    for (let i = 0; i < entries.length; i++) allFallback[i] = fallbackCategoryId;
    if (categories.length === 0) return allFallback;

    const startedAt = Date.now();
    try {
      const system =
        'Você é um classificador de despesas de fatura de cartão de crédito brasileiro. ' +
        'Você recebe uma lista de categorias cadastradas pelo usuário (id e nome) e uma lista ' +
        'de lançamentos (index e descrição — geralmente o nome do estabelecimento/serviço como ' +
        'aparece no extrato do banco, em caixa alta, às vezes abreviado). ' +
        'Para cada lançamento, escolha a categoria cujo nome corresponde ao tipo de gasto que a ' +
        'descrição indica CLARAMENTE — ex.: um nome de serviço terminado em "SUB"/"SUBSCRIPTION" ' +
        '(como "AMAZON PRIME SUB" ou "OPENAI SUB") sugere assinatura recorrente; menções a peça, ' +
        'manutenção ou item de veículo (ex.: "BATERIA GOL G2", "POSTO", "AUTOPECAS") sugerem ' +
        'carro/transporte; nome de mercado/supermercado sugere alimentação; e assim por diante — ' +
        'só quando existir uma categoria correspondente na lista recebida. ' +
        'Não force uma categoria por aproximação: se a descrição for genérica, ambígua, ou não ' +
        'houver indício claro do tipo de gasto (ou nenhuma categoria da lista corresponda bem), ' +
        'responda categoryId null para aquele índice — é sempre preferível deixar sem sugestão a ' +
        'sugerir uma categoria errada, já que o usuário revisa e pode escolher manualmente. Nunca ' +
        'invente uma categoria fora da lista recebida. ' +
        'Responda SOMENTE com um JSON array no formato ' +
        '[{"index": 0, "categoryId": "<id da categoria mais provável, ou null>"}], ' +
        'na mesma ordem recebida, um item por lançamento. Use exatamente o "id" da ' +
        'categoria (não o nome). Não inclua texto além do JSON.';

      const userContent = JSON.stringify({
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
        entries: entries.map((e, index) => ({ index, description: e.description })),
      });

      // O orçamento padrão de tokens (compartilhado com o chat de onboarding)
      // é dimensionado para texto conversacional, não para um array JSON que
      // cresce com o número de lançamentos — com poucos tokens, a resposta
      // pode ser cortada antes do "]" de fechamento e falhar o parse. Reserva
      // uma margem por lançamento (índice + uuid + pontuação ~ 30 tokens).
      const maxOutputTokens = Math.max(this.aiConfig.maxOutputTokens, entries.length * 30 + 200);

      const result = await this.aiProvider.chat({
        system,
        messages: [{ role: 'user', content: userContent }],
        maxOutputTokens,
      });

      const parsed = JSON.parse(extractJson(result.text)) as Array<{ index: number; categoryId: string | null }>;
      const byId = new Map(categories.map((c) => [c.id, c.id]));
      // Fallback por nome: é comum o modelo devolver o nome da categoria em
      // vez do id exato mesmo quando instruído a não fazer isso.
      const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));

      // Parte do fallback e só sobrescreve o que a IA de fato resolveu —
      // cobre tanto os índices ausentes na resposta quanto os que vieram com
      // um categoryId não reconhecível.
      const map: Record<number, string | null> = { ...allFallback };
      for (const item of parsed) {
        if (typeof item.index !== 'number' || !item.categoryId) continue;
        const resolvedId = byId.get(item.categoryId) ?? byName.get(item.categoryId.trim().toLowerCase());
        if (resolvedId) map[item.index] = resolvedId;
      }

      logAiAudit({ provider: this.aiProvider.name, turn: 1, durationMs: Date.now() - startedAt, tools: [], outcome: 'ok' });
      return map;
    } catch {
      // IA indisponível, timeout, ou resposta fora do formato esperado —
      // todas as linhas caem em "Outras"; o usuário pode trocar manualmente
      // no preview.
      logAiAudit({ provider: this.aiProvider.name, turn: 1, durationMs: Date.now() - startedAt, tools: [], outcome: 'error' });
      return allFallback;
    }
  }

  // ─── Confirmação (persistência) ─────────────────────────────────────────────

  async confirmImport(
    cardId: string,
    tenantId: string,
    input: ConfirmInvoiceImportInput,
  ): Promise<{ created: number; updated: number }> {
    const card = await this.creditCardsService.findById(cardId, tenantId);
    const now = nowISO();

    const fallbackCategoryId = await this.findFallbackCategoryId(tenantId);

    const invoiceIdsToRecalc = new Set<string>();
    let created = 0;
    let updated = 0;

    for (const row of input.entries) {
      const categoryId = await this.resolveExpenseCategoryId(row.categoryId, tenantId, fallbackCategoryId);
      const resolvedRow = { ...row, categoryId };
      const result = await this.createFromRow(
        card.id,
        card.closingDay,
        card.dueDay,
        tenantId,
        resolvedRow,
        now,
        invoiceIdsToRecalc,
      );
      created += result.created;
      updated += result.updated;
    }

    await this.recalcInvoiceTotals(tenantId, invoiceIdsToRecalc);

    return { created, updated };
  }

  // Importação em lote nunca falha o lote inteiro por uma categoria
  // inválida/inativa/de tipo errado — cai silenciosamente na categoria
  // "outros" já cadastrada (ao contrário do CRUD manual, onde
  // CreditCardsService rejeita com erro explícito: lá o dropdown já só
  // oferece categorias válidas, então chegar com um id inválido indica
  // adulteração/condição de corrida). Nunca cria uma categoria nova — se o
  // tenant não tiver nenhuma categoria "outros", falha pedindo para o
  // usuário escolher uma categoria válida manualmente.
  private async resolveExpenseCategoryId(
    categoryId: string,
    tenantId: string,
    fallbackCategoryId: string | null,
  ): Promise<string> {
    const category = await this.categoriesRepo.findById(categoryId, tenantId);
    if (category && category.active && category.type === CategoryType.EXPENSE) {
      return categoryId;
    }
    if (fallbackCategoryId) return fallbackCategoryId;
    throw new AppError(
      'Categoria inválida e nenhuma categoria "outros" cadastrada foi encontrada para usar como padrão. Selecione uma categoria válida.',
      400,
      'creditCardImport.categoryInvalidNoFallback',
    );
  }

  private async createFromRow(
    cardId: string,
    closingDay: number,
    dueDay: number,
    tenantId: string,
    row: ConfirmInvoiceImportEntry,
    now: string,
    invoiceIdsToRecalc: Set<string>,
  ): Promise<{ created: number; updated: number }> {
    // Nunca confia no targetMonth/targetYear que o preview mandou de volta —
    // recalcula a partir da data + fechamento do cartão, no servidor.
    const { month, year } = getInvoiceMonth(row.date, closingDay);

    let totalAmount: number;
    let entryType: CardEntryType;
    let installmentsCount: number;

    if (row.entryType === 'REFUND') {
      totalAmount = -Math.abs(row.amountCents);
      entryType = CardEntryType.REFUND;
      installmentsCount = 1;
    } else if (row.entryType === 'INSTALLMENT' && row.createFutureInstallments && row.installmentInfo) {
      // Aproximação: só conhecemos o valor da parcela atual, não o valor
      // original da compra (não vem no OFX) — mesma lógica de
      // createInstallmentEntryFromCurrent.
      totalAmount = Math.abs(row.amountCents) * row.installmentInfo.total;
      entryType = CardEntryType.INSTALLMENT;
      installmentsCount = row.installmentInfo.total;
    } else {
      // CASH, ou parcela detectada mas o usuário optou por não gerar as
      // futuras — vira um lançamento à vista de uma parcela só, neste mês.
      totalAmount = Math.abs(row.amountCents);
      entryType = CardEntryType.CASH;
      installmentsCount = 1;
    }

    if (row.overwriteEntryId) {
      await this.overwriteEntry(cardId, row.overwriteEntryId, tenantId, {
        description: row.description,
        expenseCategoryId: row.categoryId,
        totalAmount,
        purchaseDate: row.date,
        entryType,
        installmentsCount,
      });
      return { created: 0, updated: 1 };
    }

    if (entryType === CardEntryType.INSTALLMENT) {
      await this.createInstallmentEntryFromCurrent(cardId, tenantId, {
        description: row.description,
        expenseCategoryId: row.categoryId,
        installmentAmount: Math.abs(row.amountCents),
        purchaseDate: row.date,
        closingDayUsed: closingDay,
        externalRef: row.externalRef ?? null,
        current: row.installmentInfo!.current,
        total: row.installmentInfo!.total,
        month,
        year,
        dueDay,
      }, invoiceIdsToRecalc, now);
      return { created: 1, updated: 0 };
    }

    await this.createSingleInstallmentEntry(cardId, tenantId, {
      description: row.description,
      expenseCategoryId: row.categoryId,
      totalAmount,
      purchaseDate: row.date,
      entryType,
      closingDayUsed: closingDay,
      externalRef: row.externalRef ?? null,
      month,
      year,
      dueDay,
    }, invoiceIdsToRecalc, now);
    return { created: 1, updated: 0 };
  }

  // Sobrescrita de reimportação (mesmo FITID de uma importação anterior):
  // reaproveita CreditCardsService.updateEntry, que já cancela+recria as
  // parcelas do zero quando algum campo relevante muda — isso cobre
  // automaticamente "1ª importação gerou parcelas futuras, 2ª não marcou
  // createFutureInstallments" (o novo installmentsCount=1 substitui as
  // futuras) e também reverte o pagamento se a fatura já estava paga.
  private async overwriteEntry(
    cardId: string,
    entryId: string,
    tenantId: string,
    data: {
      description: string;
      expenseCategoryId: string;
      totalAmount: number;
      purchaseDate: string;
      entryType: CardEntryType;
      installmentsCount: number;
    },
  ): Promise<void> {
    const target = await this.entriesRepo.findById(entryId, tenantId);
    if (!target || target.creditCardId !== cardId || !target.active || target.entryType === CardEntryType.PAYMENT) {
      throw new AppError(
        'O lançamento a sobrescrever não existe mais ou não pertence a este cartão. Recarregue o preview e tente novamente.',
        400,
        'creditCardImport.overwriteTargetInvalid',
      );
    }

    await this.creditCardsService.updateEntry(cardId, entryId, tenantId, {
      description: data.description,
      expenseCategoryId: data.expenseCategoryId,
      totalAmount: data.totalAmount,
      purchaseDate: data.purchaseDate,
      entryType: data.entryType,
      installmentsCount: data.entryType === CardEntryType.INSTALLMENT ? data.installmentsCount : undefined,
    });
  }

  private async createSingleInstallmentEntry(
    cardId: string,
    tenantId: string,
    params: {
      description: string;
      expenseCategoryId: string;
      totalAmount: number;
      purchaseDate: string;
      entryType: CardEntryType;
      closingDayUsed: number;
      externalRef: string | null;
      month: number;
      year: number;
      dueDay: number;
    },
    invoiceIdsToRecalc: Set<string>,
    now: string,
  ): Promise<void> {
    const entry: CreditCardEntry = {
      id: generateId(),
      tenantId,
      creditCardId: cardId,
      description: params.description,
      expenseCategoryId: params.expenseCategoryId,
      totalAmount: params.totalAmount,
      purchaseDate: params.purchaseDate,
      entryType: params.entryType,
      installmentsCount: 1,
      closingDayUsed: params.closingDayUsed,
      notes: 'Importado de fatura (OFX)',
      externalRef: params.externalRef,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    await this.entriesRepo.create(entry);

    const invoice = await this.findOrCreateInvoice(tenantId, cardId, params.month, params.year, params.dueDay);
    const installment: CreditCardInstallment = {
      id: generateId(),
      tenantId,
      creditCardEntryId: entry.id,
      installmentNumber: 1,
      totalInstallments: 1,
      amount: params.totalAmount,
      month: params.month,
      year: params.year,
      status: InstallmentStatus.OPEN,
      creditCardInvoiceId: invoice.id,
      createdAt: now,
      updatedAt: now,
    };
    await this.installmentsRepo.createMany([installment]);
    invoiceIdsToRecalc.add(invoice.id);
  }

  // Compra parcelada detectada no OFX em andamento (ex.: "03/12"): não
  // reconstitui o histórico (parcelas 1 e 2 já ficaram para trás antes desta
  // importação existir) — só cria a partir da parcela atual em diante,
  // ancorada no mês desta transação.
  private async createInstallmentEntryFromCurrent(
    cardId: string,
    tenantId: string,
    params: {
      description: string;
      expenseCategoryId: string;
      installmentAmount: number;
      purchaseDate: string;
      closingDayUsed: number;
      externalRef: string | null;
      current: number;
      total: number;
      month: number;
      year: number;
      dueDay: number;
    },
    invoiceIdsToRecalc: Set<string>,
    now: string,
  ): Promise<void> {
    const entry: CreditCardEntry = {
      id: generateId(),
      tenantId,
      creditCardId: cardId,
      description: params.description,
      expenseCategoryId: params.expenseCategoryId,
      // Valor total é uma aproximação: só conhecemos o valor desta parcela,
      // não o valor original da compra (não vem no OFX).
      totalAmount: params.installmentAmount * params.total,
      purchaseDate: params.purchaseDate,
      entryType: CardEntryType.INSTALLMENT,
      installmentsCount: params.total,
      closingDayUsed: params.closingDayUsed,
      notes: 'Importado de fatura (OFX)',
      externalRef: params.externalRef,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    await this.entriesRepo.create(entry);

    const installmentsToCreate: CreditCardInstallment[] = [];
    for (let k = params.current; k <= params.total; k++) {
      const { month, year } = addMonths(params.month, params.year, k - params.current);
      const invoice = await this.findOrCreateInvoice(tenantId, cardId, month, year, params.dueDay);

      installmentsToCreate.push({
        id: generateId(),
        tenantId,
        creditCardEntryId: entry.id,
        installmentNumber: k,
        totalInstallments: params.total,
        amount: params.installmentAmount,
        month,
        year,
        status: InstallmentStatus.OPEN,
        creditCardInvoiceId: invoice.id,
        createdAt: now,
        updatedAt: now,
      });
      invoiceIdsToRecalc.add(invoice.id);
    }

    await this.installmentsRepo.createMany(installmentsToCreate);
  }

  // ─── Helpers duplicados de CreditCardsService ──────────────────────────────
  // Curtos e sem dependência de estado além dos repositórios já injetados;
  // duplicados de propósito para não alterar a visibilidade/assinatura da
  // classe já testada (CreditCardsService.findOrCreateInvoice/recalcInvoiceTotals
  // são privados).

  private async findOrCreateInvoice(
    tenantId: string,
    cardId: string,
    month: number,
    year: number,
    dueDay: number,
  ): Promise<CreditCardInvoice> {
    const existing = await this.invoicesRepo.findByCardAndMonth(tenantId, cardId, month, year);
    if (existing) return existing;

    const dueDate = new Date(year, month - 1, dueDay).toISOString();
    const now = nowISO();
    return this.invoicesRepo.create({
      id: generateId(),
      tenantId,
      creditCardId: cardId,
      month,
      year,
      dueDate,
      totalAmount: 0,
      status: InvoiceStatus.OPEN,
      paymentDate: null,
      paymentAccountId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  private async recalcInvoiceTotals(tenantId: string, invoiceIds: Iterable<string>): Promise<void> {
    const ids = [...new Set(invoiceIds)];
    if (ids.length === 0) return;

    const [all, allEntries] = await Promise.all([
      this.installmentsRepo.findAll(tenantId),
      this.entriesRepo.findAll(tenantId),
    ]);
    // Mesma exclusão de CreditCardsService.recalcInvoiceTotals: o
    // lançamento PAYMENT (crédito interno do pagamento da fatura) nunca
    // entra no valor bruto faturado.
    const paymentEntryIds = new Set(
      allEntries.filter((e) => e.entryType === CardEntryType.PAYMENT).map((e) => e.id),
    );
    const now = nowISO();

    for (const invoiceId of ids) {
      const total = all
        .filter(
          (i) =>
            i.creditCardInvoiceId === invoiceId &&
            i.status !== InstallmentStatus.CANCELED &&
            !paymentEntryIds.has(i.creditCardEntryId),
        )
        .reduce((s, i) => s + i.amount, 0);
      await this.invoicesRepo.update(invoiceId, { totalAmount: total, updatedAt: now }, tenantId);
    }
  }
}

// O modelo pode envolver o JSON em texto/markdown apesar da instrução —
// extrai só o primeiro array/objeto JSON balanceado da resposta.
function extractJson(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Resposta da IA não contém um JSON array reconhecível.');
  }
  return trimmed.slice(start, end + 1);
}
