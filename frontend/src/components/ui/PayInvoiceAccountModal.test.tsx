import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';
import { PayInvoiceAccountModal } from './PayInvoiceAccountModal';

const acc = (id: string, name: string) => ({ id, name, active: true }) as never;

describe('PayInvoiceAccountModal', () => {
  it('com uma conta só, não pergunta — só informa', () => {
    render(<PayInvoiceAccountModal open onClose={() => {}} accounts={[acc('a', 'Nubank Conta')]} onConfirm={vi.fn()} isPaying={false} />);
    expect(screen.getByText('A fatura será paga pela conta Nubank Conta.')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('com várias, sugere a conta indicada', () => {
    render(
      <PayInvoiceAccountModal open onClose={() => {}} accounts={[acc('a', 'A'), acc('b', 'B')]} onConfirm={vi.fn()} isPaying={false} defaultAccountId="b" />,
    );
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('b');
  });
});
