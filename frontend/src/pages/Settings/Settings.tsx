import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2, Plus, AlertTriangle } from 'lucide-react';
import { BackupService } from '../../services/backup.service';
import { AccountsService, CreateAccountPayload } from '../../services/accounts.service';
import { AccountTypesService, CreateAccountTypePayload } from '../../services/account-types.service';
import { CategoriesService, CreateCategoryPayload } from '../../services/categories.service';
import {
  CreditCardsService,
  CreateCreditCardPayload,
} from '../../services/credit-cards.service';
import { Account, AccountTypeItem, Category, CreditCard } from '../../types';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { IconActionButton } from '../../components/ui/IconActionButton';
import { HelpTip } from '../../components/ui/Tooltip';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { CurrencyInput } from '../../components/ui/CurrencyInput';
import { formatCurrency, centsToFloat, floatToCents } from '../../utils/money';
import { useDialog } from '../../contexts/DialogContext';
import { useToast } from '../../contexts/ToastContext';
import { getMissingFields, missingFieldsMessage } from '../../utils/validation';
import { invalidateDerivedData } from '../../utils/query-invalidation';
import { sortByName } from '../../utils/sort';
import { CardSettingsModal } from '../../components/credit-card/CardSettingsModal';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Language } from '../../i18n';
import BackupSections from '../Backup/Backup';

// ── Shared helpers ────────────────────────────────────────────────────────────

type SettingsTab = 'accounts' | 'cards' | 'categories' | 'preferences' | 'data';

// Aba vem da URL (?tab=), para que outras telas possam linkar direto (ex.:
// /backup → /settings?tab=data).
const TAB_ORDER: SettingsTab[] = ['accounts', 'cards', 'categories', 'preferences', 'data'];
const DEFAULT_TAB: SettingsTab = 'accounts';

function isSettingsTab(value: string | null): value is SettingsTab {
  return TAB_ORDER.includes(value as SettingsTab);
}

const NEW_TYPE = '__new_type__';

const INPUT =
  'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      {children}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Data Tab (backup, exportação, importação e zona de perigo) ────────────────

function ResetAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const { confirm } = useDialog();
  const [text, setText] = useState('');
  const [resetting, setResetting] = useState(false);

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setText(''); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const word = t('general.resetConfirmWord');
  const canConfirm = text.trim().toUpperCase() === word.toUpperCase();

  async function handleReset() {
    setResetting(true);
    try {
      await BackupService.resetAccount();
      await qc.invalidateQueries();
      showSuccess(t('general.resetSuccess'));
      onClose();
      const wantsOnboarding = await confirm(t('general.resetOnboardingOfferMessage'), {
        title: t('general.resetOnboardingOfferTitle'),
        confirmLabel: t('general.resetOnboardingOfferConfirm'),
        cancelLabel: t('general.resetOnboardingOfferCancel'),
      });
      if (wantsOnboarding) navigate('/onboarding', { state: { startAssistant: true } });
    } catch (err) {
      showError(err instanceof Error ? err.message : t('general.resetError'));
    } finally {
      setResetting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('general.resetConfirmTitle')}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="danger" disabled={!canConfirm} loading={resetting} onClick={handleReset}>
            {t('general.resetButton')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {t('general.resetConfirmMessage')}
        </p>
        <Field label={t('general.resetConfirmInputLabel', { word })}>
          <input
            className={INPUT}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={word}
            autoComplete="off"
          />
        </Field>
      </div>
    </Modal>
  );
}

// Antiga página "Backup e Exportação" + zona de perigo da antiga aba Geral
// (U5 do plano de UX): tudo que mexe nos dados como um todo fica junto.
function DataTab() {
  const { t } = useTranslation('settings');
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <div className="space-y-5 max-w-3xl">
      <BackupSections />

      <SectionCard title={t('general.dangerZoneTitle')}>
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('general.resetDescription')}
          </p>
          <Button variant="danger" icon={<AlertTriangle size={14} />} onClick={() => setResetOpen(true)}>
            {t('general.resetButton')}
          </Button>
        </div>
      </SectionCard>

      <ResetAccountModal open={resetOpen} onClose={() => setResetOpen(false)} />
    </div>
  );
}

