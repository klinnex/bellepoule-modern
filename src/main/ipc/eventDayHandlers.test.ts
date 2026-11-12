import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Weapon } from '../../shared/types';

type Handler = (...args: unknown[]) => unknown;
const handlers = new Map<string, Handler>();

vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: Handler) => handlers.set(ch, fn) },
}));

import { registerEventDayHandlers } from './eventDayHandlers';
import type { DatabaseManager } from '../../database';

const assignment = (competitionId: string, refereeId: string) => ({
  dayRefereeId: 'dr1',
  competitionId,
  competitionTitle: competitionId,
  refereeId,
  kind: 'pool' as const,
  number: 1,
  strip: 2,
});

describe('handlers eventDay:* (#1714)', () => {
  const repo = {
    getDay: vi.fn(() => ({ competitionIds: ['c1', 'c2'] })),
    syncCompetition: vi.fn(() => ({ added: 1, updated: 2 })),
    setCompetitionDay: vi.fn(),
    listReferees: vi.fn(() => [{ id: 'dr1', weapons: [Weapon.EPEE] }]),
    getAssignments: vi.fn(() => [assignment('c1', 'r1'), assignment('c2', 'r2')]),
    getCompetitionWeapons: vi.fn(() => ({ c1: Weapon.FOIL, c2: Weapon.FOIL })),
    getCompetitionDayId: vi.fn(() => 'd1' as string | null),
    getLinks: vi.fn(() => ({ r1: 'dr1' })),
  };

  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    registerEventDayHandlers({ db: { eventDays: repo } as unknown as DatabaseManager });
  });

  const call = (ch: string, ...args: unknown[]) => handlers.get(ch)!({}, ...args);

  it('synchronise toutes les épreuves de la journée', () => {
    expect(call('eventDay:syncReferees', 'd1')).toEqual({ added: 2, updated: 4 });
    expect(repo.syncCompetition).toHaveBeenCalledTimes(2);
  });

  it('rattacher synchronise, détacher non', () => {
    expect(call('eventDay:setCompetitionDay', 'c1', 'd1')).toEqual({ added: 1, updated: 2 });
    expect(call('eventDay:setCompetitionDay', 'c1', null)).toEqual({ added: 0, updated: 0 });
    expect(repo.setCompetitionDay).toHaveBeenLastCalledWith('c1', null);
    expect(repo.syncCompetition).toHaveBeenCalledTimes(1);
  });

  it('vue d’ensemble : statut commun et conflits', () => {
    const o = call('eventDay:getOverview', 'd1') as {
      statuses: { state: string }[];
      conflicts: { kind: string }[];
    };
    expect(o.statuses[0].state).toBe('busy');
    expect(o.conflicts.map(c => c.kind)).toEqual(['multi_competition', 'weapon']);
  });

  it('occupé ailleurs : vide hors journée, sinon autres épreuves seulement', () => {
    expect(call('eventDay:getBusyElsewhere', 'c1')).toEqual({ r1: [assignment('c2', 'r2')] });
    repo.getCompetitionDayId.mockReturnValueOnce(null);
    expect(call('eventDay:getBusyElsewhere', 'c1')).toEqual({});
  });
});
