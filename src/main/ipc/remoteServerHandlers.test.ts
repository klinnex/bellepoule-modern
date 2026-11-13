import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  ipcMain: { handle: (ch: string, fn: (...args: any[]) => any) => handlers.set(ch, fn) },
}));
vi.mock('../remoteScoreServer', () => ({ RemoteScoreServer: class {} }));
vi.mock('../certManager', () => ({ ensureCert: vi.fn() }));

import { registerRemoteServerHandlers } from './remoteServerHandlers';
import { remoteServers, usedPorts } from '../remoteRegistry';

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
      'remote:reloadServer',
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

  describe('reloadServer (rechargement à chaud)', () => {
    const fakeServer = (port: number) => {
      const s = {
        port,
        restart: vi.fn(async (p: number) => {
          s.port = p;
        }),
        getServerUrl: () => `http://10.0.0.1:${s.port}`,
        getLocalIPAddress: () => '10.0.0.1',
      };
      return s;
    };
    const register = (id: string, port: number) => {
      const server = fakeServer(port);
      remoteServers.set(id, { server: server as never, port, host: '0.0.0.0', useHttps: false });
      usedPorts.add(port);
      return server;
    };

    beforeEach(() => {
      remoteServers.clear();
      usedPorts.clear();
    });

    it('serveur absent', async () => {
      expect(await handlers.get('remote:reloadServer')!({}, 'inconnu', { port: 9000 })).toEqual({
        success: false,
        error: 'remote_not_started',
      });
    });

    it('port invalide refusé sans redémarrage', async () => {
      const server = register('c1', 8066);
      const res = await handlers.get('remote:reloadServer')!({}, 'c1', { port: 70000 });
      expect(res).toMatchObject({ success: false, error: 'port_invalid' });
      expect(server.restart).not.toHaveBeenCalled();
    });

    it('port d’un autre serveur refusé', async () => {
      register('c1', 8066);
      const server = register('c2', 8067);
      const res = await handlers.get('remote:reloadServer')!({}, 'c2', { port: 8066 });
      expect(res).toMatchObject({ success: false, error: 'port_in_use', port: 8066 });
      expect(server.restart).not.toHaveBeenCalled();
    });

    it('change port et interface, met à jour le registre (même instance conservée)', async () => {
      const server = register('c1', 8066);
      const res = await handlers.get('remote:reloadServer')!({}, 'c1', {
        port: 9000,
        host: '10.0.0.1',
      });
      expect(server.restart).toHaveBeenCalledWith(9000, '10.0.0.1', undefined);
      expect(res).toMatchObject({ success: true, serverInfo: { port: 9000, useHttps: false } });
      expect(remoteServers.get('c1')).toMatchObject({ server, port: 9000, host: '10.0.0.1' });
      expect(usedPorts.has(8066)).toBe(false);
      expect(usedPorts.has(9000)).toBe(true);
    });

    it('échec du redémarrage : registre inchangé', async () => {
      const server = register('c1', 8066);
      server.restart.mockRejectedValueOnce(
        Object.assign(new Error('busy'), { code: 'EADDRINUSE' })
      );
      const res = await handlers.get('remote:reloadServer')!({}, 'c1', { port: 9001 });
      expect(res).toMatchObject({ success: false, error: 'port_in_use', port: 9001 });
      expect(remoteServers.get('c1')?.port).toBe(8066);
      expect(usedPorts.has(8066)).toBe(true);
    });
  });
});
