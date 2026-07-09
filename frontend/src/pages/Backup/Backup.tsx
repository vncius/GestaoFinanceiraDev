import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
      showError(err instanceof Error ? err.message : 'Erro ao baixar backup.');
    } finally {
      setDownloading(false);
    }
  }

  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const ok = await confirm(
      'Restaurar um backup substitui TODOS os dados atuais (contas, categorias, lançamentos, cartões) pelos do arquivo. Esta ação não pode ser desfeita. Deseja continuar?',
      { title: 'Restaurar backup', confirmLabel: 'Restaurar' },
    );
    if (!ok) return;

    setRestoring(true);
    try {
      const content = await readFileAsText(file);
      const bundle = JSON.parse(content);
      await BackupService.restoreBackup(bundle);
      await qc.invalidateQueries();
      showSuccess('Backup restaurado com sucesso.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erro ao restaurar backup.');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <SectionCard
      title="Backup completo"
      icon={<Database size={18} />}
      description="Exporta ou restaura todos os dados do sistema em um único arquivo JSON."
    >
      <div className="flex flex-wrap gap-3">
        <Button icon={<Download size={14} />} loading={downloading} onClick={handleDownload}>
          Baixar backup
        </Button>
        <Button
          variant="secondary"
          icon={<Upload size={14} />}
          loading={restoring}
          onClick={() => fileInputRef.current?.click()}
        >
          Restaurar backup
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
      showError(err instanceof Error ? err.message : 'Erro ao exportar CSV.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <SectionCard
      title="Exportar lançamentos"
      icon={<FileSpreadsheet size={18} />}
      description="Gera uma planilha CSV com pagamentos, gastos extras e recebíveis do período escolhido."
    >
      <div className="flex flex-wrap items-center gap-2">
        {([
          { value: 'month', label: 'Mês atual' },
          { value: 'custom', label: 'Personalizado' },
          { value: 'all', label: 'Todo o período' },
        ] as { value: PeriodMode; label: string }[]).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMode(opt.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              mode === opt.value
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === 'custom' && (
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <DateInput value={from} onChange={setFrom} className={INPUT} />
          <DateInput value={to} onChange={setTo} className={INPUT} />
        </div>
      )}

      <Button icon={<Download size={14} />} loading={downloading} onClick={handleDownload}>
        Baixar CSV
      </Button>
    </SectionCard>
  );
}

// ── Importar extrato bancário ────────────────────────────────────────────────

interface PreviewEntry extends StatementEntry {
  include: boolean;
}

function StatementImportSection() {
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
      showError(err instanceof Error ? err.message : 'Erro ao ler o extrato.');
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
      showSuccess(`${created} lançamento(s) importado(s).`);
      setEntries(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erro ao importar extrato.');
    } finally {
      setImporting(false);
    }
  }

  const selectedCount = entries?.filter((e) => e.include).length ?? 0;

  return (
    <SectionCard
      title="Importar extrato bancário"
      icon={<Upload size={18} />}
      description="Envie um arquivo CSV ou OFX do seu banco para pré-visualizar e importar os lançamentos."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" loading={parsing} onClick={() => fileInputRef.current?.click()}>
          Selecionar arquivo (.csv, .ofx)
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
        <EmptyState title="Nenhum lançamento reconhecido no arquivo" />
      )}

      {entries && entries.length > 0 && (
        <>
          <div className="max-w-xs">
            <select className={INPUT} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Selecione a conta de destino...</option>
              {accounts.filter((a) => a.active).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2 text-left"></th>
                  <th className="px-3 py-2 text-left font-medium">Data</th>
                  <th className="px-3 py-2 text-left font-medium">Descrição</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 text-left font-medium">Tipo</th>
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
                        <span className="ml-2 text-[10px] text-amber-600 dark:text-amber-400">possível duplicata</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right font-medium ${entry.type === 'INCOME' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatCurrency(entry.amount)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggleType(i)}
                        title="Clique para alternar entrada/saída"
                        className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      >
                        <ArrowUpDown size={12} />
                        {entry.type === 'INCOME' ? 'Entrada' : 'Saída'}
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
            Importar {selectedCount} lançamento(s)
          </Button>
        </>
      )}
    </SectionCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Backup() {
  return (
    <div className="space-y-4 max-w-3xl">
      <FullBackupSection />
      <CsvExportSection />
      <StatementImportSection />
    </div>
  );
}
