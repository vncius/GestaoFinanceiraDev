import { z } from 'zod';
import { CardEntryType } from './credit-cards.types';

export const createCreditCardSchema = z.object({
  name: z.string().min(1, 'validation.name.required'),
  bank: z.string().min(1, 'validation.bank.required'),
  closingDay: z.number().int().min(1).max(28),
  dueDay: z.number().int().min(1).max(28),
  limit: z.number().int().min(0).default(0),
  // Obrigatória (U2): é a conta que leva a fatura em aberto para o fluxo de
  // caixa. Na atualização pode ser omitida, mas nunca anulada.
  defaultPaymentAccountId: z
    .string({ required_error: 'validation.defaultPaymentAccountId.required' })
    .uuid('validation.defaultPaymentAccountId.required'),
});

export const updateCreditCardSchema = createCreditCardSchema.partial();

export const createCardEntrySchema = z
  .object({
    description: z.string().min(1, 'validation.description.required'),
    expenseCategoryId: z.string().uuid('validation.expenseCategoryId.invalid'),
    totalAmount: z.number().int().refine((v) => v !== 0, 'validation.totalAmount.nonZero'),
    purchaseDate: z.string({ required_error: 'validation.purchaseDate.required' }),
    entryType: z.nativeEnum(CardEntryType),
    installmentsCount: z.number().int().min(2).optional(),
    notes: z.string().nullable().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.entryType === CardEntryType.PAYMENT) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.entryType.systemManaged',
        path: ['entryType'],
      });
    }
    if (d.entryType === CardEntryType.INSTALLMENT && (d.installmentsCount == null || d.installmentsCount < 2)) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.installmentsCount.required',
        path: ['installmentsCount'],
      });
    }
    // Estorno é sempre um valor negativo (reduz o total da fatura); os
    // demais tipos representam despesa e devem ser sempre positivos.
    if (d.entryType === CardEntryType.REFUND && d.totalAmount >= 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.totalAmount.mustBeNegativeForRefund',
        path: ['totalAmount'],
      });
    }
    if (d.entryType !== CardEntryType.REFUND && d.totalAmount <= 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.totalAmount.positive',
        path: ['totalAmount'],
      });
    }
  });

export const updateCardEntrySchema = z
  .object({
    description: z.string().min(1).optional(),
    expenseCategoryId: z.string().uuid().optional(),
    totalAmount: z.number().int().refine((v) => v !== 0, 'validation.totalAmount.nonZero').optional(),
    purchaseDate: z.string().optional(),
    entryType: z.nativeEnum(CardEntryType).optional(),
    installmentsCount: z.number().int().min(2).optional(),
    notes: z.string().nullable().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.entryType === CardEntryType.PAYMENT) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.entryType.systemManaged',
        path: ['entryType'],
      });
    }
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
