import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Download, Upload, FileSpreadsheet, Database, ArrowUpDown } from 'lucide-react';
import { BackupService, readFileAsText, StatementEntry } from '../../services/backup.service';
import { AccountsService } from '../../services/accounts.service';
import { Button } from '../../components/ui/Button';
import { DateInput } from '../../components/ui/DateInput';
import { EmptyState } from '../../components/ui/EmptyState';
import { useDialog } from '../../contexts/DialogContext';
import { useToast } from '../../contexts/ToastContext';
import { useMonth } from '../../contexts/MonthContext';
import { formatCurrency } from '../../utils/money';
import { formatDate, firstDayOfMonthISO } from '../../utils/date';
import { sortByName } from '../../utils/sort';

const INPUT = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function SectionCard({ title, icon, description, children }: { title: string; icon: React.ReactNode; description: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-start gap-3">
        <div className="mt-0.5 text-gray-400 dark:text-gray-500">{icon}</div>
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function lastDayOfMonthISO(month: number, year: number): string {
  const d = new Date(year, month, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Backup completo ──────────────────────────────────────────────────────────

function FullBackupSection() {
  const { t } = useTranslation('backup');
  const { confirm } = useDialog();
  const { showError, showSuccess } = useToast();
  const qc = useQueryClient();
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleDownload() {
    setDownloading(true);
    try {
      await BackupService.downloadBackup();
    } catch (err) {
      showError(err instanceof Error ? err.message : t('fullBackup.downloadError'));
    } finally {
      setDownloading(false);
    }
  }

  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const ok = await confirm(
      t('fullBackup.restoreConfirmMessage'),
      { title: t('fullBackup.restoreConfirmTitle'), confirmLabel: t('fullBackup.restoreConfirmLabel') },
    );
    if (!ok) return;

    setRestoring(true);
    try {
      const content = await readFileAsText(file);
      const bundle = JSON.parse(content);
      await BackupService.restoreBackup(bundle);
      await qc.invalidateQueries();
      showSuccess(t('fullBackup.restoreSuccess'));
    } catch (err) {
      showError(err instanceof Error ? err.message : t('fullBackup.restoreError'));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <SectionCard
      title={t('fullBackup.title')}
      icon={<Database size={18} />}
      description={t('fullBackup.description')}
    >
      <div className="flex flex-wrap gap-3">
        <Button icon={<Download size={14} />} loading={downloading} onClick={handleDownload}>
          {t('fullBackup.downloadButton')}
        </Button>
        <Button
          variant="secondary"
          icon={<Upload size={14} />}
          loading={restoring}
          onClick={() => fileInputRef.current?.click()}
        >
          {t('fullBackup.restoreButton')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleRestore}
          disabled={restoring}
        />
      </div>
    </SectionCard>
  );
}

// ── Exportar lançamentos (CSV) ───────────────────────────────────────────────

type PeriodMode = 'month' | 'custom' | 'all';

function CsvExportSection() {
  const { t } = useTranslation('backup');
  const { month, year } = useMonth();
  const { showError } = useToast();
  const [mode, setMode] = useState<PeriodMode>('month');
  const [from, setFrom] = useState(firstDayOfMonthISO(month, year));
  const [to, setTo] = useState(lastDayOfMonthISO(month, year));
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      if (mode === 'all') {
        await BackupService.downloadCsv({ all: true });
      } else if (mode === 'month') {
        await BackupService.downloadCsv({ from: firstDayOfMonthISO(month, year), to: lastDayOfMonthISO(month, year) });
      } else {
        await BackupService.downloadCsv({ from, to });
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : t('csvExport.downloadError'));
    } finally {
      setDownloading(false);
    }
  }

  const periodOptions: { value: PeriodMode; label: string }[] = [
    { value: 'month', label: t('csvExport.periodMonth') },
    { value: 'custom', label: t('csvExport.periodCustom') },
    { value: 'all', label: t('csvExport.periodAll') },
  ];

  const effectiveFrom = mode === 'month' ? firstDayOfMonthISO(month, year) : from;
  const effectiveTo = mode === 'month' ? lastDayOfMonthISO(month, year) : to;

  return (
    <SectionCard
      title={t('csvExport.title')}
      icon={<FileSpreadsheet size={18} />}
      description={t('csvExport.description')}
    >
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
          {t('csvExport.periodLabel')}
        </label>
        <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-700 p-1 gap-1">
          {periodOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === opt.value
                  ? 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'custom' && (
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              {t('csvExport.fromLabel')}
            </label>
            <DateInput value={from} onChange={setFrom} className={INPUT} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              {t('csvExport.toLabel')}
            </label>
            <DateInput value={to} onChange={setTo} className={INPUT} />
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {mode === 'all'
          ? t('csvExport.periodSummaryAll')
          : t('csvExport.periodSummary', { from: formatDate(effectiveFrom), to: formatDate(effectiveTo) })}
      </p>

      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
        <Button icon={<Download size={14} />} loading={downloading} onClick={handleDownload}>
          {t('csvExport.downloadButton')}
        </Button>
      </div>
    </SectionCard>
  );
}

// ── Importar extrato bancário ────────────────────────────────────────────────

interface PreviewEntry extends StatementEntry {
  include: boolean;
}

function StatementImportSection() {
  const { t } = useTranslation('backup');
  const { showError, showSuccess } = useToast();
  const qc = useQueryClient();
  const [entries, setEntries] = useState<PreviewEntry[] | null>(null);
  const [accountId, setAccountId] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: AccountsService.findAll,
    staleTime: Infinity,
  });

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setParsing(true);
    setEntries(null);
    try {
      const content = await readFileAsText(file);
      const { entries: parsed } = await BackupService.parseStatement(file.name, content);
      setEntries(parsed.map((entry) => ({ ...entry, include: !entry.possibleDuplicate })));
    } catch (err) {
      showError(err instanceof Error ? err.message : t('statementImport.readError'));
    } finally {
      setParsing(false);
    }
  }

  function toggleInclude(index: number) {
    setEntries((prev) => prev?.map((e, i) => (i === index ? { ...e, include: !e.include } : e)) ?? null);
  }

  function toggleType(index: number) {
    setEntries((prev) => prev?.map((e, i) => (i === index ? { ...e, type: e.type === 'INCOME' ? 'EXPENSE' : 'INCOME' } : e)) ?? null);
  }

  async function handleImport() {
    if (!entries || !accountId) return;
    const selected = entries.filter((e) => e.include);
    if (selected.length === 0) return;

    setImporting(true);
    try {
      const { created } = await BackupService.importStatement(accountId, selected);
      await qc.invalidateQueries({ queryKey: ['cashFlow'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
      showSuccess(t('statementImport.importSuccess', { count: created }));
      setEntries(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : t('statementImport.importError'));
    } finally {
      setImporting(false);
    }
  }

  const selectedCount = entries?.filter((e) => e.include).length ?? 0;

  return (
    <SectionCard
      title={t('statementImport.title')}
      icon={<Upload size={18} />}
      description={t('statementImport.description')}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" loading={parsing} onClick={() => fileInputRef.current?.click()}>
          {t('statementImport.selectFileButton')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.ofx,text/csv"
          className="hidden"
          onChange={handleFile}
          disabled={parsing}
        />
      </div>

      {entries && entries.length === 0 && (
        <EmptyState title={t('statementImport.emptyState')} />
      )}

      {entries && entries.length > 0 && (
        <>
          <div className="max-w-xs">
            <select className={INPUT} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">{t('statementImport.selectAccountPlaceholder')}</option>
              {sortByName(accounts.filter((a) => a.active)).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2 text-left"></th>
                  <th className="px-3 py-2 text-left font-medium">{t('statementImport.tableDate')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('statementImport.tableDescription')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('statementImport.tableAmount')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('statementImport.tableType')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {entries.map((entry, i) => (
                  <tr key={i} className={entry.possibleDuplicate ? 'bg-amber-50 dark:bg-amber-900/20' : ''}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={entry.include} onChange={() => toggleInclude(i)} className="rounded" />
                    </td>
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{formatDate(entry.date)}</td>
                    <td className="px-3 py-2 text-gray-800 dark:text-gray-100">
                      {entry.description}
                      {entry.possibleDuplicate && (
                        <span className="ml-2 text-[10px] text-amber-600 dark:text-amber-400">{t('statementImport.possibleDuplicate')}</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right font-medium ${entry.type === 'INCOME' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatCurrency(entry.amount)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggleType(i)}
                        title={t('statementImport.toggleTypeTitle')}
                        className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      >
                        <ArrowUpDown size={12} />
                        {entry.type === 'INCOME' ? t('statementImport.typeIncome') : t('statementImport.typeExpense')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button
            loading={importing}
            disabled={!accountId || selectedCount === 0}
            onClick={handleImport}
          >
            {t('statementImport.importButton', { count: selectedCount })}
          </Button>
        </>
      )}
    </SectionCard>
  );
}

// ── Seções (renderizadas em Configurações → Seus dados) ───────────────────────

export default function BackupSections() {
  return (
    <div className="space-y-4">
      <FullBackupSection />
      <CsvExportSection />
      <StatementImportSection />
    </div>
  );
}
