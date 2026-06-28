import { z } from 'zod';

export const updateSettingsSchema = z.object({
  defaultReservePercentage: z.number().min(0).max(100),
  applyReserveByDefault: z.boolean(),
  allowDisableReserve: z.boolean(),
  mainAccountId: z.string().uuid().nullable(),
  emergencyReserveAccountId: z.string().uuid().nullable(),
  minimumMainBalance: z.number().int().min(0),
  annualRevenueLimit: z.number().int().min(0),
  controlStartMonth: z.number().int().min(1).max(12),
  controlStartYear: z.number().int().min(2020).max(2100),
}).partial();

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
