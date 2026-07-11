import { z } from 'zod';
import { CategoryType } from '../categories/categories.types';
import { RecurrenceType } from '../../shared/types/recurrence.types';

// Payloads do draft espelham os schemas de criação dos módulos financeiros
// (accounts.schemas.ts, categories, receivables, cash-flow, credit-cards),
// trocando ids reais por refs simbólicas (draftItemId de outro item do draft,
// ex.: 'acc_1'), resolvidas para UUIDs apenas na aplicação (ADR 0004).
// Valores monetários sempre em centavos inteiros.

const refSchema = z.string().min(1);

export const draftAccountTypePayloadSchema = z.object({
  name: z.string().min(1, 'validation.name.required').max(80),
});

export const draftAccountPayloadSchema = z.object({
  name: z.string().min(1, 'validation.name.required').max(80),
  accountTypeRef: refSchema.nullable().optional(),
  initialBalance: z.number().int().min(0, 'validation.initialBalance.min').default(0),
  /** Vira settings.mainAccountId na aplicação. No máximo uma conta com isMain. */
  isMain: z.boolean().default(false),
  autoReserveEnabled: z.boolean().default(false),
  autoReservePercentage: z.number().min(0).max(100).default(0),
});

export const draftCategoryPayloadSchema = z.object({
  name: z.string().min(1, 'validation.name.required').max(80),
  type: z.nativeEnum(CategoryType),
});

export const draftIncomePayloadSchema = z.object({
  description: z.string().min(1, 'validation.description.required').max(120),
  grossAmount: z.number().int().positive('validation.grossAmount.positive'),
  /** Dia do mês do recebimento (1–28, como os demais dias recorrentes do domínio). */
  dayOfMonth: z.number().int().min(1).max(28),
  incomeCategoryRef: refSchema,
  recurrence: z.nativeEnum(RecurrenceType).default(RecurrenceType.FIXED),
  reserveAccountRefs: z.array(refSchema).default([]),
  targetAccountRef: refSchema.nullable().optional(),
});

export const draftExpensePayloadSchema = z.object({
  description: z.string().min(1, 'validation.description.required').max(120),
  amount: z.number().int().positive('validation.amount.positive'),
  dayOfMonth: z.number().int().min(1).max(28),
  categoryRef: refSchema,
  recurrence: z.nativeEnum(RecurrenceType).default(RecurrenceType.FIXED),
  sourceAccountRef: refSchema.nullable().optional(),
});

export const draftCreditCardPayloadSchema = z.object({
  name: z.string().min(1, 'validation.name.required').max(80),
  bank: z.string().min(1, 'validation.bank.required').max(80),
  closingDay: z.number().int().min(1).max(28),
  dueDay: z.number().int().min(1).max(28),
  limit: z.number().int().min(0).default(0),
  defaultPaymentAccountRef: refSchema.nullable().optional(),
});

export const draftSettingsPayloadSchema = z.object({
  /** Escopo do controle; orienta o assistente e a derivação de pjLimitControlEnabled. */
  controlScope: z.enum(['PERSONAL', 'BUSINESS', 'BOTH']),
  minimumMainBalance: z.number().int().min(0).default(0),
  annualRevenueLimit: z.number().int().min(0).default(0),
  pjLimitControlEnabled: z.boolean().default(false),
});

export type DraftAccountTypePayload = z.infer<typeof draftAccountTypePayloadSchema>;
export type DraftAccountPayload = z.infer<typeof draftAccountPayloadSchema>;
export type DraftCategoryPayload = z.infer<typeof draftCategoryPayloadSchema>;
export type DraftIncomePayload = z.infer<typeof draftIncomePayloadSchema>;
export type DraftExpensePayload = z.infer<typeof draftExpensePayloadSchema>;
export type DraftCreditCardPayload = z.infer<typeof draftCreditCardPayloadSchema>;
export type DraftSettingsPayload = z.infer<typeof draftSettingsPayloadSchema>;

export const DRAFT_SECTIONS = [
  'accountTypes',
  'accounts',
  'categories',
  'incomes',
  'expenses',
  'creditCards',
  'settings',
] as const;

export type OnboardingDraftSection = (typeof DRAFT_SECTIONS)[number];

export const addDraftItemSchema = z.object({
  section: z.enum(DRAFT_SECTIONS),
  payload: z.record(z.unknown()),
});

export const updateDraftItemSchema = z.object({
  payload: z.record(z.unknown()),
});

export type AddDraftItemInput = z.infer<typeof addDraftItemSchema>;
export type UpdateDraftItemInput = z.infer<typeof updateDraftItemSchema>;
