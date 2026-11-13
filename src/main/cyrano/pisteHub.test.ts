/**
 * Tests du raccordement PisteHub ↔ arènes (#1720), mode appareil maître.
 * Le serveur d'arène est un faux serveur ; l'état remonté par l'appareil passe par le
 * vrai module remote/deviceState.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Arena, ArenaMatch, ArenaUpdate } from '../../shared/types/remote';
import { CyranoServer } from './server';
import type { CyranoMessage } from './codec';
import { PisteHub, RESEND_INTERVAL_MS, type PisteRemote } from './pisteHub';
import {
  applyDeviceArenaState,
  clearArenaEvents,
  type DeviceStateContext,
} from '../remote/deviceState';

// Id BellePoule réels : UUID de 36 caractères. L'appareil n'en reçoit que les 8 premiers.
const ID_A = '7ca21969-e092-4a1b-9c3d-000000000001';
const ID_B = 'b3f0a1c2-5d6e-4f70-8a9b-000000000002';
const SHORT_A = '7ca21969';
const SHORT_B = 'b3f0a1c2';
const ARENA_ID = 'arena1';

const fencer = (id: string, firstName: string, lastName: string) => ({
  id,
  firstName,
  lastName,
  nationality: 'FRA',
  club: 'Paris Escrime',
  region: 'IDF',
});

/** Faux serveur d'arène : mêmes effets que RemoteScoreServer, diffusion vers le hub. */
class FakeArenaServer implements PisteRemote {
  readonly arenas = new Map<string, Arena>();
  readonly arenaCards = new Map<string, { cardsA: string[]; cardsB: string[] }>();
  readonly arenaTouches = new Map<string, { touchesA: string[]; touchesB: string[] }>();
  readonly arenaExits = new Map<string, Array<{ fencer: 'A' | 'B'; isVoluntary: boolean }>>();
  readonly arenaEventTimes = new Map<string, never>();
  readonly arenaSuddenDeath = new Map<string, boolean>();
  readonly arenaOvertimeType = new Map<string, string | null>();
  readonly arenaWaitingOvertime = new Map<string, boolean>();
  readonly queue: ArenaMatch[] = [];
  readonly updates: Array<{ arenaId: string; update: ArenaUpdate }> = [];
  weapon: string | null = 'E';
  onBroadcast: ((arenaId: string, update: ArenaUpdate) => void) | null = null;
  finished = 0;
  loaded = 0;
  started = 0;

  private readonly ctx: DeviceStateContext = {
    arenaCards: this.arenaCards as DeviceStateContext['arenaCards'],
    arenaEventTimes: this.arenaEventTimes as DeviceStateContext['arenaEventTimes'],
    arenaExits: this.arenaExits,
    arenaOvertimeType: this.arenaOvertimeType,
    arenaSuddenDeath: this.arenaSuddenDeath,
    arenaTouches: this.arenaTouches,
    arenaWaitingOvertime: this.arenaWaitingOvertime,
    arenas: this.arenas,
    broadcastArenaUpdate: (id, u) => this.broadcast(id, u),
    updateArenaScore: (id, a, b) => this.updateArenaScore(id, a, b),
  };

  constructor(match: ArenaMatch | null) {
    this.arenas.set(ARENA_ID, {
      id: ARENA_ID,
      name: 'Piste 1',
      number: 1,
      currentMatch: match,
      status: match ? 'ready' : 'idle',
      startTime: null,
      settings: {} as Arena['settings'],
    });
  }

  private broadcast(arenaId: string, update: ArenaUpdate): void {
    this.updates.push({ arenaId, update });
    this.onBroadcast?.(arenaId, update);
  }

  getArena(id: string): Arena | null {
    return this.arenas.get(id) ?? null;
  }

  updateArenaScore(id: string, a: number, b: number): void {
    const arena = this.arenas.get(id);
    if (!arena?.currentMatch || arena.status === 'finished') return;
    arena.currentMatch.scoreA = a;
    arena.currentMatch.scoreB = b;
    this.broadcast(id, {
      arenaId: id,
      match: arena.currentMatch,
      scoreA: a,
      scoreB: b,
      status: arena.status,
    });
  }

  startArenaMatch(id: string): void {
    const arena = this.arenas.get(id);
    if (!arena?.currentMatch) return;
    this.started++;
    arena.status = 'in_progress';
    arena.currentMatch.status = 'in_progress';
    this.broadcast(id, { arenaId: id, match: arena.currentMatch, status: 'in_progress' });
  }

