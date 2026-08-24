import { z } from 'zod';
import { RecurrenceType } from '../financial-transactions/financial-transactions.types';

export const cashFlowQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000),
});

export const createTransactionSchema = z.object({
  description: z.string().min(1, 'validation.description.required'),
  categoryId: z.string().uuid('validation.categoryId.invalid'),
  amount: z.number().int().positive('validation.amount.positive'),
  expectedDate: z.string({ required_error: 'validation.expectedDate.required' }),
  sourceAccountId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  recurrence: z.nativeEnum(RecurrenceType).default(RecurrenceType.UNIQUE),
});

export const updateTransactionSchema = createTransactionSchema.partial();

export const payActionSchema = z
  .object({
    actualDate: z.string().optional(),
    amountPaid: z.number().int().positive().optional(),
  })
  .optional();

export const deleteTransactionQuerySchema = z.object({
  scope: z.enum(['CURRENT', 'CURRENT_AND_FUTURE']).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).optional(),
});

export const updateTransactionQuerySchema = deleteTransactionQuerySchema;

// Entrada nativa do fluxo de caixa (D2: sem campos de NF, sem split de reserva —
// apenas descrição, categoria, valor, data, conta, notas, recorrência).
export const createIncomeSchema = z.object({
  description: z.string().min(1, 'validation.description.required'),
  categoryId: z.string().uuid('validation.categoryId.invalid'),
  amount: z.number().int().positive('validation.amount.positive'),
  expectedDate: z.string({ required_error: 'validation.expectedDate.required' }),
  targetAccountId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  recurrence: z.nativeEnum(RecurrenceType).default(RecurrenceType.UNIQUE),
});

export const updateIncomeSchema = createIncomeSchema.partial();

export const receiveActionSchema = z
  .object({
    actualDate: z.string().optional(),
    amountReceived: z.number().int().positive().optional(),
  })
  .optional();

export type CashFlowQuery = z.infer<typeof cashFlowQuerySchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type PayActionInput = z.infer<typeof payActionSchema>;
export type DeleteTransactionQuery = z.infer<typeof deleteTransactionQuerySchema>;
export type UpdateTransactionQuery = z.infer<typeof updateTransactionQuerySchema>;
export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;
export type UpdateIncomeInput = z.infer<typeof updateIncomeSchema>;
export type ReceiveActionInput = z.infer<typeof receiveActionSchema>;
