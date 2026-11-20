import { describe, expect, it } from 'vitest';
import type { Pool } from '../../../shared/types';
import { rankingTableauNavAction } from './competitionDerived';

describe('rankingTableauNavAction (#2008)', () => {
  const t = (key: string) => key;
  const base = {
    t,
    hasDirectElimination: true,
    hasNextRound: false,
    viewingPastRound: false,
    splitByGender: false,
    frozen: false,
    poolWinnersOnly: false,
    pools: [] as Pool[],
    onGoToTableau: () => {},
  };

  it('libellé « Voir le tableau » quand le classement est figé', () => {
    expect(rankingTableauNavAction({ ...base, frozen: true })?.label).toBe(
      'poolRanking.see_tableau'
    );
  });

  it('libellé « Passer au tableau » sinon', () => {
    expect(rankingTableauNavAction(base)?.label).toBe('poolRanking.go_tableau');
  });

  it('déclenche le passage au tableau', () => {
    let called = false;
    rankingTableauNavAction({ ...base, onGoToTableau: () => (called = true) })?.action();
    expect(called).toBe(true);
  });

  it.each([
    ['sans élimination directe', { hasDirectElimination: false }],
    ['tour suivant à lancer', { hasNextRound: true }],
    ['tour passé consulté', { viewingPastRound: true }],
    ['séparation par genre', { splitByGender: true }],
  ])('aucun bouton : %s', (_label, over) => {
    expect(rankingTableauNavAction({ ...base, ...over })).toBeNull();
  });
});
