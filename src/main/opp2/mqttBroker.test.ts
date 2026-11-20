import { describe, it, expect, afterEach } from 'vitest';
import { MqttBroker } from './mqttBroker';
import { MqttClient } from './mqttClient';

async function until(cond: () => boolean, ms = 5000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('délai dépassé');
    await new Promise(r => setTimeout(r, 10));
  }
}

describe('broker MQTT intégré (#1960)', () => {
  let broker: MqttBroker;
  const clients: MqttClient[] = [];
  const client = async (
    port: number,
    extra: Partial<ConstructorParameters<typeof MqttClient>[0]> = {}
  ) => {
    const c = new MqttClient({ port, clientId: `c${clients.length}`, ...extra });
    clients.push(c);
    await c.connect();
    return c;
  };

  afterEach(async () => {
    for (const c of clients.splice(0)) c.destroy();
    await broker?.stop();
  });

  it('messages retenus livrés à l’abonnement, réseau et interne', async () => {
    broker = new MqttBroker({ host: '127.0.0.1' });
    const port = await broker.start(0);
    const pub = await client(port);
    await pub.publish('openpiste/3/apparatus/state', '{"state":"W"}', { qos: 1, retain: true });
    const sub = await client(port);
    const got: [string, string, boolean][] = [];
    sub.on('message', (t, p, r) => got.push([t, p.toString(), r]));
    await sub.subscribe('openpiste/+/apparatus/#');
    await until(() => got.length === 1);
    expect(got[0]).toEqual(['openpiste/3/apparatus/state', '{"state":"W"}', true]);

    const local: string[] = [];
    broker.subscribe('openpiste/3/#', (t, _p, m) => local.push(`${t}:${m.retained}`));
    expect(local).toEqual(['openpiste/3/apparatus/state:true']);

    // Publication interne → abonné réseau (drapeau retain à 0 en direct)
    broker.publish('openpiste/3/apparatus/score', '{}', { qos: 1, retain: true });
    await until(() => got.length === 2);
    expect(got[1]).toEqual(['openpiste/3/apparatus/score', '{}', false]);
    // Retenu effacé par une charge vide
    broker.publish('openpiste/3/apparatus/score', '', { retain: true });
    expect(broker.getRetained('openpiste/3/apparatus/score')).toBeUndefined();
  });

  it('dernière volonté publiée sur coupure brutale, pas sur DISCONNECT', async () => {
    broker = new MqttBroker({ host: '127.0.0.1' });
    const port = await broker.start(0);
    const topic = 'openpiste/3/apparatus/connection';
    const will = { topic, payload: '{"online":false}', qos: 1 as const, retain: true };
    const a = await client(port, { clientId: 'a', will });
    a.end();
    await until(() => broker.getClients().length === 0);
    expect(broker.getRetained(topic)).toBeUndefined();
    const b = await client(port, { clientId: 'b', will });
    b.destroy();
    await until(() => broker.getRetained(topic) !== undefined);
    expect(broker.getRetained(topic)?.toString()).toBe('{"online":false}');
  });

  it('authentification et droit de publication par rôle', async () => {
    broker = new MqttBroker({
      host: '127.0.0.1',
      authenticate: (info, pw) => info.username === 'piste-3' && pw?.toString() === 'ok',
      authorizePublish: (info, topic) =>
        topic.startsWith(`openpiste/3/apparatus/`) && info.username === 'piste-3',
    });
    const port = await broker.start(0);
    await expect(client(port, { username: 'piste-3', password: 'non' })).rejects.toThrow(
      'CONNACK 5'
    );
    const dev = await client(port, { username: 'piste-3', password: 'ok' });
    const errors: string[] = [];
    broker.on('clientError', (_i, r) => errors.push(r));
    await dev.publish('openpiste/3/software/control', '{"command":"ACK"}', { qos: 1 });
    await dev.publish('openpiste/3/apparatus/state', '{"state":"F"}', { qos: 1, retain: true });
    expect(errors).toEqual(['publication refusée sur openpiste/3/software/control']);
    expect(broker.getRetained('openpiste/3/apparatus/state')?.toString()).toBe('{"state":"F"}');
  });

  it('paquet invalide : connexion coupée', async () => {
    broker = new MqttBroker({ host: '127.0.0.1' });
    const port = await broker.start(0);
    const c = await client(port);
    const closed = new Promise<void>(r => c.on('close', () => r()));
    (c as unknown as { socket: import('net').Socket }).socket.write(Buffer.from([0xf0, 0x00]));
    await closed;
  });
});
