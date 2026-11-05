/**
 * Tests : demi-finales du tournoi des rapières, scénarios selon le nombre de poules (#1441)
 * Licensed under GPL-3.0
 */
import { describe, it, expect } from 'vitest';
import { FencerStatus } from '../../shared/types';
import type { Fencer, Pool, PoolRanking } from '../../shared/types';
import { rapieresSemifinalists } from './rapieresCalculations';

const team = (id: string): Fencer => ({ id, lastName: id, firstName: '' }) as unknown as Fencer;

/** Poule avec classement de poule fourni (ids dans l'ordre de rang) */
const pool = (number: number, ids: string[]): Pool =>
  ({
    number,
    fencers: ids.map(team),
    matches: [],
    ranking: ids.map((id, i) => ({ fencer: team(id), rank: i + 1 })) as unknown as PoolRanking[],
  }) as unknown as Pool;

/** Classement général : ids dans l'ordre de classement */
const overall = (ids: string[]): PoolRanking[] =>
  ids.map((id, i) => ({ fencer: team(id), rank: i + 1 })) as unknown as PoolRanking[];

const ids = (r: PoolRanking[] | null) => r?.map(x => x.fencer.id);

describe('rapieresSemifinalists', () => {
  it('2 poules : croisement A1–B2 et B1–A2, ordre de tête de série', () => {
    const pools = [pool(1, ['a1', 'a2', 'a3']), pool(2, ['b1', 'b2', 'b3'])];
    const res = rapieresSemifinalists(pools, overall(['a1', 'b1', 'a2', 'b2', 'a3', 'b3']));
    expect(ids(res)).toEqual(['a1', 'b1', 'a2', 'b2']);
    expect(res?.map(x => x.rank)).toEqual([1, 2, 3, 4]);
  });

  it('3 poules : 1res + meilleure 2e du général, ordre du général', () => {
    const pools = [pool(1, ['a1', 'a2']), pool(2, ['b1', 'b2']), pool(3, ['c1', 'c2'])];
    // Meilleure 2e : b2 (3e du général) devant a2 et c2
    const res = rapieresSemifinalists(pools, overall(['a1', 'b1', 'c1', 'b2', 'a2', 'c2']));
    expect(ids(res)).toEqual(['a1', 'b1', 'c1', 'b2']);
  });

  it('4 poules : les 4 premiers de poule', () => {
    const pools = [1, 2, 3, 4].map(n => pool(n, [`p${n}a`, `p${n}b`]));
    const res = rapieresSemifinalists(pools, overall(['p3a', 'p1a', 'p4a', 'p2a', 'p1b']));
    expect(ids(res)).toEqual(['p3a', 'p1a', 'p4a', 'p2a']);
  });

  it('1 poule : les 4 premières de la poule', () => {
    const res = rapieresSemifinalists(
      [pool(1, ['x', 'y', 'z', 'w', 'v'])],
      overall(['x', 'y', 'z', 'w', 'v'])
    );
    expect(ids(res)).toEqual(['x', 'y', 'z', 'w']);
  });

  it('plus de 4 poules : pas de scénario', () => {
    const pools = [1, 2, 3, 4, 5].map(n => pool(n, [`p${n}a`, `p${n}b`]));
    expect(rapieresSemifinalists(pools, overall(['p1a']))).toBeNull();
  });

  it('équipe retirée : écartée, rangs de poule renumérotés', () => {
    const retired = { ...team('a1'), status: FencerStatus.ABANDONED } as unknown as Fencer;
    const withRetired = (ranking: PoolRanking[]) =>
      ranking.map(r => (r.fencer.id === 'a1' ? { ...r, fencer: retired } : r));
    const pools = [pool(1, ['a1', 'a2', 'a3']), pool(2, ['b1', 'b2', 'b3'])].map(p => ({
      ...p,
      ranking: withRetired(p.ranking),
    }));
    const res = rapieresSemifinalists(
      pools,
      withRetired(overall(['a1', 'b1', 'a2', 'b2', 'a3', 'b3']))
    );
    expect(ids(res)).toEqual(['a2', 'b1', 'a3', 'b2']);
  });
});
