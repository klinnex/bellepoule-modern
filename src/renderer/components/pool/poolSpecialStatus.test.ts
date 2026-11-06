/**
 * Tests - poolSpecialStatus (#1418)
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import { specialStatusOutcome } from './poolSpecialStatus';

const base = {
  inverted: false,
  status: 'exclusion' as const,
  isLaserSabre: false,
  editScoreLeft: '',
  editScoreRight: '',
  maxScore: 5,
};

describe('specialStatusOutcome', () => {
  it('tireur de gauche exclu : B gagne, A à 0', () => {
    const o = specialStatusOutcome({ ...base, side: 'left', scoreB: 3 });
    expect(o).toEqual({ scoreA: 0, scoreB: 3, winner: 'B', loser: 'A' });
  });

  it('tireur de droite exclu, sans score : A gagne avec le score max', () => {
    const o = specialStatusOutcome({ ...base, side: 'right' });
    expect(o).toEqual({ scoreA: 5, scoreB: 0, winner: 'A', loser: 'B' });
  });

  it('affichage inversé : la gauche est B', () => {
    const o = specialStatusOutcome({ ...base, side: 'left', inverted: true, scoreA: 4 });
    expect(o).toEqual({ scoreA: 4, scoreB: 0, winner: 'A', loser: 'B' });
  });

  it('Sabre Laser forfait : garde ses points (max 14), adversaire à 15', () => {
    const o = specialStatusOutcome({
      ...base,
      status: 'forfait',
      isLaserSabre: true,
      side: 'left',
      editScoreLeft: '20',
    });
    expect(o).toEqual({ scoreA: 14, scoreB: 15, winner: 'B', loser: 'A' });
  });

  it('Sabre Laser exclusion : règle classique', () => {
    const o = specialStatusOutcome({
      ...base,
      isLaserSabre: true,
      side: 'left',
      editScoreLeft: '9',
    });
    expect(o.scoreA).toBe(0);
    expect(o.scoreB).toBe(5);
  });
});
