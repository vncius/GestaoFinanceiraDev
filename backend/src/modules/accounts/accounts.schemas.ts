import { z } from 'zod';

export const createAccountSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  accountTypeId: z.string().uuid().nullable().optional(),
  initialBalance: z.number().int().min(0, 'Saldo inicial deve ser >= 0').default(0),
  initialBalanceDate: z.string().optional(),
  autoReserveEnabled: z.boolean().default(false),
  autoReservePercentage: z.number().min(0).max(100).default(0),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  accountTypeId: z.string().uuid().nullable().optional(),
  initialBalance: z.number().int().min(0).optional(),
  initialBalanceDate: z.string().optional(),
  autoReserveEnabled: z.boolean().optional(),
  autoReservePercentage: z.number().min(0).max(100).optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
