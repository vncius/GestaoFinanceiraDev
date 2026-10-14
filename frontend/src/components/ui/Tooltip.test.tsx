import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HelpTip } from './Tooltip';

describe('HelpTip', () => {
  it('não ocupa espaço fechado (evita rolagem horizontal) e aparece ao focar', () => {
    const { container } = render(<HelpTip text="Ajuda" />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(container.querySelector('span[tabindex="0"]')!);
    expect(screen.getByRole('tooltip').textContent).toBe('Ajuda');
    fireEvent.blur(container.querySelector('span[tabindex="0"]')!);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
