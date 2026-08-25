import { z } from 'zod';

export const updateSettingsSchema = z.object({
  mainAccountId: z.string().uuid().nullable(),
}).partial();

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
