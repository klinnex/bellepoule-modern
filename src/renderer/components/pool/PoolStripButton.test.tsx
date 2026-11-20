// @vitest-environment jsdom
/**
 * Tests du bouton d'assignation de piste d'une poule (#1501)
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PoolStripButton } from './PoolStripButton';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string, p?: { n?: number }) => (p?.n ? `${k}:${p.n}` : k) }),
}));
vi.mock('../common/Modal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
}));

describe('PoolStripButton', () => {
  it('propose uniquement les pistes de l’intervalle et applique le choix', () => {
    const onChange = vi.fn();
    render(
      <PoolStripButton
        poolNumber={2}
        strip={null}
        stripRange={{ start: 5, end: 7 }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByTitle('poolView.assign_strip'));
    expect(screen.queryByText('4')).toBeNull();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    fireEvent.click(screen.getByText('6'));
    expect(onChange).toHaveBeenCalledWith(6);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('permet de retirer la piste (automatique)', () => {
    const onChange = vi.fn();
    render(
      <PoolStripButton
        poolNumber={1}
        strip={5}
        stripRange={{ start: 5, end: 6 }}
        onChange={onChange}
      />
    );
    expect(screen.getByTitle('poolView.assign_strip')).toHaveTextContent('poolView.strip_n:5');
    fireEvent.click(screen.getByTitle('poolView.assign_strip'));
    fireEvent.click(screen.getByText('–'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
