import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../contexts/ToastContext';
import { readFileAsText } from '../../utils/file';
import { formatCurrency } from '../../utils/money';
import { formatDate, formatMonthYear } from '../../utils/date';
import { Category, InvoiceImportPreviewEntry } from '../../types';
import { CreditCardInvoiceImportService } from '../../services/credit-card-invoice-import.service';

const INPUT =
  'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

interface PreviewRow extends InvoiceImportPreviewEntry {
  include: boolean;
  entryType: 'CASH' | 'REFUND';
  categoryId: string;
  createFutureInstallments: boolean;
  overwrite: boolean;
  // Calculado no cliente (não vem do backend): true quando a fatura em que
  // este lançamento cairia (targetMonth/targetYear, calculado a partir do
  // fechamento do cartão) é diferente da fatura que o usuário está
  // visualizando ao abrir a importação. Um fechamento mal configurado faz
  // lançamentos caírem silenciosamente em faturas erradas (inclusive
  // meses já fechados/pagos) — este aviso é a trava para o usuário perceber
  // antes de confirmar.
  targetMismatch: boolean;
}

export function ImportInvoiceModal({
  open,
  onClose,
  cardId,
  categories,
  onImported,
  referenceMonth,
  referenceYear,
}: {
  open: boolean;
  onClose: () => void;
  cardId: string;
  categories: Category[];
  onImported: () => void;
  referenceMonth: number;
  referenceYear: number;
}) {
  const { t } = useTranslation('creditCards');
  const { showError, showSuccess } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const expenseCats = categories.filter((c) => c.type === 'EXPENSE' && c.active);

  function reset() {
    setRows(null);
    setParsing(false);
    setImporting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setParsing(true);
    setRows(null);
    try {
      const content = await readFileAsText(file);
      const { entries } = await CreditCardInvoiceImportService.parseInvoice(cardId, file.name, content);
      setRows(
        entries.map((entry) => {
          const targetMismatch = entry.targetMonth !== referenceMonth || entry.targetYear !== referenceYear;
          return {
            ...entry,
            include: !entry.possibleDuplicate && !entry.possiblePreviousInvoicePayment && !targetMismatch,
            entryType: entry.suggestedEntryType === 'REFUND' ? 'REFUND' : 'CASH',
            categoryId: entry.suggestedCategoryId ?? '',
            // Não recria histórico automaticamente — o usuário decide, linha a
            // linha, se quer gerar as parcelas futuras de uma compra em andamento.
            createFutureInstallments: false,
            overwrite: false,
            targetMismatch,
          };
        }),
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : t('invoiceImport.parseError'));
    } finally {
      setParsing(false);
    }
  }

  function updateRow(key: string, patch: Partial<PreviewRow>) {
    setRows((prev) => prev?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);
  }

  async function handleImport() {
    if (!rows) return;
    const selected = rows.filter((r) => r.include);
    if (selected.length === 0) return;

    if (selected.some((r) => !r.description.trim())) {
      showError(t('entryModal.validation.description'));
      return;
    }
    if (selected.some((r) => !r.categoryId)) {
      showError(t('entryModal.validation.category'));
      return;
    }

    setImporting(true);
    try {
      const { created, updated } = await CreditCardInvoiceImportService.confirmImport(
        cardId,
        selected.map((r) => ({
          date: r.date,
          description: r.description.trim(),
          amountCents: r.amountCents,
          entryType: r.installmentInfo && r.entryType === 'CASH' ? 'INSTALLMENT' : r.entryType,
          categoryId: r.categoryId,
          createFutureInstallments: r.createFutureInstallments,
          installmentInfo: r.installmentInfo,
          externalRef: r.externalRef,
          overwriteEntryId: r.overwrite ? r.existingEntryId : null,
        })),
      );
      showSuccess(
        updated > 0
          ? t('invoiceImport.importSuccessWithOverwrite', { created, updated })
          : t('invoiceImport.importSuccess', { count: created }),
      );
      onImported();
      handleClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : t('invoiceImport.parseError'));
    } finally {
      setImporting(false);
    }
  }

  const selectedCount = rows?.filter((r) => r.include).length ?? 0;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('invoiceImport.title')}
      size="2xl"
      footer={
        rows && rows.length > 0 ? (
          <>
            <Button variant="secondary" onClick={handleClose}>{t('invoiceImport.cancelButton')}</Button>
            <Button loading={importing} disabled={selectedCount === 0} onClick={handleImport}>
              {t('invoiceImport.confirmButton', { count: selectedCount })}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={handleClose}>{t('invoiceImport.cancelButton')}</Button>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" loading={parsing} icon={<Upload size={14} />} onClick={() => fileInputRef.current?.click()}>
            {rows ? t('invoiceImport.changeFileButton') : t('invoiceImport.selectFileButton')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ofx"
            className="hidden"
            onChange={handleFile}
            disabled={parsing}
          />
        </div>

        {rows && rows.length === 0 && <EmptyState title={t('invoiceImport.noEntries')} />}

        {rows && rows.length > 0 && (
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2 text-left">{t('invoiceImport.table.include')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('invoiceImport.table.date')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('invoiceImport.table.description')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('invoiceImport.table.amount')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('invoiceImport.table.type')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('invoiceImport.table.category')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    className={`${
                      row.possibleDuplicate || row.possiblePreviousInvoicePayment || row.targetMismatch
                        ? 'bg-amber-50 dark:bg-amber-900/20'
                        : ''
                    } ${row.include ? '' : 'opacity-50'}`}
                  >
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(e) => updateRow(row.key, { include: e.target.checked })}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-2 align-top text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {formatDate(row.date)}
                    </td>
                    <td className="px-3 py-2 align-top text-gray-800 dark:text-gray-100 min-w-[280px]">
                      <input
                        className={`${INPUT} min-w-[260px]`}
                        value={row.description}
                        onChange={(e) => updateRow(row.key, { description: e.target.value })}
                        disabled={!row.include}
                      />
                      {row.installmentInfo && (
                        <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                          {t('invoiceImport.installmentBadge', {
                            current: row.installmentInfo.current,
                            total: row.installmentInfo.total,
                          })}
                        </div>
                      )}
                      {row.targetMismatch && (
                        <div className="text-[10px] font-medium text-red-600 dark:text-red-400 mt-0.5">
                          {t('invoiceImport.warnings.targetMismatch', {
                            target: formatMonthYear(row.targetMonth, row.targetYear),
                            reference: formatMonthYear(referenceMonth, referenceYear),
                          })}
                        </div>
                      )}
                      {row.possibleDuplicate && (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                          {t('invoiceImport.warnings.duplicate')}
                        </div>
                      )}
                      {row.existingEntryId && (
                        <label className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                          <input
                            type="checkbox"
                            checked={row.overwrite}
                            onChange={(e) =>
                              updateRow(row.key, {
                                overwrite: e.target.checked,
                                include: e.target.checked ? true : row.include,
                              })
                            }
                            className="rounded"
                          />
                          {t('invoiceImport.overwriteCheckbox')}
                        </label>
                      )}
                      {row.possiblePreviousInvoicePayment && (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                          {t('invoiceImport.warnings.previousPayment')}
                        </div>
                      )}
                      {row.entryType === 'CASH' && row.installmentInfo && row.installmentInfo.current < row.installmentInfo.total && (
                        <label className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                          <input
                            type="checkbox"
                            checked={row.createFutureInstallments}
                            onChange={(e) => updateRow(row.key, { createFutureInstallments: e.target.checked })}
                            disabled={!row.include}
                            className="rounded"
                          />
                          {t('invoiceImport.createFutureInstallments', {
                            count: row.installmentInfo.total - row.installmentInfo.current,
                          })}
                        </label>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 align-top text-right font-medium whitespace-nowrap ${
                        row.amountCents < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                      }`}
                    >
                      {formatCurrency(row.amountCents)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select
                        className={INPUT}
                        value={row.entryType}
                        onChange={(e) => updateRow(row.key, { entryType: e.target.value as PreviewRow['entryType'] })}
                        disabled={!row.include}
                      >
                        <option value="CASH">{t('invoiceImport.typeOptions.cash')}</option>
                        <option value="REFUND">{t('invoiceImport.typeOptions.refund')}</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select
                        className={INPUT}
                        value={row.categoryId}
                        onChange={(e) => updateRow(row.key, { categoryId: e.target.value })}
                        disabled={!row.include}
                      >
                        <option value="">{t('invoiceImport.categoryPlaceholder')}</option>
                        {expenseCats.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
