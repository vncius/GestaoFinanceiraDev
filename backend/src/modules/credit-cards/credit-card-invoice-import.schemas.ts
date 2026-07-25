import { z } from 'zod';

export const parseInvoiceImportSchema = z.object({
  filename: z.string().min(1),
  content: z.string().min(1),
});

const installmentInfoSchema = z.object({
  current: z.number().int().min(1),
  total: z.number().int().min(2),
});

const confirmInvoiceImportEntrySchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  amountCents: z.number().int().refine((v) => v !== 0, 'validation.amountCents.nonZero'),
  entryType: z.enum(['CASH', 'INSTALLMENT', 'REFUND']),
  categoryId: z.string().uuid(),
  createFutureInstallments: z.boolean().default(false),
  installmentInfo: installmentInfoSchema.nullable().optional(),
  externalRef: z.string().nullable().optional(),
});

export const confirmInvoiceImportSchema = z.object({
  entries: z.array(confirmInvoiceImportEntrySchema).min(1),
});

export type ParseInvoiceImportInput = z.infer<typeof parseInvoiceImportSchema>;
export type ConfirmInvoiceImportInput = z.infer<typeof confirmInvoiceImportSchema>;
export type ConfirmInvoiceImportEntry = z.infer<typeof confirmInvoiceImportEntrySchema>;
