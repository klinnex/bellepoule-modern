import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();
const send = vi.fn();

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send } }] },
  ipcMain: {
    handle: (ch: string, fn: (...args: any[]) => any) => handlers.set(ch, fn),
    on: vi.fn(),
  },
}));

import { registerDbHandlers, emitCompetitionEvent } from './dbHandlers';

describe('bus d’événements db (#1298)', () => {
  const db = {
    updateMatch: vi.fn(),
    createMatch: vi.fn(() => ({ id: 'm1' })),
    addFencer: vi.fn(() => ({ id: 'f1' })),
  };

  beforeEach(() => {
    handlers.clear();
    send.mockClear();
    registerDbHandlers({
      db: db as never,
      remoteServers: new Map(),
      stopRemoteServer: () => false,
    });
  });

  it('emitCompetitionEvent diffuse aux fenêtres', () => {
    emitCompetitionEvent('matches:changed', 'c1');
    expect(send).toHaveBeenCalledWith('competition:event', {
      type: 'matches:changed',
      competitionId: 'c1',
    });
  });

  it('db:updateMatch et db:createMatch émettent matches:changed', async () => {
    await handlers.get('db:updateMatch')!({}, 'm1', { status: 'x' });
    await handlers.get('db:createMatch')!({}, {}, 'p1');
    expect(send.mock.calls.filter(c => c[1].type === 'matches:changed')).toHaveLength(2);
  });

  it('db:addFencer émet fencers:changed pour la compétition', async () => {
    await handlers.get('db:addFencer')!({}, 'c1', {});
    expect(send).toHaveBeenCalledWith('competition:event', {
      type: 'fencers:changed',
      competitionId: 'c1',
    });
  });
});
