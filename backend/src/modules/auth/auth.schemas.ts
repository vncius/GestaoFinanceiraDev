import { z } from 'zod';

export const googleLoginSchema = z.object({
  idToken: z.string().min(1),
});

export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;

export const acceptConsentSchema = z.object({
  accept: z.literal(true, { errorMap: () => ({ message: 'validation.consent.required' }) }),
  version: z.number().int().positive(),
});

export const deleteAccountSchema = z.object({
  confirm: z.literal(true, { errorMap: () => ({ message: 'validation.confirm.required' }) }),
});
