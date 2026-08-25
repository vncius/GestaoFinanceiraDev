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
  /** No máximo uma conta com isMain — vira o contexto default para receitas/
   * despesas do draft sem conta explícita (settings não guarda mais conta
   * principal desde a E5; ver docs/refactor-contas-pf-pj.md). */
  isMain: z.boolean().default(false),
  /** Reserva automática (E8): a flag e o percentual ficam na conta de
   * ORIGEM; autoReserveTargetAccountRef aponta para a conta de DESTINO
   * (outro item do draft, nunca a si mesma — validado em
   * onboarding-draft.service.ts). isMain e autoReserveEnabled não conflitam
   * mais entre si — uma conta pode ser principal e ainda assim ter uma
   * regra de reserva apontando para outra conta. */
  autoReserveEnabled: z.boolean().default(false),
  autoReservePercentage: z.number().min(0).max(100).default(0),
  autoReserveTargetAccountRef: refSchema.nullable().optional(),
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

// Transferência pontual entre duas contas do draft (E7/E9) — não é a regra de
// reserva automática (essa fica em draftAccountPayloadSchema). Sempre única
// (sem recurrence): representa um movimento já decidido, não uma obrigação
// recorrente.
export const draftTransferPayloadSchema = z.object({
  description: z.string().min(1, 'validation.description.required').max(120),
  amount: z.number().int().positive('validation.amount.positive'),
  dayOfMonth: z.number().int().min(1).max(28),
  sourceAccountRef: refSchema,
  targetAccountRef: refSchema,
});

export const draftSettingsPayloadSchema = z.object({
  /** Espelha settings.dashboardScope (E5) — único campo de settings que
   * realmente persiste; a aplicação grava direto em FinancialSettings. */
  dashboardScope: z.enum(['CONSOLIDATED', 'ACCOUNT']).default('CONSOLIDATED'),
});

export type DraftAccountTypePayload = z.infer<typeof draftAccountTypePayloadSchema>;
export type DraftAccountPayload = z.infer<typeof draftAccountPayloadSchema>;
export type DraftCategoryPayload = z.infer<typeof draftCategoryPayloadSchema>;
export type DraftIncomePayload = z.infer<typeof draftIncomePayloadSchema>;
export type DraftExpensePayload = z.infer<typeof draftExpensePayloadSchema>;
export type DraftCreditCardPayload = z.infer<typeof draftCreditCardPayloadSchema>;
export type DraftTransferPayload = z.infer<typeof draftTransferPayloadSchema>;
export type DraftSettingsPayload = z.infer<typeof draftSettingsPayloadSchema>;

export const DRAFT_SECTIONS = [
  'accountTypes',
  'accounts',
  'categories',
  'incomes',
  'expenses',
  'creditCards',
  'transfers',
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

// Turno de conversa. Limite de caracteres é a primeira barreira de custo/abuso.
export const postMessageSchema = z.object({
  message: z.string().min(1, 'validation.message.required').max(2000, 'validation.message.max'),
  language: z.enum(['pt', 'en', 'es']).optional(),
});

export type PostMessageInput = z.infer<typeof postMessageSchema>;

// Confirmação da configuração (ADR 0005): uma chave por tentativa, gerada no
// frontend; repetir a mesma chave após conclusão devolve o resultado anterior.
export const confirmSchema = z.object({
  idempotencyKey: z.string().uuid('validation.idempotencyKey.invalid'),
});

export type ConfirmInput = z.infer<typeof confirmSchema>;
