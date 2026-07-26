import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, Check, Loader2, Pencil, Star, Trash2 } from 'lucide-react';
import {
  OnboardingDraft,
  OnboardingDraftItem,
  OnboardingService,
} from '../../../services/onboarding.service';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { CurrencyInput } from '../../../components/ui/CurrencyInput';
import { PageLoading } from '../../../components/ui/LoadingSpinner';
import { formatCurrency } from '../../../utils/money';

// Tela de revisão: renderiza SEMPRE o draft retornado pelo backend — nunca o
// texto livre da IA. Edições passam pela validação completa do servidor.
// Refs entre itens não são editáveis pela UI na v1: remova o item ou ajuste
// pelo chat.

type Section = 'accountTypes' | 'accounts' | 'categories' | 'incomes' | 'expenses' | 'creditCards' | 'settings';

type FieldType = 'text' | 'money' | 'day' | 'percent' | 'boolean';

interface FieldConfig {
  key: string;
  labelKey: string;
  type: FieldType;
}

const EDIT_FIELDS: Record<Section, FieldConfig[]> = {
  accountTypes: [{ key: 'name', labelKey: 'review.fields.name', type: 'text' }],
  accounts: [
    { key: 'name', labelKey: 'review.fields.name', type: 'text' },
    { key: 'initialBalance', labelKey: 'review.fields.initialBalance', type: 'money' },
    { key: 'isMain', labelKey: 'review.fields.isMain', type: 'boolean' },
    { key: 'autoReserveEnabled', labelKey: 'review.fields.autoReserveEnabled', type: 'boolean' },
    { key: 'autoReservePercentage', labelKey: 'review.fields.autoReservePercentage', type: 'percent' },
  ],
  categories: [{ key: 'name', labelKey: 'review.fields.name', type: 'text' }],
  incomes: [
    { key: 'description', labelKey: 'review.fields.description', type: 'text' },
    { key: 'grossAmount', labelKey: 'review.fields.amount', type: 'money' },
    { key: 'dayOfMonth', labelKey: 'review.fields.dayOfMonth', type: 'day' },
  ],
  expenses: [
    { key: 'description', labelKey: 'review.fields.description', type: 'text' },
    { key: 'amount', labelKey: 'review.fields.amount', type: 'money' },
    { key: 'dayOfMonth', labelKey: 'review.fields.dayOfMonth', type: 'day' },
  ],
  creditCards: [
    { key: 'name', labelKey: 'review.fields.name', type: 'text' },
    { key: 'bank', labelKey: 'review.fields.bank', type: 'text' },
    { key: 'closingDay', labelKey: 'review.fields.closingDay', type: 'day' },
    { key: 'dueDay', labelKey: 'review.fields.dueDay', type: 'day' },
    { key: 'limit', labelKey: 'review.fields.limit', type: 'money' },
  ],
  settings: [
    { key: 'minimumMainBalance', labelKey: 'review.fields.minimumMainBalance', type: 'money' },
    { key: 'annualRevenueLimit', labelKey: 'review.fields.annualRevenueLimit', type: 'money' },
    { key: 'pjLimitControlEnabled', labelKey: 'review.fields.pjLimitControlEnabled', type: 'boolean' },
  ],
};

interface DraftReviewProps {
  onBackToChat: () => void;
}

