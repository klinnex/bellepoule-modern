/**
 * Bout en bout Cyrano — relais FIE par équipes (#1829) : appareil simulé en UDP réel (boucle
 * locale, DISP `Type=T`) ↔ CyranoServer ↔ pilote Cyrano ↔ PisteHub ↔ RemoteScoreServer (arène
 * équipe `/equipe1`). Scénario : relais 1 → VALIDATE → ACK → relais 2 aux cumuls → remplaçant
 * → VALIDATE → relais 3 → PREV (relais 2 rappelé).
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
import { CyranoPisteDriver } from './driver';
import { PisteHub } from '../piste/pisteHub';
import { generateRelayOrder } from '../../features/teams/utils/teamCalculations';
// Appareil simulé (scripts/lib/cyranoDevice.js), testé ici car Vitest ne couvre que src/
const { CyranoDevice } = require('../../../scripts/lib/cyranoDevice.js');

const A = ['3a1f0c9e-1111', '3a2f0c9e-2222', '3a3f0c9e-3333', '3a4f0c9e-4444'].map(
  p => `${p}-4000-8000-000000000000`
);
const B = ['9b1e7d2c-1111', '9b2e7d2c-2222', '9b3e7d2c-3333'].map(
  p => `${p}-4000-8000-000000000000`
);
const short = (id: string) => id.slice(0, 8);

const detail = () => ({
  id: 'tm1',
  competitionId: 'comp-t',
  teamAId: 'tA',
  teamAName: 'Lyon',
  teamBId: 'tB',
  teamBName: 'Gand',
  status: 'not_started',
  currentBoutIndex: 0,
  bouts: generateRelayOrder(3).map(([a, b], i) => ({
    id: `bout${i + 1}`,
    boutOrder: i + 1,
    fencerAId: A[a],
    fencerAName: `A${a + 1}`,
    fencerBId: B[b],
    fencerBName: `B${b + 1}`,
    scoreA: 0,
    scoreB: 0,
    maxScore: 45,
    status: 'not_started',
    winnerId: null,
  })),
});

const mockDb = {
  getCompetition: vi.fn().mockReturnValue({
    id: 'comp-t',
    weapon: 'E',
    settings: { minTeamSize: 3, teamRelayStepSize: 5 },
  }),
  getTeamMatchDetail: vi.fn(() => detail()),
  getTeamBoutCards: vi.fn().mockReturnValue([]),
  getTeamMatchCards: vi.fn().mockReturnValue([]),
  updateTeamBout: vi.fn(),
  setTeamBoutFencer: vi.fn(),
  reopenTeamBout: vi.fn(),
  getTeamsByCompetition: vi.fn().mockReturnValue([
    {
      id: 'tA',
      name: 'Lyon',
      club: '',
      fencers: [
        {
          fencerId: A[3],
          fencerLastName: 'Remplaçant',
          fencerFirstName: 'R',
          teamOrder: 4,
          isReserve: true,
        },
      ],
    },
  ]),
  getFencer: vi.fn().mockReturnValue(null),
  getArenaState: vi.fn().mockReturnValue(null),
  getSessionState: vi.fn().mockReturnValue(null),
  getFencersByCompetition: vi.fn().mockReturnValue([]),
  getRefereesByCompetition: vi.fn().mockReturnValue([]),
};

async function until(cond: () => boolean, ms = 15000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('délai dépassé en attendant la trame UDP');
    await new Promise(r => setTimeout(r, 15));
  }
}

describe('Cyrano bout en bout : relais par équipes, UDP réel (#1829)', { timeout: 30_000 }, () => {
  let cyrano: CyranoServer;
  let remote: RemoteScoreServer;
  let device: InstanceType<typeof CyranoDevice>;
  let hub: PisteHub;
  let acks = 0;
  const team = () => remote.teamArenaCtx.teamArenaState.get('1')!;
  const snap = () => device.snapshot();

  beforeAll(async () => {
    remote = new RemoteScoreServer(mockDb as never, 8066);
    cyrano = new CyranoServer({ host: '127.0.0.1', port: 0, helloIntervalMs: 60_000 });
    const serverPort = await cyrano.start(0);
    device = new CyranoDevice({ piste: '1', port: 0, serverPort, server: '127.0.0.1' });
    await device.start();
    device.port = device.sock.address().port;
    cyrano.setPistes([{ piste: '1', ip: '127.0.0.1', port: device.port, arena: 1 }]);
    hub = new PisteHub(new CyranoPisteDriver(cyrano), () => remote);
    hub.attach();
    const sendAck = cyrano.sendAck.bind(cyrano);
    vi.spyOn(cyrano, 'sendAck').mockImplementation(p => (++acks, sendAck(p)));
    remote.cyranoTeamHook = id => hub.onTeamArenaUpdate(id, remote);
    remote.setTeamArenaMatch('1', 'tm1', false);
    await until(() => snap().team && snap().right.id === short(A[0]));
  });

  afterAll(async () => {
    device?.stop();
    await cyrano?.stop();
  });

  it('DISP Type=T reçu par UDP : relais 1, tireurs du relais, nation = équipe', () => {
    expect(snap()).toMatchObject({
      team: true,
      relay: 1,
      state: 'W',
      general: { weapon: 'E' },
      right: { id: short(A[0]), nat: 'LYO', score: 0 },
      left: { id: short(B[0]), nat: 'GAN', score: 0 },
    });
  });

  it('relais 1 : touches de l’appareil → score du relais sur l’arène équipe', async () => {
    device.command('begin');
    for (let i = 0; i < 5; i++) device.command('r+');
    device.command('l+');
    device.command('l+');
    await until(() => team().liveScoreA === 5 && team().liveScoreB === 2);
  });

  it('VALIDATE → ACK → relais 2 affiché avec les scores cumulés', async () => {
    device.command('validate');
    await until(() => acks >= 1);
    await until(() => snap().relay === 2 && snap().state === 'W');
    expect(mockDb.updateTeamBout).toHaveBeenCalledWith('bout1', 5, 2, 'finished', A[0]);
    expect(snap()).toMatchObject({
      right: { id: short(A[1]), score: 5 },
      left: { id: short(B[1]), score: 2 },
    });
  });

  it('relais 2 : BEGIN sans remise à zéro, remplaçant demandé (RESERVE) puis accepté', async () => {
    device.command('begin');
    device.command('resr');
    await until(() => mockDb.setTeamBoutFencer.mock.calls.length > 0);
    // A2 tire les relais 2, 5 et 8 (ordre de l'application) : remplacé dans 5 et 8
    expect(mockDb.setTeamBoutFencer.mock.calls).toEqual([
      ['bout5', 'A', A[3]],
      ['bout8', 'A', A[3]],
    ]);
    device.command('l+');
    await until(() => team().liveScoreB === 1);
    expect(team().liveScoreA).toBe(0);
  });

  it('VALIDATE → relais 3 ; PREV avant BEGIN → relais 2 rappelé aux mêmes cumuls', async () => {
    device.command('validate');
    await until(() => acks >= 2 && snap().relay === 3 && snap().state === 'W');
    expect(snap()).toMatchObject({ right: { score: 5 }, left: { score: 3 } });
    device.command('prev');
    await until(() => snap().relay === 2);
    expect(team()).toMatchObject({ currentBoutIndex: 1, liveScoreA: 0, liveScoreB: 1 });
    expect(snap()).toMatchObject({ right: { score: 5 }, left: { score: 3 } });
  });
});
