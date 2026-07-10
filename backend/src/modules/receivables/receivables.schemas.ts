import { z } from 'zod';
import { ReceivableStatus, RecurrenceType } from './receivables.types';

export const createReceivableSchema = z.object({
  description: z.string().min(1, 'validation.description.required'),
  expectedPaymentDate: z.string({ required_error: 'validation.expectedPaymentDate.required' }),
  grossAmount: z.number().int().positive('validation.grossAmount.positive'),
  reserveAccountIds: z.array(z.string().uuid()).default([]),
  incomeCategoryId: z.string().uuid('validation.incomeCategoryId.invalid'),
  notes: z.string().nullable().optional(),
  recurrence: z.nativeEnum(RecurrenceType).default(RecurrenceType.UNIQUE),
  // campos opcionais de NF / projeto
  customerName: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  invoiceCode: z.string().nullable().optional(),
  invoiceLink: z.string().nullable().optional(),
  invoiceIssueDate: z.string().nullable().optional(),
  competence: z.string().nullable().optional(),
  workedHours: z.number().positive().nullable().optional(),
  hourlyRate: z.number().int().positive().nullable().optional(),
  targetAccountId: z.string().uuid().nullable().optional(),
});

export const updateReceivableSchema = createReceivableSchema.partial();

export const receivableQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).optional(),
  status: z.nativeEnum(ReceivableStatus).optional(),
});

export const receiveActionSchema = z.object({
  actualPaymentDate: z.string().optional(),
}).optional();

export const deleteReceivableQuerySchema = z.object({
  scope: z.enum(['CURRENT', 'CURRENT_AND_FUTURE']).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).optional(),
});

export type CreateReceivableInput = z.infer<typeof createReceivableSchema>;
export type UpdateReceivableInput = z.infer<typeof updateReceivableSchema>;
export type ReceivableQuery = z.infer<typeof receivableQuerySchema>;
export type ReceiveActionInput = z.infer<typeof receiveActionSchema>;
export type DeleteReceivableQuery = z.infer<typeof deleteReceivableQuerySchema>;