export default function DraftReview({ onBackToChat }: DraftReviewProps) {
  const { t } = useTranslation('onboarding');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ section: Section; item: OnboardingDraftItem } | null>(
    null,
  );

  const draftQuery = useQuery({
    queryKey: ['onboarding', 'draft'],
    queryFn: OnboardingService.getDraft,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['onboarding'] });

  const removeMutation = useMutation({
    // Wrapper evita vazar o segundo argumento de contexto interno do
    // TanStack Query (mutationFnContext) para o serviço.
    mutationFn: (draftItemId: string) => OnboardingService.removeDraftItem(draftItemId),
    onSuccess: invalidate,
  });

  const pendingRemoveId = removeMutation.isPending ? removeMutation.variables : null;

  const confirmMutation = useMutation({
    // Uma chave nova por tentativa; após falha parcial o backend retoma de
    // onde parou sem duplicar (ADR 0005).
    mutationFn: () => OnboardingService.confirm(crypto.randomUUID()),
    onSuccess: () => {
      invalidate();
      navigate('/dashboard');
    },
  });

  if (draftQuery.isLoading) return <PageLoading />;
  if (draftQuery.isError || !draftQuery.data) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('loadError')}</p>
        <Button variant="secondary" onClick={() => draftQuery.refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  const draft = draftQuery.data;
  const mains = draft.accounts.filter((a) => a.payload.isMain === true);
  const pendencies: string[] = [];
  if (draft.accounts.length === 0) pendencies.push(t('review.pendencies.noAccounts'));
  if (draft.accounts.length > 0 && mains.length !== 1)
    pendencies.push(t('review.pendencies.noMainAccount'));
  if (draft.incomes.length === 0) pendencies.push(t('review.pendencies.noIncomes'));
  const canConfirm = draft.accounts.length > 0 && mains.length === 1;

  const nameOf = (items: OnboardingDraftItem[], ref: unknown): string | null => {
    const found = items.find((i) => i.draftItemId === ref);
    return found ? String(found.payload.name ?? '') : null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
          {t('review.title')}
        </h2>
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={onBackToChat}>
          {t('review.backToChat')}
        </Button>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400">{t('review.subtitle')}</p>

      {pendencies.length > 0 && (
        <div
          data-testid="pendencies"
          className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={15} /> {t('review.pendencies.title')}
          </div>
          <ul className="mt-1 list-disc pl-6">
            {pendencies.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <SectionCard title={t('review.sections.accounts')} count={draft.accounts.length}>
        {draft.accounts.map((item) => (
          <ItemRow
            key={item.draftItemId}
            itemId={item.draftItemId}
            title={
              <span className="inline-flex items-center gap-1.5">
                {String(item.payload.name ?? '')}
                {item.payload.isMain === true && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                    <Star size={10} /> {t('review.mainAccount')}
                  </span>
                )}
              </span>
            }
            details={[
              nameOf(draft.accountTypes, item.payload.accountTypeRef),
              typeof item.payload.initialBalance === 'number' && item.payload.initialBalance > 0
                ? `${t('review.fields.initialBalance')}: ${formatCurrency(item.payload.initialBalance)}`
                : null,
              item.payload.autoReserveEnabled === true
                ? t('review.reserveOf', { percent: Number(item.payload.autoReservePercentage ?? 0) })
                : null,
            ]}
            onEdit={() => setEditing({ section: 'accounts', item })}
            onRemove={() => removeMutation.mutate(item.draftItemId)}
            removing={pendingRemoveId === item.draftItemId}
          />
        ))}
      </SectionCard>

      <SectionCard title={t('review.sections.incomes')} count={draft.incomes.length}>
        {draft.incomes.map((item) => (
          <ItemRow
            key={item.draftItemId}
            itemId={item.draftItemId}
            title={String(item.payload.description ?? '')}
            details={[
              typeof item.payload.grossAmount === 'number'
                ? formatCurrency(item.payload.grossAmount)
                : null,
              t('review.dayOfMonth', { day: Number(item.payload.dayOfMonth ?? 0) }),
              item.payload.recurrence === 'FIXED' ? t('review.recurring') : t('review.oneTime'),
              nameOf(draft.categories, item.payload.incomeCategoryRef),
            ]}
            onEdit={() => setEditing({ section: 'incomes', item })}
            onRemove={() => removeMutation.mutate(item.draftItemId)}
            removing={pendingRemoveId === item.draftItemId}
          />
        ))}
      </SectionCard>

      <SectionCard title={t('review.sections.expenses')} count={draft.expenses.length}>
        {draft.expenses.map((item) => (
          <ItemRow
            key={item.draftItemId}
            itemId={item.draftItemId}
            title={String(item.payload.description ?? '')}
            details={[
              typeof item.payload.amount === 'number' ? formatCurrency(item.payload.amount) : null,
              t('review.dayOfMonth', { day: Number(item.payload.dayOfMonth ?? 0) }),
              item.payload.recurrence === 'FIXED' ? t('review.recurring') : t('review.oneTime'),
              nameOf(draft.categories, item.payload.categoryRef),
            ]}
            onEdit={() => setEditing({ section: 'expenses', item })}
            onRemove={() => removeMutation.mutate(item.draftItemId)}
            removing={pendingRemoveId === item.draftItemId}
          />
        ))}
      </SectionCard>

      <SectionCard title={t('review.sections.creditCards')} count={draft.creditCards.length}>
        {draft.creditCards.map((item) => (
          <ItemRow
            key={item.draftItemId}
            itemId={item.draftItemId}
            title={String(item.payload.name ?? '')}
            details={[
              String(item.payload.bank ?? ''),
              t('review.cardDays', {
                closing: Number(item.payload.closingDay ?? 0),
                due: Number(item.payload.dueDay ?? 0),
              }),
              typeof item.payload.limit === 'number' && item.payload.limit > 0
                ? `${t('review.fields.limit')}: ${formatCurrency(item.payload.limit)}`
                : null,
            ]}
            onEdit={() => setEditing({ section: 'creditCards', item })}
            onRemove={() => removeMutation.mutate(item.draftItemId)}
            removing={pendingRemoveId === item.draftItemId}
          />
        ))}
      </SectionCard>

      <SectionCard title={t('review.sections.categories')} count={draft.categories.length}>
        {draft.categories.map((item) => (
          <ItemRow
            key={item.draftItemId}
            itemId={item.draftItemId}
            title={String(item.payload.name ?? '')}
            details={[
              item.payload.type === 'INCOME'
                ? t('review.incomeCategory')
                : t('review.expenseCategory'),
            ]}
            onEdit={() => setEditing({ section: 'categories', item })}
            onRemove={() => removeMutation.mutate(item.draftItemId)}
            removing={pendingRemoveId === item.draftItemId}
          />
        ))}
      </SectionCard>

      {draft.settings && (
        <SectionCard title={t('review.sections.settings')} count={1}>
          <ItemRow
            itemId={draft.settings.draftItemId}
            title={t('review.settingsTitle')}
            details={[
              draft.settings.payload.pjLimitControlEnabled === true
                ? t('review.pjControlOn')
                : t('review.pjControlOff'),
              typeof draft.settings.payload.annualRevenueLimit === 'number' &&
              draft.settings.payload.annualRevenueLimit > 0
                ? `${t('review.fields.annualRevenueLimit')}: ${formatCurrency(draft.settings.payload.annualRevenueLimit)}`
                : null,
            ]}
            onEdit={() => setEditing({ section: 'settings', item: draft.settings as OnboardingDraftItem })}
            onRemove={() => removeMutation.mutate((draft.settings as OnboardingDraftItem).draftItemId)}
            removing={pendingRemoveId === (draft.settings as OnboardingDraftItem).draftItemId}
          />
        </SectionCard>
      )}

      {confirmMutation.isError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {(confirmMutation.error as Error).message} — {t('review.retryHint')}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onBackToChat}>
          {t('review.cancel')}
        </Button>
        <Button
          variant="primary"
          icon={<Check size={14} />}
          disabled={!canConfirm}
          loading={confirmMutation.isPending}
          onClick={() => confirmMutation.mutate()}
          data-testid="confirm-button"
        >
          {t('review.confirm')}
        </Button>
      </div>

      {editing && (
        <EditItemModal
          section={editing.section}
          item={editing.item}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

// ─── Componentes internos ────────────────────────────────────────────────────

function SectionCard({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('onboarding');
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
        {title} ({count})
      </h3>
      {count === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t('review.emptySection')}</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">{children}</div>
      )}
    </section>
  );
}

function ItemRow({
  itemId,
  title,
  details,
  onEdit,
  onRemove,
  removing = false,
}: {
  itemId: string;
  title: React.ReactNode;
  details: (string | null)[];
  onEdit: () => void;
  onRemove: () => void;
  removing?: boolean;
}) {
  const { t } = useTranslation('onboarding');
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-50">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {details.filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onEdit}
          disabled={removing}
          aria-label={t('review.edit')}
          data-testid={`edit-${itemId}`}
          className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onRemove}
          disabled={removing}
          aria-label={t('review.remove')}
          data-testid={`remove-${itemId}`}
          className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  );
}

function EditItemModal({
  section,
  item,
  onClose,
  onSaved,
}: {
  section: Section;
  item: OnboardingDraftItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation('onboarding');
  const fields = EDIT_FIELDS[section];
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const field of fields) initial[field.key] = item.payload[field.key];
    return initial;
  });

  const updateMutation = useMutation({
    mutationFn: () => OnboardingService.updateDraftItem(item.draftItemId, values),
    onSuccess: onSaved,
  });

  const inputClass =
    'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <Modal
      open
      onClose={onClose}
      title={t('review.editTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('review.cancelEdit')}
          </Button>
          <Button
            variant="primary"
            loading={updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
            data-testid="save-item"
          >
            {t('review.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {fields.map((field) => (
          <label key={field.key} className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
              {t(field.labelKey)}
            </span>
            {field.type === 'text' && (
              <input
                className={inputClass}
                value={String(values[field.key] ?? '')}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              />
            )}
            {field.type === 'money' && (
              <CurrencyInput
                className={inputClass}
                value={String(Number(values[field.key] ?? 0) / 100)}
                onChange={(v) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.key]: Math.round(parseFloat(v || '0') * 100),
                  }))
                }
              />
            )}
            {(field.type === 'day' || field.type === 'percent') && (
              <input
                type="number"
                min={field.type === 'day' ? 1 : 0}
                max={field.type === 'day' ? 28 : 100}
                className={inputClass}
                value={Number(values[field.key] ?? 0)}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [field.key]: Number(e.target.value) }))
                }
              />
            )}
            {field.type === 'boolean' && (
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={values[field.key] === true}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setValues((v) => {
                    const next = { ...v, [field.key]: checked };
                    // Conta principal e conta de reserva nunca podem ser a
                    // mesma (validado também no backend) — marcar uma
                    // desmarca a outra em vez de deixar o usuário confirmar
                    // um estado que travaria a aplicação do draft.
                    if (checked && field.key === 'isMain') next.autoReserveEnabled = false;
                    if (checked && field.key === 'autoReserveEnabled') next.isMain = false;
                    return next;
                  });
                }}
              />
            )}
          </label>
        ))}
        {updateMutation.isError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {(updateMutation.error as Error).message}
          </p>
        )}
      </div>
    </Modal>
  );
}
