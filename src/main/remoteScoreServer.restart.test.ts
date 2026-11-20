/**
 * Rechargement à chaud du vrai RemoteScoreServer : session et pistes conservées.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as net from 'net';

vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd(), getPath: () => '/tmp', isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

import { RemoteScoreServer } from './remoteScoreServer';

const db = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === 'onChange') return () => () => {};
      if (prop === 'getCompetition') return () => ({ id: 'comp-1', weapon: 'E', settings: {} });
      if (String(prop).startsWith('get')) return () => [];
      return () => null;
    },
  }
) as never;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

const reachable = (port: number) =>
  fetch(`http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling`).then(
    r => r.status,
    () => 'down' as const
  );

let server: RemoteScoreServer | null = null;
afterEach(() => {
  server?.stop();
  server = null;
});

describe('RemoteScoreServer.restart', () => {
  it('nouveau port, session et pistes conservées', async () => {
    const [p1, p2] = [await freePort(), await freePort()];
    server = new RemoteScoreServer(db, p1, '127.0.0.1');
    await server.start();
    await server.startSession('comp-1', 3, []);
    expect(await reachable(p1)).toBe(200);

    await server.restart(p2, '127.0.0.1');

    expect(server.getServerUrl()).toBe(`http://127.0.0.1:${p2}`);
    expect(await reachable(p2)).toBe(200);
    expect(await reachable(p1)).toBe('down');
    expect(server.hasSession()).toBe(true);
    expect(server.getArenaCount()).toBe(3);
  });
});
