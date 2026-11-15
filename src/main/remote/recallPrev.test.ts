/**
 * Rappel PREV (recallPrevMatch, #1829) : état de l'arène, base et file après un rappel
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recallPrevMatch, type ArenaQueueContext } from './arenaQueue';
import { PREV_WINDOW_MS, type LastFinishedSnapshot } from './prevMatch';
import type { ArenaMatch } from '../../shared/types/remote';

const fencer = (id: string) => ({ id, firstName: id, lastName: id }) as never;

const done: ArenaMatch = {
  id: 'm1',
  poolId: 'p1',
  fencerA: fencer('a'),
  fencerB: fencer('b'),
  scoreA: 5,
  scoreB: 2,
  status: 'finished',
  startTime: new Date(1000),
  endTime: new Date(2000),
  duration: 120,
};

const next: ArenaMatch = {
  ...done,
  id: 'm2',
  status: 'not_started',
  scoreA: 0,
  scoreB: 0,
  endTime: null,
  startTime: null,
  duration: undefined,
};

function makeCtx(opts: {
  current: ArenaMatch | null;
  snapshot?: LastFinishedSnapshot;
  queue?: ArenaMatch[];
  dbThrows?: boolean;
}) {
  const arena = { id: 'a1', currentMatch: opts.current, status: 'ready' };
  const arenaLastFinished = new Map<string, LastFinishedSnapshot>();
  if (opts.snapshot) arenaLastFinished.set('a1', opts.snapshot);
  const arenaMatchQueue = new Map<string, ArenaMatch[]>([['a1', opts.queue ?? []]]);
  const arenaCards = new Map();
  const arenaTouches = new Map();
  const arenaExits = new Map();
  const arenaEventTimes = new Map();
  const db = {
    clearArenaEvents: vi.fn(() => {
      if (opts.dbThrows) throw new Error('boom');
    }),
  };
  const assignMatchToArena = vi.fn((_id: string, m: ArenaMatch) => {
    arena.currentMatch = m;
  });
  const ctx = {
    arenas: new Map([['a1', arena]]),
    session: { competitionId: 'c' },
    isTrainingMode: false,
    arenaLastFinished,
    arenaMatchQueue,
    arenaCards,
    arenaTouches,
    arenaExits,
    arenaEventTimes,
    db,
    resolveDbMatchId: (m: ArenaMatch) => m.id,
    assignMatchToArena,
  } as unknown as ArenaQueueContext;
  return { ctx, arena, db, assignMatchToArena, arenaMatchQueue, arenaCards, arenaExits };
}

const snapshot: LastFinishedSnapshot = {
  match: done,
  finishedAt: Date.now(),
  events: {
    cards: { cardsA: ['yellow'], cardsB: [] },
    touches: { touchesA: ['A'], touchesB: [] },
    exits: [{ fencer: 'B', isVoluntary: true }],
  },
};

describe('recallPrevMatch', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('rend le match terminé à l’arène, scores conservés, et restaure les événements', () => {
    const { ctx, arena, db, assignMatchToArena, arenaCards, arenaExits } = makeCtx({
      current: next,
      snapshot,
    });
    expect(recallPrevMatch(ctx, 'a1')).toBe(true);
    expect(db.clearArenaEvents).toHaveBeenCalledWith('m1');
    expect(assignMatchToArena).toHaveBeenCalledTimes(1);
    expect(arena.currentMatch).toMatchObject({
      id: 'm1',
      scoreA: 5,
      scoreB: 2,
      status: 'not_started',
    });
    expect(arenaCards.get('a1')).toEqual({ cardsA: ['yellow'], cardsB: [] });
    expect(arenaExits.get('a1')).toEqual([{ fencer: 'B', isVoluntary: true }]);
  });

  it('refuse sans rien modifier hors fenêtre', () => {
    const old: LastFinishedSnapshot = {
      ...snapshot,
      finishedAt: Date.now() - PREV_WINDOW_MS - 1000,
    };
    const { ctx, arena, db, assignMatchToArena } = makeCtx({ current: next, snapshot: old });
    expect(recallPrevMatch(ctx, 'a1')).toBe(false);
    expect(db.clearArenaEvents).not.toHaveBeenCalled();
    expect(assignMatchToArena).not.toHaveBeenCalled();
    expect(arena.currentMatch).toBe(next);
  });

  it('refuse un combat en cours', () => {
    const running = { ...next, status: 'in_progress' as const };
    const { ctx, assignMatchToArena } = makeCtx({ current: running, snapshot });
    expect(recallPrevMatch(ctx, 'a1')).toBe(false);
    expect(assignMatchToArena).not.toHaveBeenCalled();
  });

  it('n’efface rien et ne rend rien si la purge DB échoue', () => {
    const { ctx, assignMatchToArena } = makeCtx({ current: next, snapshot, dbThrows: true });
    expect(recallPrevMatch(ctx, 'a1')).toBe(false);
    expect(assignMatchToArena).not.toHaveBeenCalled();
  });

  it('remet en tête de file un match DE non commencé', () => {
    const de: ArenaMatch = { ...next, id: 'de1', isTableau: true };
    const { ctx, arenaMatchQueue } = makeCtx({ current: de, snapshot, queue: [] });
    expect(recallPrevMatch(ctx, 'a1')).toBe(true);
    expect(arenaMatchQueue.get('a1')?.map(m => m.id)).toEqual(['de1']);
  });
});
