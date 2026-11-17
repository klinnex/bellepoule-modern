/**
 * Relais FIE par équipes sur appareil Cyrano (#1829) — RemoteScoreServer réel, arène équipe
 * `/equipe1` (relais FIE en direct, #1086), trames Cyrano `Type=T` injectées.
 * Identifiants de tireurs au format UUID : l'appareil n'en reçoit que 8 caractères.
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
import { CyranoServer } from '../cyrano/server';
import { CyranoPisteDriver } from '../cyrano/driver';
import { buildCyrano, parseCyrano, type CyranoFencer, type CyranoMessage } from '../cyrano/codec';
import { PisteHub } from './pisteHub';
import { logger } from '../../shared/services/logger';
import { generateRelayOrder } from '../../features/teams/utils/teamCalculations';

const uuid = (n: number, team: string) =>
  `${team}${n}${team}${n}${team}${n}${team}${n}-0000-4000-8000-00000000000${n}`;
const A = [1, 2, 3, 4].map(n => uuid(n, 'a'));
const B = [1, 2, 3].map(n => uuid(n, 'b'));
const short = (id: string) => id.slice(0, 8);
const NAMES: Record<string, [string, string]> = {
  [A[0]]: ['Martin', 'Paul'],
  [A[1]]: ['Bernard', 'Luc'],
  [A[2]]: ['Thomas', 'Eric'],
  [A[3]]: ['Petit', 'Hugo'],
  [B[0]]: ['Rossi', 'Marco'],
  [B[1]]: ['Bianchi', 'Luca'],
  [B[2]]: ['Romano', 'Gino'],
};

/** Rencontre de 9 relais (ordre de l'application), les `finished` premiers déjà tirés. */
function detail(finished = 0, scores: [number, number][] = []) {
  return {
    id: 'tm1',
    competitionId: 'comp-t',
    teamAId: 'tA',
    teamAName: 'Paris',
    teamBId: 'tB',
    teamBName: 'Roma',
    status: 'in_progress',
    currentBoutIndex: finished,
    bouts: generateRelayOrder(3).map(([a, b], i) => ({
      id: `bout${i + 1}`,
      boutOrder: i + 1,
      fencerAId: A[a],
      fencerAName: NAMES[A[a]].join(' '),
      fencerBId: B[b],
      fencerBName: NAMES[B[b]].join(' '),
      scoreA: i < finished ? (scores[i]?.[0] ?? 0) : 0,
      scoreB: i < finished ? (scores[i]?.[1] ?? 0) : 0,
      maxScore: 45,
      status: i < finished ? 'finished' : 'not_started',
      winnerId: null,
    })),
  };
}

const mockDb = {
  getCompetition: vi.fn(),
  getTeamMatchDetail: vi.fn(),
  getTeamBoutCards: vi.fn().mockReturnValue([]),
  getTeamMatchCards: vi.fn().mockReturnValue([]),
  updateTeamBout: vi.fn(),
  setTeamBoutFencer: vi.fn(),
  reopenTeamBout: vi.fn(),
  getTeamsByCompetition: vi.fn().mockReturnValue([
    {
      id: 'tA',
      name: 'Paris',
      club: '',
      fencers: [
        ...A.slice(0, 3).map((id, i) => ({
          fencerId: id,
          fencerLastName: NAMES[id][0],
          fencerFirstName: NAMES[id][1],
          teamOrder: i + 1,
          isReserve: false,
        })),
        {
          fencerId: A[3],
          fencerLastName: 'Petit',
          fencerFirstName: 'Hugo',
          teamOrder: 4,
          isReserve: true,
        },
      ],
    },
    { id: 'tB', name: 'Roma', club: '', fencers: [] },
  ]),
  getFencer: vi.fn((id: string) =>
    NAMES[id]
      ? {
          id,
          lastName: NAMES[id][0],
          firstName: NAMES[id][1],
          nationality: id.startsWith('a') ? 'FRA' : 'ITA',
        }
      : null
  ),
  getArenaState: vi.fn().mockReturnValue(null),
  getSessionState: vi.fn().mockReturnValue(null),
  getFencersByCompetition: vi.fn().mockReturnValue([]),
  getRefereesByCompetition: vi.fn().mockReturnValue([]),
};

