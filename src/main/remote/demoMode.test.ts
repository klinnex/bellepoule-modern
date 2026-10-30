import { describe, it, expect, vi, afterEach } from 'vitest';
import { DemoPlayer, decideDemoAction, type DemoArenaView, type DemoPlayerHost } from './demoMode';
import type { ArenaMatch } from '../../shared/types/remote';

const constantRng = (value: number) => () => value;

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
      arenas: () => arenas,
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
    return { status: 'ready', currentMatch: player.createMatch() };
  }

  it('génère des matchs avec deux tireurs fictifs et des identifiants uniques', () => {
    const player = new DemoPlayer(makeHost(new Map()), 42);
    const first: ArenaMatch = player.createMatch();
    const second: ArenaMatch = player.createMatch();

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
