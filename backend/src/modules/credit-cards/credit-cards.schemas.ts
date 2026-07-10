import { z } from 'zod';
import { CardEntryType } from './credit-cards.types';

export const createCreditCardSchema = z.object({
  name: z.string().min(1, 'validation.name.required'),
  bank: z.string().min(1, 'validation.bank.required'),
  closingDay: z.number().int().min(1).max(28),
  dueDay: z.number().int().min(1).max(28),
  limit: z.number().int().min(0).default(0),
  defaultPaymentAccountId: z.string().uuid().nullable().optional(),
});

export const updateCreditCardSchema = createCreditCardSchema.partial();

export const createCardEntrySchema = z
  .object({
    description: z.string().min(1, 'validation.description.required'),
    expenseCategoryId: z.string().uuid('validation.expenseCategoryId.invalid'),
    totalAmount: z.number().int().positive('validation.totalAmount.positive'),
    purchaseDate: z.string({ required_error: 'validation.purchaseDate.required' }),
    entryType: z.nativeEnum(CardEntryType),
    installmentsCount: z.number().int().min(2).optional(),
    notes: z.string().nullable().optional(),
  })
  .refine(
    (d) =>
      d.entryType !== CardEntryType.INSTALLMENT ||
      (d.installmentsCount != null && d.installmentsCount >= 2),
    {
      message: 'validation.installmentsCount.required',
      path: ['installmentsCount'],
    },
  );

export const updateCardEntrySchema = z.object({
  description: z.string().min(1).optional(),
  expenseCategoryId: z.string().uuid().optional(),
  totalAmount: z.number().int().positive().optional(),
  purchaseDate: z.string().optional(),
  entryType: z.nativeEnum(CardEntryType).optional(),
  installmentsCount: z.number().int().min(2).optional(),
  notes: z.string().nullable().optional(),
});

export const cardFlowQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000),
});

export const findCardsQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).optional(),
});

export const payInvoiceSchema = z
  .object({
    paymentAccountId: z.string().uuid().nullable().optional(),
    paymentDate: z.string().optional(),
  })
  .optional();

export const deleteCardEntryQuerySchema = z.object({
  scope: z.enum(['CURRENT', 'CURRENT_AND_FUTURE']).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).optional(),
});

export type CreateCreditCardInput = z.infer<typeof createCreditCardSchema>;
export type UpdateCreditCardInput = z.infer<typeof updateCreditCardSchema>;
export type CreateCardEntryInput = z.infer<typeof createCardEntrySchema>;
export type UpdateCardEntryInput = z.infer<typeof updateCardEntrySchema>;
export type CardFlowQuery = z.infer<typeof cardFlowQuerySchema>;
export type FindCardsQuery = z.infer<typeof findCardsQuerySchema>;
export type PayInvoiceInput = z.infer<typeof payInvoiceSchema>;
export type DeleteCardEntryQuery = z.infer<typeof deleteCardEntryQuerySchema>;
