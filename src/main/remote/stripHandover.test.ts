/**
 * Pistes libérées (#1878) : travail en attente d’une épreuve et déplacement vers une piste
 * libre, sur un RemoteScoreServer réel.
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

const db = {
  getCompetition: vi.fn().mockReturnValue({ id: 'c1', weapon: 'E', settings: {} }),
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

const f = (id: string) => ({ id, firstName: id, lastName: id.toUpperCase() });
const poolMarker = (poolId: string, poolNumber: number, strip?: number) => ({
  __poolFencers: true,
  poolId,
  poolNumber,
  ...(strip ? { strip } : {}),
  fencers: [],
});
const poolMatch = (poolId: string, n: number, a: string, b: string) => ({
  id: `${poolId}-m${n}`,
  poolId,
  poolNumber: Number(poolId.slice(1)),
  number: n,
  fencerA: f(a),
  fencerB: f(b),
  status: 'not_started',
});

function makeServer(): RemoteScoreServer {
  const s = new RemoteScoreServer(db as never, 8066);
  vi.spyOn(
    s as never as { loadSessionReferees: () => unknown },
    'loadSessionReferees'
  ).mockReturnValue([]);
  return s;
}

describe('stripHandover — travail en attente et piste libérée (#1878)', () => {
  let server: RemoteScoreServer;
  beforeEach(() => {
    vi.clearAllMocks();
    server = makeServer();
  });

  it('poule sans piste : proposée ; jamais déplacée vers une piste hors de l’épreuve', async () => {
    await server.startSession('c1', 2, [
      poolMarker('p1', 1, 1),
      poolMatch('p1', 1, 'a', 'b'),
      poolMarker('p2', 2, 2),
      poolMatch('p2', 1, 'c', 'd'),
      poolMarker('p3', 3),
      poolMatch('p3', 1, 'e', 'f'),
    ] as never);
    const waiting = server.getWaitingWork();
    expect(waiting).toEqual([{ kind: 'pool', poolId: 'p3', poolNumber: 3, fromArena: null }]);
    // Piste 4 inexistante dans cette épreuve (ni mot de passe ni écran configurés) : refus
    expect(server.moveWorkToArena(waiting[0], 4)).toBe(false);
    expect(server.getArena('arena4')).toBeNull();
  });

  it('poule en file derrière une piste occupée : installée sur la piste libre, qui la garde', async () => {
    await server.startSession('c1', 3, [
      poolMarker('p1', 1, 1),
      poolMatch('p1', 1, 'a', 'b'),
      poolMarker('p2', 2, 2),
      poolMatch('p2', 1, 'c', 'd'),
      poolMarker('p3', 3, 2),
      poolMatch('p3', 1, 'e', 'f'),
      poolMatch('p3', 2, 'e', 'g'),
    ] as never);
    // Piste 3 libérée (poule terminée ailleurs) : vidée pour le test
    server.updateArena('arena3', { status: 'idle', currentMatch: null });
    const arena3 = server.getArena('arena3')!;
    arena3.currentMatch = null;
    arena3.activePoolId = undefined;
    const waiting = server.getWaitingWork();
    expect(waiting).toEqual([{ kind: 'pool', poolId: 'p3', poolNumber: 3, fromArena: 2 }]);

    expect(server.moveWorkToArena(waiting[0], 3)).toBe(true);
    expect(server.getArena('arena3')?.currentMatch).toMatchObject({ id: 'p3-m1', poolId: 'p3' });
    expect(server.hasArenaAssignment('arena3')).toBe(true);
    expect(server.getWaitingWork()).toEqual([]);
    expect(db.saveArenaState).toHaveBeenCalledWith('arena2', expect.anything());
    expect(db.saveArenaState).toHaveBeenCalledWith('arena3', expect.anything());

    // Répartition renvoyée par le renderer (poule 3 toujours sur la piste 2) : la piste 3 reste
    server.assignPools([
      { poolId: 'p1', poolNumber: 1, strip: 1, matches: [poolMatch('p1', 1, 'a', 'b')] },
      { poolId: 'p2', poolNumber: 2, strip: 2, matches: [poolMatch('p2', 1, 'c', 'd')] },
      {
        poolId: 'p3',
        poolNumber: 3,
        strip: 2,
        matches: [poolMatch('p3', 1, 'e', 'f'), poolMatch('p3', 2, 'e', 'g')],
      },
    ] as never);
    expect(server.getArena('arena3')?.currentMatch?.poolId).toBe('p3');
  });

  it('match de tableau en file derrière une piste occupée : déplacé sur la piste libre', async () => {
    await server.startSession('c1', 2, [
      { id: '16-1', isTableau: true, round: 16, arena: 1, fencerA: f('a'), fencerB: f('b') },
      { id: '16-2', isTableau: true, round: 16, arena: 1, fencerA: f('c'), fencerB: f('d') },
    ] as never);
    expect(server.getArena('arena1')?.currentMatch?.id).toBe('16-1');
    const waiting = server.getWaitingWork();
    expect(waiting).toEqual([
      expect.objectContaining({ kind: 'match', matchId: '16-2', fromArena: 1, fencers: 'C – D' }),
    ]);
    expect(server.moveWorkToArena(waiting[0], 2)).toBe(true);
    expect(server.getArena('arena2')?.currentMatch?.id).toBe('16-2');
    expect(server.getWaitingWork()).toEqual([]);
  });

  it('sans séance : rien n’attend', () => {
    expect(server.getWaitingWork()).toEqual([]);
  });
});
