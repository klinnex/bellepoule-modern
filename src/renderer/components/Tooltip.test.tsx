// @vitest-environment jsdom
/**
 * Tests Tooltip : accessibilité clavier (focus, Échap, aria-describedby).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Tooltip, TipButton, placeTooltip } from './Tooltip';

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

describe('placeTooltip (#1755)', () => {
  const vp = { width: 1024, height: 768 };
  const tip = { width: 200, height: 30 };
  it('au-dessus, centré sur le déclencheur', () => {
    const p = placeTooltip({ left: 400, top: 300, width: 40, height: 20 }, tip, 'top', vp);
    expect(p.side).toBe('top');
    expect(p.left).toBe(320);
    expect(p.top).toBe(300 - 11 - 30);
  });
  it('bascule en dessous si pas de place en haut', () => {
    const p = placeTooltip({ left: 400, top: 10, width: 40, height: 20 }, tip, 'top', vp);
    expect(p.side).toBe('bottom');
    expect(p.top).toBe(41);
  });
  it('recadré au bord droit de la fenêtre', () => {
    const p = placeTooltip({ left: 1000, top: 300, width: 20, height: 20 }, tip, 'top', vp);
    expect(p.left).toBe(1024 - 8 - 200);
    expect(p.arrowLeft).toBe(1005);
  });
});
