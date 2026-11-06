import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  ipcMain: { handle: (ch: string, fn: (...args: any[]) => any) => handlers.set(ch, fn) },
}));
vi.mock('../remoteScoreServer', () => ({ RemoteScoreServer: class {} }));
vi.mock('../certManager', () => ({ ensureCert: vi.fn() }));

import { registerRemoteSettingsHandlers } from './remoteSettingsHandlers';

describe('registerRemoteSettingsHandlers (#1341)', () => {
  beforeEach(() => {
    handlers.clear();
    registerRemoteSettingsHandlers({ db: {} as never });
  });

  it('enregistre les canaux de réglages', () => {
    for (const ch of [
      'remote:updateLogo',
      'remote:setWallpaper',
      'remote:changePort',
      'remote:setRegistrationEnabled',
      'remote:setCheckinEnabled',
      'remote:setCheckinPassword',
      'remote:setTrainerEnabled',
      'remote:setTrainerPassword',
    ]) {
      expect(handlers.has(ch)).toBe(true);
    }
  });

  it('setCheckinEnabled : serveur absent', async () => {
    const res = await handlers.get('remote:setCheckinEnabled')!({}, 'inconnu', true);
    expect(res.success).toBe(false);
  });
});
