// @vitest-environment jsdom
/**
 * Tests Tooltip : accessibilité clavier (focus, Échap, aria-describedby).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Tooltip, TipButton } from './Tooltip';

describe('Tooltip', () => {
  it('apparaît au focus clavier avec role=tooltip et aria-describedby, se ferme avec Échap', async () => {
    render(
      <Tooltip content="Aide" delay={0}>
        <button>ok</button>
      </Tooltip>
    );
    const btn = screen.getByRole('button');
    act(() => {
      fireEvent.focus(btn);
    });
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toBe('Aide');
    expect(btn.parentElement?.getAttribute('aria-describedby')).toBe(tip.id);
    fireEvent.keyDown(btn, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('TipButton : aria-label par défaut et pas de title natif', () => {
    const onClick = vi.fn();
    render(
      <TipButton tip="Supprimer" onClick={onClick}>
        x
      </TipButton>
    );
    const btn = screen.getByLabelText('Supprimer');
    expect(btn.getAttribute('title')).toBeNull();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });
});
