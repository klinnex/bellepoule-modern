/**
 * Tests - raccourcis de navigation entre phases (#1533)
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import { phaseShortcutTarget } from './usePhaseShortcuts';

const phases = [
  { id: 'checkin', disabled: false },
  { id: 'poolprep', disabled: false },
  { id: 'pools', disabled: true },
  { id: 'ranking', disabled: false },
  { id: 'tableau', disabled: false },
];

describe('phaseShortcutTarget', () => {
  it('Ctrl+n va à la phase de rang n', () => {
    expect(phaseShortcutTarget('1', phases, 'checkin')).toBe('checkin');
    expect(phaseShortcutTarget('5', phases, 'checkin')).toBe('tableau');
  });

  it('ne cible pas une phase désactivée ni un rang absent', () => {
    expect(phaseShortcutTarget('3', phases, 'checkin')).toBeNull();
    expect(phaseShortcutTarget('8', phases, 'checkin')).toBeNull();
  });

  it('Ctrl+→ / Ctrl+← passent à la phase accessible suivante / précédente', () => {
    expect(phaseShortcutTarget('ArrowRight', phases, 'poolprep')).toBe('ranking');
    expect(phaseShortcutTarget('ArrowLeft', phases, 'ranking')).toBe('poolprep');
  });

  it('aux bornes, pas de cible', () => {
    expect(phaseShortcutTarget('ArrowLeft', phases, 'checkin')).toBeNull();
    expect(phaseShortcutTarget('ArrowRight', phases, 'tableau')).toBeNull();
  });

  it('autres touches : pas de cible', () => {
    expect(phaseShortcutTarget('s', phases, 'checkin')).toBeNull();
    expect(phaseShortcutTarget('0', phases, 'checkin')).toBeNull();
  });
});
