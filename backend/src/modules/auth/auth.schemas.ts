import { z } from 'zod';

export const googleLoginSchema = z.object({
  idToken: z.string().min(1),
});

export const appleLoginSchema = z.object({
  idToken: z.string().min(1),
  name: z.string().optional(),
});

export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
export type AppleLoginInput = z.infer<typeof appleLoginSchema>;
