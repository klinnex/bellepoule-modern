import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/bp-inexistant' },
  ipcMain: { handle: (ch: string, fn: (...args: any[]) => any) => handlers.set(ch, fn) },
}));

import { registerRemoteClientsHandlers } from './remoteClientsHandlers';

describe('registerRemoteClientsHandlers (#1341)', () => {
  beforeEach(() => {
    handlers.clear();
    registerRemoteClientsHandlers();
  });

  it('enregistre les canaux clients et synthèse vocale', () => {
    for (const ch of [
      'remote:getConnectedClients',
      'remote:sendClientCommand',
      'remote:broadcastCommand',
      'remote:renameClient',
      'remote:identifyClient',
      'remote:setClientKioskMode',
      'remote:setTtsConfig',
      'app:getTtsConfig',
      'app:getLogo',
    ]) {
      expect(handlers.has(ch)).toBe(true);
    }
  });

  it('getConnectedClients : serveur absent → liste vide', async () => {
    const res = await handlers.get('remote:getConnectedClients')!({}, 'inconnu');
    expect(res).toEqual({ success: true, clients: [] });
  });
});
