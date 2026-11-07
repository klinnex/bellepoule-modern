/**
 * Tests - état « poules lancées » (#1499)
 */

import { describe, it, expect } from 'vitest';
import { MatchStatus, Pool } from '../../shared/types';
import { inferPoolsLaunched, poolsHaveScores, poolTabLock } from './poolLaunchState';

const pool = (matches: Array<Partial<{ status: MatchStatus; scoreA: number | null }>>): Pool =>
  ({
    id: 'p1',
    matches: matches.map(m => ({ status: MatchStatus.NOT_STARTED, scoreA: null, ...m })),
  }) as unknown as Pool;

describe('poolsHaveScores', () => {
  it('faux sans poule ou sans match saisi', () => {
    expect(poolsHaveScores([])).toBe(false);
    expect(poolsHaveScores([pool([{}, {}])])).toBe(false);
  });

  it("vrai dès qu'un match est saisi ou avancé", () => {
    expect(poolsHaveScores([pool([{}, { scoreA: 3 }])])).toBe(true);
    expect(poolsHaveScores([pool([{ status: MatchStatus.FINISHED }])])).toBe(true);
  });
});

describe('inferPoolsLaunched (anciennes sessions)', () => {
  it('faux en appel / préparation sans score', () => {
    expect(inferPoolsLaunched('checkin', [pool([{}])], [])).toBe(false);
    expect(inferPoolsLaunched('poolprep', [pool([{}])], undefined)).toBe(false);
  });

  it('vrai si phase postérieure, historique ou score saisi', () => {
    expect(inferPoolsLaunched('pools', [], [])).toBe(true);
    expect(inferPoolsLaunched('tableau', undefined, undefined)).toBe(true);
    expect(inferPoolsLaunched('checkin', [], [[pool([{}])]])).toBe(true);
    expect(inferPoolsLaunched('poolprep', [pool([{ scoreA: 1 }])], [])).toBe(true);
  });
});

describe('poolTabLock', () => {
  const base = { pools: [] as Pool[], poolHistory: [] as Pool[][], skipPoolPhase: false };

  it('tout verrouillé avant « Préparer les poules »', () => {
    expect(poolTabLock({ ...base, poolsLaunched: false })).toEqual({
      prepLocked: true,
      poolsLocked: true,
    });
  });

  it('Préparation libre une fois préparées, Poules libre une fois lancées', () => {
    const prepared = { ...base, pools: [pool([{}])] };
    expect(poolTabLock({ ...prepared, poolsLaunched: false })).toEqual({
      prepLocked: false,
      poolsLocked: true,
    });
    expect(poolTabLock({ ...prepared, poolsLaunched: true })).toEqual({
      prepLocked: false,
      poolsLocked: false,
    });
  });
});
