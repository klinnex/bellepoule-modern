/**
 * Rechargement à chaud du serveur distant : nouvelle écoute, même Express / Socket.IO.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as net from 'net';
import { createHttpListener, createHttpStack } from './serverSetup';
import { restartServer, type LifecycleContext } from './lifecycle';

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

async function status(port: number): Promise<number | 'down'> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/ping`);
    return res.status;
  } catch {
    return 'down';
  }
}

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function makeCtx(port: number) {
  const stack = createHttpStack(undefined, () => false);
  stack.app.get('/ping', (_req, res) => {
    res.status(204).end();
  });
  const ctx = {
    app: stack.app,
    server: stack.server,
    io: stack.io,
    port,
    host: '127.0.0.1',
    useHttps: false,
    tlsOptions: undefined,
    arenaCount: 2,
    getServerUrl: () => `http://127.0.0.1:${ctx.port}`,
  };
  await new Promise<void>(r => stack.server.listen(port, '127.0.0.1', () => r()));
  cleanups.push(
    () =>
      new Promise<void>(r => {
        ctx.io.close();
        ctx.server.close(() => r());
      })
  );
  return ctx;
}

describe('restartServer (rechargement à chaud)', () => {
  it('bascule sur le nouveau port et libère l’ancien', async () => {
    const [p1, p2] = [await freePort(), await freePort()];
    const ctx = await makeCtx(p1);
    expect(await status(p1)).toBe(204);

    await restartServer(ctx as unknown as LifecycleContext, { port: p2, host: '127.0.0.1' }, tls =>
      createHttpListener(ctx.app, tls)
    );

    expect(ctx.port).toBe(p2);
    expect(await status(p2)).toBe(204);
    expect(await status(p1)).toBe('down');
  });

  it('port occupé : rejette et rétablit l’ancienne écoute', async () => {
    const [p1, busy] = [await freePort(), await freePort()];
    const blocker = net.createServer();
    await new Promise<void>(r => blocker.listen(busy, '127.0.0.1', () => r()));
    cleanups.push(() => new Promise<void>(r => blocker.close(() => r())));
    const ctx = await makeCtx(p1);

    await expect(
      restartServer(ctx as unknown as LifecycleContext, { port: busy, host: '127.0.0.1' }, tls =>
        createHttpListener(ctx.app, tls)
      )
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });

    expect(ctx.port).toBe(p1);
    expect(await status(p1)).toBe(204);
  });
});
