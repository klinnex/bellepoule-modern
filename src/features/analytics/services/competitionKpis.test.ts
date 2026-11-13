/**
 * Tests unitaires - indicateurs du tableau analytique (#1817)
 */
import { describe, it, expect } from 'vitest';
import {
  fencerIndexRanking,
  fencerMatchKpis,
  initialRankOf,
  normalizeFinishedMatches,
  organisationKpis,
  rankingProgression,
  averageMatchSeconds,
  type KpiMatch,
} from './competitionKpis';
import { Fencer, FencerStatus, Match, MatchStatus, MatchTiming, Pool } from '../../../shared/types';

const f = (id: string, ranking?: number, status = FencerStatus.CHECKED_IN) =>
  ({ id, ranking, status, lastName: id, firstName: id }) as unknown as Fencer;

const km = (a: string, b: string, sa: number, sb: number): KpiMatch => ({
  id: `${a}-${b}-${sa}-${sb}`,
  fencerAId: a,
  fencerBId: b,
  scoreA: sa,
  scoreB: sb,
  winnerId: sa > sb ? a : b,
});

const poolMatch = (
  id: string,
  a: string,
  b: string,
  sa: number,
  sb: number,
  status = MatchStatus.FINISHED,
  updatedAt = '2026-11-13T09:00:00Z'
) =>
  ({
    id,
    number: 1,
    fencerA: f(a),
    fencerB: f(b),
    scoreA: { value: sa, isVictory: sa > sb },
    scoreB: { value: sb, isVictory: sb > sa },
    status,
    updatedAt: new Date(updatedAt),
  }) as unknown as Match;

const timing = (over: Partial<MatchTiming>): MatchTiming => ({
  matchId: 'm',
  poolId: null,
  tableId: null,
  fencerAId: null,
  fencerBId: null,
  status: 'finished',
  strip: null,
  refereeId: null,
  startTime: null,
  endTime: null,
  duration: null,
  ...over,
});

describe('normalizeFinishedMatches', () => {
  it('ordonne les poules par fin puis ajoute le tableau du plus grand tour au plus petit', () => {
    const pools = [
      poolMatch('p2', 'a', 'c', 5, 1, MatchStatus.FINISHED, '2026-11-13T10:00:00Z'),
      poolMatch('p1', 'a', 'b', 2, 5, MatchStatus.FINISHED, '2026-11-13T09:00:00Z'),
      poolMatch('p3', 'b', 'c', 0, 0, MatchStatus.NOT_STARTED),
    ];
    const tableau = [
      {
        id: 't8',
        round: 8,
        fencerA: { id: 'a' },
        fencerB: { id: 'd' },
        scoreA: 15,
        scoreB: 3,
        winner: { id: 'a' },
        isBye: false,
      },
      {
        id: 't16',
        round: 16,
        fencerA: { id: 'a' },
        fencerB: { id: 'e' },
        scoreA: 15,
        scoreB: 14,
        winner: { id: 'a' },
        isBye: false,
      },
      {
        id: 'bye',
        round: 32,
        fencerA: { id: 'a' },
        fencerB: null,
        scoreA: null,
        scoreB: null,
        winner: { id: 'a' },
        isBye: true,
      },
    ];
    expect(normalizeFinishedMatches(pools, tableau).map(m => m.id)).toEqual([
      'p1',
      'p2',
      't16',
      't8',
    ]);
  });
});

describe('fencerIndexRanking', () => {
  it('classe par TD − TR moyen', () => {
    const r = fencerIndexRanking([km('a', 'b', 5, 1), km('a', 'c', 3, 5), km('b', 'c', 5, 4)]);
    expect(r[0]).toMatchObject({ fencerId: 'a', matches: 2, averageIndex: 1 });
    expect(r.map(x => x.fencerId)).toEqual(['a', 'c', 'b']);
    expect(r[2].averageIndex).toBeCloseTo(-1.5);
  });
});

describe('fencerMatchKpis', () => {
  it('écarts moyens, victoires serrées/dominantes et séries', () => {
    const k = fencerMatchKpis('a', [
      km('a', 'b', 5, 4), // V serrée (1)
      km('a', 'c', 5, 0), // V dominante (5)
      km('d', 'a', 5, 2), // D (3)
      km('a', 'e', 5, 3), // V (2, serrée)
      km('a', 'f', 4, 5), // D (1)
      km('a', 'g', 2, 5), // D (3)
    ]);
    expect(k).toMatchObject({ played: 6, wins: 3, losses: 3, closeWins: 2, dominantWins: 1 });
    expect(k.averageGap).toBeCloseTo(15 / 6);
    expect(k.averageWinGap).toBeCloseTo(8 / 3);
    expect(k.bestWinStreak).toBe(2);
    expect(k.bestLossStreak).toBe(2);
    expect(k.current).toEqual({ kind: 'L', length: 2 });
    expect(k.sequence.join('')).toBe('WWLWLL');
  });

  it('aucun match → zéros', () => {
    expect(fencerMatchKpis('z', [])).toMatchObject({ played: 0, averageGap: 0, current: null });
  });
});

