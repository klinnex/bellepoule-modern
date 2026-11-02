import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();

vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: (...args: any[]) => any) => handlers.set(ch, fn) },
}));
vi.mock('../remoteScoreServer', () => ({ RemoteScoreServer: class {} }));

import { registerRemoteMatchHandlers } from './remoteMatchHandlers';

const CHANNELS = [
  'remote:startSession',
  'remote:updateMatchArena',
  'remote:updatePoolFencers',
  'remote:setActiveWave',
  'remote:syncPoolMatches',
  'remote:assignPools',
  'remote:refreshDeMatches',
  'remote:resetPoolMatch',
  'remote:finishPoolMatch',
  'remote:setTeamArenaMatch',
  'remote:clearTeamArenaMatch',
];

describe('registerRemoteMatchHandlers (#1341)', () => {
  beforeEach(() => {
    handlers.clear();
    registerRemoteMatchHandlers();
  });

  it('enregistre tous les canaux de session / rencontres', () => {
    for (const ch of CHANNELS) expect(handlers.has(ch)).toBe(true);
  });

  it('refuse proprement quand le serveur n’est pas démarré', async () => {
    const res = await handlers.get('remote:startSession')!({}, 'inconnu', 4);
    expect(res).toEqual({ success: false, error: 'remote_not_started' });
    const res2 = await handlers.get('remote:updateMatchArena')!({}, 'inconnu', 'm1', null, 1);
    expect(res2.success).toBe(false);
  });
});