// ── Preferences Tab ───────────────────────────────────────────────────────────

const LANGUAGES: Language[] = ['pt', 'en', 'es'];

function PreferencesTab() {
  const { t } = useTranslation('settings');
  const { language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="space-y-5 max-w-2xl">
      <SectionCard title={t('preferences.title')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('preferences.languageLabel')}>
            <select className={INPUT} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>{t(`preferences.languages.${lang}`)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('preferences.themeLabel')}>
            <select
              className={INPUT}
              value={theme}
              onChange={(e) => { if (e.target.value !== theme) toggleTheme(); }}
            >
              <option value="light">{t('preferences.themes.light')}</option>
              <option value="dark">{t('preferences.themes.dark')}</option>
            </select>
          </Field>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Accounts Tab ──────────────────────────────────────────────────────────────

interface AccountFormState {
  name: string;
  accountTypeId: string;
  initialBalance: string;
  autoReserveEnabled: boolean;
  autoReservePercentage: string;
  autoReserveTargetAccountId: string;
}

function AccountModal({
  open,
  onClose,
  item,
  accounts,
  accountTypes,
  onSave,
  onDelete,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  item?: Account;
  accounts: Account[];
  accountTypes: AccountTypeItem[];
  onSave: (data: CreateAccountPayload) => void;
  onDelete?: () => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation('settings');
  const activeTypes = sortByName(accountTypes.filter((at) => at.active));
  // Não pode apontar reserva automática para a própria conta (E8).
  const targetOptions = sortByName(accounts.filter((a) => a.active && a.id !== item?.id));

  const init = (): AccountFormState => ({
    name: item?.name ?? '',
    accountTypeId: item?.accountTypeId ?? '',
    initialBalance: item ? String(centsToFloat(item.initialBalance)) : '0',
    autoReserveEnabled: item?.autoReserveEnabled ?? false,
    autoReservePercentage: String(item?.autoReservePercentage ?? 0),
    autoReserveTargetAccountId: item?.autoReserveTargetAccountId ?? '',
  });

  const [form, setForm] = useState<AccountFormState>(init);
  const [lastOpen, setLastOpen] = useState(false);
  const [creatingType, setCreatingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  if (open && !lastOpen) { setForm(init()); setCreatingType(false); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const { alert } = useDialog();
  const qc = useQueryClient();

  // Tipo de conta criado sem sair do cadastro da conta (U14 do plano de UX).
  const createTypeMut = useMutation({
    mutationFn: AccountTypesService.create,
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['accountTypes'] });
      setForm((f) => ({ ...f, accountTypeId: created.id }));
      setCreatingType(false);
    },
  });
  function createType() {
    const name = newTypeName.trim();
    if (name) createTypeMut.mutate({ name });
  }

  const set =
    (k: keyof AccountFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const missing = getMissingFields([
      { label: t('validation.nameLabel'), valid: !!form.name },
      ...(form.autoReserveEnabled
        ? [{ label: t('accounts.modal.autoReserveTargetLabel'), valid: !!form.autoReserveTargetAccountId }]
        : []),
    ]);
    if (missing.length > 0) { await alert(missingFieldsMessage(missing)); return; }
    onSave({
      name: form.name,
      accountTypeId: form.accountTypeId || null,
      initialBalance: floatToCents(parseFloat(form.initialBalance) || 0),
      autoReserveEnabled: form.autoReserveEnabled,
      autoReservePercentage: form.autoReserveEnabled ? parseFloat(form.autoReservePercentage) || 0 : 0,
      autoReserveTargetAccountId: form.autoReserveEnabled ? form.autoReserveTargetAccountId || null : null,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? t('accounts.modal.editTitle') : t('accounts.modal.newTitle')}
      footer={
        <>
          {item && onDelete && (
            <button
              type="button"
              title={t('actions.deactivate')}
              aria-label={t('actions.deactivate')}
              onClick={() => { onClose(); onDelete(); }}
              className="md:hidden mr-auto p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
            >
              <Trash2 size={16} />
            </button>
          )}
          <Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button loading={isSaving} onClick={handleSubmit as never}>{t('actions.save')}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('accounts.modal.nameLabel')}>
          <input className={INPUT} value={form.name} onChange={set('name')} required />
        </Field>
        <Field label={t('accounts.modal.typeLabel')}>
          {creatingType ? (
            <div className="flex gap-2">
              <input
                className={INPUT}
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder={t('accounts.modal.newTypePlaceholder')}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); createType(); }
                  if (e.key === 'Escape') { e.stopPropagation(); setCreatingType(false); }
                }}
              />
              <Button size="sm" onClick={createType} loading={createTypeMut.isPending} disabled={!newTypeName.trim()}>
                {t('accounts.modal.newTypeCreate')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setCreatingType(false)}>
                {t('actions.cancel')}
              </Button>
            </div>
          ) : (
            <select
              className={INPUT}
              value={form.accountTypeId}
              onChange={(e) => {
                if (e.target.value === NEW_TYPE) { setNewTypeName(''); setCreatingType(true); return; }
                setForm((f) => ({ ...f, accountTypeId: e.target.value }));
              }}
            >
              <option value="">{t('accounts.modal.typeNone')}</option>
              {activeTypes.map((at) => (
                <option key={at.id} value={at.id}>{at.name}</option>
              ))}
              <option value={NEW_TYPE}>{t('accounts.modal.newTypeOption')}</option>
            </select>
          )}
        </Field>
        <Field label={t('accounts.modal.initialBalanceLabel')}>
          <input
            type="number"
            step="0.01"
            className={INPUT}
            value={form.initialBalance}
            onChange={set('initialBalance')}
          />
        </Field>
        {(targetOptions.length > 0 || form.autoReserveEnabled) && (
        <>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={form.autoReserveEnabled}
            onChange={(e) => setForm((f) => ({ ...f, autoReserveEnabled: e.target.checked }))}
            className="rounded"
          />
          {t('accounts.modal.autoReserveLabel')}
          <HelpTip text={t('accounts.modal.autoReserveTooltip')} />
        </label>
        {form.autoReserveEnabled && (
          <>
            <Field label={t('accounts.modal.autoReservePercentageLabel')}>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                className={INPUT}
                value={form.autoReservePercentage}
                onChange={set('autoReservePercentage')}
              />
            </Field>
            <Field label={t('accounts.modal.autoReserveTargetLabel')}>
              <select
                className={INPUT}
                value={form.autoReserveTargetAccountId}
                onChange={set('autoReserveTargetAccountId')}
              >
                <option value="">{t('accounts.modal.autoReserveTargetPlaceholder')}</option>
                {targetOptions.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
          </>
        )}
        </>
        )}
      </form>
    </Modal>
  );
}