describe('classement', () => {
  it('rang d’entrée parmi les présents, non classés en fin', () => {
    const list = [f('a'), f('b', 10), f('c', 3), f('x', 1, FencerStatus.NOT_CHECKED_IN)];
    expect(initialRankOf(list, 'c')).toBe(1);
    expect(initialRankOf(list, 'b')).toBe(2);
    expect(initialRankOf(list, 'a')).toBe(3);
    expect(initialRankOf(list, 'x')).toBeNull();
  });

  it('progression : delta positif = places gagnées', () => {
    expect(rankingProgression(12, 5, 8)).toEqual([
      { key: 'initial', rank: 12, delta: null },
      { key: 'pools', rank: 5, delta: 7 },
      { key: 'final', rank: 8, delta: -3 },
    ]);
    expect(rankingProgression(4, null, 2)[2].delta).toBe(2);
  });
});

describe('organisationKpis', () => {
  const NOW = Date.parse('2026-11-13T10:00:00Z');
  const pool = (id: string, number: number, matches: Match[]) =>
    ({ id, number, matches }) as unknown as Pool;

  it('avancement, poules en retard, anneau, débit, attente, pistes actives', () => {
    const pools = [
      pool('A', 1, [
        poolMatch('a1', 'f1', 'f2', 5, 1),
        poolMatch('a2', 'f1', 'f3', 5, 2),
        poolMatch('a3', 'f2', 'f3', 0, 0, MatchStatus.NOT_STARTED),
      ]),
      pool('B', 2, [
        poolMatch('b1', 'g1', 'g2', 5, 1),
        poolMatch('b2', 'g1', 'g3', 5, 3),
        poolMatch('b3', 'g2', 'g3', 0, 0, MatchStatus.NOT_STARTED),
      ]),
      pool('C', 3, [
        poolMatch('c1', 'h1', 'h2', 0, 0, MatchStatus.NOT_STARTED),
        poolMatch('c2', 'h1', 'h3', 0, 0, MatchStatus.NOT_STARTED),
        poolMatch('c3', 'h2', 'h3', 0, 0, MatchStatus.NOT_STARTED),
      ]),
    ];
    const timings = [
      timing({
        matchId: 'a1',
        fencerAId: 'f1',
        fencerBId: 'f2',
        strip: 1,
        startTime: '2026-11-13T09:10:00Z',
        endTime: '2026-11-13T09:15:00Z',
        duration: 180,
      }),
      timing({
        matchId: 'a2',
        fencerAId: 'f1',
        fencerBId: 'f3',
        strip: 1,
        startTime: '2026-11-13T09:25:00Z',
        endTime: '2026-11-13T09:30:00Z',
        duration: 120,
      }),
      timing({
        matchId: 'b1',
        strip: 2,
        startTime: '2026-11-13T08:00:00Z',
        endTime: '2026-11-13T08:04:00Z',
        duration: 200,
      }),
    ];
    const k = organisationKpis({
      pools,
      timings,
      arenas: [
        { number: 1, status: 'in_progress', matchId: 'a3' },
        { number: 2, status: 'idle', matchId: null },
        { number: 3, status: 'ready', matchId: 'c1' },
      ],
      events: [
        {
          id: '1',
          competitionId: 'c',
          type: 'disconnect',
          arenaId: 'arena1',
          matchId: null,
          refereeId: null,
          detail: null,
          createdAt: '2026-11-13T09:00:00Z',
        },
        {
          id: '2',
          competitionId: 'c',
          type: 'offline_sync',
          arenaId: null,
          matchId: null,
          refereeId: null,
          detail: null,
          createdAt: '2026-11-13T09:01:00Z',
        },
      ],
      now: NOW,
    });
    expect(k).toMatchObject({
      done: 4,
      total: 9,
      inProgress: 1,
      pending: 4,
      poolsDone: 0,
      poolsTotal: 3,
    });
    expect(k.pools.map(p => p.late)).toEqual([false, false, true]);
    expect(k.pools[0].inProgress).toBe(1);
    expect(k.activeStrips).toEqual([1]);
    expect(k.stripCount).toBe(3);
    expect(k.lastHourThroughput).toBe(2);
    expect(k.averageWaitSeconds).toBe(600);
    expect(k.averageFightSeconds).toBeCloseTo(500 / 3);
    expect(k.remote).toMatchObject({ disconnects: 1, offlineSyncs: 1, syncErrors: 0 });
    expect(k.recentIssues).toHaveLength(1);
    expect(k.etaAt).toBeGreaterThan(NOW);
  });

  it('tout terminé → pas d’estimation', () => {
    const k = organisationKpis({
      pools: [pool('A', 1, [poolMatch('a1', 'x', 'y', 5, 0)])],
      now: NOW,
    });
    expect(k).toMatchObject({ done: 1, total: 1, etaAt: null });
  });
});

describe('averageMatchSeconds', () => {
  it('temps de combat si connu, sinon début → fin', () => {
    expect(
      averageMatchSeconds([
        timing({
          endTime: '2026-11-13T09:05:00Z',
          startTime: '2026-11-13T09:00:00Z',
          duration: 200,
        }),
        timing({ endTime: '2026-11-13T09:05:00Z', startTime: '2026-11-13T09:00:00Z' }),
        timing({ startTime: '2026-11-13T09:00:00Z' }),
      ])
    ).toBe(250);
  });
});
