/**
 * PisteHub — pistes partagées entre épreuves (#1878) : chaque piste suit l'épreuve de son
 * affectation en cours ; l'épreuve d'à côté n'atteint pas l'appareil tant que la piste est prise.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

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
import { PisteHub } from '../piste/pisteHub';
import { CyranoPisteDriver } from './driver';
import { buildCyrano, parseCyrano, type CyranoMessage } from './codec';

const ID = {
  a1: '7ca21969-e092-4bdc-a987-eac9844968b7',
  a2: '08f01fd6-ae32-4aac-930b-f23c2dc97543',
  b1: 'f2fde892-1b0c-4e7a-9d55-3c1f0a6b2e11',
  b2: '7b156a61-5d2e-4c3b-8f1a-0e9d7c6b5a42',
};
const short = (id: string) => id.slice(0, 8);
const fencer = (id: string) => ({ id, firstName: id.slice(0, 2), lastName: id.slice(0, 2) });

/** Base factice d'une épreuve (arme propre) */
function makeDb(competitionId: string, weapon: string) {
  return {
    getCompetition: vi.fn().mockReturnValue({ id: competitionId, weapon, settings: {} }),
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
}

/** Séance d'une épreuve : une poule d'un seul match sur la piste `strip` */
async function startEvent(
  server: RemoteScoreServer,
  competitionId: string,
  poolId: string,
  strip: number,
  a: string,
  b: string
) {
  await server.startSession(competitionId, 2, [
    { __poolFencers: true, poolId, poolNumber: 1, strip, fencers: [] },
    {
      id: `${poolId}-m1`,
      poolId,
      number: 1,
      fencerA: fencer(a),
      fencerB: fencer(b),
      status: 'not_started',
    },
  ] as never);
}

const DEVICE_IP = '10.0.0.1';

function frame(state: CyranoMessage['state'], right: string, left: string, rs = 0, ls = 0) {
  return buildCyrano({
    protocol: 'EFP1.1',
    command: 'INFO',
    piste: '1',
    compe: '',
    stopwatch: '3:00',
    priority: 'N',
    state,
    right: { id: short(right), score: rs, status: 'U' },
    left: { id: short(left), score: ls, status: 'U' },
  });
}

describe('PisteHub — pistes partagées entre épreuves (#1878)', () => {
  let fleuret: RemoteScoreServer;
  let epee: RemoteScoreServer;
  let cyrano: CyranoServer;
  let hub: PisteHub;
  let disps: { msg: CyranoMessage; compe?: string }[];
  let acks: number;
  const device = (raw: string) => cyrano.handle(raw, DEVICE_IP, 50101);
  const lastDisp = () => disps[disps.length - 1];

  beforeEach(async () => {
    vi.clearAllMocks();
    fleuret = new RemoteScoreServer(makeDb('comp-fleuret', 'F') as never, 8066);
    epee = new RemoteScoreServer(makeDb('comp-epee', 'E') as never, 8067);
    for (const s of [fleuret, epee])
      vi.spyOn(
        s as never as { loadSessionReferees: () => unknown },
        'loadSessionReferees'
      ).mockReturnValue([]);
    cyrano = new CyranoServer();
    cyrano.setPistes([{ piste: '1', ip: DEVICE_IP, port: 50101, arena: 1 }]);
    hub = new PisteHub(new CyranoPisteDriver(cyrano), () => [fleuret, epee]);
    hub.attach();
    disps = [];
    acks = 0;
    vi.spyOn(cyrano, 'sendDisp').mockImplementation((_p, d, compe) => {
      const msg = parseCyrano(
        buildCyrano({ ...d, protocol: 'EFP1.1', command: 'DISP', piste: '1', compe: '' })
      )!;
      disps.push({ msg, compe });
      return true;
    });
    vi.spyOn(cyrano, 'sendAck').mockImplementation(() => (++acks, true));
    vi.spyOn(cyrano, 'sendNak').mockImplementation(() => true);
    for (const s of [fleuret, epee]) s.cyranoHook = (id, u) => hub.onArenaUpdate(id, u, s);
  });

  it('la piste suit l’épreuve de son affectation : DISP avec l’arme et l’épreuve du match', async () => {
    await startEvent(fleuret, 'comp-fleuret', 'pool-f', 1, ID.a1, ID.a2);
    // Épreuve d'épée : poule sur la piste 2, la piste 1 reste au fleuret
    await startEvent(epee, 'comp-epee', 'pool-e', 2, ID.b1, ID.b2);
    expect(lastDisp().msg).toMatchObject({ weapon: 'F', right: { id: short(ID.a1) } });
    expect(lastDisp().compe).toBe('comp-fleuret');
    expect(disps.some(d => d.msg.weapon === 'E')).toBe(false);
    expect(hub.getRoutes()).toEqual({ '1': 'comp-fleuret' });
  });

  it('INFO de l’appareil appliqué à l’épreuve suivie, jamais à l’autre', async () => {
    await startEvent(fleuret, 'comp-fleuret', 'pool-f', 1, ID.a1, ID.a2);
    await startEvent(epee, 'comp-epee', 'pool-e', 2, ID.b1, ID.b2);
    device(frame('H', ID.a1, ID.a2, 2, 1));
    expect(fleuret.getArena('arena1')?.currentMatch).toMatchObject({ scoreA: 2, scoreB: 1 });
    expect(epee.getArena('arena1')?.currentMatch ?? null).toBeNull();
  });

  it('piste prise : l’autre épreuve affectée à la même piste attend la fin, puis prend la main', async () => {
    await startEvent(fleuret, 'comp-fleuret', 'pool-f', 1, ID.a1, ID.a2);
    await startEvent(epee, 'comp-epee', 'pool-e', 1, ID.b1, ID.b2);
    // Les deux épreuves ont la piste 1 : la première reste maîtresse de l'appareil
    expect(disps.every(d => d.msg.weapon === 'F')).toBe(true);
    expect(hub.getRoutes()).toEqual({ '1': 'comp-fleuret' });
    // Fin du match de fleuret : ACK, résultat dans l'épreuve de fleuret seulement
    device(frame('H', ID.a1, ID.a2, 5, 3));
    device(frame('E', ID.a1, ID.a2, 5, 3));
    expect(acks).toBe(1);
    expect(fleuret.getArena('arena1')?.status).toBe('finished');
    expect(epee.getArena('arena1')?.status).not.toBe('finished');
    // L'appareil revient au repos : la piste passe à l'épée, nouveau DISP (arme, épreuve)
    device(frame('W', ID.a1, ID.a2, 5, 3));
    expect(lastDisp().msg).toMatchObject({ weapon: 'E', right: { id: short(ID.b1) } });
    expect(lastDisp().compe).toBe('comp-epee');
    expect(hub.getRoutes()).toEqual({ '1': 'comp-epee' });
    // Une mise à jour de l'épreuve de fleuret n'atteint plus l'appareil
    const n = disps.length;
    fleuret.updateArena('arena1', { status: 'idle' });
    expect(disps).toHaveLength(n);
  });

  it('liaison appareil (bandeau, verrou tablette) : publiée sur l’arène de l’épreuve suivie', async () => {
    // Appareil en ligne avant toute séance, puis séances : les arènes sont recréées
    device(frame('W', ID.a1, ID.a2));
    await startEvent(fleuret, 'comp-fleuret', 'pool-f', 1, ID.a1, ID.a2);
    await startEvent(epee, 'comp-epee', 'pool-e', 1, ID.b1, ID.b2);
    const link = { piste: '1', mode: 'master', online: true };
    expect(fleuret.getArena('arena1')?.cyrano).toEqual(link);
    expect(epee.getArena('arena1')?.cyrano ?? null).toBeNull();
    // Fin du match de fleuret : la piste passe à l'épée, la liaison aussi
    device(frame('H', ID.a1, ID.a2, 5, 3));
    device(frame('E', ID.a1, ID.a2, 5, 3));
    device(frame('W', ID.a1, ID.a2, 5, 3));
    expect(hub.getRoutes()).toEqual({ '1': 'comp-epee' });
    expect(epee.getArena('arena1')?.cyrano).toEqual(link);
    expect(fleuret.getArena('arena1')?.cyrano ?? null).toBeNull();
  });

  it('aucune affectation : la piste reste sur sa dernière épreuve, rien n’est envoyé', async () => {
    await startEvent(fleuret, 'comp-fleuret', 'pool-f', 1, ID.a1, ID.a2);
    await startEvent(epee, 'comp-epee', 'pool-e', 2, ID.b1, ID.b2);
    device(frame('E', ID.a1, ID.a2, 5, 3));
    const n = disps.length;
    device(frame('W', ID.a1, ID.a2, 5, 3));
    expect(disps).toHaveLength(n);
    expect(hub.getRoutes()).toEqual({ '1': 'comp-fleuret' });
  });

  it('une seule épreuve ouverte : comportement inchangé (serveur unique)', async () => {
    hub = new PisteHub(new CyranoPisteDriver(cyrano), () => epee);
    hub.attach();
    epee.cyranoHook = (id, u) => hub.onArenaUpdate(id, u, epee);
    await startEvent(epee, 'comp-epee', 'pool-e', 1, ID.b1, ID.b2);
    expect(lastDisp().msg).toMatchObject({ weapon: 'E', right: { id: short(ID.b1) } });
  });
});
