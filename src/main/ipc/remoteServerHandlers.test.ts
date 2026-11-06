import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  ipcMain: { handle: (ch: string, fn: (...args: any[]) => any) => handlers.set(ch, fn) },
}));
vi.mock('../remoteScoreServer', () => ({ RemoteScoreServer: class {} }));
vi.mock('../certManager', () => ({ ensureCert: vi.fn() }));

import { registerRemoteServerHandlers } from './remoteServerHandlers';

describe('registerRemoteServerHandlers (#1341)', () => {
  beforeEach(() => {
    handlers.clear();
    registerRemoteServerHandlers({ db: {} as never, getMainWindow: () => null });
  });

  it('enregistre les canaux de cycle de vie du serveur', () => {
    for (const ch of [
      'remote:getNetworkInterfaces',
      'remote:startServer',
      'remote:stopServer',
      'remote:getServerInfo',
      'remote:getCertFingerprint',
    ]) {
      expect(handlers.has(ch)).toBe(true);
    }
  });

  it('getServerInfo / stopServer : serveur absent', async () => {
    expect(await handlers.get('remote:getServerInfo')!({}, 'inconnu')).toEqual({
      success: false,
      error: 'remote_not_started',
    });
    expect(await handlers.get('remote:stopServer')!({}, 'inconnu')).toEqual({
      success: false,
      error: 'remote_not_started',
    });
  });

  it('getNetworkInterfaces propose toujours 0.0.0.0', async () => {
    const res = await handlers.get('remote:getNetworkInterfaces')!({});
    expect(res.success).toBe(true);
    expect(res.interfaces[0].address).toBe('0.0.0.0');
  });
});
