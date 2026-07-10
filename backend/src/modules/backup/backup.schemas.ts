import { z } from 'zod';

// Validação estrutural do bundle: cada entidade precisa de um `id` string,
// mas não replicamos o schema completo de cada uma aqui — o bundle vem de
// um export gerado pelo próprio sistema, então o objetivo é pegar arquivos
// corrompidos/incompatíveis, não validar campo a campo.
const entityArray = z.array(z.object({ id: z.string() }).passthrough());

export const backupBundleSchema = z.object({
  version: z.number(),
  exportedAt: z.string(),
  data: z.object({
    accounts: entityArray,
    categories: entityArray,
    settings: entityArray,
    receivables: entityArray,
    financialTransactions: entityArray,
    creditCards: entityArray,
    creditCardEntries: entityArray,
    creditCardInstallments: entityArray,
    creditCardInvoices: entityArray,
  }),
});

export const importBackupSchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'validation.confirm.required' }),
  }),
  bundle: backupBundleSchema,
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
