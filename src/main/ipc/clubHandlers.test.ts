import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClubBout } from '../../shared/types/club';

type Handler = (...args: unknown[]) => unknown;
const handlers = new Map<string, Handler>();

vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: Handler) => handlers.set(ch, fn) },
}));

import { registerClubHandlers } from './clubHandlers';
import type { DatabaseManager } from '../../database';

const bout = (a: string, b: string, sa: number, sb: number, date: string): ClubBout => ({
  id: `${a}${b}${date}`,
  sessionId: date,
  date,
  memberAId: a,
  memberBId: b,
  scoreA: sa,
  scoreB: sb,
  maxScore: 5,
  winnerId: sa > sb ? a : sb > sa ? b : null,
  status: 'finished',
  entryMode: 'master',
  createdAt: date,
  updatedAt: date,
});

describe('handlers club:* (#1872)', () => {
  const bouts = [bout('a', 'b', 5, 1, '2026-11-16'), bout('a', 'c', 2, 5, '2027-01-10')];
  const repo = {
    listMembers: vi.fn(() => []),
    setAttendance: vi.fn(() => ['a']),
    listBouts: vi.fn(() => bouts),
    listSessions: vi.fn(() => []),
  };

  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    registerClubHandlers({ db: { club: repo } as unknown as DatabaseManager });
  });

  const call = (ch: string, ...args: unknown[]) => handlers.get(ch)!({}, ...args);

  it('enregistre tous les canaux club:*', () => {
    expect([...handlers.keys()].every(k => k.startsWith('club:'))).toBe(true);
    expect(handlers.size).toBe(21);
  });

  it('booléens stricts et filtres par défaut', () => {
    call('club:listMembers', 'yes');
    expect(repo.listMembers).toHaveBeenCalledWith(false);
    call('club:setAttendance', 's', 'a', 1);
    expect(repo.setAttendance).toHaveBeenCalledWith('s', 'a', false);
    call('club:listSessions');
    expect(repo.listSessions).toHaveBeenCalledWith({});
  });

  it('classement : force les combats terminés', () => {
    const r = call('club:getLeaderboard', { from: '2026-09-01', includeUnfinished: true }) as {
      memberId: string;
    }[];
    expect(repo.listBouts).toHaveBeenCalledWith({ from: '2026-09-01', includeUnfinished: false });
    expect(r.map(s => s.memberId)).toEqual(['c', 'a', 'b']);
  });

  it('fiche membre : stats, face-à-face, progression par trimestre', () => {
    const r = call('club:getMemberReport', 'a', { from: '2026-09-01' }, 'quarter') as {
      stats: { bouts: number; victories: number };
      headToHead: unknown[];
      progression: { period: { key: string } }[];
    };
    expect(repo.listBouts).toHaveBeenCalledWith({ from: '2026-09-01', memberId: 'a' });
    expect(r.stats).toMatchObject({ bouts: 2, victories: 1 });
    expect(r.headToHead).toHaveLength(2);
    expect(r.progression.map(p => p.period.key)).toEqual(['2026-T4', '2027-T1']);
  });

  it('période inconnue → mois', () => {
    const r = call('club:getMemberReport', 'a', {}, 'week') as {
      progression: { period: { kind: string } }[];
    };
    expect(r.progression[0].period.kind).toBe('month');
  });
});
