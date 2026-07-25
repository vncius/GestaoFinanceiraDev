import { api } from './api';

export interface StatementEntry {
  date: string;
  description: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
  possibleDuplicate: boolean;
}

export type CsvExportRange = { all: true } | { from: string; to: string };

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function extractFilename(contentDisposition: string | undefined, fallback: string): string {
  const match = contentDisposition?.match(/filename="?([^";]+)"?/);
  return match?.[1] ?? fallback;
}

export const BackupService = {
  downloadBackup: async (): Promise<void> => {
    const res = await api.get('/backup/export', { responseType: 'blob' });
    triggerDownload(res.data, extractFilename(res.headers['content-disposition'], 'backup.json'));
  },

  restoreBackup: (bundle: unknown): Promise<{ counts: Record<string, number> }> =>
    api.post('/backup/import', { confirm: true, bundle }).then((r) => r.data),

  resetAccount: (): Promise<{ ok: boolean }> =>
    api.post('/backup/reset', { confirm: true }).then((r) => r.data),

  downloadCsv: async (range: CsvExportRange): Promise<void> => {
    const res = await api.get('/backup/export-csv', { params: range, responseType: 'blob' });
    triggerDownload(res.data, extractFilename(res.headers['content-disposition'], 'lancamentos.csv'));
  },

  parseStatement: (filename: string, content: string): Promise<{ entries: StatementEntry[] }> =>
    api.post('/backup/statement/parse', { filename, content }).then((r) => r.data),

  importStatement: (accountId: string, entries: StatementEntry[]): Promise<{ created: number }> =>
    api.post('/backup/statement/import', { accountId, entries }).then((r) => r.data),
};

export { readFileAsText } from '../utils/file';
