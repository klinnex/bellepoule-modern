/**
 * Tests : optimisation des conflits de poules
 */

import { describe, it, expect } from 'vitest';
import { countConflicts, minConflicts, optimizePoolConflicts } from './poolOptimizer';
import { Fencer, FencerStatus, Gender } from '../types';

const f = (id: string, club?: string, region?: string, ranking?: number): Fencer => ({
  id,
  ref: 0,
  lastName: id,
  firstName: 'Test',
  gender: Gender.MALE,
  nationality: 'FRA',
  club,
  region,
  ranking,
  status: FencerStatus.CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const ids = (pools: Fencer[][]) => pools.map(p => p.map(x => x.id));

describe('countConflicts / minConflicts', () => {
  it('compte les tireurs en trop par poule', () => {
    const pools = [
      [f('a', 'X'), f('b', 'X'), f('c', 'X'), f('d', 'Y')],
      [f('e', 'Y'), f('g', 'Z')],
    ];
    expect(countConflicts(pools, 'byClub')).toBe(2);
    // X ×3 sur 2 poules → 1 conflit inévitable
    expect(minConflicts(pools, 'byClub')).toBe(1);
  });

  it('ignore les valeurs vides', () => {
    const pools = [[f('a'), f('b', ' '), f('c')]];
    expect(countConflicts(pools, 'byClub')).toBe(0);
  });
});

describe('optimizePoolConflicts', () => {
  it('atteint le minimum en conservant la taille des poules', () => {
    const pools = [
      [f('a', 'X', undefined, 1), f('b', 'X', undefined, 4), f('c', 'Y', undefined, 5)],
      [f('d', 'Y', undefined, 2), f('e', 'Y', undefined, 3), f('g', 'Z', undefined, 6)],
    ];
    const out = optimizePoolConflicts(pools, ['byClub']);
    expect(out.map(p => p.length)).toEqual([3, 3]);
    expect(countConflicts(out, 'byClub')).toBe(minConflicts(pools, 'byClub'));
  });

  it("préfère l'échange entre tireurs au classement le plus proche", () => {
    const pools = [
      [f('a', 'X', undefined, 1), f('b', 'X', undefined, 3)],
      [f('c', 'Y', undefined, 4), f('d', 'Z', undefined, 10)],
    ];
    const out = optimizePoolConflicts(pools, ['byClub']);
    // b (3) ↔ c (4) plutôt que a ↔ c ou b ↔ d
    expect(ids(out)).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ]);
  });

  it('ne sacrifie pas le critère prioritaire au profit du suivant', () => {
    const pools = [
      [f('a', 'X', 'R1'), f('b', 'Y', 'R1')],
      [f('c', 'X', 'R2'), f('d', 'Z', 'R2')],
    ];
    const out = optimizePoolConflicts(pools, ['byClub', 'byRegion']);
    expect(countConflicts(out, 'byClub')).toBe(0);
  });

  it("ne modifie pas l'entrée et ne fait rien sans critère", () => {
    const pools = [[f('a', 'X'), f('b', 'X')], [f('c', 'Y')]];
    const before = ids(pools);
    expect(ids(optimizePoolConflicts(pools, []))).toEqual(before);
    optimizePoolConflicts(pools, ['byClub']);
    expect(ids(pools)).toEqual(before);
  });
});
