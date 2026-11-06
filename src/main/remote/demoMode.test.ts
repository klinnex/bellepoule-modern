import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DemoPlayer,
  decideDemoAction,
  touchPoints,
  type DemoArenaView,
  type DemoPlayerHost,
} from './demoMode';
import type { ArenaMatch } from '../../shared/types/remote';
import { Weapon } from '../../shared/types';
import { createRng } from '../../shared/utils/tournamentSimulator';

const constantRng = (value: number) => () => value;

describe('touchPoints', () => {
  it('compte 1 point par touche hors Laser', () => {
    for (const weapon of [Weapon.EPEE, Weapon.FOIL, Weapon.SABRE, Weapon.CUSTOM]) {
      expect(touchPoints({ weapon, allowedZones: [] }, constantRng(0.99))).toBe(1);
    }
  });

  it('Laser : zone tirée parmi les zones autorisées (1, 3 ou 5 points)', () => {
    const profile = { weapon: Weapon.LASER, allowedZones: [] };
    expect(touchPoints(profile, constantRng(0))).toBe(1);
    expect(touchPoints(profile, constantRng(0.99))).toBe(5);
    expect(touchPoints({ weapon: Weapon.LASER, allowedZones: ['B'] }, constantRng(0.99))).toBe(3);
  });
});

describe('decideDemoAction', () => {
  it('démarre un match prêt', () => {
    const action = decideDemoAction(
      { status: 'ready', scoreA: 0, scoreB: 0, scoreLimit: 15 },
      constantRng(0)
    );
    expect(action).toEqual({ kind: 'start' });
  });

  it('ne fait rien hors match en cours (arène terminée ou libre)', () => {
    for (const status of ['finished', 'idle']) {
      expect(
        decideDemoAction({ status, scoreA: 15, scoreB: 3, scoreLimit: 15 }, constantRng(0))
      ).toEqual({ kind: 'wait' });
    }
  });

  it('termine dès qu’un tireur atteint la limite', () => {
    const action = decideDemoAction(
      { status: 'in_progress', scoreA: 3, scoreB: 15, scoreLimit: 15 },
      constantRng(0)
    );
    expect(action).toEqual({ kind: 'finish' });
  });

  it('marque un point du côté tiré au sort quand le tirage passe le seuil', () => {
    const state = { status: 'in_progress', scoreA: 2, scoreB: 2, scoreLimit: 15 };
    expect(decideDemoAction(state, constantRng(0.1))).toEqual({ kind: 'point', side: 'A' });
    expect(decideDemoAction(state, constantRng(0.9))).toEqual({ kind: 'wait' });
  });
});

