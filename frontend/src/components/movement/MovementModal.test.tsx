import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';
import { MovementModal, MovementSubmit } from './MovementModal';
import { DialogProvider } from '../../contexts/DialogContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Category, FinancialTransaction } from '../../types';

const categories = [
  { id: 'mercado', name: 'Mercado', type: 'EXPENSE', active: true },
  { id: 'salario', name: 'Salário', type: 'INCOME', active: true },
] as Category[];
const accounts = [{ id: 'a1', name: 'Conta', active: true }] as never;

function renderForm(props: Partial<React.ComponentProps<typeof MovementModal>> = {}) {
  const onSubmit = vi.fn<(d: MovementSubmit) => void>();
  render(
    <QueryClientProvider client={new QueryClient()}>
    <DialogProvider>
      <MovementModal
        open
        onClose={() => {}}
        categories={categories}
        accounts={accounts}
        defaultAccountId="a1"
        month={10}
        year={2026}
        saving={false}
        onSubmit={onSubmit}
        {...props}
      />
    </DialogProvider>
    </QueryClientProvider>,
  );
  return { onSubmit };
}

function fill(description: string, amount: string) {
  fireEvent.change(screen.getByPlaceholderText(/Ex\.:/), { target: { value: description } });
  fireEvent.change(screen.getByPlaceholderText('R$ 0,00'), { target: { value: amount } });
}

describe('MovementModal', () => {
  it('cria uma saída comum (pagamento) com os campos essenciais', () => {
    const { onSubmit } = renderForm();
    fill('Feira', '4550');
    fireEvent.click(screen.getByText('Salvar'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'payment',
        settleNow: false,
        payload: expect.objectContaining({ description: 'Feira', amount: 4550, categoryId: 'mercado', recurrence: 'UNIQUE', sourceAccountId: 'a1' }),
      }),
    );
  });

  it('trocar para Entrada usa categorias de entrada e "Já recebi" pede efetivação', () => {
    const { onSubmit } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Entrada' }));
    fill('Salário', '500000');
    fireEvent.click(screen.getByLabelText('Já recebi'));
    fireEvent.click(screen.getByText('Salvar'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'income', settleNow: true, payload: expect.objectContaining({ categoryId: 'salario', targetAccountId: 'a1' }) }),
    );
  });

  it('"Mais opções" guarda fixo e fora do comum', () => {
    const { onSubmit } = renderForm();
    fill('Conserto', '30000');
    fireEvent.click(screen.getByText('Mais opções'));
    fireEvent.click(screen.getByLabelText('Repete todo mês'));
    fireEvent.click(screen.getByLabelText('Gasto fora do comum'));
    fireEvent.click(screen.getByText('Salvar'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'extra', payload: expect.objectContaining({ recurrence: 'FIXED' }) }),
    );
  });

  it('na edição, o tipo fica travado e há "Marcar como pago"', () => {
    const tx = {
      id: 't1', type: 'PAYMENT', description: 'Aluguel', categoryId: 'mercado', amount: 150000,
      expectedDate: '2026-10-05T12:00:00.000Z', status: 'PENDING', sourceAccountId: 'a1', targetAccountId: null,
      notes: null, recurrence: 'UNIQUE',
    } as FinancialTransaction;
    renderForm({ item: { kind: 'payment', tx }, onSettle: vi.fn() });
    expect(screen.getByText('Editar saída')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Entrada' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Marcar como pago')).toBeTruthy();
    expect(screen.queryByLabelText('Já paguei')).toBeNull();
  });
});

describe('MovementModal — nota fiscal (I7)', () => {
  const nfAccounts = [
    { id: 'a1', name: 'PJ', active: true, invoiceTaxEnabled: true, invoiceTaxDefaultRateBps: 600, invoiceTaxDueDay: 20 },
  ] as never;

  it('conta que emite NF: marcada, alíquota padrão, prévia e payload com alíquota e emissão', () => {
    const { onSubmit } = renderForm({ accounts: nfAccounts });
    fireEvent.click(screen.getByRole('button', { name: 'Entrada' }));
    fill('Cliente', '1000000');
    expect((screen.getByLabelText('Nota fiscal') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByPlaceholderText('6') as HTMLInputElement).value).toBe('6');
    expect(screen.getByText(/Imposto R\$\s600,00/)).toBeTruthy();
    fireEvent.click(screen.getByText('Salvar'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'income', payload: expect.objectContaining({ taxRateBps: 600, issueDate: expect.any(String) }) }),
    );
  });

  it('alíquota vazia bloqueia o salvamento', () => {
    const { onSubmit } = renderForm({ accounts: nfAccounts });
    fireEvent.click(screen.getByRole('button', { name: 'Entrada' }));
    fill('Cliente', '1000000');
    fireEvent.change(screen.getByPlaceholderText('6'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Salvar'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('conta sem NF: entrada comum não manda alíquota', () => {
    const { onSubmit } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Entrada' }));
    fill('Salário', '500000');
    fireEvent.click(screen.getByText('Salvar'));
    const payload = (onSubmit.mock.calls[0][0] as unknown as { payload: Record<string, unknown> }).payload;
    expect('taxRateBps' in payload).toBe(false);
  });
});

describe('MovementModal — compra no cartão (U18)', () => {
  const cards = [{ id: 'nu', name: 'Nubank', active: true }] as never;

  it('saída paga com cartão vira lançamento parcelado do cartão', () => {
    const { onSubmit } = renderForm({ cards });
    fill('Geladeira', '300000');
    fireEvent.change(screen.getByDisplayValue('Conta (débito, Pix, dinheiro)'), { target: { value: 'nu' } });
    fireEvent.change(screen.getByDisplayValue('À vista'), { target: { value: '3' } });
    expect(screen.queryByLabelText('Já paguei')).toBeNull();
    fireEvent.click(screen.getByText('Salvar'));
    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'card',
      cardId: 'nu',
      payload: expect.objectContaining({ description: 'Geladeira', totalAmount: 300000, entryType: 'INSTALLMENT', installmentsCount: 3, expenseCategoryId: 'mercado' }),
    });
  });

  it('sem cartão, não mostra "Pagar com"', () => {
    renderForm();
    expect(screen.queryByText('Pagar com')).toBeNull();
  });
});
