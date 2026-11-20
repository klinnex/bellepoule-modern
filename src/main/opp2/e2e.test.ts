/**
 * Bout en bout OPP2 (#1960) : broker MQTT intégré (TCP réel, boucle locale) ↔ appareil simulé
 * (client MQTT) sur la piste 3 ↔ Opp2PisteDriver ↔ MultiPisteDriver (avec Cyrano) ↔ PisteHub ↔
 * RemoteScoreServer. Scénario : affichage → assaut → touches → END → ACK → NEXT ; END à égalité
 * → NAK ; coupure → hors ligne ; retour → reprise depuis les messages retenus.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getAppPath: () => '/opt/app', getPath: () => '/tmp', isPackaged: false },
  BrowserWindow: class {},
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn(), showMessageBox: vi.fn() },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
  net: { request: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => false },
  screen: { getAllDisplays: () => [], getPrimaryDisplay: () => ({}) },
  session: { defaultSession: {} },
  shell: { openExternal: vi.fn() },
}));
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(''),
  readdirSync: vi.fn().mockReturnValue([]),
}));
vi.mock('socket.io', () => ({
  Server: vi.fn().mockImplementation(function () {
    return { on: vi.fn(), emit: vi.fn(), to: vi.fn().mockReturnThis() };
  }),
}));
vi.mock('../ipc/dbHandlers', async importOriginal => ({
  ...(await importOriginal<typeof import('../ipc/dbHandlers')>()),
  emitCompetitionEvent: vi.fn(),
}));
vi.mock('http', () => ({
  createServer: vi
    .fn()
    .mockReturnValue({ listen: vi.fn(), close: vi.fn(), on: vi.fn(), once: vi.fn() }),
}));

import { RemoteScoreServer } from '../remoteScoreServer';
import { PisteHub } from '../piste/pisteHub';
import { MultiPisteDriver } from '../piste/multiDriver';
import { CyranoServer } from '../cyrano/server';
import { CyranoPisteDriver } from '../cyrano/driver';
import { MqttBroker } from './mqttBroker';
import { MqttClient } from './mqttClient';
import { Opp2PisteDriver } from './driver';

const ID = {
  ef: '7ca21969-e092-4bdc-a987-eac9844968b7',
  ab: '08f01fd6-ae32-4aac-930b-f23c2dc97543',
  de: 'f2fde892-1b0c-4e7a-9d55-3c1f0a6b2e11',
  bc: '7b156a61-5d2e-4c3b-8f1a-0e9d7c6b5a42',
};
const fencer = (id: string, last: string) => ({
  id,
  firstName: last,
  lastName: last,
  nationality: 'FRA',
});
const POOL = 'ecc0b9cc-2e60-4105-8582-4ec65a409902';
const pm = (n: number, a: string, b: string) => ({
  id: `m${n}-0000-4000-8000-000000000000`,
  poolId: POOL,
  number: n,
  fencerA: fencer(a, a.slice(0, 2)),
  fencerB: fencer(b, b.slice(0, 2)),
  status: 'not_started',
});

const mockDb = {
  getCompetition: vi.fn().mockReturnValue({ id: 'comp-1', weapon: 'E', settings: {} }),
  getPendingMatches: vi.fn().mockReturnValue([]),
  getCompetitionPools: vi.fn().mockReturnValue([]),
  getMatchesByPool: vi.fn().mockReturnValue([]),
  getPoolFencers: vi.fn().mockReturnValue([]),
  getPoolCount: vi.fn().mockReturnValue(1),
  getMatch: vi.fn((id: string) => ({ id, scoreA: { value: 0 }, scoreB: { value: 0 } })),
  updateMatch: vi.fn(),
  updateMatchTiming: vi.fn(),
  saveCard: vi.fn(),
  clearArenaEvents: vi.fn(),
  saveTouch: vi.fn(),
  saveArenaExit: vi.fn(),
  logScoreChange: vi.fn(),
  saveArenaState: vi.fn(),
  getArenaState: vi.fn().mockReturnValue(null),
  getFencersByCompetition: vi.fn().mockReturnValue([]),
  getRefereesByCompetition: vi.fn().mockReturnValue([]),
  updateFencer: vi.fn(),
  logRemoteEvent: vi.fn(),
  getFencer: vi.fn().mockReturnValue(null),
  updateReferee: vi.fn(),
  getSessionState: vi.fn().mockReturnValue(null),
};

async function until(cond: () => boolean, ms = 15000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('délai dépassé en attendant le message MQTT');
    await new Promise(r => setTimeout(r, 15));
  }
}

/** Appareil OPP2 simulé : reçoit `software/*`, publie `apparatus/*` (QoS 1, retenus). */
class Opp2Apparatus {
  readonly client: MqttClient;
  readonly received: Record<string, Record<string, unknown>[]> = {};
  private seq = 0;
  score = { right: 0, left: 0 };

