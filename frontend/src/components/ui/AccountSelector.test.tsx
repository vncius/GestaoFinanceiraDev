import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import { AccountSelector } from './AccountSelector';
import { useAccount } from '../../contexts/AccountContext';

vi.mock('../../contexts/AccountContext', () => ({ useAccount: vi.fn() }));

const setAccountId = vi.fn();
const setViewAll = vi.fn();
const account = (id: string, name: string) => ({ id, name }) as never;

function mockAccount(overrides: Record<string, unknown> = {}) {
  vi.mocked(useAccount).mockReturnValue({
    accountId: 'pj',
    setAccountId,
    viewAll: true,
    setViewAll,
    scopeAccountId: null,
    accounts: [account('pj', 'PJ'), account('pf', 'PF')],
    activeAccount: null,
    ...overrides,
  });
}

describe('AccountSelector', () => {
  beforeEach(() => {
    setAccountId.mockReset();
    setViewAll.mockReset();
  });

  it('com uma conta só, não aparece', () => {
    mockAccount({ accounts: [account('pj', 'PJ')] });
    const { container } = render(<AccountSelector allowAll />);
    expect(container.innerHTML).toBe('');
  });

  it('com allowAll, oferece "Todas as contas" e mostra-a selecionada', () => {
    mockAccount();
    render(<AccountSelector allowAll />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(screen.getByText('Todas as contas')).toBeTruthy();
    expect(select.value).toBe('__ALL__');
  });

  it('sem allowAll, não oferece "Todas" e mostra a última conta específica', () => {
    mockAccount();
    render(<AccountSelector />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(screen.queryByText('Todas as contas')).toBeNull();
    expect(select.value).toBe('pj');
  });

  it('escolher uma conta com allowAll sai do consolidado', () => {
    mockAccount();
    render(<AccountSelector allowAll />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'pf' } });
    expect(setViewAll).toHaveBeenCalledWith(false);
    expect(setAccountId).toHaveBeenCalledWith('pf');
  });

  it('escolher "Todas" mantém a última conta específica', () => {
    mockAccount({ viewAll: false, scopeAccountId: 'pj' });
    render(<AccountSelector allowAll />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__ALL__' } });
    expect(setViewAll).toHaveBeenCalledWith(true);
    expect(setAccountId).not.toHaveBeenCalled();
  });
});
