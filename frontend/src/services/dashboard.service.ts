import { api } from './api';
import { DashboardResponse } from '../types';

export interface DashboardQuery {
  month?: number;
  year?: number;
  upcomingDays?: number;
  evolutionMonths?: number;
  accountId?: string;
}

export const DashboardService = {
  get: (query?: DashboardQuery): Promise<DashboardResponse> =>
    api.get<DashboardResponse>('/dashboard', { params: query }).then((r) => r.data),
};
