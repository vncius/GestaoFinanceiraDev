import { z } from 'zod';
import { ReceivableStatus } from './receivables.types';

export const createReceivableSchema = z.object({
  description: z.string().min(1, 'Descrição é obrigatória'),
  expectedPaymentDate: z.string({ required_error: 'Data prevista é obrigatória' }),
  grossAmount: z.number().int().positive('Valor bruto deve ser positivo'),
  separateReservePercentage: z.boolean().default(true),
  incomeCategoryId: z.string().uuid('Categoria inválida'),
  notes: z.string().nullable().optional(),
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

export type CreateReceivableInput = z.infer<typeof createReceivableSchema>;
export type UpdateReceivableInput = z.infer<typeof updateReceivableSchema>;
export type ReceivableQuery = z.infer<typeof receivableQuerySchema>;
export type ReceiveActionInput = z.infer<typeof receiveActionSchema>;