describe('DemoPlayer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeHost(arenas: Map<string, DemoArenaView>) {
    const host = {
      arenas,
      startArenaMatch: vi.fn((id: string) => {
        const a = arenas.get(id)!;
        a.status = 'in_progress';
      }),
      updateArenaScore: vi.fn((id: string, scoreA: number, scoreB: number) => {
        const m = arenas.get(id)!.currentMatch!;
        m.scoreA = scoreA;
        m.scoreB = scoreB;
      }),
      finishArenaMatch: vi.fn((id: string) => {
        arenas.get(id)!.status = 'finished';
      }),
      getScoreLimit: vi.fn(() => 15),
    } satisfies DemoPlayerHost;
    return host;
  }

  function readyArena(player: DemoPlayer): DemoArenaView {
    return { status: 'ready', currentMatch: player.createMatch()! };
  }

  it('génère des matchs avec deux tireurs fictifs et des identifiants uniques', () => {
    const player = new DemoPlayer(makeHost(new Map()), 42);
    const first: ArenaMatch = player.createMatch()!;
    const second: ArenaMatch = player.createMatch()!;

    expect(first.id).not.toBe(second.id);
    expect(first.fencerA.id).not.toBe(first.fencerB.id);
    expect(first.fencerA.lastName).toBeTruthy();
    expect(first.status).toBe('not_started');
    expect(first.scoreA).toBe(0);
    expect(first.scoreB).toBe(0);
  });

  it('joue un match complet de bout en bout jusqu’à la limite', () => {
    const arenas = new Map<string, DemoArenaView>();
    const host = makeHost(arenas);
    const player = new DemoPlayer(host, 7);
    arenas.set('arena1', readyArena(player));

    for (let i = 0; i < 500 && arenas.get('arena1')!.status !== 'finished'; i++) {
      player.tick();
    }

    const match = arenas.get('arena1')!.currentMatch!;
    expect(arenas.get('arena1')!.status).toBe('finished');
    expect(Math.max(match.scoreA, match.scoreB)).toBe(15);
    expect(host.startArenaMatch).toHaveBeenCalledWith('arena1');
    expect(host.finishArenaMatch).toHaveBeenCalledWith('arena1');
  });

  it('Laser restreint à la zone C : chaque touche vaut 5 points', () => {
    const arenas = new Map<string, DemoArenaView>();
    const host = makeHost(arenas);
    const player = new DemoPlayer(host, 11, { weapon: Weapon.LASER, allowedZones: ['C'] });
    arenas.set('arena1', readyArena(player));

    for (let i = 0; i < 500 && arenas.get('arena1')!.status !== 'finished'; i++) {
      player.tick();
    }

    const match = arenas.get('arena1')!.currentMatch!;
    expect(match.scoreA % 5).toBe(0);
    expect(match.scoreB % 5).toBe(0);
    expect(Math.max(match.scoreA, match.scoreB)).toBe(15);
  });

  it('ignore les arènes sans match', () => {
    const arenas = new Map<string, DemoArenaView>([
      ['arena1', { status: 'idle', currentMatch: null }],
    ]);
    const host = makeHost(arenas);
    new DemoPlayer(host, 1).tick();
    expect(host.startArenaMatch).not.toHaveBeenCalled();
    expect(host.updateArenaScore).not.toHaveBeenCalled();
  });

  it('pilote l’arbitrage à intervalle régulier et s’arrête sur demande', () => {
    vi.useFakeTimers();
    const arenas = new Map<string, DemoArenaView>();
    const host = makeHost(arenas);
    const player = new DemoPlayer(host, 3);
    arenas.set('arena1', readyArena(player));

    player.start(1000);
    expect(player.running).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(host.startArenaMatch).toHaveBeenCalledTimes(1);

    player.stop();
    expect(player.running).toBe(false);
    const callsAfterStop =
      host.startArenaMatch.mock.calls.length + host.updateArenaScore.mock.calls.length;
    vi.advanceTimersByTime(10_000);
    expect(host.startArenaMatch.mock.calls.length + host.updateArenaScore.mock.calls.length).toBe(
      callsAfterStop
    );
  });
});

describe('DemoPlayer + poules', () => {
  it('enregistre le score final dans la poule à la fin du match', () => {
    const arenas = new Map<string, DemoArenaView>();
    const finished: string[] = [];
    const player = new DemoPlayer(
      {
        arenas,
        startArenaMatch: () => undefined,
        updateArenaScore: () => undefined,
        finishArenaMatch: id => finished.push(id),
        getScoreLimit: () => 5,
      },
      1
    );
    const match = player.createMatch()!;
    match.scoreA = 5;
    match.scoreB = 3;
    arenas.set('arena1', { status: 'in_progress', currentMatch: match });
    player.tick();
    expect(finished).toEqual(['arena1']);
    const rows = player.tournamentState().pools.flatMap(p => p.rankings);
    expect(rows.find(r => r.id === match.fencerA.id)?.victories).toBe(1);
    expect(rows.find(r => r.id === match.fencerB.id)?.touchesFor).toBe(3);
  });
});

describe('DemoPlayer chrono', () => {
  it('diffuse le temps restant des matchs en cours', () => {
    const arenas = new Map<string, DemoArenaView>();
    const timers: [string, number][] = [];
    const player = new DemoPlayer(
      {
        arenas,
        startArenaMatch: id => {
          arenas.get(id)!.status = 'in_progress';
        },
        updateArenaScore: () => undefined,
        finishArenaMatch: () => undefined,
        getScoreLimit: () => 5,
        broadcastArenaUpdate: (id, u) => timers.push([id, u.time ?? -1]),
        trainingCustomRules: { matchDurationSeconds: 60 },
      },
      1
    );
    let now = 1_000_000;
    player.setClock(() => now);
    arenas.set('arena1', { status: 'ready', currentMatch: player.createMatch()! });
    player.tick(); // démarrage : chrono plein
    expect(timers).toEqual([['arena1', 60]]);
    now += 12_500;
    player.tick();
    expect(timers[timers.length - 1]).toEqual(['arena1', 48]);
    now += 120_000;
    player.tick();
    expect(timers[timers.length - 1]).toEqual(['arena1', 0]);
  });
});
