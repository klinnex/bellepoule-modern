import { describe, it, expect } from 'vitest';
import { Fencer, FencerStatus, Gender, Match, MatchStatus, Pool } from '../../shared/types';
import { classicMatchOrder, classicWaves, hasClassicOrder } from './rapieresClassicOrder';
import {
  applyClassicOrder,
  poolMatchWaves,
  waveCount,
  waveMatchOrder,
} from './rapieresCalculations';

const fencer = (id: string): Fencer =>
  ({
    id,
    ref: 0,
    lastName: id,
    firstName: '',
    gender: Gender.MIXED,
    nationality: 'FRA',
    status: FencerStatus.CHECKED_IN,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as Fencer;

/** Poule préparée avec l'ordre standard (vagues calculées) */
const standardPool = (n: number): Pool => {
  const fencers = Array.from({ length: n }, (_, i) => fencer(`t${i + 1}`));
  const matches = waveMatchOrder(fencers).map(
    ([a, b], i) =>
      ({
        id: `m${i}`,
        number: i + 1,
        fencerA: fencers[a - 1],
        fencerB: fencers[b - 1],
        scoreA: null,
        scoreB: null,
        maxScore: 5,
        status: MatchStatus.NOT_STARTED,
        poolId: 'p1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as Match
  );
  return { id: 'p1', number: 1, fencers, matches } as unknown as Pool;
};

describe('ordre classique des rapières (#1816)', () => {
  it.each([10, 11, 12, 13, 14, 15])('poule de %i : chaque paire une seule fois', n => {
    const order = classicMatchOrder(n)!;
    const keys = order.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`));
    expect(new Set(keys).size).toBe((n * (n - 1)) / 2);
    expect(keys.length).toBe((n * (n - 1)) / 2);
    expect(order.flat().every(x => x >= 1 && x <= n)).toBe(true);
  });

  it('nombre de tours par taille', () => {
    expect([10, 11, 12, 13, 14, 15].map(n => classicWaves(n)!.length)).toEqual([
      9, 11, 11, 13, 13, 15,
    ]);
  });

  it('pas de table hors 10 à 15', () => {
    expect(hasClassicOrder(9)).toBe(false);
    expect(hasClassicOrder(16)).toBe(false);
    expect(classicMatchOrder(8)).toBeNull();
  });

  it('applyClassicOrder renumérote, garde les ids et donne les vagues des tours', () => {
    const pool = standardPool(10);
    const classic = applyClassicOrder(pool);
    expect(new Set(classic.matches.map(m => m.id))).toEqual(new Set(pool.matches.map(m => m.id)));
    const first = classic.matches[0];
    expect([first.number, first.fencerA!.id, first.fencerB!.id]).toEqual([1, 't1', 't2']);
    const fifth = classic.matches.find(m => m.number === 21)!; // tour 5, 1er combat : 1-10
    expect([fifth.fencerA!.id, fifth.fencerB!.id]).toEqual(['t1', 't10']);
    const waves = poolMatchWaves(classic);
    expect(waves.get(fifth.id)).toBe(5);
    expect(waveCount([classic])).toBe(9);
  });

  it('ordre standard conservé si la poule ne suit pas la table', () => {
    const pool = standardPool(11);
    expect(waveCount([pool])).toBe(11);
    const classic = applyClassicOrder(pool);
    const lastWave = classic.matches.filter(m => poolMatchWaves(classic).get(m.id) === 11);
    expect(lastWave.map(m => [m.fencerA!.id, m.fencerB!.id])).toEqual([
      ['t2', 't9'],
      ['t3', 't5'],
      ['t4', 't8'],
      ['t7', 't10'],
      ['t6', 't11'],
    ]);
  });

  it('poule sans table inchangée', () => {
    const pool = standardPool(6);
    expect(applyClassicOrder(pool)).toBe(pool);
  });
});
