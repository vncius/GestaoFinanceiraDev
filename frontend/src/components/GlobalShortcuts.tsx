import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMonth } from '../contexts/MonthContext';
import { useQuickAdd } from '../contexts/QuickAddContext';
import { useGlobalShortcuts } from '../hooks/useGlobalShortcuts';
import { Modal } from './ui/Modal';

// Registra os atalhos globais e renderiza o painel de ajuda (?). Montado
// uma única vez em App.tsx, dentro de MonthProvider e QuickAddProvider.
export function GlobalShortcuts() {
  const { t } = useTranslation('common');
  const { prevMonth, nextMonth } = useMonth();
  const { openQuickAdd } = useQuickAdd();
  const [helpOpen, setHelpOpen] = useState(false);

  const SHORTCUTS = [
    { keys: 'Alt + ←  /  Alt + →', description: t('shortcuts.prevNextMonth') },
    { keys: 'N', description: t('shortcuts.newEntry') },
    { keys: '?', description: t('shortcuts.showHelp') },
    { keys: 'Esc', description: t('shortcuts.closeModal') },
  ];

  useGlobalShortcuts({
    onPrevMonth: prevMonth,
    onNextMonth: nextMonth,
    onQuickAdd: openQuickAdd,
    onToggleHelp: () => setHelpOpen((o) => !o),
  });

  return (
    <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('shortcuts.title')} size="sm">
      <ul className="space-y-2">
        {SHORTCUTS.map((s) => (
          <li key={s.keys} className="flex items-center justify-between gap-4 text-sm">
            <span className="text-gray-600 dark:text-gray-300">{s.description}</span>
            <kbd className="shrink-0 px-2 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">
              {s.keys}
            </kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