  finishArenaMatch(id: string): void {
    const arena = this.arenas.get(id);
    if (!arena?.currentMatch || arena.status === 'finished') return;
    this.finished++;
    arena.status = 'finished';
    arena.currentMatch.status = 'finished';
    this.broadcast(id, { arenaId: id, match: arena.currentMatch, status: 'finished' });
  }

  loadNextMatch(id: string): void {
    const arena = this.arenas.get(id);
    if (!arena) return;
    this.loaded++;
    arena.currentMatch = this.queue.shift() ?? null;
    arena.status = arena.currentMatch ? 'ready' : 'idle';
    this.broadcast(id, { arenaId: id, match: arena.currentMatch, status: arena.status });
  }

  applyDeviceArenaState(id: string, state: Parameters<typeof applyDeviceArenaState>[2]): void {
    applyDeviceArenaState(this.ctx, id, state);
  }

  clearArenaEvents(id: string): void {
    clearArenaEvents(this.ctx, id);
  }

  getSessionWeapon(): string | null {
    return this.weapon;
  }
}

/** Trame INFO telle que la produit le codec (Id tronqués à 8 caractères). */
function info(
  state: CyranoMessage['state'],
  right: Partial<CyranoMessage['right']>,
  left: Partial<CyranoMessage['left']>,
  extra: Partial<CyranoMessage> = {}
): CyranoMessage {
  return {
    protocol: 'EFP1.1',
    command: 'INFO',
    piste: '1',
    compe: 'test',
    state,
    right: { id: SHORT_A, ...right },
    left: { id: SHORT_B, ...left },
    ...extra,
  };
}

function makeMatch(over: Partial<ArenaMatch> = {}): ArenaMatch {
  return {
    id: 'match-1',
    poolId: 'pool-1',
    fencerA: fencer(ID_A, 'Pierre', 'Martin') as unknown as ArenaMatch['fencerA'],
    fencerB: fencer(ID_B, 'Paul', 'Durand') as unknown as ArenaMatch['fencerB'],
    scoreA: 0,
    scoreB: 0,
    status: 'ready',
    startTime: null,
    endTime: null,
    ...over,
  };
}

