import { z } from 'zod';
import { RecurrenceType } from '../financial-transactions/financial-transactions.types';

// GET /cash-flow: sem accountId = todas as contas ativas (U17).
export const cashFlowListQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000),
  accountId: z.string().uuid().optional(),
});

export const cashFlowQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000),
  // Conta como contexto financeiro (E5) — o fluxo de caixa é sempre de uma
  // única conta por vez, nunca mais consolidado globalmente.
  accountId: z.string().uuid(),
});

// Contexto de conta usado pelas rotas de criação (POST), que ainda não têm
// um :id de lançamento existente para inferir a conta — default de
// sourceAccountId/targetAccountId quando o corpo não informa explicitamente.
export const accountContextQuerySchema = z.object({
  accountId: z.string().uuid(),
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
export type AccountContextQuery = z.infer<typeof accountContextQuerySchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type PayActionInput = z.infer<typeof payActionSchema>;
export type DeleteTransactionQuery = z.infer<typeof deleteTransactionQuerySchema>;
export type UpdateTransactionQuery = z.infer<typeof updateTransactionQuerySchema>;
export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;
export type UpdateIncomeInput = z.infer<typeof updateIncomeSchema>;
export type ReceiveActionInput = z.infer<typeof receiveActionSchema>;
