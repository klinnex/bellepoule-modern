import { describe, it, expect } from 'vitest';
import { PoolRanking } from '../../../shared/types';
import {
  buildTableauMatches,
  autoFillAllPositions,
  buildCombinedResults,
} from './tableauCalculations';

const mkRanking = (n: number): PoolRanking[] =>
  Array.from({ length: n }, (_, i) => ({
    fencer: { id: `f${i + 1}`, firstName: `F${i + 1}`, lastName: `L${i + 1}` } as any,
    rank: i + 1,
    victories: 0,
    defeats: 0,
    matchesPlayed: 0,
    touchesScored: 0,
    touchesReceived: 0,
    index: 0,
    ratio: 0,
  }));

describe('autoFillAllPositions', () => {
  // Régression : en mode « toutes les places », le remplissage auto doit couvrir
  // barrages, tableau principal ET tous les brackets de consolation.
  it.each([
    [8, 8],
    [16, 16],
    [13, 8],
    [37, 32],
  ])('%i tireurs (tableau de %i) : classement complet', (n, size) => {
    const ranking = mkRanking(n);
    const matches = buildTableauMatches(ranking, size, true, false);
    const { updatedMatches, updatedBrackets } = autoFillAllPositions(
      matches,
      [],
      15,
      size,
      ranking
    );

    expect(updatedMatches.every(m => m.isBye || !!m.winner)).toBe(true);
    expect(updatedBrackets.every(b => b.isComplete)).toBe(true);

    const results = buildCombinedResults(updatedMatches, updatedBrackets, ranking);
    expect(results).toHaveLength(n);
    expect(new Set(results.map(r => r.rank)).size).toBe(n);
  });
});