describe('PisteHub — appareil maître (#1720)', () => {
  let cyrano: CyranoServer;
  let remote: FakeArenaServer;
  let hub: PisteHub;
  let sendDisp: ReturnType<typeof vi.spyOn>;
  let sendAck: ReturnType<typeof vi.spyOn>;
  let sendNak: ReturnType<typeof vi.spyOn>;

  const emitInfo = (msg: CyranoMessage) => {
    const piste = cyrano.findPiste('1');
    if (!piste) throw new Error('piste 1 absente');
    cyrano.emit('info', piste, msg);
  };
  const emitNext = () => {
    const piste = cyrano.findPiste('1');
    if (!piste) throw new Error('piste 1 absente');
    cyrano.emit('next', piste, { protocol: 'EFP1.1', command: 'NEXT', piste: '1', compe: 'test' });
  };
  /** Id du tireur droit du dernier DISP (complet ici ; la trame le tronque) : identifie le match. */
  const lastDispRightId = () => {
    const calls = sendDisp.mock.calls;
    return calls.length
      ? (calls[calls.length - 1][1] as { right?: { id?: string } }).right?.id
      : undefined;
  };

  function setup(match: ArenaMatch | null = makeMatch()) {
    cyrano = new CyranoServer({ compe: 'test' });
    cyrano.setPistes([{ piste: '1', ip: '10.0.0.5', arena: 1, protocol: 'EFP1.1' }]);
    remote = new FakeArenaServer(match);
    hub = new PisteHub(cyrano, () => remote);
    remote.onBroadcast = (arenaId, update) => hub.onArenaUpdate(arenaId, update);
    hub.attach();
    sendDisp = vi.spyOn(cyrano, 'sendDisp').mockReturnValue(true);
    sendAck = vi.spyOn(cyrano, 'sendAck').mockReturnValue(true);
    sendNak = vi.spyOn(cyrano, 'sendNak').mockReturnValue(true);
    // Comme en production : le DISP part à l'affectation du match
    const current = remote.getArena(ARENA_ID)?.currentMatch;
    if (current)
      hub.onArenaUpdate(ARENA_ID, { arenaId: ARENA_ID, match: current, status: 'ready' });
    sendDisp.mockClear();
  }

  beforeEach(() => {
    setup();
  });

  afterEach(() => {
    hub.detach();
    vi.restoreAllMocks();
  });

  it('retrouve le match avec les Id tronqués à 8 caractères (bug : Id de 36 caractères)', () => {
    emitInfo(info('F', { score: 2 }, { score: 1 }));
    const arena = remote.getArena(ARENA_ID)!;
    expect(arena.currentMatch?.scoreA).toBe(2);
    expect(arena.currentMatch?.scoreB).toBe(1);
  });

  it('suit l’Id du tireur après inversion droite/gauche', () => {
    emitInfo(info('F', { id: SHORT_B, score: 3 }, { id: SHORT_A, score: 0 }));
    const m = remote.getArena(ARENA_ID)!.currentMatch!;
    expect(m.scoreA).toBe(0);
    expect(m.scoreB).toBe(3);
  });

  it('démarre le match à l’assaut (F) et passe le chrono en marche', () => {
    emitInfo(info('F', { score: 0 }, { score: 0 }, { time: '2:57' }));
    expect(remote.started).toBe(1);
    const last = remote.updates[remote.updates.length - 1].update;
    expect(last.time).toBe(177);
    expect(last.timerStatus).toBe('running');
  });

  it('chrono en pause pour H et P', () => {
    emitInfo(info('H', { score: 0 }, { score: 0 }, { time: '1:00.25' }));
    const last = remote.updates[remote.updates.length - 1].update;
    expect(last.time).toBe(60);
    expect(last.timerStatus).toBe('paused');
  });

  it('applique les cartons jaunes et rouges annoncés par l’appareil', () => {
    emitInfo(info('F', { yellowCards: 1, redCards: 0 }, { yellowCards: 0, redCards: 1 }));
    expect(remote.arenaCards.get(ARENA_ID)).toEqual({ cardsA: ['yellow'], cardsB: ['red'] });
  });

  it('conserve les cartons blancs ou noirs saisis sur la tablette', () => {
    remote.arenaCards.set(ARENA_ID, { cardsA: ['white'], cardsB: [] });
    emitInfo(info('F', { yellowCards: 1 }, {}));
    expect(remote.arenaCards.get(ARENA_ID)?.cardsA).toEqual(['yellow', 'white']);
  });

  it('ne renvoie pas de DISP en écho d’un score saisi sur l’appareil', () => {
    sendDisp.mockClear();
    emitInfo(info('F', { score: 4 }, { score: 2 }));
    expect(sendDisp).not.toHaveBeenCalled();
  });

  it('renvoie un DISP quand l’arbitre corrige le score sur la tablette', () => {
    sendDisp.mockClear();
    remote.updateArenaScore(ARENA_ID, 5, 2);
    expect(sendDisp).toHaveBeenCalledTimes(1);
    const disp = sendDisp.mock.calls[0][1] as { right: { score: number }; left: { score: number } };
    expect(disp.right.score).toBe(5);
    expect(disp.left.score).toBe(2);
  });

  it('ignore une trame dont les tireurs ne sont pas ceux du match (BAD MATCH)', () => {
    emitInfo(info('F', { id: '99999999', score: 9 }, { score: 9 }));
    expect(remote.getArena(ARENA_ID)!.currentMatch!.scoreA).toBe(0);
    expect(remote.started).toBe(0);
  });

  it('répond NAK à un END qui ne concerne pas le match affiché (BAD MATCH)', () => {
    emitInfo(info('E', { id: '99999999', score: 5 }, { score: 2 }));
    expect(sendNak).toHaveBeenCalledWith('1');
    expect(sendAck).not.toHaveBeenCalled();
    expect(remote.finished).toBe(0);
  });

  it('END valide : enregistre le score final, ACK, termine le match sans DISP ensuite', () => {
    sendDisp.mockClear();
    emitInfo(info('E', { score: 5, status: 'V' }, { score: 2, status: 'D' }, { time: '0:00' }));
    expect(sendAck).toHaveBeenCalledWith('1');
    expect(remote.finished).toBe(1);
    const m = remote.getArena(ARENA_ID)!.currentMatch!;
    expect(m.scoreA).toBe(5);
    expect(m.scoreB).toBe(2);
    expect(m.status).toBe('finished');
    expect(sendDisp).not.toHaveBeenCalled();
  });

  it('END répété après ACK : ACK sans second enregistrement', () => {
    emitInfo(info('E', { score: 5, status: 'V' }, { score: 2, status: 'D' }));
    emitInfo(info('E', { score: 5, status: 'V' }, { score: 2, status: 'D' }));
    expect(sendAck).toHaveBeenCalledTimes(2);
    expect(remote.finished).toBe(1);
  });

  it('END invalide (égalité sans priorité) : NAK, match toujours en cours', () => {
    emitInfo(info('E', { score: 3, status: 'U' }, { score: 3, status: 'U' }));
    expect(sendNak).toHaveBeenCalledWith('1');
    expect(sendAck).not.toHaveBeenCalled();
    expect(remote.getArena(ARENA_ID)!.status).not.toBe('finished');
  });

  it('END avec priorité : accepté', () => {
    emitInfo(info('E', { score: 3, status: 'U' }, { score: 3, status: 'U' }, { priority: 'R' }));
    expect(sendAck).toHaveBeenCalledWith('1');
    expect(remote.finished).toBe(1);
  });

  it('NEXT refusé pendant un assaut : le match en cours est renvoyé', () => {
    emitInfo(info('F', { score: 1 }, { score: 0 }));
    sendDisp.mockClear();
    remote.queue.push(
      makeMatch({
        id: 'match-2',
        fencerA: fencer(
          'c0000000-0000-4000-8000-000000000003',
          'A',
          'B'
        ) as unknown as ArenaMatch['fencerA'],
      })
    );
    emitNext();
    expect(remote.loaded).toBe(0);
    expect(sendDisp).toHaveBeenCalledTimes(1);
    expect(lastDispRightId()).toBe(ID_A);
  });

  it('NEXT après END : charge le match suivant et envoie son DISP', () => {
    emitInfo(info('E', { score: 5, status: 'V' }, { score: 2, status: 'D' }));
    remote.queue.push(
      makeMatch({
        id: 'match-2',
        scoreA: 0,
        scoreB: 0,
        fencerA: fencer(
          'c0000000-0000-4000-8000-000000000003',
          'Alice',
          'Dupont'
        ) as unknown as ArenaMatch['fencerA'],
      })
    );
    sendDisp.mockClear();
    emitNext();
    expect(remote.loaded).toBe(1);
    expect(sendDisp).toHaveBeenCalledTimes(1);
    expect(lastDispRightId()).toBe('c0000000-0000-4000-8000-000000000003');
  });

  it('DISP envoyé avec l’arme de la séance', () => {
    sendDisp.mockClear();
    remote.updateArenaScore(ARENA_ID, 1, 0);
    expect(sendDisp.mock.calls[0][1]).toMatchObject({ weapon: 'E' });
  });

  it('Sabre laser : affichage seul, pas de télécommande', () => {
    remote.weapon = 'L';
    emitInfo(info('F', { score: 4 }, { score: 4 }));
    expect(remote.getArena(ARENA_ID)!.currentMatch!.scoreA).toBe(0);
    emitInfo(info('E', { score: 5, status: 'V' }, { score: 2, status: 'D' }));
    expect(sendNak).toHaveBeenCalledWith('1');
    expect(remote.finished).toBe(0);
  });

  it('INFO W : rappel du match au plus une fois toutes les 5 s', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    sendDisp.mockClear();
    emitInfo(info('W', {}, {}, { right: undefined, left: undefined } as Partial<CyranoMessage>));
    emitInfo(info('W', {}, {}, { right: undefined, left: undefined } as Partial<CyranoMessage>));
    expect(sendDisp).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_000_000 + RESEND_INTERVAL_MS);
    emitInfo(info('W', {}, {}, { right: undefined, left: undefined } as Partial<CyranoMessage>));
    expect(sendDisp).toHaveBeenCalledTimes(2);
  });

  it('INFO W sur le bon match : pas de rappel', () => {
    sendDisp.mockClear();
    emitInfo(info('W', { score: 0 }, { score: 0 }));
    expect(sendDisp).not.toHaveBeenCalled();
  });

  it('pas de DISP sans match : DISP vide une seule fois', () => {
    const idle = new FakeArenaServer(null);
    cyrano.setPistes([{ piste: '1', ip: '10.0.0.5', arena: 1, protocol: 'EFP1.1' }]);
    hub.detach();
    hub = new PisteHub(cyrano, () => idle);
    idle.onBroadcast = (arenaId, update) => hub.onArenaUpdate(arenaId, update);
    hub.attach();
    sendDisp.mockClear();
    idle.updates.length = 0;
    idle.getArena(ARENA_ID);
    idle.arenas.get(ARENA_ID)!.status = 'idle';
    hub.onArenaUpdate(ARENA_ID, { arenaId: ARENA_ID, match: null, status: 'idle' });
    hub.onArenaUpdate(ARENA_ID, { arenaId: ARENA_ID, match: null, status: 'idle' });
    expect(sendDisp).toHaveBeenCalledTimes(1);
    expect(sendDisp.mock.calls[0][1]).toEqual({});
  });
});
