import { describe, it, expect } from 'vitest';
import { PoolRanking } from '../../../shared/types';
import {
  buildTableauMatches,
  autoFillAllPositions,
  buildCombinedResults,
  calculateFinalResults,
} from './tableauCalculations';
import { TableauMatch } from './tableauTypes';

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

describe('calculateFinalResults - abandon / forfait / exclusion (#1012)', () => {
  it('mentionne l’évènement entre parenthèses pour le tireur concerné', () => {
    const ranking = mkRanking(4);
    const [a, b, c, d] = ranking.map(r => r.fencer);
    const mk = (id: string, round: number, position: number, o: Partial<TableauMatch>) =>
      ({
        id,
        round,
        position,
        scoreA: null,
        scoreB: null,
        isBye: false,
        ...o,
      }) as TableauMatch;
    const matches: TableauMatch[] = [
      mk('4-0', 4, 0, {
        fencerA: a,
        fencerB: d,
        winner: a,
        specialStatus: { fencerId: d.id, status: 'forfait' },
      }),
      mk('4-1', 4, 1, { fencerA: b, fencerB: c, scoreA: 15, scoreB: 10, winner: b }),
      mk('2-0', 2, 0, {
        fencerA: a,
        fencerB: b,
        winner: b,
        specialStatus: { fencerId: a.id, status: 'abandon' },
      }),
    ];
    const results = calculateFinalResults(matches, ranking, 4);
    const by = (id: string) => results.find(r => r.fencer.id === id)!.eliminatedAt;
    expect(by(b.id)).toBe('Vainqueur');
    expect(by(a.id)).toBe('Finale (abandon)');
    expect(by(d.id)).toMatch(/\(forfait\)$/);
    expect(by(c.id)).not.toMatch(/\(/);
  });
});
