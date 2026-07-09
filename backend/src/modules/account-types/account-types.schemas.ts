import { z } from 'zod';

export const createAccountTypeSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
});

export const updateAccountTypeSchema = z.object({
  name: z.string().min(1).optional(),
});

export type CreateAccountTypeInput = z.infer<typeof createAccountTypeSchema>;
export type UpdateAccountTypeInput = z.infer<typeof updateAccountTypeSchema>;
