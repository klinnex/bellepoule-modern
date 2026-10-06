import { describe, it, expect } from 'vitest';
import { PoolCalculator } from './poolCalculator';
import { Fencer, FencerStatus, Gender, Match, MatchStatus, Pool } from '../../../shared/types';

// ============================================================================
// Helpers
// ============================================================================

const makeFencer = (id: string, ref: number): Fencer => ({
  id,
  ref,
  lastName: `Tireur${ref}`,
  firstName: 'Test',
  gender: Gender.MALE,
  nationality: 'FRA',
  status: FencerStatus.CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeMatch = (
  id: string,
  fencerA: Fencer,
  fencerB: Fencer,
  scoreA: number,
  scoreB: number,
  status: MatchStatus = MatchStatus.FINISHED
): Match => ({
  id,
  number: 1,
  fencerA,
  fencerB,
  scoreA: {
    value: scoreA,
    isVictory: scoreA > scoreB,
    isAbstention: false,
    isExclusion: false,
    isForfait: false,
  },
  scoreB: {
    value: scoreB,
    isVictory: scoreB > scoreA,
    isAbstention: false,
    isExclusion: false,
    isForfait: false,
  },
  maxScore: 5,
  status,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makePool = (fencers: Fencer[], matches: Match[], isComplete = false): Pool => ({
  id: 'pool-1',
  number: 1,
  phaseId: 'phase-1',
  fencers,
  matches,
  referees: [],
  isComplete,
  hasError: false,
  ranking: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

// ============================================================================
// PoolCalculator.calculatePoolDistribution
// ============================================================================

describe('PoolCalculator.calculatePoolDistribution', () => {
  it('returns 1 pool when fencer count fits single pool', () => {
    const { poolCount } = PoolCalculator.calculatePoolDistribution(6, 5, 7);
    expect(poolCount).toBe(1);
  });

  it('returns correct distribution for 35 fencers (5-7)', () => {
    const { poolCount, fencersPerPool } = PoolCalculator.calculatePoolDistribution(35, 5, 7);
    expect(poolCount).toBe(5);
    expect(fencersPerPool.reduce((a, b) => a + b, 0)).toBe(35);
    fencersPerPool.forEach(s => {
      expect(s).toBeGreaterThanOrEqual(5);
      expect(s).toBeLessThanOrEqual(7);
    });
  });

  it('fencersPerPool sums to fencerCount', () => {
    const count = 28;
    const { fencersPerPool } = PoolCalculator.calculatePoolDistribution(count, 5, 7);
    expect(fencersPerPool.reduce((a, b) => a + b, 0)).toBe(count);
  });

  it('falls back to single pool when no valid distribution exists', () => {
    // Only 3 fencers, min=5 → can't meet min, single pool fallback
    const { poolCount } = PoolCalculator.calculatePoolDistribution(3, 5, 7);
    expect(poolCount).toBe(1);
  });

  it('uses default min=5 max=7 when not provided', () => {
    const { fencersPerPool } = PoolCalculator.calculatePoolDistribution(14);
    fencersPerPool.forEach(s => {
      expect(s).toBeGreaterThanOrEqual(5);
      expect(s).toBeLessThanOrEqual(7);
    });
  });

  it('returns pool count of 1 for small number of fencers within range', () => {
    const { poolCount } = PoolCalculator.calculatePoolDistribution(5, 5, 7);
    expect(poolCount).toBe(1);
  });
});

// ============================================================================
// PoolCalculator.isPoolComplete
// ============================================================================

describe('PoolCalculator.isPoolComplete', () => {
  it('returns false for empty matches', () => {
    const pool = makePool([], []);
    expect(PoolCalculator.isPoolComplete(pool)).toBe(false);
  });

  it('returns true when all matches are finished', () => {
    const [f1, f2] = [makeFencer('f1', 1), makeFencer('f2', 2)];
    const pool = makePool([f1, f2], [makeMatch('m1', f1, f2, 5, 3)]);
    expect(PoolCalculator.isPoolComplete(pool)).toBe(true);
  });

  it('returns false when any match is not finished', () => {
    const [f1, f2, f3] = [makeFencer('f1', 1), makeFencer('f2', 2), makeFencer('f3', 3)];
    const pool = makePool(
      [f1, f2, f3],
      [makeMatch('m1', f1, f2, 5, 3), makeMatch('m2', f1, f3, 0, 0, MatchStatus.NOT_STARTED)]
    );
    expect(PoolCalculator.isPoolComplete(pool)).toBe(false);
  });

  it('returns false when matches array is undefined', () => {
    const pool = makePool([], undefined as any);
    expect(PoolCalculator.isPoolComplete(pool)).toBe(false);
  });
});

// ============================================================================
// PoolCalculator.calculateRankings
// ============================================================================

describe('PoolCalculator.calculateRankings', () => {
  it('returns rankings for all fencers', () => {
    const [f1, f2, f3] = [makeFencer('f1', 1), makeFencer('f2', 2), makeFencer('f3', 3)];
    const pool = makePool(
      [f1, f2, f3],
      [makeMatch('m1', f1, f2, 5, 3), makeMatch('m2', f1, f3, 5, 1), makeMatch('m3', f2, f3, 5, 4)]
    );
    const { rankings } = PoolCalculator.calculateRankings(pool);
    expect(rankings).toHaveLength(3);
  });

  it('returns isComplete=true when all matches finished', () => {
    const [f1, f2] = [makeFencer('f1', 1), makeFencer('f2', 2)];
    const pool = makePool([f1, f2], [makeMatch('m1', f1, f2, 5, 0)]);
    const { isComplete } = PoolCalculator.calculateRankings(pool);
    expect(isComplete).toBe(true);
  });

  it('returns isComplete=false with pending match', () => {
    const [f1, f2] = [makeFencer('f1', 1), makeFencer('f2', 2)];
    const pool = makePool([f1, f2], [makeMatch('m1', f1, f2, 0, 0, MatchStatus.NOT_STARTED)]);
    const { isComplete } = PoolCalculator.calculateRankings(pool);
    expect(isComplete).toBe(false);
  });

  it('returns correct completedMatches count', () => {
    const [f1, f2, f3] = [makeFencer('f1', 1), makeFencer('f2', 2), makeFencer('f3', 3)];
    const pool = makePool(
      [f1, f2, f3],
      [makeMatch('m1', f1, f2, 5, 3), makeMatch('m2', f1, f3, 0, 0, MatchStatus.NOT_STARTED)]
    );
    const { stats } = PoolCalculator.calculateRankings(pool);
    expect(stats.completedMatches).toBe(1);
    expect(stats.totalMatches).toBe(2);
  });

  it('returns 0 averageTouchesPerMatch when no completed matches', () => {
    const [f1, f2] = [makeFencer('f1', 1), makeFencer('f2', 2)];
    const pool = makePool([f1, f2], [makeMatch('m1', f1, f2, 0, 0, MatchStatus.NOT_STARTED)]);
    const { stats } = PoolCalculator.calculateRankings(pool);
    expect(stats.averageTouchesPerMatch).toBe(0);
  });

  it('calculates correct average touches per match', () => {
    const [f1, f2] = [makeFencer('f1', 1), makeFencer('f2', 2)];
    // match: 5+3 = 8 touches, 1 match → avg = 8
    const pool = makePool([f1, f2], [makeMatch('m1', f1, f2, 5, 3)]);
    const { stats } = PoolCalculator.calculateRankings(pool);
    expect(stats.averageTouchesPerMatch).toBe(8);
  });
});

// ============================================================================
// PoolCalculator.calculateVictoryRatio
// ============================================================================

describe('PoolCalculator.calculateVictoryRatio', () => {
  it('returns 1.0 for fencer who won all matches', () => {
    const [f1, f2, f3] = [makeFencer('f1', 1), makeFencer('f2', 2), makeFencer('f3', 3)];
    const pool = makePool(
      [f1, f2, f3],
      [makeMatch('m1', f1, f2, 5, 0), makeMatch('m2', f1, f3, 5, 0), makeMatch('m3', f2, f3, 5, 0)]
    );
    expect(PoolCalculator.calculateVictoryRatio(f1, pool)).toBe(1);
  });

  it('returns 0.0 for fencer who lost all matches', () => {
    const [f1, f2, f3] = [makeFencer('f1', 1), makeFencer('f2', 2), makeFencer('f3', 3)];
    const pool = makePool(
      [f1, f2, f3],
      [makeMatch('m1', f2, f1, 5, 0), makeMatch('m2', f3, f1, 5, 0), makeMatch('m3', f2, f3, 5, 0)]
    );
    expect(PoolCalculator.calculateVictoryRatio(f1, pool)).toBe(0);
  });

  it('returns 0.5 for fencer with equal wins and losses', () => {
    const [f1, f2, f3] = [makeFencer('f1', 1), makeFencer('f2', 2), makeFencer('f3', 3)];
    const pool = makePool(
      [f1, f2, f3],
      [
        makeMatch('m1', f1, f2, 5, 0), // f1 wins
        makeMatch('m2', f3, f1, 5, 0), // f1 loses
        makeMatch('m3', f2, f3, 5, 0),
      ]
    );
    expect(PoolCalculator.calculateVictoryRatio(f1, pool)).toBe(0.5);
  });
});
