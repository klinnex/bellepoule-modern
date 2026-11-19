import { describe, it, expect } from 'vitest';
import { FencerStatus, type Fencer, type PoolRanking } from '../types';
import {
  arePoolsFrozenByTableau,
  computePoolCorrectionImpact,
  type CorrectionTableauMatch,
} from './poolCorrectionImpact';

const f = (id: string, status = FencerStatus.QUALIFIED): Fencer =>
  ({ id, firstName: id, lastName: id.toUpperCase(), status }) as Fencer;
const F = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map(id => [id, f(id)]));
const ranking = (ids: string[]): PoolRanking[] =>
  ids.map((id, i) => ({ fencer: F[id], rank: i + 1 }) as PoolRanking);
const match = (
  a: string,
  b: string,
  seedA: number | null,
  seedB: number | null,
  winner?: string
): CorrectionTableauMatch => ({
  fencerA: F[a],
  fencerB: F[b],
  seedA,
  seedB,
  isBye: false,
  winner: winner ? F[winner] : null,
});

describe('arePoolsFrozenByTableau (#1996)', () => {
  it('figées dès qu’un tableau ou une consolante existe', () => {
    expect(arePoolsFrozenByTableau([])).toBe(false);
    expect(arePoolsFrozenByTableau([{}])).toBe(true);
    expect(arePoolsFrozenByTableau([], 2)).toBe(true);
  });
});

describe('computePoolCorrectionImpact (#1996)', () => {
  // Tableau de 4 tiré sur a, b, c, d ; e éliminé
  const tableau = [match('a', 'd', 1, 4), match('b', 'c', 2, 3)];

  it('aucun changement : tableau intact', () => {
    const r = ranking(['a', 'b', 'c', 'd', 'e']);
    const impact = computePoolCorrectionImpact({ before: r, after: r, tableauMatches: tableau });
    expect(impact.rankChanges).toEqual([]);
    expect(impact.tableauOutdated).toBe(false);
    expect(impact.playedMatches).toBe(0);
  });

  it('têtes de série inversées : tableau obsolète, sans entrant ni sortant', () => {
    const impact = computePoolCorrectionImpact({
      before: ranking(['a', 'b', 'c', 'd', 'e']),
      after: ranking(['b', 'a', 'c', 'd', 'e']),
      tableauMatches: tableau,
    });
    expect(impact.rankChanges.map(c => [c.fencer.id, c.from, c.to])).toEqual([
      ['b', 2, 1],
      ['a', 1, 2],
    ]);
    expect(impact.seedChanges.map(s => [s.fencer.id, s.drawn, s.corrected])).toEqual([
      ['a', 1, 2],
      ['b', 2, 1],
    ]);
    expect(impact.entering).toEqual([]);
    expect(impact.leaving).toEqual([]);
    expect(impact.tableauOutdated).toBe(true);
  });

  it('qualification : e entre, d sort', () => {
    const impact = computePoolCorrectionImpact({
      before: ranking(['a', 'b', 'c', 'd', 'e']),
      after: ranking(['a', 'b', 'c', 'e', 'd']),
      tableauMatches: tableau,
    });
    expect(impact.entering.map(x => x.id)).toEqual(['e']);
    expect(impact.leaving.map(x => x.id)).toEqual(['d']);
  });

  it('rangs du tirage lus sur le tableau, pas sur le classement courant', () => {
    // Classement courant déjà décalé (session antérieure) : le tirage fait foi
    const impact = computePoolCorrectionImpact({
      before: ranking(['b', 'a', 'c', 'd', 'e']),
      after: ranking(['b', 'a', 'c', 'd', 'e']),
      tableauMatches: tableau,
    });
    expect(impact.rankChanges).toEqual([]);
    expect(impact.seedChanges.map(s => s.fencer.id)).toEqual(['a', 'b']);
  });

  it('matchs joués comptés (tableau + consolantes), exempts exclus', () => {
    const played = [match('a', 'd', 1, 4, 'a'), match('b', 'c', 2, 3)];
    const bye = { ...match('c', 'c', 3, 3, 'c'), isBye: true };
    const impact = computePoolCorrectionImpact({
      before: ranking(['a', 'b', 'c', 'd']),
      after: ranking(['a', 'b', 'c', 'd']),
      tableauMatches: [...played, bye],
      consolationMatches: [match('c', 'd', null, null, 'd')],
    });
    expect(impact.playedMatches).toBe(2);
  });

  it('tireur exclu après tirage : pas compté parmi les qualifiés corrigés', () => {
    const excluded = f('d', FencerStatus.EXCLUDED);
    const after = ranking(['a', 'b', 'c', 'e']);
    after.splice(3, 0, { fencer: excluded, rank: 4 } as PoolRanking);
    after[4].rank = 5;
    const impact = computePoolCorrectionImpact({
      before: ranking(['a', 'b', 'c', 'd', 'e']),
      after,
      tableauMatches: tableau,
    });
    expect(impact.entering.map(x => x.id)).toEqual(['e']);
  });
});
