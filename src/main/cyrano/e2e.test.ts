/**
 * Bout en bout Cyrano (#1829, point 6 du ticket) : appareil simulé en UDP réel (boucle locale)
 * ↔ CyranoServer réel ↔ PisteHub ↔ RemoteScoreServer. Aucun appel direct à `handle()` : chaque
 * trame traverse la pile UDP. Scénario : DISP → BEGIN → touches → VALIDATE → ACK → PREV → correction.
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
import { CyranoServer } from './server';
import { PisteHub } from './pisteHub';
// Appareil simulé (scripts/lib/cyranoDevice.js), testé ici car Vitest ne couvre que src/
const { CyranoDevice } = require('../../../scripts/lib/cyranoDevice.js');

const ID = {
  ef: '7ca21969-e092-4bdc-a987-eac9844968b7',
  ab: '08f01fd6-ae32-4aac-930b-f23c2dc97543',
  de: 'f2fde892-1b0c-4e7a-9d55-3c1f0a6b2e11',
  bc: '7b156a61-5d2e-4c3b-8f1a-0e9d7c6b5a42',
};
const short = (id: string) => id.slice(0, 8);
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

/**
 * Attend qu'une condition soit vraie (polling sur la vraie horloge, UDP réel). Délai large :
 * la suite complète tourne en parallèle et peut ralentir la boucle d'événements.
 */
async function until(cond: () => boolean, ms = 15000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('délai dépassé en attendant la trame UDP');
    await new Promise(r => setTimeout(r, 15));
  }
}

describe('Cyrano bout en bout : UDP réel, appareil simulé (#1829)', { timeout: 30_000 }, () => {
  let cyrano: CyranoServer;
  let remote: RemoteScoreServer;
  let device: InstanceType<typeof CyranoDevice>;
  let hub: PisteHub;
  let acks = 0;
  let naks = 0;
  const arena = () => remote.getArena('arena1')!;

  beforeAll(async () => {
    remote = new RemoteScoreServer(mockDb as any, 8066);
    vi.spyOn(remote as any, 'loadSessionReferees').mockReturnValue([]);
    cyrano = new CyranoServer({ host: '127.0.0.1', port: 0, helloIntervalMs: 60_000 });
    const serverPort = await cyrano.start(0);

    device = new CyranoDevice({ piste: '1', port: 0, serverPort, server: '127.0.0.1' });
    await device.start();
    const devicePort = device.sock.address().port;
    device.port = devicePort;
    cyrano.setPistes([{ piste: '1', ip: '127.0.0.1', port: devicePort, arena: 1 }]);

    hub = new PisteHub(cyrano, () => remote, {
      coordsSource: {
        getMatch: id => ({ number: Number(id.slice(1, 2)) || undefined }),
        getCompetitionPools: () => [{ id: POOL, name: 'Poule 2' }],
      },
    });
    hub.attach();
    const sendAck = cyrano.sendAck.bind(cyrano);
    vi.spyOn(cyrano, 'sendAck').mockImplementation(p => (++acks, sendAck(p)));
    const sendNak = cyrano.sendNak.bind(cyrano);
    vi.spyOn(cyrano, 'sendNak').mockImplementation(p => (++naks, sendNak(p)));
    remote.cyranoHook = (arenaId, u) => hub.onArenaUpdate(arenaId, u);

    await remote.startSession('comp-1', 1, [
      { __poolFencers: true, poolId: POOL, poolNumber: 1, strip: 1, fencers: [] },
      pm(1, ID.ef, ID.ab),
      pm(2, ID.de, ID.bc),
    ] as any);
    // Le DISP du premier match arrive à l'appareil par UDP
    await until(() => device.snapshot().right.id === short(ID.ef));
  });

  afterAll(async () => {
    device?.stop();
    await cyrano?.stop();
  });

  it('DISP reçu par UDP : tireurs, n° de poule et de match', () => {
    expect(device.snapshot()).toMatchObject({
      right: { id: short(ID.ef) },
      left: { id: short(ID.ab) },
      state: 'W',
    });
    expect(arena().currentMatch?.id).toBe(pm(1, ID.ef, ID.ab).id);
  });

  it('BEGIN, touches et cartons : l’arène suit l’appareil', async () => {
    device.command('begin');
    device.command('r+');
    device.command('r+');
    device.command('yl'); // carton jaune à gauche (ne change pas le score)
    await until(() => arena().currentMatch?.scoreA === 2);
    expect(arena().status).toBe('in_progress');
    expect(arena().currentMatch?.scoreB).toBe(0);
    await until(() => remote.arenaCards.get('arena1')?.cardsB?.includes('yellow') === true);
  });

  it('VALIDATE → ACK par UDP → match terminé', async () => {
    device.command('validate');
    await until(() => acks >= 1);
    expect(arena().currentMatch?.scoreA).toBe(2);
    expect(arena().status).toBe('finished');
    // L'ACK doit avoir atteint l'appareil (retour au repos) : PREV n'agit qu'en attente (W).
    // Sans cette attente, sous charge, la touche PREV suivante était ignorée (test instable).
    await until(() => device.snapshot().state === 'W');
  });

  it('PREV émis par l’appareil : le match terminé revient pour correction, scores et cartons conservés', async () => {
    device.command('prev');
    // Attendre le rappel (arène prête, match terminé remis) et le DISP reçu par l'appareil
    await until(
      () => arena().status === 'ready' && arena().currentMatch?.id === pm(1, ID.ef, ID.ab).id
    );
    await until(() => device.snapshot().right.score === 2);
    expect(arena().currentMatch).toMatchObject({ scoreA: 2, scoreB: 0, status: 'not_started' });
    expect(remote.arenaCards.get('arena1')?.cardsB).toContain('yellow');
  });

  it('égalité sans priorité : NAK, match non terminé', async () => {
    // Correction : BEGIN (le match rappelé repart en halte), 2-2 sur l'appareil, puis VALIDATE
    device.command('begin');
    device.command('l+');
    device.command('l+');
    await until(() => arena().currentMatch?.scoreB === 2);
    const before = naks;
    device.command('validate');
    await until(() => naks > before);
    expect(arena().status).not.toBe('finished');
  });
});
