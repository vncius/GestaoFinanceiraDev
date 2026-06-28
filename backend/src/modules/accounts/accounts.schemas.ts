import { z } from 'zod';
import { AccountType } from './accounts.types';

export const createAccountSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  type: z.nativeEnum(AccountType, { message: 'Tipo de conta inválido' }),
  initialBalance: z.number().int().min(0, 'Saldo inicial deve ser >= 0').default(0),
  initialBalanceDate: z.string().optional(),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.nativeEnum(AccountType).optional(),
  initialBalance: z.number().int().min(0).optional(),
  initialBalanceDate: z.string().optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
