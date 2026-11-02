// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
import GregAutoPublishToggle from './GregAutoPublishToggle';

describe('GregAutoPublishToggle', () => {
  it('affiche OFF puis bascule en ON au clic', () => {
    const onChange = vi.fn();
    render(<GregAutoPublishToggle on={false} onChange={onChange} />);
    const sw = screen.getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.textContent).toContain('OFF');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('affiche ON quand actif', () => {
    render(<GregAutoPublishToggle on onChange={() => undefined} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });
});
