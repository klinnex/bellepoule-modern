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
    getMatch: vi.fn(() => ({ id: 'm1', poolId: 'p1', scoreA: { value: 5 }, scoreB: { value: 4 } })),
    logScoreChange: vi.fn(),
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

  it('db:updateMatch : motif de correction au journal, jamais écrit dans le match (#1996)', async () => {
    db.updateMatch.mockClear();
    db.logScoreChange.mockClear();
    const scoreA = { value: 3, isVictory: false };
    await handlers.get('db:updateMatch')!({}, 'm1', {
      scoreA,
      auditReason: '  Correction après tirage du tableau, tableau conservé  ',
    });
    expect(db.updateMatch).toHaveBeenCalledWith('m1', { scoreA });
    expect(db.logScoreChange).toHaveBeenCalledWith(
      expect.objectContaining({
        changedBy: 'correction',
        reason: 'Correction après tirage du tableau, tableau conservé',
      })
    );

    db.logScoreChange.mockClear();
    await handlers.get('db:updateMatch')!({}, 'm1', { scoreA });
    expect(db.logScoreChange).toHaveBeenCalledWith(expect.objectContaining({ changedBy: 'ui' }));
    expect(db.logScoreChange.mock.calls[0][0]).not.toHaveProperty('reason');
  });

  it('db:updateMatch : score déjà en base (écrit par recordScore) ni réécrit ni journalisé (#1980)', async () => {
    db.updateMatch.mockClear();
    db.logScoreChange.mockClear();
    db.getMatch.mockReturnValueOnce({
      id: 'm1',
      poolId: 'p1',
      scoreA: { value: 5, isVictory: true },
      scoreB: { value: 4 },
    } as never);
    await handlers.get('db:updateMatch')!({}, 'm1', {
      scoreA: { isVictory: true, value: 5 },
      scoreB: { value: 4 },
    });
    expect(db.updateMatch).not.toHaveBeenCalled();
    expect(db.logScoreChange).not.toHaveBeenCalled();
  });

  it('db:addFencer émet fencers:changed pour la compétition', async () => {
    await handlers.get('db:addFencer')!({}, 'c1', {});
    expect(send).toHaveBeenCalledWith('competition:event', {
      type: 'fencers:changed',
      competitionId: 'c1',
    });
  });
});