  constructor(
    port: number,
    readonly piste: string
  ) {
    this.client = new MqttClient({
      port,
      clientId: `apparatus-${piste}`,
      will: { topic: this.topic('connection'), payload: '{"online":false}', qos: 1, retain: true },
    });
  }
  topic(m: string): string {
    return `openpiste/${this.piste}/apparatus/${m}`;
  }
  async start(): Promise<void> {
    this.client.on('message', (topic, payload) => {
      const m = topic.split('/')[3];
      (this.received[m] ??= []).push(JSON.parse(payload.toString()));
    });
    await this.client.connect();
    await this.client.subscribe(`openpiste/${this.piste}/software/#`);
    await this.send('connection', { online: true, device: 'sim' });
  }
  last(m: string): Record<string, unknown> | undefined {
    return this.received[m]?.[this.received[m].length - 1];
  }
  count(m: string): number {
    return this.received[m]?.length ?? 0;
  }
  send(m: string, body: object, retain = m !== 'control'): Promise<void> {
    const payload = { protocol: 'OPP2', version: '1.0', seq: ++this.seq, ts: Date.now(), ...body };
    return this.client.publish(this.topic(m), JSON.stringify(payload), { qos: 1, retain });
  }
  async touch(side: 'right' | 'left'): Promise<void> {
    this.score[side]++;
    await this.publishScore();
  }
  publishScore(): Promise<void> {
    const s = (n: number) => ({
      score: n,
      status: 'U',
      yellow_card: false,
      red_cards: 0,
      black_card: false,
    });
    return this.send('score', {
      right: s(this.score.right),
      left: s(this.score.left),
      priority: 'N',
    });
  }
}

