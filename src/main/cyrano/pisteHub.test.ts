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
// Notification du renderer (BrowserWindow absent en test)
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
const lastCall = (fn: { mock: { calls: any[][] } }) => fn.mock.calls[fn.mock.calls.length - 1];

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
  // Horloge de la supervision (#1829) : contrôlée par les tests de bascule hors ligne
  let clock = 1_000_000;

  const arena = () => remote.getArena('arena1')!;
  const setMode = (mode: 'master' | 'display' | 'manual') => {
    cyrano.setPistes([{ piste: '1', ip: DEVICE_IP, port: 50101, arena: 1, mode }]);
    hub.syncPisteModes();
  };
  const updateScore = (scoreA: number, scoreB: number) =>
    remote.handleArenaControl(
      { id: 'tablet', emit: () => true } as any,
      {
        arenaId: 'arena1',
        action: 'update_score',
        scoreA,
        scoreB,
      } as any
    );
  const device = (frame: string) => cyrano.handle(frame, DEVICE_IP, 50101);
  const lastDisp = () => disps[disps.length - 1];

  beforeEach(async () => {
    vi.clearAllMocks();
    clock = 1_000_000;
    remote = new RemoteScoreServer(mockDb as any, 8066);
    vi.spyOn(remote as any, 'loadSessionReferees').mockReturnValue([]);
    cyrano = new CyranoServer({ now: () => clock });
    cyrano.setPistes([{ piste: '1', ip: DEVICE_IP, port: 50101, arena: 1 }]);
    // Base : poule n°2, numéro de match lu par id
    hub = new PisteHub(cyrano, () => remote, {
      coordsSource: {
        getMatch: id => ({ number: Number(id.slice(1, 2)) || undefined }),
        getCompetitionPools: () => [{ id: POOL, name: 'Poule 2' }],
      },
    });
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

  it('DISP du match chargé : Id tronqués à 8 caractères, arme, n° de poule et de match', () => {
    expect(arena().currentMatch?.fencerA.id).toBe(ID.ef);
    expect(lastDisp()).toMatchObject({
      command: 'DISP',
      weapon: 'E',
      phase: '1',
      poulTab: '2',
      match: '1',
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
  const finishedWith = () => lastCall(mockDb.updateMatch)?.[1];

  it('END à égalité avec priorité : vainqueur = tireur prioritaire, inversion comprise', () => {
    // A (EF) à droite, priorité à droite → A
    device(
      info('E', { id: short(ID.ef), score: 4 }, { id: short(ID.ab), score: 4 }, { priority: 'R' })
    );
    expect(acks).toBe(1);
    expect(finishedWith()).toMatchObject({
      scoreA: { value: 4, isVictory: true },
      scoreB: { value: 4, isVictory: false },
    });
  });

  it('END à égalité, A à gauche après inversion, priorité à droite → B', () => {
    device(
      info('E', { id: short(ID.ab), score: 2 }, { id: short(ID.ef), score: 2 }, { priority: 'R' })
    );
    expect(finishedWith()).toMatchObject({
      scoreA: { value: 2, isVictory: false },
      scoreB: { value: 2, isVictory: true },
    });
  });

  it('END sur abandon : l’adversaire gagne même mené au score, abandon marqué', () => {
    device(info('E', { id: short(ID.ef), score: 3, status: 'A' }, { id: short(ID.ab), score: 1 }));
    expect(acks).toBe(1);
    expect(finishedWith()).toMatchObject({
      scoreA: { value: 3, isVictory: false, isAbstention: true },
      scoreB: { value: 1, isVictory: true, isAbstention: false },
    });
  });

  it('END sur exclusion : exclusion marquée sur le tireur exclu', () => {
    device(info('E', { id: short(ID.ef), score: 2 }, { id: short(ID.ab), score: 4, status: 'E' }));
    expect(finishedWith()).toMatchObject({
      scoreA: { value: 2, isVictory: true },
      scoreB: { value: 4, isVictory: false, isExclusion: true },
    });
  });

  it('journal des scores : auteur « device » pour l’appareil, « referee » pour la tablette', () => {
    device(info('H', { id: short(ID.ef), score: 1 }, { id: short(ID.ab), score: 0 }));
    expect(lastCall(mockDb.logScoreChange)?.[0]).toMatchObject({ changedBy: 'device' });
    (remote as any).handleArenaControl(
      { id: 'tablet-socket', emit: vi.fn() },
      { arenaId: 'arena1', action: 'update_score', scoreA: 2, scoreB: 0, cardsA: [], cardsB: [] }
    );
    expect(lastCall(mockDb.logScoreChange)?.[0]).toMatchObject({ changedBy: 'referee' });
    device(info('E', { id: short(ID.ef), score: 2 }, { id: short(ID.ab), score: 0 }));
    expect(lastCall(mockDb.logScoreChange)?.[0]).toMatchObject({
      changedBy: 'device',
      reason: 'arena_finish',
    });
  });

  it('BAD MATCH : alerte exposée pour le panneau, levée quand l’appareil affiche le bon match', () => {
    device(info('H', { id: short(ID.de), score: 1 }, { id: short(ID.bc), score: 0 }));
    expect(hub.getAlerts()['1']).toMatchObject({ kind: 'bad_match', device: 'X – X' });
    device(info('H', { id: short(ID.ef) }, { id: short(ID.ab) }));
    expect(hub.getAlerts()['1']).toBeUndefined();
  });

  it('sabre laser : affichage seul — INFO ignorés, END refusé, NEXT sans effet', () => {
    vi.spyOn(remote, 'getSessionWeapon').mockReturnValue('L');
    device(info('H', { id: short(ID.ef), score: 3 }, { id: short(ID.ab), score: 0 }));
    expect(arena().currentMatch).toMatchObject({ scoreA: 0, scoreB: 0 });
    device(info('E', { id: short(ID.ef), score: 3 }, { id: short(ID.ab), score: 0 }));
    expect(naks).toBe(1);
    expect(arena().status).not.toBe('finished');
    disps = [];
    device('|EFP1.1|NEXT|1||%|');
    expect(disps).toHaveLength(0);
    expect(arena().currentMatch?.id).toBe(pm(1, ID.ef, ID.ab).id);
  });

  describe('actions de secours depuis le poste (#1829)', () => {
    it('ACK forcé envoyé à la piste', () => {
      expect(hub.pisteAction('1', 'ack')).toBe(true);
      expect(acks).toBe(1);
    });

    it('NEXT du poste : mêmes garde-fous que la touche de l’appareil', () => {
      device(info('H', { id: short(ID.ef), score: 3 }, { id: short(ID.ab), score: 0 }));
      hub.pisteAction('1', 'next');
      expect(arena().currentMatch?.id).toBe(pm(1, ID.ef, ID.ab).id);
      device(info('E', { id: short(ID.ef), score: 5 }, { id: short(ID.ab), score: 2 }));
      hub.pisteAction('1', 'next');
      expect(arena().currentMatch?.id).toBe(pm(2, ID.de, ID.bc).id);
    });

    it('resynchronisation : match de l’arène renvoyé, alerte levée', () => {
      device(info('H', { id: short(ID.de), score: 1 }, { id: short(ID.bc), score: 0 }));
      expect(hub.getAlerts()['1']).toBeDefined();
      disps = [];
      expect(hub.pisteAction('1', 'resync')).toBe(true);
      expect(hub.getAlerts()['1']).toBeUndefined();
      expect(lastDisp()).toMatchObject({ right: { id: short(ID.ef) }, left: { id: short(ID.ab) } });
    });

    it('piste inconnue : refus', () => {
      expect(hub.pisteAction('9', 'ack')).toBe(false);
      expect(acks).toBe(0);
    });
  });

  describe('modes par piste (#1829)', () => {
    it('afficheur : DISP reçu, INFO ignorés, END refusé (NAK), NEXT sans effet', () => {
      setMode('display');
      disps = [];
      device(info('F', { id: short(ID.ef), score: 3 }, { id: short(ID.ab), score: 1 }));
      expect(arena().currentMatch?.scoreA).toBe(0);
      device(info('E', { id: short(ID.ef), score: 5 }, { id: short(ID.ab), score: 2 }));
      expect(naks).toBe(1);
      expect(acks).toBe(0);
      expect(arena().currentMatch?.id).toBe(pm(1, ID.ef, ID.ab).id);
      device(buildCyrano({ protocol: 'EFP1.1', command: 'NEXT', piste: '1', compe: '' } as any));
      expect(arena().currentMatch?.id).toBe(pm(1, ID.ef, ID.ab).id);
      // Les mises à jour de la tablette sont encore affichées sur l'appareil
      updateScore(4, 0);
      expect(lastDisp()).toMatchObject({ right: { score: 4 }, left: { score: 0 } });
    });

    it('manuel : aucun DISP envoyé, INFO ignorés, END refusé, resynchronisation refusée', () => {
      setMode('manual');
      disps = [];
      updateScore(2, 1);
      expect(disps).toHaveLength(0);
      device(info('F', { id: short(ID.ef), score: 3 }, { id: short(ID.ab), score: 1 }));
      expect(arena().currentMatch?.scoreA).toBe(2);
      device(info('E', { id: short(ID.ef), score: 5 }, { id: short(ID.ab), score: 2 }));
      expect(naks).toBe(1);
      expect(acks).toBe(0);
      expect(hub.pisteAction('1', 'resync')).toBe(false);
      expect(hub.pisteAction('1', 'next')).toBe(false);
      // L'ACK forcé reste disponible depuis le poste
      expect(hub.pisteAction('1', 'ack')).toBe(true);
      expect(acks).toBe(1);
    });

    it('retour de manuel vers maître : DISP du match courant renvoyé', () => {
      setMode('manual');
      disps = [];
      setMode('master');
      expect(lastDisp()).toMatchObject({
        right: { id: short(ID.ef) },
        left: { id: short(ID.ab) },
      });
    });

    it('appareil hors ligne : bascule en manuel (plus de DISP), retour en ligne : DISP renvoyé', () => {
      device(info('W', null, null)); // appareil connu et en ligne
      clock += 60_000;
      cyrano.getStatuses(); // supervision : hors ligne
      disps = [];
      updateScore(3, 0);
      expect(disps).toHaveLength(0);
      device(info('W', null, null)); // reconnexion
      expect(lastDisp()).toMatchObject({
        right: { id: short(ID.ef), score: 3 },
        left: { id: short(ID.ab), score: 0 },
      });
    });

    it('BAD MATCH : notification au DT à la première alerte seulement', () => {
      const onAlert = vi.fn();
      hub.detach();
      hub = new PisteHub(cyrano, () => remote, { onAlert });
      hub.attach();
      device(info('H', { id: short(ID.de), score: 1 }, { id: short(ID.bc), score: 0 }));
      device(info('H', { id: short(ID.de), score: 2 }, { id: short(ID.bc), score: 0 }));
      expect(onAlert).toHaveBeenCalledTimes(1);
      expect(onAlert).toHaveBeenCalledWith('1', expect.objectContaining({ arena: 'arena1' }));
    });

    it('reprise : match en cours sauvegardé repris avec son score au redémarrage de la séance', async () => {
      const saved = { ...pm(2, ID.de, ID.bc), scoreA: 3, scoreB: 1, status: 'in_progress' };
      mockDb.getArenaState.mockReturnValue({
        arenaId: 'arena1',
        competitionId: 'comp-1',
        currentMatch: saved,
        matchQueue: [],
        settings: null,
        status: 'in_progress',
        updatedAt: '',
      });
      try {
        remote.stopSession();
        await remote.startSession('comp-1', 1, [
          { __poolFencers: true, poolId: POOL, poolNumber: 1, strip: 1, fencers: [] },
          pm(1, ID.ef, ID.ab),
          pm(2, ID.de, ID.bc),
          pm(3, ID.ef, ID.de),
        ] as any);
        expect(arena().currentMatch?.id).toBe(saved.id);
        expect(arena().currentMatch?.scoreA).toBe(3);
        expect(arena().status).toBe('in_progress');
      } finally {
        mockDb.getArenaState.mockReturnValue(null);
      }
    });

    it('reprise : match déjà terminé en base non repris', async () => {
      const saved = { ...pm(2, ID.de, ID.bc), scoreA: 3, scoreB: 1, status: 'in_progress' };
      mockDb.getArenaState.mockReturnValue({
        arenaId: 'arena1',
        competitionId: 'comp-1',
        currentMatch: saved,
        matchQueue: [],
        settings: null,
        status: 'in_progress',
        updatedAt: '',
      });
      mockDb.getMatch.mockReturnValueOnce({ id: saved.id, status: 'finished' } as any);
      try {
        remote.stopSession();
        await remote.startSession('comp-1', 1, [
          { __poolFencers: true, poolId: POOL, poolNumber: 1, strip: 1, fencers: [] },
          pm(1, ID.ef, ID.ab),
          pm(2, ID.de, ID.bc),
          pm(3, ID.ef, ID.de),
        ] as any);
        // Match écarté : affectation par défaut (premier match à jouer)
        expect(arena().currentMatch?.id).toBe(pm(1, ID.ef, ID.ab).id);
      } finally {
        mockDb.getArenaState.mockReturnValue(null);
      }
    });

    it('mode hors liste : repli sur maître', () => {
      cyrano.setPistes([
        { piste: '1', ip: DEVICE_IP, port: 50101, arena: 1, mode: 'bogus' as any },
      ]);
      expect(cyrano.findPiste('1')?.mode).toBe('master');
    });
  });
});
