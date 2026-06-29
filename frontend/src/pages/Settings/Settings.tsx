import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Plus, Check } from 'lucide-react';
import { SettingsService } from '../../services/settings.service';
import { AccountsService, CreateAccountPayload } from '../../services/accounts.service';
import { CategoriesService, CreateCategoryPayload } from '../../services/categories.service';
import {
  CreditCardsService,
  CreateCreditCardPayload,
} from '../../services/credit-cards.service';
import { Account, Category, CreditCard, FinancialSettings } from '../../types';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageLoading } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatCurrency, centsToFloat, floatToCents } from '../../utils/money';

// ── Shared helpers ────────────────────────────────────────────────────────────

type SettingsTab = 'general' | 'accounts' | 'categories' | 'cards';

const TAB_LABELS: Record<SettingsTab, string> = {
  general: 'Geral',
  accounts: 'Contas',
  categories: 'Categorias',
  cards: 'Cartões',
};

const INPUT =
  'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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

// ── General Tab ───────────────────────────────────────────────────────────────

interface GeneralFormState {
  defaultReservePercentage: string;
  applyReserveByDefault: boolean;
  allowDisableReserve: boolean;
  mainAccountId: string;
  emergencyReserveAccountId: string;
  minimumMainBalance: string;
  annualRevenueLimit: string;
  controlStartMonth: string;
  controlStartYear: string;
}

function GeneralTab({
  settings,
  accounts,
}: {
  settings: FinancialSettings;
  accounts: Account[];
}) {
  const qc = useQueryClient();

  const initForm = (s: FinancialSettings): GeneralFormState => ({
    defaultReservePercentage: String(s.defaultReservePercentage),
    applyReserveByDefault: s.applyReserveByDefault,
    allowDisableReserve: s.allowDisableReserve,
    mainAccountId: s.mainAccountId ?? '',
    emergencyReserveAccountId: s.emergencyReserveAccountId ?? '',
    minimumMainBalance: String(centsToFloat(s.minimumMainBalance)),
    annualRevenueLimit: String(centsToFloat(s.annualRevenueLimit)),
    controlStartMonth: String(s.controlStartMonth),
    controlStartYear: String(s.controlStartYear),
  });

  const [form, setForm] = useState<GeneralFormState>(() => initForm(settings));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(initForm(settings));
  }, [settings.id]);

  const updateMut = useMutation({
    mutationFn: SettingsService.update,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const set =
    (k: keyof GeneralFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSave() {
    updateMut.mutate({
      defaultReservePercentage: parseFloat(form.defaultReservePercentage) || 0,
      applyReserveByDefault: form.applyReserveByDefault,
      allowDisableReserve: form.allowDisableReserve,
      mainAccountId: form.mainAccountId || null,
      emergencyReserveAccountId: form.emergencyReserveAccountId || null,
      minimumMainBalance: floatToCents(parseFloat(form.minimumMainBalance) || 0),
      annualRevenueLimit: floatToCents(parseFloat(form.annualRevenueLimit) || 0),
      controlStartMonth: parseInt(form.controlStartMonth) || 1,
      controlStartYear: parseInt(form.controlStartYear) || new Date().getFullYear(),
    });
  }

  const activeAccounts = accounts.filter((a) => a.active);

  return (
    <div className="space-y-5 max-w-2xl">
      <SectionCard title="Reserva de Lucro">
        <div className="space-y-4">
          <Field label="Percentual de reserva padrão (%)">
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              className={INPUT}
              value={form.defaultReservePercentage}
              onChange={set('defaultReservePercentage')}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.applyReserveByDefault}
              onChange={(e) =>
                setForm((f) => ({ ...f, applyReserveByDefault: e.target.checked }))
              }
              className="rounded"
            />
            Aplicar reserva por padrão em novos recebimentos
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.allowDisableReserve}
              onChange={(e) =>
                setForm((f) => ({ ...f, allowDisableReserve: e.target.checked }))
              }
              className="rounded"
            />
            Permitir desabilitar reserva por recebimento
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Contas Vinculadas">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Conta principal">
            <select className={INPUT} value={form.mainAccountId} onChange={set('mainAccountId')}>
              <option value="">Nenhuma</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Conta de reserva de emergência">
            <select
              className={INPUT}
              value={form.emergencyReserveAccountId}
              onChange={set('emergencyReserveAccountId')}
            >
              <option value="">Nenhuma</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Saldo mínimo da conta principal (R$)">
            <input
              type="number"
              min="0"
              step="0.01"
              className={INPUT}
              value={form.minimumMainBalance}
              onChange={set('minimumMainBalance')}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Limites e Período">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Limite anual de faturamento (R$)">
            <input
              type="number"
              min="0"
              step="0.01"
              className={INPUT}
              value={form.annualRevenueLimit}
              onChange={set('annualRevenueLimit')}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Mês início controle">
              <input
                type="number"
                min="1"
                max="12"
                className={INPUT}
                value={form.controlStartMonth}
                onChange={set('controlStartMonth')}
              />
            </Field>
            <Field label="Ano início">
              <input
                type="number"
                min="2000"
                max="2100"
                className={INPUT}
                value={form.controlStartYear}
                onChange={set('controlStartYear')}
              />
            </Field>
          </div>
        </div>
      </SectionCard>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={updateMut.isPending}>
          Salvar configurações
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400 font-medium">
            <Check size={14} /> Salvo!
          </span>
        )}
      </div>
    </div>
  );
}