function AccountsTab() {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ item?: Account } | null>(null);
  const { confirm } = useDialog();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: AccountsService.findAll,
  });
  const { data: accountTypes = [] } = useQuery({
    queryKey: ['accountTypes'],
    queryFn: AccountTypesService.findAll,
    staleTime: 30_000,
  });
  const accountTypeMap = new Map(accountTypes.map((at) => [at.id, at.name]));
  // Reserva automática só faz sentido com 2+ contas (U16).
  const showReserveColumn = accounts.filter((a) => a.active).length > 1 || accounts.some((a) => a.autoReserveEnabled);

  // Saldo inicial e reserva automática da conta são insumos do fluxo de caixa
  // e do dashboard — sem isso os números de outros meses só se corrigiam no F5.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['accounts'] });
    invalidateDerivedData(qc);
  };

  const createMut = useMutation({
    mutationFn: AccountsService.create,
    onSuccess: () => { invalidate(); setModal(null); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateAccountPayload> }) =>
      AccountsService.update(id, data),
    onSuccess: () => { invalidate(); setModal(null); },
  });
  const deleteMut = useMutation({
    mutationFn: AccountsService.remove,
    onSuccess: invalidate,
  });

  function save(payload: CreateAccountPayload) {
    if (modal?.item) updateMut.mutate({ id: modal.item.id, data: payload });
    else createMut.mutate(payload);
  }

  async function handleDeactivate(a: Account) {
    if (await confirm(t('accounts.deactivateConfirm'))) deleteMut.mutate(a.id);
  }

  const pendingDeactivateId = deleteMut.isPending ? (deleteMut.variables as string) : null;

  if (isLoading) return <PageLoading />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<Plus size={14} />} onClick={() => setModal({})}>
          {t('accounts.newButton')}
        </Button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {accounts.length === 0 ? (
          <EmptyState title={t('accounts.emptyState')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-3 sm:px-5 py-3 font-medium">{t('accounts.tableName')}</th>
                  <th className="hidden sm:table-cell text-left px-3 py-3 font-medium">{t('accounts.tableType')}</th>
                  {showReserveColumn && <th className="hidden md:table-cell text-left px-3 py-3 font-medium">{t('accounts.tableAutoReserve')}</th>}
                  <th className="text-right px-2 sm:px-3 py-3 font-medium">{t('accounts.tableInitialBalance')}</th>
                  <th className="hidden sm:table-cell text-left px-3 py-3 font-medium">{t('accounts.tableStatus')}</th>
                  <th className="px-1 sm:px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {accounts.map((a) => (
                  <tr
                    key={a.id}
                    className={`hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group cursor-pointer ${!a.active ? 'opacity-50' : ''}`}
                    onClick={() => setModal({ item: a })}
                  >
                    <td className="px-3 sm:px-5 py-3 font-medium text-gray-800 dark:text-gray-100 max-w-[120px] sm:max-w-none truncate">{a.name}</td>
                    <td className="hidden sm:table-cell px-3 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {a.accountTypeId ? accountTypeMap.get(a.accountTypeId) ?? '—' : '—'}
                    </td>
                    {showReserveColumn && <td className="hidden md:table-cell px-3 py-3 text-xs">
                      {a.autoReserveEnabled ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                          {a.autoReservePercentage}%
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">—</span>
                      )}
                    </td>}
                    <td className="px-2 sm:px-3 py-3 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {formatCurrency(a.initialBalance)}
                    </td>
                    <td className="hidden sm:table-cell px-3 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          a.active
                            ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {a.active ? t('status.active') : t('status.inactive')}
                      </span>
                    </td>
                    <td className="px-1 sm:px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <IconActionButton
                          title={t('actions.edit')}
                          onClick={() => setModal({ item: a })}
                          disabled={pendingDeactivateId === a.id}
                          className="text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <Pencil size={14} />
                        </IconActionButton>
                        {a.active && (
                          <IconActionButton
                            title={t('actions.deactivate')}
                            onClick={() => handleDeactivate(a)}
                            loading={pendingDeactivateId === a.id}
                            className="text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                          >
                            <Trash2 size={14} />
                          </IconActionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <details className="group bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <summary className="cursor-pointer select-none list-none flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <span className="transition-transform group-open:rotate-90">›</span>
          {t('accountTypes.sectionTitle', { count: accountTypes.filter((at) => at.active).length })}
          <span className="font-normal text-xs text-gray-400 dark:text-gray-500">{t('accountTypes.sectionHint')}</span>
        </summary>
        <div className="px-5 pb-5">
          <AccountTypesTab />
        </div>
      </details>

      <AccountModal
        open={modal !== null}
        onClose={() => setModal(null)}
        item={modal?.item}
        accounts={accounts}
        accountTypes={accountTypes}
        onSave={save}
        onDelete={modal?.item?.active ? () => handleDeactivate(modal.item!) : undefined}
        isSaving={createMut.isPending || updateMut.isPending}
      />
    </div>
  );
}

// ── Account Types Tab ─────────────────────────────────────────────────────────

interface AccountTypeFormState {
  name: string;
}

function AccountTypeModal({
  open,
  onClose,
  item,
  onSave,
  onDelete,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  item?: AccountTypeItem;
  onSave: (data: CreateAccountTypePayload) => void;
  onDelete?: () => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation('settings');
  const init = (): AccountTypeFormState => ({ name: item?.name ?? '' });

  const [form, setForm] = useState<AccountTypeFormState>(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const { alert } = useDialog();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const missing = getMissingFields([{ label: t('validation.nameLabel'), valid: !!form.name }]);
    if (missing.length > 0) { await alert(missingFieldsMessage(missing)); return; }
    onSave({ name: form.name });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? t('accountTypes.modal.editTitle') : t('accountTypes.modal.newTitle')}
      size="sm"
      footer={
        <>
          {item && onDelete && (
            <IconActionButton
              title={t('actions.remove')}
              onClick={() => { onClose(); onDelete(); }}
              className="md:hidden mr-auto p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 !rounded-lg"
            >
              <Trash2 size={16} />
            </IconActionButton>
          )}
          <Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button loading={isSaving} onClick={handleSubmit as never}>{t('actions.save')}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('accountTypes.modal.nameLabel')}>
          <input
            className={INPUT}
            value={form.name}
            onChange={(e) => setForm({ name: e.target.value })}
            required
          />
        </Field>
      </form>
    </Modal>
  );
}

function AccountTypesTab() {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ item?: AccountTypeItem } | null>(null);
  const { confirm } = useDialog();

  const { data: accountTypes = [], isLoading } = useQuery({
    queryKey: ['accountTypes'],
    queryFn: AccountTypesService.findAll,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['accountTypes'] });

  const createMut = useMutation({
    mutationFn: AccountTypesService.create,
    onSuccess: () => { invalidate(); setModal(null); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateAccountTypePayload> }) =>
      AccountTypesService.update(id, data),
    onSuccess: () => { invalidate(); setModal(null); },
  });
  const deleteMut = useMutation({
    mutationFn: AccountTypesService.remove,
    onSuccess: invalidate,
  });

  function save(payload: CreateAccountTypePayload) {
    if (modal?.item) updateMut.mutate({ id: modal.item.id, data: payload });
    else createMut.mutate(payload);
  }

  async function handleRemove(at: AccountTypeItem) {
    if (await confirm(t('accountTypes.removeConfirm'))) deleteMut.mutate(at.id);
  }

  const pendingRemoveId = deleteMut.isPending ? (deleteMut.variables as string) : null;

  if (isLoading) return <PageLoading />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<Plus size={14} />} onClick={() => setModal({})}>
          {t('accountTypes.newButton')}
        </Button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {accountTypes.length === 0 ? (
          <EmptyState title={t('accountTypes.emptyState')} description={t('accountTypes.emptyStateDescription')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {accountTypes.map((at) => (
                  <tr
                    key={at.id}
                    className={`hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group cursor-pointer ${!at.active ? 'opacity-50' : ''}`}
                    onClick={() => setModal({ item: at })}
                  >
                    <td className="px-3 sm:px-5 py-2.5 font-medium text-gray-800 dark:text-gray-100">{at.name}</td>
                    <td className="px-1 sm:px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <IconActionButton
                          title={t('actions.edit')}
                          onClick={() => setModal({ item: at })}
                          disabled={pendingRemoveId === at.id}
                          className="text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <Pencil size={14} />
                        </IconActionButton>
                        <IconActionButton
                          title={t('actions.remove')}
                          onClick={() => handleRemove(at)}
                          loading={pendingRemoveId === at.id}
                          className="text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                        >
                          <Trash2 size={14} />
                        </IconActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AccountTypeModal
        open={modal !== null}
        onClose={() => setModal(null)}
        item={modal?.item}
        onSave={save}
        onDelete={modal?.item ? () => handleRemove(modal.item!) : undefined}
        isSaving={createMut.isPending || updateMut.isPending}
      />
    </div>
  );
}

// ── Categories Tab ────────────────────────────────────────────────────────────

interface CategoryFormState {
  name: string;
  type: Category['type'];
}

function CategoryModal({
  open,
  onClose,
  item,
  defaultType,
  onSave,
  onDelete,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  item?: Category;
  defaultType?: Category['type'];
  onSave: (data: CreateCategoryPayload) => void;
  onDelete?: () => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation('settings');
  const init = (): CategoryFormState => ({
    name: item?.name ?? '',
    type: item?.type ?? defaultType ?? 'EXPENSE',
  });

  const [form, setForm] = useState<CategoryFormState>(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const { alert } = useDialog();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const missing = getMissingFields([{ label: t('validation.nameLabel'), valid: !!form.name }]);
    if (missing.length > 0) { await alert(missingFieldsMessage(missing)); return; }
    onSave({ name: form.name, type: form.type });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? t('categories.modal.editTitle') : t('categories.modal.newTitle')}
      size="sm"
      footer={
        <>
          {item && onDelete && (
            <button
              type="button"
              title={t('actions.deactivate')}
              aria-label={t('actions.deactivate')}
              onClick={() => { onClose(); onDelete(); }}
              className="md:hidden mr-auto p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
            >
              <Trash2 size={16} />
            </button>
          )}
          <Button variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button loading={isSaving} onClick={handleSubmit as never}>{t('actions.save')}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('categories.modal.nameLabel')}>
          <input
            className={INPUT}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </Field>
        <Field label={t('categories.modal.typeLabel')}>
          <select
            className={INPUT}
            value={form.type}
            onChange={(e) =>
              setForm((f) => ({ ...f, type: e.target.value as Category['type'] }))
            }
          >
            <option value="INCOME">{t('categories.modal.typeIncome')}</option>
            <option value="EXPENSE">{t('categories.modal.typeExpense')}</option>
          </select>
        </Field>
      </form>
    </Modal>
  );
}

function CategorySection({
  type,
  categories,
  onAdd,
  onEdit,
  onDelete,
  pendingDeactivateId,
}: {
  type: Category['type'];
  categories: Category[];
  onAdd: (type: Category['type']) => void;
  onEdit: (item: Category) => void;
  onDelete: (item: Category) => void;
  pendingDeactivateId?: string | null;
}) {
  const { t } = useTranslation('settings');
  const items = categories.filter((c) => c.type === type);
  const label = type === 'INCOME' ? t('categories.income') : t('categories.expense');
  const color = type === 'INCOME'
    ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30'
    : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
            {label}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">({items.length})</span>
        </div>
        <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => onAdd(type)}>
          {t('categories.newButton')}
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState title={t('categories.emptyState', { type: label.toLowerCase() })} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {items.map((c) => (
                <tr
                  key={c.id}
                  className={`hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group cursor-pointer ${!c.active ? 'opacity-50' : ''}`}
                  onClick={() => onEdit(c)}
                >
                  <td className="px-3 sm:px-5 py-2.5 font-medium text-gray-800 dark:text-gray-100">
                    {c.name}
                  </td>
                  <td className="px-2 sm:px-3 py-2.5">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.active
                          ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {c.active ? t('status.active') : t('status.inactive')}
                    </span>
                  </td>
                  <td className="px-1 sm:px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <IconActionButton
                        title={t('actions.edit')}
                        onClick={() => onEdit(c)}
                        disabled={pendingDeactivateId === c.id}
                        className="text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <Pencil size={14} />
                      </IconActionButton>
                      {c.active && (
                        <IconActionButton
                          title={t('actions.deactivate')}
                          onClick={() => onDelete(c)}
                          loading={pendingDeactivateId === c.id}
                          className="text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                        >
                          <Trash2 size={14} />
                        </IconActionButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CategoriesTab() {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ item?: Category; defaultType?: Category['type'] } | null>(null);
  const { confirm } = useDialog();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: CategoriesService.findAll,
  });

  // O dashboard agrupa por categoria no backend e o fluxo de caixa exibe o
  // nome resolvido — renomear/inativar precisa repropagar para as duas.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['categories'] });
    invalidateDerivedData(qc);
  };

  const createMut = useMutation({
    mutationFn: CategoriesService.create,
    onSuccess: () => { invalidate(); setModal(null); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateCategoryPayload> }) =>
      CategoriesService.update(id, data),
    onSuccess: () => { invalidate(); setModal(null); },
  });
  const deleteMut = useMutation({
    mutationFn: CategoriesService.remove,
    onSuccess: invalidate,
  });

  function save(payload: CreateCategoryPayload) {
    if (modal?.item) updateMut.mutate({ id: modal.item.id, data: payload });
    else createMut.mutate(payload);
  }

  async function handleDeactivate(c: Category) {
    if (await confirm(t('categories.deactivateConfirm'))) deleteMut.mutate(c.id);
  }

  const pendingDeactivateId = deleteMut.isPending ? (deleteMut.variables as string) : null;

  if (isLoading) return <PageLoading />;

  return (
    <div className="space-y-4">
      <CategorySection
        type="INCOME"
        categories={categories}
        onAdd={(type) => setModal({ defaultType: type })}
        onEdit={(item) => setModal({ item })}
        onDelete={handleDeactivate}
        pendingDeactivateId={pendingDeactivateId}
      />
      <CategorySection
        type="EXPENSE"
        categories={categories}
        onAdd={(type) => setModal({ defaultType: type })}
        onEdit={(item) => setModal({ item })}
        onDelete={handleDeactivate}
        pendingDeactivateId={pendingDeactivateId}
      />

      <CategoryModal
        open={modal !== null}
        onClose={() => setModal(null)}
        item={modal?.item}
        defaultType={modal?.defaultType}
        onSave={save}
        onDelete={modal?.item?.active ? () => handleDeactivate(modal.item!) : undefined}
        isSaving={createMut.isPending || updateMut.isPending}
      />
    </div>
  );
}

// ── Credit Cards Tab ──────────────────────────────────────────────────────────

function CardsTab({ accounts }: { accounts: Account[] }) {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ item?: CreditCard } | null>(null);
  const { confirm } = useDialog();

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['creditCards'],
    queryFn: () => CreditCardsService.findAll(),
  });

  // Cartão alimenta as faturas do fluxo de caixa e o total de cartão do
  // dashboard; `invalidateDerivedData` já cobre o prefixo `['creditCards']`.
  const invalidate = () => invalidateDerivedData(qc);

  const createMut = useMutation({
    mutationFn: CreditCardsService.create,
    onSuccess: () => { invalidate(); setModal(null); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateCreditCardPayload> }) =>
      CreditCardsService.update(id, data),
    onSuccess: () => { invalidate(); setModal(null); },
  });
  const deleteMut = useMutation({
    mutationFn: CreditCardsService.remove,
    onSuccess: invalidate,
  });

  function save(payload: CreateCreditCardPayload) {
    if (modal?.item) updateMut.mutate({ id: modal.item.id, data: payload });
    else createMut.mutate(payload);
  }

  async function handleDeactivate(card: CreditCard) {
    if (await confirm(t('cards.deactivateConfirm'))) deleteMut.mutate(card.id);
  }

  const pendingDeactivateId = deleteMut.isPending ? (deleteMut.variables as string) : null;

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  if (isLoading) return <PageLoading />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<Plus size={14} />} onClick={() => setModal({})}>
          {t('cards.newButton')}
        </Button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {cards.length === 0 ? (
          <EmptyState title={t('cards.emptyState')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-3 sm:px-5 py-3 font-medium">{t('cards.tableName')}</th>
                  <th className="hidden md:table-cell text-left px-3 py-3 font-medium">{t('cards.tableBank')}</th>
                  <th className="hidden lg:table-cell text-center px-3 py-3 font-medium">{t('cards.tableClosingDay')}</th>
                  <th className="hidden lg:table-cell text-center px-3 py-3 font-medium">{t('cards.tableDueDay')}</th>
                  <th className="text-right px-2 sm:px-3 py-3 font-medium">{t('cards.tableLimit')}</th>
                  <th className="hidden lg:table-cell text-left px-3 py-3 font-medium">{t('cards.tableDefaultAccount')}</th>
                  <th className="hidden sm:table-cell text-left px-3 py-3 font-medium">{t('cards.tableStatus')}</th>
                  <th className="px-1 sm:px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {cards.map((card) => (
                  <tr
                    key={card.id}
                    className={`hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group cursor-pointer ${!card.active ? 'opacity-50' : ''}`}
                    onClick={() => setModal({ item: card })}
                  >
                    <td className="px-3 sm:px-5 py-3 font-medium text-gray-800 dark:text-gray-100 max-w-[100px] sm:max-w-none truncate">{card.name}</td>
                    <td className="hidden md:table-cell px-3 py-3 text-gray-500 dark:text-gray-400">{card.bank}</td>
                    <td className="hidden lg:table-cell px-3 py-3 text-center text-gray-500 dark:text-gray-400">
                      {t('cards.dayPrefix', { day: card.closingDay })}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-3 text-center text-gray-500 dark:text-gray-400">
                      {t('cards.dayPrefix', { day: card.dueDay })}
                    </td>
                    <td className="px-2 sm:px-3 py-3 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {formatCurrency(card.limit)}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {card.defaultPaymentAccountId
                        ? (accountMap.get(card.defaultPaymentAccountId) ?? '—')
                        : '—'}
                    </td>
                    <td className="hidden sm:table-cell px-3 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          card.active
                            ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {card.active ? t('status.activeMasc') : t('status.inactiveMasc')}
                      </span>
                    </td>
                    <td className="px-1 sm:px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <IconActionButton
                          title={t('actions.edit')}
                          onClick={() => setModal({ item: card })}
                          disabled={pendingDeactivateId === card.id}
                          className="text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <Pencil size={14} />
                        </IconActionButton>
                        {card.active && (
                          <IconActionButton
                            title={t('actions.deactivate')}
                            onClick={() => handleDeactivate(card)}
                            loading={pendingDeactivateId === card.id}
                            className="text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                          >
                            <Trash2 size={14} />
                          </IconActionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CardSettingsModal
        open={modal !== null}
        onClose={() => setModal(null)}
        item={modal?.item}
        accounts={accounts}
        onSave={save}
        onDelete={modal?.item?.active ? () => handleDeactivate(modal.item!) : undefined}
        isSaving={createMut.isPending || updateMut.isPending}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { t } = useTranslation('settings');
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: SettingsTab = isSettingsTab(tabParam) ? tabParam : DEFAULT_TAB;
  const setTab = (next: SettingsTab) => setParams({ tab: next }, { replace: true });

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: AccountsService.findAll,
    staleTime: 30_000,
  });

  if (loadingAccounts) return <PageLoading />;

  return (
    <div className="space-y-5">
      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto overflow-y-hidden">
        {TAB_ORDER.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              tab === tb
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t(`tabs.${tb}`)}
          </button>
        ))}
      </div>

      {tab === 'accounts' && <AccountsTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'cards' && <CardsTab accounts={accounts} />}
      {tab === 'preferences' && <PreferencesTab />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}
