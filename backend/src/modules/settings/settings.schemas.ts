import { z } from 'zod';

export const updateSettingsSchema = z.object({
  dashboardScope: z.enum(['CONSOLIDATED', 'ACCOUNT']),
}).partial();

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