// ── Accounts Tab ──────────────────────────────────────────────────────────────

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  MAIN: 'Conta Principal',
  EMERGENCY_RESERVE: 'Reserva de Emergência',
  INVESTMENT: 'Investimentos',
  OTHER: 'Outra',
};

interface AccountFormState {
  name: string;
  type: Account['type'];
  initialBalance: string;
}

function AccountModal({
  open,
  onClose,
  item,
  onSave,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  item?: Account;
  onSave: (data: CreateAccountPayload) => void;
  isSaving: boolean;
}) {
  const init = (): AccountFormState => ({
    name: item?.name ?? '',
    type: item?.type ?? 'OTHER',
    initialBalance: item ? String(centsToFloat(item.initialBalance)) : '0',
  });

  const [form, setForm] = useState<AccountFormState>(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const set =
    (k: keyof AccountFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    onSave({
      name: form.name,
      type: form.type,
      initialBalance: floatToCents(parseFloat(form.initialBalance) || 0),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Editar Conta' : 'Nova Conta'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={isSaving} onClick={handleSubmit as never}>Salvar</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nome *">
          <input className={INPUT} value={form.name} onChange={set('name')} required />
        </Field>
        <Field label="Tipo *">
          <select
            className={INPUT}
            value={form.type}
            onChange={(e) =>
              setForm((f) => ({ ...f, type: e.target.value as Account['type'] }))
            }
          >
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Saldo inicial (R$)">
          <input
            type="number"
            step="0.01"
            className={INPUT}
            value={form.initialBalance}
            onChange={set('initialBalance')}
          />
        </Field>
      </form>
    </Modal>
  );
}

function AccountsTab() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ item?: Account } | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: AccountsService.findAll,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['accounts'] });

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

  if (isLoading) return <PageLoading />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<Plus size={14} />} onClick={() => setModal({})}>
          Nova Conta
        </Button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {accounts.length === 0 ? (
          <EmptyState title="Nenhuma conta cadastrada" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-medium">Nome</th>
                <th className="text-left px-3 py-3 font-medium">Tipo</th>
                <th className="text-right px-3 py-3 font-medium">Saldo inicial</th>
                <th className="text-left px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {accounts.map((a) => (
                <tr key={a.id} className={`hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group ${!a.active ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3 font-medium text-gray-800 dark:text-gray-100">{a.name}</td>
                  <td className="px-3 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    {ACCOUNT_TYPE_LABELS[a.type] ?? a.type}
                  </td>
                  <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-300">
                    {formatCurrency(a.initialBalance)}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.active
                          ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {a.active ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        title="Editar"
                        onClick={() => setModal({ item: a })}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                      >
                        <Pencil size={14} />
                      </button>
                      {a.active && (
                        <button
                          title="Desativar"
                          onClick={() => {
                            if (window.confirm('Desativar esta conta?'))
                              deleteMut.mutate(a.id);
                          }}
                          className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AccountModal
        open={modal !== null}
        onClose={() => setModal(null)}
        item={modal?.item}
        onSave={save}
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
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  item?: Category;
  defaultType?: Category['type'];
  onSave: (data: CreateCategoryPayload) => void;
  isSaving: boolean;
}) {
  const init = (): CategoryFormState => ({
    name: item?.name ?? '',
    type: item?.type ?? defaultType ?? 'EXPENSE',
  });

  const [form, setForm] = useState<CategoryFormState>(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    onSave({ name: form.name, type: form.type });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Editar Categoria' : 'Nova Categoria'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={isSaving} onClick={handleSubmit as never}>Salvar</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nome *">
          <input
            className={INPUT}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </Field>
        <Field label="Tipo *">
          <select
            className={INPUT}
            value={form.type}
            onChange={(e) =>
              setForm((f) => ({ ...f, type: e.target.value as Category['type'] }))
            }
          >
            <option value="INCOME">Receita</option>
            <option value="EXPENSE">Despesa</option>
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
}: {
  type: Category['type'];
  categories: Category[];
  onAdd: (type: Category['type']) => void;
  onEdit: (item: Category) => void;
  onDelete: (id: string) => void;
}) {
  const items = categories.filter((c) => c.type === type);
  const label = type === 'INCOME' ? 'Receitas' : 'Despesas';
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
          Nova
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState title={`Nenhuma categoria de ${label.toLowerCase()} cadastrada`} />
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
            {items.map((c) => (
              <tr key={c.id} className={`hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group ${!c.active ? 'opacity-50' : ''}`}>
                <td className="px-5 py-2.5 font-medium text-gray-800 dark:text-gray-100">{c.name}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.active
                        ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {c.active ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                    <button
                      title="Editar"
                      onClick={() => onEdit(c)}
                      className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                    >
                      <Pencil size={14} />
                    </button>
                    {c.active && (
                      <button
                        title="Desativar"
                        onClick={() => {
                          if (window.confirm('Desativar esta categoria?')) onDelete(c.id);
                        }}
                        className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CategoriesTab() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ item?: Category; defaultType?: Category['type'] } | null>(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: CategoriesService.findAll,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['categories'] });

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

  if (isLoading) return <PageLoading />;

  return (
    <div className="space-y-4">
      <CategorySection
        type="INCOME"
        categories={categories}
        onAdd={(type) => setModal({ defaultType: type })}
        onEdit={(item) => setModal({ item })}
        onDelete={(id) => deleteMut.mutate(id)}
      />
      <CategorySection
        type="EXPENSE"
        categories={categories}
        onAdd={(type) => setModal({ defaultType: type })}
        onEdit={(item) => setModal({ item })}
        onDelete={(id) => deleteMut.mutate(id)}
      />

      <CategoryModal
        open={modal !== null}
        onClose={() => setModal(null)}
        item={modal?.item}
        defaultType={modal?.defaultType}
        onSave={save}
        isSaving={createMut.isPending || updateMut.isPending}
      />
    </div>
  );
}

// ── Credit Cards Tab ──────────────────────────────────────────────────────────

interface CardFormState {
  name: string;
  bank: string;
  closingDay: string;
  dueDay: string;
  limit: string;
  defaultPaymentAccountId: string;
}

function CardSettingsModal({
  open,
  onClose,
  item,
  accounts,
  onSave,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  item?: CreditCard;
  accounts: Account[];
  onSave: (data: CreateCreditCardPayload) => void;
  isSaving: boolean;
}) {
  const activeAccounts = accounts.filter((a) => a.active);

  const init = (): CardFormState => ({
    name: item?.name ?? '',
    bank: item?.bank ?? '',
    closingDay: item ? String(item.closingDay) : '10',
    dueDay: item ? String(item.dueDay) : '20',
    limit: item ? String(centsToFloat(item.limit)) : '',
    defaultPaymentAccountId: item?.defaultPaymentAccountId ?? '',
  });

  const [form, setForm] = useState<CardFormState>(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) { setForm(init()); setLastOpen(true); }
  if (!open && lastOpen) setLastOpen(false);

  const set =
    (k: keyof CardFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const limit = floatToCents(parseFloat(form.limit) || 0);
    if (!form.name || !form.bank || !limit) return;
    onSave({
      name: form.name,
      bank: form.bank,
      closingDay: parseInt(form.closingDay) || 10,
      dueDay: parseInt(form.dueDay) || 20,
      limit,
      defaultPaymentAccountId: form.defaultPaymentAccountId || null,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Editar Cartão' : 'Novo Cartão'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={isSaving} onClick={handleSubmit as never}>Salvar</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome *">
            <input className={INPUT} value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Banco *">
            <input className={INPUT} value={form.bank} onChange={set('bank')} required />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Dia fechamento">
            <input
              type="number"
              min="1"
              max="28"
              className={INPUT}
              value={form.closingDay}
              onChange={set('closingDay')}
            />
          </Field>
          <Field label="Dia vencimento">
            <input
              type="number"
              min="1"
              max="28"
              className={INPUT}
              value={form.dueDay}
              onChange={set('dueDay')}
            />
          </Field>
          <Field label="Limite (R$) *">
            <input
              type="number"
              min="0.01"
              step="0.01"
              className={INPUT}
              value={form.limit}
              onChange={set('limit')}
              required
            />
          </Field>
        </div>
        <Field label="Conta padrão de pagamento">
          <select
            className={INPUT}
            value={form.defaultPaymentAccountId}
            onChange={set('defaultPaymentAccountId')}
          >
            <option value="">Nenhuma</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  );
}

function CardsTab({ accounts }: { accounts: Account[] }) {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ item?: CreditCard } | null>(null);

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['creditCards'],
    queryFn: CreditCardsService.findAll,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['creditCards'] });

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

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  if (isLoading) return <PageLoading />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<Plus size={14} />} onClick={() => setModal({})}>
          Novo Cartão
        </Button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {cards.length === 0 ? (
          <EmptyState title="Nenhum cartão cadastrado" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-medium">Nome</th>
                <th className="text-left px-3 py-3 font-medium">Banco</th>
                <th className="text-center px-3 py-3 font-medium">Fechamento</th>
                <th className="text-center px-3 py-3 font-medium">Vencimento</th>
                <th className="text-right px-3 py-3 font-medium">Limite</th>
                <th className="text-left px-3 py-3 font-medium">Conta padrão</th>
                <th className="text-left px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {cards.map((card) => (
                <tr
                  key={card.id}
                  className={`hover:bg-gray-50/50 dark:hover:bg-gray-700/50 group ${!card.active ? 'opacity-50' : ''}`}
                >
                  <td className="px-5 py-3 font-medium text-gray-800 dark:text-gray-100">{card.name}</td>
                  <td className="px-3 py-3 text-gray-500 dark:text-gray-400">{card.bank}</td>
                  <td className="px-3 py-3 text-center text-gray-500 dark:text-gray-400">
                    Dia {card.closingDay}
                  </td>
                  <td className="px-3 py-3 text-center text-gray-500 dark:text-gray-400">
                    Dia {card.dueDay}
                  </td>
                  <td className="px-3 py-3 text-right text-gray-700 dark:text-gray-300">
                    {formatCurrency(card.limit)}
                  </td>
                  <td className="px-3 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    {card.defaultPaymentAccountId
                      ? (accountMap.get(card.defaultPaymentAccountId) ?? '—')
                      : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        card.active
                          ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {card.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        title="Editar"
                        onClick={() => setModal({ item: card })}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                      >
                        <Pencil size={14} />
                      </button>
                      {card.active && (
                        <button
                          title="Desativar"
                          onClick={() => {
                            if (window.confirm('Desativar este cartão?'))
                              deleteMut.mutate(card.id);
                          }}
                          className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CardSettingsModal
        open={modal !== null}
        onClose={() => setModal(null)}
        item={modal?.item}
        accounts={accounts}
        onSave={save}
        isSaving={createMut.isPending || updateMut.isPending}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const [tab, setTab] = useState<SettingsTab>('general');

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: SettingsService.get,
  });
  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: AccountsService.findAll,
    staleTime: 30_000,
  });

  if (loadingSettings || loadingAccounts) return <PageLoading />;
  if (!settings) return null;

  return (
    <div className="space-y-5">
      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {(Object.keys(TAB_LABELS) as SettingsTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralTab settings={settings} accounts={accounts} />}
      {tab === 'accounts' && <AccountsTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'cards' && <CardsTab accounts={accounts} />}
    </div>
  );
}
