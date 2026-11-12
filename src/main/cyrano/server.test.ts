import { describe, it, expect, afterEach } from 'vitest';
import dgram from 'dgram';
import { CyranoServer } from './server';
import { parseCyrano } from './codec';

/** Appareil simulé : socket UDP local qui collecte les trames reçues. */
async function fakeApparatus() {
  const sock = dgram.createSocket('udp4');
  const received: string[] = [];
  const waiters: ((s: string) => void)[] = [];
  sock.on('message', buf => {
    const s = buf.toString('latin1');
    const w = waiters.shift();
    if (w) w(s);
    else received.push(s);
  });
  await new Promise<void>(r => sock.bind(0, '127.0.0.1', () => r()));
  return {
    port: sock.address().port,
    next: () =>
      new Promise<string>((resolve, reject) => {
        const queued = received.shift();
        if (queued !== undefined) return resolve(queued);
        const t = setTimeout(() => reject(new Error('timeout')), 2000);
        waiters.push(s => {
          clearTimeout(t);
          resolve(s);
        });
      }),
    send: (raw: string, port: number) =>
      new Promise<void>(r => sock.send(raw, port, '127.0.0.1', () => r())),
    close: () => new Promise<void>(r => sock.close(() => r())),
  };
}

describe('CyranoServer', () => {
  const cleanup: (() => Promise<void>)[] = [];
  afterEach(async () => {
    while (cleanup.length) await cleanup.pop()!();
  });

  it('start(port) écoute sur le port demandé, sans piste configurée', async () => {
    const probe = dgram.createSocket('udp4');
    await new Promise<void>(r => probe.bind(0, '127.0.0.1', () => r()));
    const wanted = probe.address().port;
    await new Promise<void>(r => probe.close(() => r()));
    const server = new CyranoServer({ host: '127.0.0.1' });
    cleanup.push(() => server.stop());
    expect(await server.start(wanted)).toBe(wanted);
    expect(server.running).toBe(true);
  });

  it('HELLO au démarrage, INFO/NEXT reçus, DISP/ACK envoyés', async () => {
    const app = await fakeApparatus();
    cleanup.push(app.close);
    const server = new CyranoServer({ port: 0, host: '127.0.0.1', compe: 'test-cmp' });
    server.setPistes([{ piste: '1', ip: '127.0.0.1', port: app.port, arena: 1 }]);
    cleanup.push(() => server.stop());
    const port = await server.start();
    expect(port).toBeGreaterThan(0);

    expect(await app.next()).toBe('|EFP1.1|HELLO|1|test-cmp|%|');

    const nextP = new Promise(r => server.once('next', (p, m) => r([p.arena, m.command])));
    await app.send('|EFP1|NEXT|1|test-cmp|%|', port);
    expect(await nextP).toEqual([1, 'NEXT']);

    // Version détectée : l'appareil parle EFP1, le serveur répond en EFP1
    server.sendDisp('1', {
      phase: '1',
      poulTab: '2',
      match: '3',
      right: { id: '7' },
      left: { id: '8' },
    });
    const disp = parseCyrano(await app.next())!;
    expect(disp).toMatchObject({ protocol: 'EFP1', command: 'DISP', piste: '1', match: '3' });

    const infoP = new Promise(r => server.once('info', (_p, m) => r(m.state)));
    await app.send('|EFP1|INFO|1|test-cmp||||||||||E|%|7|||5|U|%|8|||2|U|%|', port);
    expect(await infoP).toBe('E');

    expect(server.sendAck('1')).toBe(true);
    expect(await app.next()).toBe('|EFP1|ACK|1|test-cmp|%|');
    expect(server.sendNak('inconnue')).toBe(false);

    const [status] = server.getStatuses();
    expect(status).toMatchObject({ status: 'online', detectedProtocol: 'EFP1' });
    expect(status.lastInfo?.state).toBe('E');
  });

  it('ignore les IP non déclarées et les trames illisibles', () => {
    const server = new CyranoServer();
    server.setPistes([{ piste: '2', ip: '10.0.0.2' }]);
    const unknown: string[] = [];
    const infos: unknown[] = [];
    server.on('unknown', ip => unknown.push(ip));
    server.on('info', (_p, m) => infos.push(m));
    server.handle('|EFP1.1|INFO|2|x|%|', '10.0.0.99', 50100);
    server.handle('n importe quoi', '10.0.0.2', 50100);
    server.handle('|EFP1.1|INFO|2|x|%|', '::ffff:10.0.0.2', 50100);
    expect(unknown).toEqual(['10.0.0.99']);
    expect(infos).toHaveLength(1);
    expect(server.getLog().map(e => e.rejected ?? 'ok')).toEqual(['unknown_ip', 'malformed', 'ok']);
  });

  it('supervision : en ligne → incertain → hors ligne', () => {
    let now = 0;
    const server = new CyranoServer({ now: () => now });
    server.setPistes([{ piste: '3', ip: '10.0.0.3' }]);
    const seen: string[] = [];
    server.on('status', p => seen.push(p.status));
    expect(server.getStatuses()[0].status).toBe('never');
    server.handle('|EFP1.1|INFO|3|x||||||||||W|%|', '10.0.0.3', 50100);
    now = 25_000;
    server.tick();
    now = 41_000;
    server.tick();
    expect(seen).toEqual(['online', 'stale', 'offline']);
    // Reconfiguration : l'état de liaison est conservé
    server.setPistes([{ piste: '3b', ip: '10.0.0.3', arena: 4 }]);
    expect(server.getStatuses()[0]).toMatchObject({ piste: '3b', arena: 4, status: 'offline' });
  });

  it('journal borné', () => {
    const server = new CyranoServer({ logSize: 3 });
    for (let i = 0; i < 5; i++) server.handle(`|EFP1.1|NEXT|${i}|x|%|`, '10.9.9.9', 1);
    expect(server.getLog()).toHaveLength(3);
  });

  it('version imposée par piste', async () => {
    const app = await fakeApparatus();
    cleanup.push(app.close);
    const server = new CyranoServer({ port: 0, host: '127.0.0.1', defaultProtocol: 'EFP1.1' });
    server.setPistes([{ piste: '9', ip: '127.0.0.1', port: app.port, protocol: 'EFP1' }]);
    cleanup.push(() => server.stop());
    await server.start();
    expect(await app.next()).toBe('|EFP1|HELLO|9||%|');
  });
});
