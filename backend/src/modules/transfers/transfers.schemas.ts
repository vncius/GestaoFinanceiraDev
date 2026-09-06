import { z } from 'zod';

export const createTransferSchema = z.object({
  sourceAccountId: z.string().uuid('validation.sourceAccountId.invalid'),
  targetAccountId: z.string().uuid('validation.targetAccountId.invalid'),
  amount: z.number().int().positive('validation.amount.positive'),
  date: z.string({ required_error: 'validation.date.required' }),
  description: z.string().min(1, 'validation.description.required'),
  notes: z.string().nullable().optional(),
});

export const updateTransferSchema = createTransferSchema.partial();

// Efetivação de uma transferência programada (joinha) — mesma forma do
// payActionSchema do fluxo de caixa, sem o valor (o par sempre move o
// mesmo montante nas duas pernas).
export const settleTransferSchema = z
  .object({
    actualDate: z.string().optional(),
  })
  .optional();

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type UpdateTransferInput = z.infer<typeof updateTransferSchema>;
export type SettleTransferInput = z.infer<typeof settleTransferSchema>;
