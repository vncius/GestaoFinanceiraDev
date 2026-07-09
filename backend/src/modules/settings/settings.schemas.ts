import { z } from 'zod';

export const updateSettingsSchema = z.object({
  mainAccountId: z.string().uuid().nullable(),
  minimumMainBalance: z.number().int().min(0),
  annualRevenueLimit: z.number().int().min(0),
  controlStartMonth: z.number().int().min(1).max(12),
  controlStartYear: z.number().int().min(2020).max(2100),
  pjLimitControlEnabled: z.boolean(),
}).partial();

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
