import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import { CashFlowFilterBar } from './CashFlowFilterBar';

describe('menu de ações do mês', () => {
  it('exporta o relatório em Excel ou PDF; o CSV não aparece mais', () => {
    const onExportExcel = vi.fn();
    const onExportPdf = vi.fn();
    render(
      <CashFlowFilterBar
        typeFilter="ALL" onTypeChange={vi.fn()} categories={[]} excludedCategoryIds={new Set()}
        onToggleCategory={vi.fn()} onSelectAllCategories={vi.fn()} onClearCategories={vi.fn()}
        onClearAll={vi.fn()} onImportStatement={vi.fn()} onExportExcel={onExportExcel} onExportPdf={onExportPdf}
        search="" onSearchChange={vi.fn()} tags={new Set()} onToggleTag={vi.fn()} onClearTags={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Ações do mês'));
    expect(screen.queryByText(/CSV/)).toBeNull();
    fireEvent.click(screen.getByText('Exportar relatório (Excel)'));
    expect(onExportExcel).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Ações do mês'));
    fireEvent.click(screen.getByText('Exportar relatório (PDF)'));
    expect(onExportPdf).toHaveBeenCalled();
  });
});
