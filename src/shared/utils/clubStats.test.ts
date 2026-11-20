import { describe, it, expect } from 'vitest';
import type { ClubBout } from '../types/club';
import {
  computeHeadToHead,
  computeLeaderboard,
  computeMemberStats,
  isIsoDate,
  periodOf,
  statsByPeriod,
  winnerFromScore,
} from './clubStats';

let n = 0;
const bout = (
  a: string,
  b: string,
  sa: number,
  sb: number,
  date = '2026-11-16',
  extra: Partial<ClubBout> = {}
): ClubBout => ({
  id: `b${++n}`,
  sessionId: `s-${date}`,
  date,
  memberAId: a,
  memberBId: b,
  scoreA: sa,
  scoreB: sb,
  maxScore: 5,
  winnerId: winnerFromScore(a, b, sa, sb),
  status: 'finished',
  entryMode: 'master',
  createdAt: date,
  updatedAt: date,
  ...extra,
});

describe('Mode Club : périodes (#1872)', () => {
  it('valide les dates ISO', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('16/11/2026')).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });

  it('jour, mois, trimestre, année', () => {
    expect(periodOf('2026-11-16', 'day')).toMatchObject({ from: '2026-11-16', to: '2026-11-16' });
    expect(periodOf('2028-02-10', 'month')).toMatchObject({
      from: '2028-02-01',
      to: '2028-02-29',
      key: '2028-02',
    });
    expect(periodOf('2026-11-16', 'quarter')).toMatchObject({
      from: '2026-10-01',
      to: '2026-12-31',
      key: '2026-T4',
    });
    expect(periodOf('2026-01-01', 'quarter').key).toBe('2026-T1');
    expect(periodOf('2026-06-30', 'year')).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('saison sportive septembre → août', () => {
    expect(periodOf('2026-11-16', 'season')).toMatchObject({
      from: '2026-09-01',
      to: '2027-08-31',
      key: '2026-2027',
    });
    expect(periodOf('2027-08-31', 'season').key).toBe('2026-2027');
    expect(periodOf('2026-08-31', 'season').key).toBe('2025-2026');
  });

  it('rejette une date invalide', () => {
    expect(() => periodOf('nope', 'day')).toThrow();
  });
});

describe('Mode Club : statistiques (#1872)', () => {
  const bouts = [
    bout('alice', 'bob', 5, 3),
    bout('bob', 'alice', 5, 2),
    bout('alice', 'carl', 5, 1, '2026-12-02'),
    bout('alice', 'carl', 4, 4, '2027-01-10'),
    bout('alice', 'bob', 0, 0, '2026-11-16', { status: 'cancelled', winnerId: null }),
  ];

  it('V/D/nul, touches, indice, séances', () => {
    expect(computeMemberStats('alice', bouts)).toEqual({
      memberId: 'alice',
      bouts: 4,
      victories: 2,
      defeats: 1,
      draws: 1,
      winRate: 0.5,
      touchesScored: 16,
      touchesReceived: 13,
      indice: 3,
      sessions: 3,
    });
  });

  it('membre sans combat : zéros', () => {
    expect(computeMemberStats('zoe', bouts)).toMatchObject({ bouts: 0, winRate: 0 });
  });

  it('vainqueur explicite prime sur le score', () => {
    const b = bout('alice', 'bob', 4, 4, '2026-11-16', { winnerId: 'bob' });
    expect(computeMemberStats('bob', [b])).toMatchObject({ victories: 1, draws: 0 });
  });

  it('classement : % victoires puis indice', () => {
    expect(computeLeaderboard(bouts).map(s => s.memberId)).toEqual(['alice', 'bob', 'carl']);
  });

  it('face-à-face trié par nombre de combats', () => {
    expect(computeHeadToHead('alice', bouts)).toEqual([
      {
        opponentId: 'bob',
        bouts: 2,
        victories: 1,
        defeats: 1,
        draws: 0,
        touchesScored: 7,
        touchesReceived: 8,
      },
      {
        opponentId: 'carl',
        bouts: 2,
        victories: 1,
        defeats: 0,
        draws: 1,
        touchesScored: 9,
        touchesReceived: 5,
      },
    ]);
  });

  it('progression par trimestre, chronologique', () => {
    const p = statsByPeriod('alice', bouts, 'quarter');
    expect(p.map(x => x.period.key)).toEqual(['2026-T4', '2027-T1']);
    expect(p[0].stats.bouts).toBe(3);
    expect(p[1].stats.draws).toBe(1);
  });

  it('progression par saison : un seul groupe', () => {
    expect(statsByPeriod('alice', bouts, 'season').map(x => x.period.key)).toEqual(['2026-2027']);
  });

  it('winnerFromScore', () => {
    expect(winnerFromScore('a', 'b', 5, 2)).toBe('a');
    expect(winnerFromScore('a', 'b', 1, 2)).toBe('b');
    expect(winnerFromScore('a', 'b', 3, 3)).toBeNull();
  });
});
