/**
 * PisteHub (#1720) — intégration appareil Cyrano ↔ RemoteScoreServer réel, mode appareil maître.
 * Identifiants de tireurs au format UUID (36 caractères) : l'appareil n'en reçoit que 8.
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
vi.mock('http', () => ({
  createServer: vi
    .fn()
    .mockReturnValue({ listen: vi.fn(), close: vi.fn(), on: vi.fn(), once: vi.fn() }),
}));

import { RemoteScoreServer } from '../remoteScoreServer';
import { CyranoServer } from './server';
import { PisteHub } from './pisteHub';
import { buildCyrano, parseCyrano, type CyranoFencer, type CyranoMessage } from './codec';
import type { ArenaUpdate } from '../../shared/types/remote';

// UUID réels (format BellePoule) ; les 8 premiers caractères suffisent à l'appareil
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
  saveTouch: vi.fn(),
  saveArenaExit: vi.fn(),
  logScoreChange: vi.fn(),
  saveArenaState: vi.fn(),
  getArenaState: vi.fn().mockReturnValue(null),
  getFencersByCompetition: vi.fn().mockReturnValue([]),
  getRefereesByCompetition: vi.fn().mockReturnValue([]),
  updateFencer: vi.fn(),
  getFencer: vi.fn().mockReturnValue(null),
  updateReferee: vi.fn(),
  getSessionState: vi.fn().mockReturnValue(null),
};

const DEVICE_IP = '10.0.0.1';

interface Side {
  id: string;
  score?: number;
  y?: number;
  r?: number;
  status?: CyranoFencer['status'];
}

function info(
  state: CyranoMessage['state'],
  right: Side | null,
  left: Side | null,
  extra: Partial<CyranoMessage> = {}
): string {
  const zone = (f: Side | null): CyranoFencer | undefined =>
    f
      ? {
          id: f.id,
          name: 'X',
          nat: 'FRA',
          score: f.score ?? 0,
          status: f.status ?? 'U',
          yellowCards: f.y ?? 0,
          redCards: f.r ?? 0,
        }
      : { score: 0, status: 'U' };
  return buildCyrano({
    protocol: 'EFP1.1',
    command: 'INFO',
    piste: '1',
    compe: '',
    stopwatch: '3:00',
    priority: 'N',
    state,
    right: zone(right),
    left: zone(left),
    ...extra,
  });
}

describe('PisteHub — mode appareil maître (#1720)', () => {
  let remote: RemoteScoreServer;
  let cyrano: CyranoServer;
  let hub: PisteHub;
  let disps: CyranoMessage[];
  let acks: number;
  let naks: number;
  let updates: ArenaUpdate[];

  const arena = () => remote.getArena('arena1')!;
  const device = (frame: string) => cyrano.handle(frame, DEVICE_IP, 50101);
  const lastDisp = () => disps[disps.length - 1];

  beforeEach(async () => {
    vi.clearAllMocks();
    remote = new RemoteScoreServer(mockDb as any, 8066);
    vi.spyOn(remote as any, 'loadSessionReferees').mockReturnValue([]);
    cyrano = new CyranoServer();
    cyrano.setPistes([{ piste: '1', ip: DEVICE_IP, port: 50101, arena: 1 }]);
    hub = new PisteHub(cyrano, () => remote);
    hub.attach();
    disps = [];
    acks = 0;
    naks = 0;
    updates = [];
    vi.spyOn(cyrano, 'sendDisp').mockImplementation((_p, d) => {
      // Trame réellement émise (troncature des Id comprise), relue
      disps.push(
        parseCyrano(
          buildCyrano({ ...d, protocol: 'EFP1.1', command: 'DISP', piste: '1', compe: '' })
        )!
      );
      return true;
    });
    vi.spyOn(cyrano, 'sendAck').mockImplementation(() => (++acks, true));
    vi.spyOn(cyrano, 'sendNak').mockImplementation(() => (++naks, true));
    remote.cyranoHook = (arenaId, u) => {
      updates.push(u);
      hub.onArenaUpdate(arenaId, u);
    };
    await remote.startSession('comp-1', 1, [
      { __poolFencers: true, poolId: POOL, poolNumber: 1, strip: 1, fencers: [] },
      pm(1, ID.ef, ID.ab),
      pm(2, ID.de, ID.bc),
      pm(3, ID.ef, ID.de),
    ] as any);
  });

  it('DISP du match chargé : Id tronqués à 8 caractères, arme de la séance', () => {
    expect(arena().currentMatch?.fencerA.id).toBe(ID.ef);
    expect(lastDisp()).toMatchObject({
      command: 'DISP',
      weapon: 'E',
      right: { id: short(ID.ef), score: 0 },
      left: { id: short(ID.ab), score: 0 },
    });
  });

  it('INFO actif : score et cartons de l’appareil appliqués à l’arène malgré la troncature des Id', () => {
    const n = disps.length;
    device(info('H', { id: short(ID.ef), score: 2, y: 1 }, { id: short(ID.ab), score: 1, r: 2 }));
    expect(arena().status).toBe('in_progress');
    expect(arena().currentMatch).toMatchObject({ scoreA: 2, scoreB: 1 });
    expect(updates.filter(u => u.cardsA).pop()).toMatchObject({
      source: 'device',
      cardsA: ['yellow'],
      cardsB: ['red', 'red'],
    });
    // L'appareil connaît déjà ce score : pas de DISP en écho
    expect(disps).toHaveLength(n);
  });

  it('inversion droite/gauche : A à gauche de l’appareil, résultats non intervertis', () => {
    device(info('H', { id: short(ID.ab), score: 4 }, { id: short(ID.ef), score: 1 }));
    expect(arena().currentMatch).toMatchObject({ scoreA: 1, scoreB: 4 });
  });

  it('chrono : F → update_timer (en marche), H → pause_timer, diffusés avec source device', () => {
    device(info('F', { id: short(ID.ef) }, { id: short(ID.ab) }, { stopwatch: '2:57' }));
    expect(updates[updates.length - 1]).toMatchObject({
      time: 177,
      timerStatus: 'running',
      source: 'device',
    });
    device(info('H', { id: short(ID.ef) }, { id: short(ID.ab) }, { stopwatch: '0:09.53' }));
    expect(updates[updates.length - 1]).toMatchObject({
      time: 9.53,
      timerStatus: 'paused',
      source: 'device',
    });
  });

  it('appareil au repos sans le match (redémarrage, reconnexion) → DISP renvoyé', () => {
    disps = [];
    device(info('W', null, null));
    expect(lastDisp()).toMatchObject({ right: { id: short(ID.ef) }, left: { id: short(ID.ab) } });
    // Match déjà affiché : rien
    disps = [];
    device(info('W', { id: short(ID.ef) }, { id: short(ID.ab) }));
    expect(disps).toHaveLength(0);
  });

  it('INFO au repos (W) : scores ignorés', () => {
    device(info('W', { id: short(ID.ef), score: 0 }, { id: short(ID.ab), score: 0 }));
    remote.updateArenaScore('arena1', 3, 0);
    device(info('W', { id: short(ID.ef), score: 0 }, { id: short(ID.ab), score: 0 }));
    expect(arena().currentMatch).toMatchObject({ scoreA: 3, scoreB: 0 });
  });

  it('END valide : ACK, résultat de l’appareil enregistré, pas de DISP du match terminé', () => {
    device(info('H', { id: short(ID.ef), score: 2, y: 1 }, { id: short(ID.ab), score: 1 }));
    disps = [];
    device(info('E', { id: short(ID.ef), score: 2, y: 1 }, { id: short(ID.ab), score: 1 }));
    expect(acks).toBe(1);
    expect(arena().status).toBe('finished');
    expect(mockDb.updateMatch).toHaveBeenCalledWith(
      pm(1, ID.ef, ID.ab).id,
      expect.objectContaining({
        scoreA: expect.objectContaining({ value: 2, isVictory: true }),
        scoreB: expect.objectContaining({ value: 1, isVictory: false }),
      })
    );
    expect(mockDb.saveCard).toHaveBeenCalledWith(
      expect.objectContaining({ fencerId: ID.ef, cardType: 'yellow' })
    );
    expect(disps).toHaveLength(0);
    // END répété (ACK perdu) : nouvel ACK, rien de réenregistré
    mockDb.updateMatch.mockClear();
    device(info('E', { id: short(ID.ef), score: 2 }, { id: short(ID.ab), score: 1 }));
    expect(acks).toBe(2);
    expect(mockDb.updateMatch).not.toHaveBeenCalled();
  });

  it('END envoyé directement (score dans la même trame, sans INFO préalable) : score final retenu', () => {
    device(info('E', { id: short(ID.ab), score: 5 }, { id: short(ID.ef), score: 3 }));
    expect(acks).toBe(1);
    expect(mockDb.updateMatch).toHaveBeenCalledWith(
      pm(1, ID.ef, ID.ab).id,
      expect.objectContaining({
        scoreA: expect.objectContaining({ value: 3 }),
        scoreB: expect.objectContaining({ value: 5, isVictory: true }),
      })
    );
  });

  it('END invalide (égalité sans priorité) → NAK, match non clos', () => {
    device(info('E', { id: short(ID.ef), score: 1 }, { id: short(ID.ab), score: 1 }));
    expect(naks).toBe(1);
    expect(acks).toBe(0);
    expect(arena().status).not.toBe('finished');
  });

  it('END ou INFO d’un autre match (BAD MATCH) → NAK, arène inchangée', () => {
    device(info('H', { id: short(ID.de), score: 4 }, { id: short(ID.bc), score: 0 }));
    expect(arena().currentMatch).toMatchObject({ scoreA: 0, scoreB: 0 });
    device(info('E', { id: short(ID.de), score: 5 }, { id: short(ID.bc), score: 0 }));
    expect(naks).toBe(1);
    expect(arena().status).not.toBe('finished');
  });

  it('NEXT pendant un match non terminé : refusé, DISP du match courant renvoyé', () => {
    device(info('H', { id: short(ID.ef), score: 3 }, { id: short(ID.ab), score: 0 }));
    disps = [];
    device('|EFP1.1|NEXT|1||%|');
    expect(arena().currentMatch?.id).toBe(pm(1, ID.ef, ID.ab).id);
    expect(arena().currentMatch).toMatchObject({ scoreA: 3, scoreB: 0 });
    expect(lastDisp()).toMatchObject({ right: { id: short(ID.ef), score: 3 } });
  });

  it('NEXT après ACK : match suivant chargé et envoyé', () => {
    device(info('E', { id: short(ID.ef), score: 5 }, { id: short(ID.ab), score: 2 }));
    disps = [];
    device('|EFP1.1|NEXT|1||%|');
    expect(arena().currentMatch?.id).toBe(pm(2, ID.de, ID.bc).id);
    expect(lastDisp()).toMatchObject({
      right: { id: short(ID.de), score: 0 },
      left: { id: short(ID.bc) },
    });
  });

  it('correction de score depuis la tablette → DISP avec les scores corrigés', () => {
    device(info('H', { id: short(ID.ef), score: 3 }, { id: short(ID.ab), score: 1 }));
    disps = [];
    (remote as any).handleArenaControl(
      { id: 'tablet-socket', emit: vi.fn() },
      { arenaId: 'arena1', action: 'update_score', scoreA: 2, scoreB: 1, cardsA: [], cardsB: [] }
    );
    expect(lastDisp()).toMatchObject({ right: { id: short(ID.ef), score: 2 }, left: { score: 1 } });
    // L'appareil renvoie le score corrigé : pas de boucle
    disps = [];
    device(info('H', { id: short(ID.ef), score: 2 }, { id: short(ID.ab), score: 1 }));
    expect(disps).toHaveLength(0);
  });

  it('mises à jour de la tablette : jamais marquées source device', () => {
    (remote as any).handleArenaControl(
      { id: 'tablet-socket', emit: vi.fn() },
      { arenaId: 'arena1', action: 'update_timer', time: 100, timerStatus: 'running' }
    );
    expect(updates[updates.length - 1]?.source).toBeUndefined();
  });

  it('sabre laser : champ arme vide dans le DISP', () => {
    vi.spyOn(remote, 'getSessionWeapon').mockReturnValue('L');
    hub.clearDispCache('1');
    device(info('W', null, null));
    expect(lastDisp().weapon).toBeUndefined();
  });
});
