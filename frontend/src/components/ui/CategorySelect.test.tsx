import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';
import { CategorySelect } from './CategorySelect';
import { CategoriesService } from '../../services/categories.service';
import { Category } from '../../types';

vi.mock('../../services/categories.service', () => ({ CategoriesService: { create: vi.fn() } }));

const categories = [
  { id: 'm', name: 'Mercado', type: 'EXPENSE', active: true },
  { id: 's', name: 'Salário', type: 'INCOME', active: true },
  { id: 'x', name: 'Antiga', type: 'EXPENSE', active: false },
] as Category[];

function renderSelect(onChange = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CategorySelect value="" onChange={onChange} type="EXPENSE" categories={categories} className="" placeholder="Selecione..." />
    </QueryClientProvider>,
  );
  return onChange;
}

describe('CategorySelect', () => {
  it('lista só categorias ativas do tipo pedido, mais a opção de criar', () => {
    renderSelect();
    const labels = Array.from(screen.getByRole('combobox').querySelectorAll('option')).map((o) => o.textContent);
    expect(labels).toEqual(['Selecione...', 'Mercado', '+ Nova categoria…']);
  });

  it('"+ Nova categoria…" cria com o tipo certo e já seleciona', async () => {
    vi.mocked(CategoriesService.create).mockResolvedValue({ id: 'nova', name: 'Pets', type: 'EXPENSE', active: true } as Category);
    const onChange = renderSelect();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__new_category__' } });
    fireEvent.change(screen.getByPlaceholderText('Nome da nova categoria'), { target: { value: ' Pets ' } });
    fireEvent.click(screen.getByText('Criar'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('nova'));
    expect(CategoriesService.create).toHaveBeenCalledWith({ name: 'Pets', type: 'EXPENSE' });
  });
});
