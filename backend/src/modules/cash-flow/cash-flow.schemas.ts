import { z } from 'zod';

export const cashFlowQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000),
});

export const createTransactionSchema = z.object({
  description: z.string().min(1, 'Descrição é obrigatória'),
  categoryId: z.string().uuid('Categoria inválida'),
  amount: z.number().int().positive('Valor deve ser positivo'),
  expectedDate: z.string({ required_error: 'Data prevista é obrigatória' }),
  sourceAccountId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const updateTransactionSchema = createTransactionSchema.partial();

export const payActionSchema = z
  .object({
    actualDate: z.string().optional(),
    amountPaid: z.number().int().positive().optional(),
  })
  .optional();

export type CashFlowQuery = z.infer<typeof cashFlowQuerySchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type PayActionInput = z.infer<typeof payActionSchema>;
