import { z } from 'zod';

export const dashboardQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).optional(),
  upcomingDays: z.coerce.number().int().min(1).max(90).default(15),
  evolutionMonths: z.coerce.number().int().min(1).max(12).default(6),
  // Com accountId: dashboard só daquela conta. Sem: consolidado de todas as
  // contas ativas do tenant.
  accountId: z.string().uuid().optional(),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
