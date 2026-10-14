import { z } from 'zod';

// Validação do bundle (S7 do plano de segurança). O arquivo vem do usuário
// e é gravado direto no banco, então cada campo conhecido tem tipo e tamanho
// conferidos. Os campos conhecidos são opcionais (só `id` é obrigatório)
// para não rejeitar backups de versões antigas — as migrações de boot
// completam o que faltar. Campos desconhecidos (legado de versões antigas)
// só passam se forem valores simples: nada de objetos/arrays aninhados, que
// é por onde operadores do Mongo ou estruturas inesperadas entrariam.
const MAX_ITEMS = 50_000;
const id = z.string().min(1).max(100);
const ref = id.nullable();
const date = z.string().max(40);
const code = z.string().max(40); // enums (tipo, status…)
const name = z.string().max(200);
const longText = z.string().max(5_000);
const cents = z.number().int().safe();
const smallInt = z.number().int().min(0).max(10_000);
const legacyValue = z.union([z.string().max(10_000), z.number(), z.boolean(), z.null()]);

function entityArray<T extends z.ZodRawShape>(shape: T) {
  const entity = z
    .object({
      id,
      // Sempre substituído pelo tenant de quem importa (BackupService.importBackup).
      tenantId: z.string().max(100).optional(),
      createdAt: date.optional(),
      updatedAt: date.optional(),
      ...shape,
    })
    .partial()
    .required({ id: true })
    .catchall(legacyValue)
    // _id é do MongoDB; um valor vindo do arquivo nunca deve ser gravado.
    .transform(({ _id: _ignored, ...rest }) => rest);
  return z.array(entity).max(MAX_ITEMS);
}

export const backupBundleSchema = z.object({
  version: z.number(),
  exportedAt: z.string().max(40),
  data: z.object({
    accounts: entityArray({
      name,
      accountTypeId: ref,
      initialBalance: cents,
      initialBalanceDate: date,
      active: z.boolean(),
      autoReserveEnabled: z.boolean(),
      autoReservePercentage: z.number().min(0).max(100),
      autoReserveTargetAccountId: ref,
    }),
    categories: entityArray({ name, type: code, active: z.boolean() }),
    settings: entityArray({ dashboardScope: code }),
    // Módulo Recebimentos removido (E3 do refactor de contas) — a chave some
    // dos bundles novos, mas segue aceita e ignorada aqui para não rejeitar
    // backups antigos já baixados pelo usuário.
    receivables: entityArray({}).optional(),
    financialTransactions: entityArray({
      type: code,
      description: longText,
      categoryId: ref,
      amount: cents,
      expectedDate: date,
      actualDate: date.nullable(),
      status: code,
      sourceAccountId: ref,
      targetAccountId: ref,
      originType: code.nullable(),
      originId: ref,
      transferGroupId: ref,
      notes: longText.nullable(),
      recurrence: code,
      recurringGroupId: ref,
      recurringActive: z.boolean(),
    }),
    creditCards: entityArray({
      name,
      bank: name,
      closingDay: z.number().int().min(1).max(31),
      dueDay: z.number().int().min(1).max(31),
      limit: cents,
      defaultPaymentAccountId: ref,
      active: z.boolean(),
    }),
    creditCardEntries: entityArray({
      creditCardId: id,
      description: longText,
      expenseCategoryId: ref,
      totalAmount: cents,
      purchaseDate: date,
      entryType: code,
      installmentsCount: smallInt,
      closingDayUsed: z.number().int().min(1).max(31),
      notes: longText.nullable(),
      externalRef: z.string().max(200).nullable(),
      active: z.boolean(),
    }),
    creditCardInstallments: entityArray({
      creditCardEntryId: id,
      installmentNumber: smallInt,
      totalInstallments: smallInt,
      amount: cents,
      month: z.number().int().min(1).max(12),
      year: z.number().int().min(1900).max(3000),
      status: code,
      creditCardInvoiceId: ref,
    }),
    creditCardInvoices: entityArray({
      creditCardId: id,
      month: z.number().int().min(1).max(12),
      year: z.number().int().min(1900).max(3000),
      dueDate: date,
      totalAmount: cents,
      status: code,
      paymentDate: date.nullable(),
      paymentAccountId: ref,
    }),
  }),
});

export const importBackupSchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'validation.confirm.required' }),
  }),
  bundle: backupBundleSchema,
});

export const resetAccountSchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'validation.confirm.required' }),
  }),
});

export const exportCsvQuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    all: z.coerce.boolean().optional(),
  })
  .refine((q) => q.all || (q.from && q.to), {
    message: 'validation.dateRange.required',
  });

export const parseStatementSchema = z.object({
  filename: z.string().min(1),
  content: z.string().min(1),
});

const parsedStatementEntrySchema = z.object({
  date: z.string(),
  description: z.string(),
  amount: z.number().int().positive(),
  type: z.enum(['INCOME', 'EXPENSE']),
  possibleDuplicate: z.boolean(),
});

export const importStatementSchema = z.object({
  accountId: z.string().uuid(),
  entries: z.array(parsedStatementEntrySchema).min(1),
});

export type ImportBackupInput = z.infer<typeof importBackupSchema>;
export type ExportCsvQuery = z.infer<typeof exportCsvQuerySchema>;
export type ParseStatementInput = z.infer<typeof parseStatementSchema>;
export type ImportStatementInput = z.infer<typeof importStatementSchema>;