describe(
  'OPP2 bout en bout : broker MQTT réel, appareil simulé (#1960)',
  { timeout: 30_000 },
  () => {
    let broker: MqttBroker;
    let remote: RemoteScoreServer;
    let device: Opp2Apparatus;
    let driver: Opp2PisteDriver;
    let hub: PisteHub;
    let port: number;
    const arena = () => remote.getArena('arena3')!;
    const fencerIds = () => {
      const f = device.last('fencers') as {
        right: { fencer: { id: string } };
        left: { fencer: { id: string } };
      };
      return [f?.right.fencer.id, f?.left.fencer.id];
    };

    beforeAll(async () => {
      remote = new RemoteScoreServer(mockDb as never, 8066);
      vi.spyOn(
        remote as never as { loadSessionReferees: () => unknown },
        'loadSessionReferees'
      ).mockReturnValue([]);
      broker = new MqttBroker({ host: '127.0.0.1' });
      port = await broker.start(0);
      driver = new Opp2PisteDriver(broker);
      driver.setPistes([{ piste: '3', arena: 3 }]);
      driver.start();
      // Piste Cyrano déclarée dans la même journée : coexistence des deux protocoles
      const cyrano = new CyranoServer({ host: '127.0.0.1', port: 0, helloIntervalMs: 60_000 });
      cyrano.setPistes([{ piste: '1', ip: '127.0.0.1', port: 50100, arena: 1 }]);
      hub = new PisteHub(
        new MultiPisteDriver([new CyranoPisteDriver(cyrano), driver]),
        () => remote,
        {
          coordsSource: {
            getMatch: id => ({ number: Number(id.slice(1, 2)) || undefined }),
            getCompetitionPools: () => [{ id: POOL, name: 'Poule 2' }],
          },
        }
      );
      hub.attach();
      remote.cyranoHook = (arenaId, u) => hub.onArenaUpdate(arenaId, u);

      device = new Opp2Apparatus(port, '3');
      await device.start();
      await until(() => driver.findPiste('3')?.status === 'online');
      await device.send('state', { state: 'W' });

      await remote.startSession('comp-1', 3, [
        { __poolFencers: true, poolId: POOL, poolNumber: 1, strip: 3, fencers: [] },
        pm(1, ID.ef, ID.ab),
        pm(2, ID.de, ID.bc),
      ] as never);
      await until(() => fencerIds()[0] === ID.ef);
    });

    afterAll(async () => {
      device?.client.destroy();
      driver?.stop();
      await broker?.stop();
    });

    it('affichage reçu par l’appareil : tireurs (Id complets), arme, poule et match', () => {
      expect(fencerIds()).toEqual([ID.ef, ID.ab]);
      expect(device.last('match')).toMatchObject({
        weapon: 'E',
        type: 'I',
        phase_type: 'pool',
        match: 1,
      });
      expect(arena().currentMatch?.id).toBe(pm(1, ID.ef, ID.ab).id);
    });

    it('assaut et touches : l’arène suit l’appareil', async () => {
      await device.send('state', { state: 'F' });
      await device.touch('right');
      await device.touch('right');
      await device.touch('left');
      await until(() => arena().currentMatch?.scoreA === 2 && arena().currentMatch?.scoreB === 1);
      expect(arena().status).toBe('in_progress');
    });

    it('END valide → ACK, match terminé ; NEXT → match suivant', async () => {
      await device.send('state', { state: 'H' });
      await device.send('control', { command: 'END' });
      await device.send('state', { state: 'E' });
      await until(() => device.count('control') >= 1);
      expect(device.last('control')).toMatchObject({ command: 'ACK' });
      expect(device.count('control')).toBe(1);
      await until(() => arena().status === 'finished');
      expect(arena().currentMatch).toMatchObject({ scoreA: 2, scoreB: 1 });
      await device.send('state', { state: 'W' });
      device.score = { right: 0, left: 0 };
      await device.publishScore();
      await device.send('control', { command: 'NEXT' });
      await until(() => fencerIds()[0] === ID.de);
      expect(arena().currentMatch?.id).toBe(pm(2, ID.de, ID.bc).id);
    });

    it('END à égalité sans priorité → NAK, match non terminé', async () => {
      await device.send('state', { state: 'F' });
      await device.touch('right');
      await device.touch('left');
      await until(() => arena().currentMatch?.scoreA === 1 && arena().currentMatch?.scoreB === 1);
      const before = device.count('control');
      await device.send('state', { state: 'H' });
      await device.send('control', { command: 'END' });
      await until(() => device.count('control') > before);
      expect(device.last('control')).toMatchObject({ command: 'NAK' });
      expect(arena().status).not.toBe('finished');
    });

    it('coupure : hors ligne (dernière volonté) ; retour : état repris des messages retenus', async () => {
      await device.send('state', { state: 'H' });
      device.client.destroy();
      await until(() => driver.findPiste('3')?.status === 'offline');
      expect(arena().cyrano).toMatchObject({ online: false });
      // L'appareil revient (nouvelle session, compteur repart à 1) : touche donnée hors ligne
      const back = new Opp2Apparatus(port, '3');
      back.score = { right: 2, left: 1 };
      await back.start();
      await back.send('state', { state: 'F' });
      await back.publishScore();
      await until(() => driver.findPiste('3')?.status === 'online');
      await until(() => arena().currentMatch?.scoreA === 2);
      expect(arena().currentMatch).toMatchObject({ scoreA: 2, scoreB: 1 });
      back.client.destroy();
    });
  }
);
