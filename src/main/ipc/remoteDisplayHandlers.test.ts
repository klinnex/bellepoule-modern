import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();

vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: (...args: any[]) => any) => handlers.set(ch, fn) },
}));

import { registerRemoteDisplayHandlers } from './remoteDisplayHandlers';

describe('registerRemoteDisplayHandlers (#1341)', () => {
  beforeEach(() => {
    handlers.clear();
    registerRemoteDisplayHandlers({ getMainWindow: () => null });
  });

  it('enregistre les canaux écrans / notes / signature', () => {
    for (const ch of [
      'remote:updateKioskViews',
      'remote:updateKioskTheme',
      'remote:updateArenaScreenTheme',
      'remote:setArenaPassword',
      'remote:setOrgNote',
      'remote:clearOrgNote',
      'remote:acknowledgeDTCall',
      'remote:requestMatchSignature',
    ]) {
      expect(handlers.has(ch)).toBe(true);
    }
  });

  it('clearOrgNote : serveur absent', async () => {
    const res = await handlers.get('remote:clearOrgNote')!({}, 'inconnu');
    expect(res.success).toBe(false);
  });
});
