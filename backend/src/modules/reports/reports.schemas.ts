import { z } from 'zod';

// Sem accountId = todas as contas ativas (mesma regra do Dashboard e do fluxo de caixa).
export const statementQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000),
  accountId: z.string().uuid().optional(),
});

export type StatementQuery = z.infer<typeof statementQuerySchema>;

export const statementXlsxQuerySchema = statementQuerySchema.extend({
  lang: z.enum(['pt', 'en', 'es']).default('pt'),
});