const DEVICE_IP = '10.0.0.7';

interface Side {
  id: string;
  score: number;
  y?: number;
  reserve?: boolean;
  status?: CyranoFencer['status'];
}

function info(
  state: CyranoMessage['state'],
  relay: number,
  right: Side,
  left: Side,
  extra: Partial<CyranoMessage> = {}
): string {
  const zone = (f: Side): CyranoFencer => ({
    id: short(f.id),
    name: 'X',
    nat: 'FRA',
    score: f.score,
    status: f.status ?? 'U',
    yellowCards: f.y ?? 0,
    redCards: 0,
    reserve: f.reserve ?? false,
  });
  return buildCyrano({
    protocol: 'EFP1.1',
    command: 'INFO',
    piste: '1',
    compe: '',
    round: String(relay),
    stopwatch: '2:00',
    type: 'T',
    priority: 'N',
    state,
    right: zone(right),
    left: zone(left),
    ...extra,
  });
}

describe('PisteHub — relais FIE par équipes (Type=T)', () => {
  let remote: RemoteScoreServer;
  let cyrano: CyranoServer;
  let hub: PisteHub;
  /** Trames émises vers l'appareil, dans l'ordre (DISP relus, ACK, NAK) */
  let out: (CyranoMessage | 'ACK' | 'NAK')[];

  const team = () => remote.teamArenaCtx.teamArenaState.get('1')!;
  const device = (frame: string) => cyrano.handle(frame, DEVICE_IP, 50100);
  const disps = () => out.filter((m): m is CyranoMessage => typeof m === 'object');
  const lastDisp = () => disps()[disps().length - 1];
  const count = (k: 'ACK' | 'NAK') => out.filter(m => m === k).length;

  const start = (finished = 0, scores: [number, number][] = [], weapon = 'S', format?: string) => {
    mockDb.getCompetition.mockReturnValue({
      id: 'comp-t',
      weapon,
      settings: { minTeamSize: 3, teamRelayStepSize: 5, teamFormat: format },
    });
    mockDb.getTeamMatchDetail.mockReturnValue(detail(finished, scores));
    out = [];
    expect(remote.setTeamArenaMatch('1', 'tm1', false)).toBe(true);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    remote = new RemoteScoreServer(mockDb as never, 8066);
    cyrano = new CyranoServer();
    cyrano.setPistes([{ piste: '1', ip: DEVICE_IP, arena: 1 }]);
    hub = new PisteHub(new CyranoPisteDriver(cyrano), () => remote);
    hub.attach();
    out = [];
    vi.spyOn(cyrano, 'sendDisp').mockImplementation((_p, d) => {
      out.push(
        parseCyrano(
          buildCyrano({ ...d, protocol: 'EFP1.1', command: 'DISP', piste: '1', compe: '' })
        )!
      );
      return true;
    });
    vi.spyOn(cyrano, 'sendAck').mockImplementation(() => (out.push('ACK'), true));
    vi.spyOn(cyrano, 'sendNak').mockImplementation(() => (out.push('NAK'), true));
    remote.cyranoTeamHook = id => hub.onTeamArenaUpdate(id, remote);
  });

  it('rencontre assignée : DISP Type=T du relais 1, tireurs du relais, nation = équipe', () => {
    start();
    expect(lastDisp()).toMatchObject({
      command: 'DISP',
      type: 'T',
      round: '1',
      weapon: 'S',
      right: { id: short(A[0]), name: 'MARTIN P', nat: 'PAR', score: 0 },
      left: { id: short(B[0]), name: 'ROSSI M', nat: 'ROM', score: 0 },
    });
    expect(lastDisp().phase).toBeUndefined();
  });

  it('compétition internationale : nation = pays du tireur', () => {
    hub.setOptions({ international: true });
    start();
    expect(lastDisp()).toMatchObject({ right: { nat: 'FRA' }, left: { nat: 'ITA' } });
  });

  it('état reçu : score cumulé → score du relais, cartons reportés au relais, chrono, sans écho', () => {
    start();
    const n = disps().length;
    device(info('F', 1, { id: A[0], score: 3, y: 1 }, { id: B[0], score: 1 }));
    expect(team()).toMatchObject({ liveScoreA: 3, liveScoreB: 1, elapsedAccumulatedSec: 60 });
    expect(team().timerStartedAt).not.toBeNull();
    expect(team().deviceCards?.bout1).toEqual({ cardsA: ['yellow'], cardsB: [] });
    expect(disps()).toHaveLength(n);
  });

  it('inversion droite / gauche : équipe A suivie par Id, pas par position', () => {
    start();
    device(info('H', 1, { id: B[0], score: 4 }, { id: A[0], score: 2 }));
    expect(team()).toMatchObject({ liveScoreA: 2, liveScoreB: 4 });
  });

  it('fin d’un relais intermédiaire : toujours correcte, ACK puis DISP du relais suivant avec les cumuls', () => {
    start();
    device(info('H', 1, { id: A[0], score: 3 }, { id: B[0], score: 3 }));
    out = [];
    // Égalité sans priorité : refusée en individuel, correcte pour un relais intermédiaire
    device(info('E', 1, { id: A[0], score: 5 }, { id: B[0], score: 5 }));
    expect(out[0]).toBe('ACK');
    expect(mockDb.updateTeamBout).toHaveBeenCalledWith('bout1', 5, 5, 'finished', null);
    expect(out[1]).toMatchObject({
      type: 'T',
      round: '2',
      right: { id: short(A[1]), score: 5 },
      left: { id: short(B[1]), score: 5 },
    });
    expect(team()).toMatchObject({ currentBoutIndex: 1, liveScoreA: 0, liveScoreB: 0 });
  });

  it('relais intermédiaire avec abandon ou exclusion : NAK tracé, relais non enregistré', () => {
    const warn = vi.spyOn(logger, 'warn');
    start();
    for (const status of ['A', 'E'] as const) {
      out = [];
      device(info('E', 1, { id: A[0], score: 3, status }, { id: B[0], score: 1 }));
      expect(out).toEqual(['NAK']);
    }
    expect(mockDb.updateTeamBout).not.toHaveBeenCalled();
    expect(team().currentBoutIndex).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('abandon ou exclusion')
    );
    warn.mockRestore();
  });

  it('relais suivant : score du relais = cumul − relais terminés ; END répété (ACK perdu) → nouvel ACK', () => {
    start(1, [[5, 2]]);
    device(info('H', 2, { id: A[1], score: 7 }, { id: B[1], score: 6 }));
    expect(team()).toMatchObject({ liveScoreA: 2, liveScoreB: 4 });
    device(info('E', 2, { id: A[1], score: 10 }, { id: B[1], score: 6 }));
    expect(mockDb.updateTeamBout).toHaveBeenCalledWith('bout2', 5, 4, 'finished', A[1]);
    const acks = count('ACK');
    const updates = mockDb.updateTeamBout.mock.calls.length;
    device(info('E', 2, { id: A[1], score: 10 }, { id: B[1], score: 6 }));
    expect(count('ACK')).toBe(acks + 1);
    expect(mockDb.updateTeamBout.mock.calls.length).toBe(updates);
    expect(lastDisp()).toMatchObject({ round: '3', right: { score: 10 }, left: { score: 6 } });
  });

  it('cumul inférieur aux relais terminés : ignoré, cumul de l’arène renvoyé à l’appareil', () => {
    start(1, [[5, 2]]);
    out = [];
    device(info('H', 2, { id: A[1], score: 3 }, { id: B[1], score: 2 }));
    expect(team()).toMatchObject({ liveScoreA: 0, liveScoreB: 0 });
    expect(lastDisp()).toMatchObject({ round: '2', right: { score: 5 }, left: { score: 2 } });
  });

  it('BAD MATCH : tireurs d’un autre relais → alerte ; END → NAK', () => {
    start(2, [
      [5, 2],
      [5, 5],
    ]);
    device(info('H', 1, { id: A[0], score: 1 }, { id: B[0], score: 0 }));
    expect(hub.getAlerts()['1']).toMatchObject({ kind: 'bad_match', arena: 'equipe1' });
    expect(team().liveScoreA).toBe(0);
    device(info('E', 1, { id: A[0], score: 1 }, { id: B[0], score: 0 }));
    expect(out[out.length - 1]).toBe('NAK');
  });

  it('appareil au repos sans le relais en cours → DISP du relais', () => {
    start(1, [[5, 2]]);
    out = [];
    device(info('W', 1, { id: A[0], score: 5 }, { id: B[0], score: 2 }));
    expect(lastDisp()).toMatchObject({ round: '2', right: { id: short(A[1]) } });
  });

  describe('remplaçant (R11 / L11 = R)', () => {
    it('accepté : le remplaçant prend la place du tireur dans ses relais suivants', () => {
      start(2, [
        [5, 2],
        [5, 5],
      ]); // relais 3 : A3 – B3
      device(info('H', 3, { id: A[2], score: 10, reserve: true }, { id: B[2], score: 7 }));
      // A3 tire aussi les relais 6 et 9 (ordre de l'application)
      expect(mockDb.setTeamBoutFencer.mock.calls).toEqual([
        ['bout6', 'A', A[3]],
        ['bout9', 'A', A[3]],
      ]);
      expect(team().bouts[5]).toMatchObject({ fencerAId: A[3], fencerAName: 'Petit Hugo' });
      // Demande répétée dans chaque INFO : traitée une seule fois
      device(info('H', 3, { id: A[2], score: 11, reserve: true }, { id: B[2], score: 7 }));
      expect(mockDb.setTeamBoutFencer).toHaveBeenCalledTimes(2);
    });

    it('refusé : équipe sans remplaçant, remplaçant déjà utilisé (tracé)', () => {
      const warn = vi.spyOn(logger, 'warn');
      start(2, [
        [5, 2],
        [5, 5],
      ]);
      device(info('H', 3, { id: A[2], score: 10 }, { id: B[2], score: 7, reserve: true }));
      expect(warn).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('no_reserve'));
      device(info('H', 3, { id: A[2], score: 10, reserve: true }, { id: B[2], score: 7 }));
      expect(mockDb.setTeamBoutFencer).toHaveBeenCalledTimes(2);
      // Relais 4 : A1 sort ; le remplaçant figure déjà dans la rencontre
      device(info('E', 3, { id: A[2], score: 15 }, { id: B[2], score: 7 }));
      device(info('H', 4, { id: A[0], score: 15, reserve: true }, { id: B[1], score: 7 }));
      expect(warn).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('reserve_used'));
      expect(mockDb.setTeamBoutFencer).toHaveBeenCalledTimes(2);
      warn.mockRestore();
    });
  });

  describe('NEXT / PREV dans la rencontre', () => {
    it('NEXT pendant un relais : refusé, relais en cours renvoyé', () => {
      start(1, [[5, 2]]);
      out = [];
      device('|EFP1.1|NEXT|1||%|');
      expect(lastDisp()).toMatchObject({ round: '2' });
      expect(team().currentBoutIndex).toBe(1);
    });

    it('PREV avant le début du relais suivant : relais précédent rappelé avec son score', () => {
      start(2, [
        [5, 2],
        [5, 5],
      ]);
      device('|EFP1.1|PREV|1||%|');
      expect(mockDb.reopenTeamBout).toHaveBeenCalledWith('bout2');
      expect(team()).toMatchObject({ currentBoutIndex: 1, liveScoreA: 5, liveScoreB: 5 });
      expect(lastDisp()).toMatchObject({ round: '2', right: { score: 10 }, left: { score: 7 } });
      // Correction puis nouvelle validation
      device(info('E', 2, { id: A[1], score: 9 }, { id: B[1], score: 7 }));
      expect(mockDb.updateTeamBout).toHaveBeenLastCalledWith('bout2', 4, 5, 'finished', A[1]);
      expect(lastDisp()).toMatchObject({ round: '3', right: { score: 9 }, left: { score: 7 } });
    });

    it('PREV après la fin de la rencontre : dernier relais rouvert, rencontre recalculée en base', () => {
      start(
        9,
        Array.from({ length: 9 }, () => [5, 4] as [number, number])
      );
      device('|EFP1.1|PREV|1||%|');
      expect(mockDb.reopenTeamBout).toHaveBeenCalledWith('bout9');
      expect(team()).toMatchObject({ currentBoutIndex: 8, liveScoreA: 5, liveScoreB: 4 });
      expect(lastDisp()).toMatchObject({ round: '9', right: { score: 45 }, left: { score: 36 } });
    });

    it('PREV refusé une fois le relais en cours commencé', () => {
      start(1, [[5, 2]]);
      device(info('H', 2, { id: A[1], score: 6 }, { id: B[1], score: 2 }));
      out = [];
      device('|EFP1.1|PREV|1||%|');
      expect(team().currentBoutIndex).toBe(1);
      expect(mockDb.reopenTeamBout).not.toHaveBeenCalled();
      expect(lastDisp()).toMatchObject({ round: '2', right: { score: 6 } });
    });

    it('afficheur : NEXT / PREV ignorés, END → NAK', () => {
      cyrano.setPistes([{ piste: '1', ip: DEVICE_IP, arena: 1, mode: 'display' }]);
      start(1, [[5, 2]]);
      out = [];
      device('|EFP1.1|PREV|1||%|');
      device(info('E', 2, { id: A[1], score: 10 }, { id: B[1], score: 2 }));
      expect(out).toEqual(['NAK']);
      expect(team().currentBoutIndex).toBe(1);
    });
  });

  describe('dernier relais : règles de fin individuelles', () => {
    const eight: [number, number][] = Array.from({ length: 8 }, () => [5, 5]);

    it('égalité sans priorité : NAK', () => {
      start(8, eight);
      device(info('E', 9, { id: A[2], score: 45 }, { id: B[1], score: 45 }));
      expect(out[out.length - 1]).toBe('NAK');
      expect(mockDb.updateTeamBout).not.toHaveBeenCalled();
    });

    it('vainqueur imposé (priorité à égalité) : NAK, non enregistrable par le modèle d’équipe', () => {
      start(8, eight);
      device(info('E', 9, { id: A[2], score: 45 }, { id: B[1], score: 45 }, { priority: 'R' }));
      expect(out[out.length - 1]).toBe('NAK');
    });

    it('victoire au cumul : ACK, rencontre terminée, affichage vide', () => {
      start(8, eight);
      device(info('E', 9, { id: A[2], score: 45 }, { id: B[1], score: 43 }));
      expect(out[out.length - 2]).toBe('ACK');
      expect(mockDb.updateTeamBout).toHaveBeenCalledWith('bout9', 5, 3, 'finished', A[2]);
      expect(out[out.length - 1]).toMatchObject({ command: 'DISP' });
      expect((out[out.length - 1] as CyranoMessage).right).toBeUndefined();
      // END répété après la fin : ACK de nouveau
      device(info('E', 9, { id: A[2], score: 45 }, { id: B[1], score: 43 }));
      expect(out[out.length - 1]).toBe('ACK');
    });
  });

  it('arme laser : affichage seul (END → NAK) ; format arène laser : non raccordé', () => {
    start(0, [], 'L');
    expect(lastDisp()).toMatchObject({ type: 'T', round: '1' });
    expect(lastDisp().weapon).toBeUndefined();
    device(info('E', 1, { id: A[0], score: 5 }, { id: B[0], score: 1 }));
    expect(out[out.length - 1]).toBe('NAK');
    // Arène laser à la place : le relais disparaît de l'appareil, rien d'autre n'est affiché
    start(0, [], 'L', 'laser-arena');
    expect(disps().every(d => !d.right)).toBe(true);
    out = [];
    device(info('E', 1, { id: A[0], score: 5 }, { id: B[0], score: 1 }));
    expect(out).toEqual([]);
  });

  it('rencontre retirée de l’arène : affichage vide', () => {
    start();
    remote.clearTeamArenaMatch('1');
    expect(lastDisp().right).toBeUndefined();
  });
});
