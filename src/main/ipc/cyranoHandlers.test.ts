/**
 * Handlers IPC Cyrano — table des pistes par épreuve (#1829) ou partagée par la journée (#1878).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
  },
}));

import { registerCyranoHandlers, dayPistesKey } from './cyranoHandlers';

type Row = { piste: string; config: Record<string, unknown> };

function setup(dayOf: Record<string, string>) {
  const tables = new Map<string, Row[]>();
  const db = {
    getCyranoPistes: (key: string) => tables.get(key) ?? [],
    replaceCyranoPistes: (key: string, rows: Row[]) => void tables.set(key, rows),
    eventDays: {
      getCompetitionDayId: (id: string) => dayOf[id] ?? null,
      getDay: (id: string) => ({ id, name: `Journée ${id}` }) as never,
    },
  };
  const pisteHub = { getRoutes: vi.fn(() => ({ '3': 'comp-b' })) };
  registerCyranoHandlers({ cyranoServer: {} as never, pisteHub: pisteHub as never, db });
  const call = (channel: string, ...args: unknown[]) => handlers.get(channel)!({}, ...args);
  return { tables, call };
}

describe('cyranoHandlers — table des pistes', () => {
  beforeEach(() => handlers.clear());

  it('épreuve hors journée : table propre à l’épreuve', () => {
    const { tables, call } = setup({});
    call('cyrano:savePistes', 'comp-a', [{ piste: '1', arena: 1 }]);
    expect(tables.get('comp-a')).toHaveLength(1);
    expect(call('cyrano:loadPistes', 'comp-a')).toEqual([{ piste: '1', arena: 1 }]);
    expect(call('cyrano:getPistesScope', 'comp-a')).toBeNull();
  });

  it('épreuves d’une même journée : une seule table, partagée', () => {
    const { tables, call } = setup({ 'comp-a': 'd1', 'comp-b': 'd1' });
    call('cyrano:savePistes', 'comp-a', [{ piste: '3', arena: 3 }]);
    expect(tables.get(dayPistesKey('d1'))).toHaveLength(1);
    expect(tables.has('comp-a')).toBe(false);
    expect(call('cyrano:loadPistes', 'comp-b')).toEqual([{ piste: '3', arena: 3 }]);
    expect(call('cyrano:getPistesScope', 'comp-b')).toEqual({
      dayId: 'd1',
      dayName: 'Journée d1',
    });
  });

  it('journée encore vide : la table existante de l’épreuve est reprise', () => {
    const { tables, call } = setup({ 'comp-a': 'd1' });
    tables.set('comp-a', [{ piste: '2', config: { piste: '2', arena: 2 } }]);
    expect(call('cyrano:loadPistes', 'comp-a')).toEqual([{ piste: '2', arena: 2 }]);
  });

  it('épreuve suivie par piste', () => {
    const { call } = setup({});
    expect(call('cyrano:getRoutes')).toEqual({ '3': 'comp-b' });
  });

  it('entrées invalides refusées', () => {
    const { call } = setup({});
    expect(call('cyrano:loadPistes', 42)).toEqual([]);
    expect(call('cyrano:getPistesScope', '')).toBeNull();
    expect(call('cyrano:savePistes', 'comp-a', 'x')).toBe(false);
  });
});
