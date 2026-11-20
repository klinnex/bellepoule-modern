/**
 * Tests - états du stepper de phases (#1533)
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import { phaseStepStates, nextBlockedReason } from './phaseStepper';

const phases = [
  { id: 'checkin', label: 'Appel', disabled: false },
  { id: 'pools', label: 'Poules', disabled: false },
  { id: 'ranking', label: 'Classement', disabled: false },
  { id: 'tableau', label: 'Tableau', disabled: true, title: 'Validez le classement' },
  { id: 'results', label: 'Résultats', disabled: true },
];

describe('phaseStepStates', () => {
  it('marque fait, en cours, à faire et bloqué', () => {
    expect(phaseStepStates(phases, 'pools')).toEqual([
      'done',
      'current',
      'todo',
      'blocked',
      'blocked',
    ]);
  });
  it('onglet utilitaire actif : avancement de la dernière étape du flow (#1650)', () => {
    const withExtra = [
      ...phases.map(p => ({ ...p, disabled: false })),
      { id: 'logs', label: 'Historique', disabled: false, isSupplementary: true },
    ];
    expect(phaseStepStates(withExtra, 'logs', 'pools')).toEqual([
      'done',
      'todo',
      'todo',
      'todo',
      'todo',
      'current',
    ]);
    expect(phaseStepStates(withExtra, 'logs')).not.toContain('done');
  });
  it('phase inconnue : rien de fait', () => {
    expect(phaseStepStates(phases, 'x')[0]).toBe('todo');
  });
});

describe('nextBlockedReason', () => {
  it('renvoie le motif de la première phase bloquée suivante', () => {
    expect(nextBlockedReason(phases, 'checkin')).toEqual({
      label: 'Tableau',
      reason: 'Validez le classement',
    });
  });
  it('null si aucun motif connu après la phase courante', () => {
    expect(nextBlockedReason(phases, 'tableau')).toBeNull();
  });
});
