import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftRight,
  ChevronRight,
  CreditCard,
  Lock,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { IconActionButton } from '../../../components/ui/IconActionButton';
import { PaidToggle } from '../../../components/ui/PaidToggle';
import { formatCurrency } from '../../../utils/money';
import { formatDate } from '../../../utils/date';
import { MovementGroups, MovementItem } from '../movements';
import { formatRateBps } from '../../../utils/invoice-tax';

export type NewMovementKind = 'income' | 'payment' | 'extra' | 'transfer';
export type RowBusy = 'toggle' | 'delete' | null;

const CARD = 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700';

function Badge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray' | 'teal' | 'orange' | 'purple' | 'amber' }) {
  const TONES = {
    amber: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    gray: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
    teal: 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400',
    orange: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
    purple: 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

function KindIcon({ item }: { item: MovementItem }) {
  if (item.kind === 'transfer') return <ArrowLeftRight size={15} className="text-gray-400 dark:text-gray-500" />;
  if (item.kind === 'invoice') return <CreditCard size={15} className="text-purple-500" />;
  if (item.direction === 'in') return <TrendingUp size={15} className="text-green-500" />;
  return <TrendingDown size={15} className={item.kind === 'extra' ? 'text-orange-500' : 'text-red-500'} />;
}

function MovementRow({
  item,
  overdue,
  categoryName,
  accountName,
  busy,
  locked,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: MovementItem;
  overdue: boolean;
  categoryName: string | null;
  accountName: string | null;
  busy: RowBusy;
  locked: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('cashFlow');
  const rowLocked = locked || busy !== null;
  const isTransfer = item.kind === 'transfer';
  const isInvoice = item.kind === 'invoice';

  const toggleTitles = isTransfer
    ? { paid: t('transferGrid.revert'), unpaid: t('transferGrid.settle') }
    : isInvoice
    ? { paid: t('grid.toggle.revertPaid'), unpaid: overdue ? t('creditCardsGrid.toggle.payOverdue') : t('creditCardsGrid.toggle.pay') }
    : item.direction === 'in'
    ? { paid: t('entriesGrid.toggle.revertReceived'), unpaid: t('entriesGrid.toggle.markReceived') }
    : { paid: t('grid.toggle.revertPaid'), unpaid: t('transactionGrid.toggle.markPaid') };

  const amountColor = isTransfer
    ? 'text-gray-600 dark:text-gray-300'
    : item.direction === 'in'
    ? 'text-green-700 dark:text-green-400'
    : isInvoice
    ? 'text-purple-700 dark:text-purple-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <li
      className={`group flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 hover:bg-gray-50/60 dark:hover:bg-gray-700/40 ${
        rowLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
      }`}
      onClick={() => { if (!rowLocked) onEdit(); }}
    >
      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
        <PaidToggle
          paid={item.settled}
          urgent={overdue}
          loading={busy === 'toggle'}
          disabled={locked || busy === 'delete'}
          onToggle={onToggle}
          paidTitle={toggleTitles.paid}
          unpaidTitle={toggleTitles.unpaid}
        />
      </div>
      <div className="shrink-0"><KindIcon item={item} /></div>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${item.settled ? 'text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-gray-100'}`}>
          {isInvoice ? t('movements.invoiceOf', { card: item.description }) : item.description}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-xs text-gray-400 dark:text-gray-500">
          <span className={overdue ? 'text-red-600 dark:text-red-400 font-medium' : ''}>{formatDate(item.date)}</span>
          {accountName && <Badge tone="gray">{accountName}</Badge>}
          {categoryName && <span className="truncate max-w-[10rem]">{categoryName}</span>}
          {item.isFixed && (
            <Badge><Repeat size={10} />{t('movements.badges.fixed')}</Badge>
          )}
          {item.kind === 'extra' && <Badge tone="orange">{t('movements.badges.extra')}</Badge>}
          {isInvoice && <Badge tone="purple">{t('movements.badges.card')}</Badge>}
          {isTransfer && (
            <Badge>
              {item.direction === 'in'
                ? t('transferGrid.fromLabel', { account: item.counterpartAccountName })
                : t('transferGrid.toLabel', { account: item.counterpartAccountName })}
            </Badge>
          )}
          {item.isAutoReserve && <Badge tone="teal">{t('transferGrid.autoReserveBadge')}</Badge>}
          {item.taxRateBps != null && (
            <Badge tone="amber">
              {item.locked && <Lock size={10} aria-label={t('movements.badges.invoiceLocked')} />}
              {t('movements.badges.invoice', { rate: formatRateBps(item.taxRateBps) })}
            </Badge>
          )}
          {item.invoiceTaxCount != null && (
            <Badge tone="amber">
              <Lock size={10} aria-hidden />
              {t('movements.badges.invoiceTax', { count: item.invoiceTaxCount })}
            </Badge>
          )}
        </div>
      </div>

      <span className={`shrink-0 text-sm font-semibold whitespace-nowrap ${amountColor}`}>
        {item.direction === 'in' ? '+' : '−'} {formatCurrency(item.amount)}
      </span>

      <div
        onClick={(e) => e.stopPropagation()}
        className={`hidden md:flex items-center gap-0.5 shrink-0 w-16 justify-end transition-opacity ${
          rowLocked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <IconActionButton
          title={isInvoice ? t('creditCardsGrid.actions.openInvoice') : t('grid.actions.edit')}
          onClick={onEdit}
          disabled={rowLocked}
          className="text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <Pencil size={14} />
        </IconActionButton>
        {!isInvoice && !item.locked && (
          <IconActionButton
            title={t('grid.actions.delete')}
            onClick={onDelete}
            loading={busy === 'delete'}
            disabled={locked || busy === 'toggle'}
            className="text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
          >
            <Trash2 size={14} />
          </IconActionButton>
        )}
      </div>
    </li>
  );
}

function NewMenu({ onNew, canTransfer, disabled }: { onNew: (kind: NewMovementKind) => void; canTransfer: boolean; disabled: boolean }) {
  const { t } = useTranslation('cashFlow');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const options: NewMovementKind[] = ['income', 'payment', 'extra', ...(canTransfer ? (['transfer'] as const) : [])];

  return (
    <div className="relative" ref={ref}>
      <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setOpen((o) => !o)} disabled={disabled}>
        {t('movements.new')}
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-1">
          {options.map((kind) => (
            <button
              key={kind}
              role="menuitem"
              onClick={() => { setOpen(false); onNew(kind); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md"
            >
              {t(`movements.newOptions.${kind}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  items,
  overdue = false,
  collapsible = false,
  expanded = true,
  onToggleExpanded,
  render,
}: {
  title: string;
  items: MovementItem[];
  overdue?: boolean;
  collapsible?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  render: (item: MovementItem) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  const heading = (
    <>
      {collapsible && (
        <ChevronRight size={14} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
      )}
      <span>{title}</span>
      <span className="font-normal text-gray-400 dark:text-gray-500">({items.length})</span>
    </>
  );
  const headingClass = `flex items-center gap-1.5 px-3 sm:px-5 py-2 text-xs font-semibold uppercase tracking-wider ${
    overdue ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
  }`;
  return (
    <div>
      {collapsible ? (
        <button onClick={onToggleExpanded} aria-expanded={expanded} className={`${headingClass} w-full hover:text-gray-800 dark:hover:text-gray-200`}>
          {heading}
        </button>
      ) : (
        <h3 className={headingClass}>{heading}</h3>
      )}
      {expanded && <ul className="divide-y divide-gray-50 dark:divide-gray-700/60">{items.map(render)}</ul>}
    </div>
  );
}

export function MovementsList({
  groups,
  categoryNames,
  rowBusy,
  locked,
  doneExpanded,
  onToggleDone,
  canTransfer,
  onNew,
  onToggle,
  onEdit,
  onDelete,
  emptyMessage,
  accountNames,
}: {
  groups: MovementGroups;
  categoryNames: Map<string, string>;
  rowBusy: (item: MovementItem) => RowBusy;
  locked: boolean;
  doneExpanded: boolean;
  onToggleDone: () => void;
  canTransfer: boolean;
  onNew: (kind: NewMovementKind) => void;
  onToggle: (item: MovementItem) => void;
  onEdit: (item: MovementItem) => void;
  onDelete: (item: MovementItem) => void;
  // Mensagem quando a lista está vazia por causa da busca/filtro.
  emptyMessage?: string;
  // Só na visão "Todas as contas": mostra a conta de cada lançamento.
  accountNames?: Map<string, string>;
}) {
  const { t } = useTranslation('cashFlow');
  const total = groups.overdue.length + groups.upcoming.length + groups.done.length;

  const row = (overdue: boolean) => (item: MovementItem) => (
    <MovementRow
      key={item.key}
      item={item}
      overdue={overdue}
      categoryName={item.categoryId ? categoryNames.get(item.categoryId) ?? null : null}
      accountName={accountNames && item.accountId ? accountNames.get(item.accountId) ?? null : null}
      busy={rowBusy(item)}
      locked={locked}
      onToggle={() => onToggle(item)}
      onEdit={() => onEdit(item)}
      onDelete={() => onDelete(item)}
    />
  );

  return (
    <section className={CARD}>
      <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {t('movements.title')} <span className="font-normal text-gray-400 dark:text-gray-500">({total})</span>
        </h2>
        <NewMenu onNew={onNew} canTransfer={canTransfer} disabled={locked} />
      </div>

      {total === 0 ? (
        <EmptyState title={emptyMessage ?? t('movements.empty')} />
      ) : (
        <div className="py-1">
          <Group title={t('movements.groups.overdue')} items={groups.overdue} overdue render={row(true)} />
          <Group title={t('movements.groups.upcoming')} items={groups.upcoming} render={row(false)} />
          <Group
            title={t('movements.groups.done')}
            items={groups.done}
            collapsible
            expanded={doneExpanded}
            onToggleExpanded={onToggleDone}
            render={row(false)}
          />
        </div>
      )}
    </section>
  );
}
