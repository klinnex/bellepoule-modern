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
    updateClub: vi.fn(() => null),
    createClub: vi.fn(() => null),
    findMemberByCardCode: vi.fn(() => null),
  };

  const inventory = {
    listItems: vi.fn(() => []),
    createItem: vi.fn(() => null),
    updateItem: vi.fn(() => null),
    deleteItem: vi.fn(),
    listLoans: vi.fn(() => []),
    lendItem: vi.fn(() => null),
    returnLoan: vi.fn(() => null),
    deleteLoan: vi.fn(),
    importItems: vi.fn(() => ({ created: 0, skipped: 0 })),
    createItemSeries: vi.fn(() => []),
  };

  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    registerClubHandlers({
      db: { club: repo, clubInventory: inventory } as unknown as DatabaseManager,
    });
  });

  const call = (ch: string, ...args: unknown[]) => handlers.get(ch)!({}, ...args);

  it('enregistre tous les canaux club:*', () => {
    expect([...handlers.keys()].every(k => k.startsWith('club:'))).toBe(true);
    expect(handlers.size).toBe(69);
  });

  it('inventaire : délègue au dépôt, filtres et booléens par défaut', () => {
    call('club:listItems', 'c1');
    expect(inventory.listItems).toHaveBeenCalledWith('c1', true);
    call('club:listItems', 'c1', false);
    expect(inventory.listItems).toHaveBeenLastCalledWith('c1', false);
    call('club:listLoans', 'c1');
    expect(inventory.listLoans).toHaveBeenCalledWith('c1', {});
    call('club:returnLoan', 'l1');
    expect(inventory.returnLoan).toHaveBeenCalledWith('l1', {});
    call('club:deleteLoan', 'l1');
    expect(inventory.deleteLoan).toHaveBeenCalledWith('l1');
    call('club:importItems', 'c1', [{ name: 'X', category: 'mask' }]);
    expect(inventory.importItems).toHaveBeenCalledWith('c1', [{ name: 'X', category: 'mask' }]);
    call('club:createItemSeries', 'c1', { name: 'P', category: 'plastron' }, '15');
    expect(inventory.createItemSeries).toHaveBeenCalledWith(
      'c1',
      { name: 'P', category: 'plastron' },
      15
    );
  });

  it('booléens stricts et filtres par défaut', () => {
    call('club:listMembers', 'c1', 'yes');
    expect(repo.listMembers).toHaveBeenCalledWith('c1', false);
    call('club:setAttendance', 's', 'a', 1);
    expect(repo.setAttendance).toHaveBeenCalledWith('s', 'a', false);
    call('club:listSessions', 'c1');
    expect(repo.listSessions).toHaveBeenCalledWith('c1', {});
  });

  it('club : objets vides par défaut', () => {
    call('club:updateClub', 'c1');
    expect(repo.updateClub).toHaveBeenCalledWith('c1', {});
    call('club:createClub');
    expect(repo.createClub).toHaveBeenCalledWith({ name: '' });
    call('club:findMemberByCardCode', 'A1B2C3D4E5', 42);
    expect(repo.findMemberByCardCode).toHaveBeenCalledWith('A1B2C3D4E5', undefined);
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

  it('score de la tablette → combat club terminé (saisie arbitre), autres matchs ignorés', async () => {
    const { onClubRemoteFinish } = await import('./clubHandlers');
    const club = {
      getBout: vi.fn((id: string) => (id === 'b1' ? { id, status: 'in_progress' } : null)),
      finishBout: vi.fn(),
    };
    const db = { club } as unknown as DatabaseManager;
    const rec = { arenaId: 'arena1', arenaNumber: 1, weapon: 'E', finishedAt: '' };
    onClubRemoteFinish(db, { ...rec, id: 'club:b1', scoreA: 5, scoreB: 2, durationSec: 90 });
    onClubRemoteFinish(db, { ...rec, id: 'training-x', scoreA: 1, scoreB: 0, durationSec: 1 });
    expect(club.finishBout).toHaveBeenCalledTimes(1);
    expect(club.finishBout).toHaveBeenCalledWith('b1', {
      scoreA: 5,
      scoreB: 2,
      entryMode: 'referee',
      duration: 90,
    });
  });
});
