import { api } from './api';
import { extractFilename, triggerDownload } from './backup.service';
import { StatementReport } from '../types';

export interface StatementQuery {
  month: number;
  year: number;
  accountId?: string;
}

export const ReportsService = {
  getStatement: (query: StatementQuery): Promise<StatementReport> =>
    api.get<StatementReport>('/reports/statement', { params: query }).then((r) => r.data),

  downloadXlsx: async (query: StatementQuery, lang: string): Promise<void> => {
    const res = await api.get('/reports/statement/xlsx', { params: { ...query, lang }, responseType: 'blob' });
    triggerDownload(res.data, extractFilename(res.headers['content-disposition'], 'extrato.xlsx'));
  },
};
