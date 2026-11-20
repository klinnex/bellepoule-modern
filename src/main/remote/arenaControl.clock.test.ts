/**
 * Reprise du chrono au redémarrage (#1829) : la dernière valeur du chrono est gardée avec le
 * match de l'arène et persistée (pause : toujours ; en marche : au plus toutes les 15 s).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Socket } from 'socket.io';
import { handleArenaControl, type ArenaControlContext } from './arenaControl';

function setup(arenaId: string) {
  const arena = { id: arenaId, status: 'in_progress', currentMatch: { id: 'm1' } };
  const persistArenaState = vi.fn();
  const ctx = {
    getArena: () => arena,
    isTrainingMode: false,
    arenaSuddenDeath: new Map(),
    arenaOvertimeType: new Map(),
    arenaWaitingOvertime: new Map(),
    broadcastArenaUpdate: vi.fn(),
    persistArenaState,
  } as unknown as ArenaControlContext;
  const send = (action: string, time: number) =>
    handleArenaControl(ctx, { id: 's', emit: vi.fn() } as unknown as Socket, {
      arenaId,
      action,
      time,
      timerStatus: action === 'update_timer' ? 'running' : 'paused',
    });
  return { arena, persistArenaState, send };
}

describe('arena_control chrono (#1829)', () => {
  afterEach(() => vi.useRealTimers());

  it('pause : chrono gardé avec le match et persisté', () => {
    const { arena, persistArenaState, send } = setup('arenaA');
    send('pause_timer', 95);
    expect((arena.currentMatch as { clockSeconds?: number }).clockSeconds).toBe(95);
    expect(persistArenaState).toHaveBeenCalledWith('arenaA');
  });

  it('en marche : au plus une écriture toutes les 15 s', () => {
    vi.useFakeTimers();
    const { arena, persistArenaState, send } = setup('arenaB');
    send('update_timer', 170);
    send('update_timer', 169);
    send('update_timer', 168);
    expect(persistArenaState).toHaveBeenCalledTimes(1);
    expect((arena.currentMatch as { clockSeconds?: number }).clockSeconds).toBe(168);
    vi.advanceTimersByTime(15_000);
    send('update_timer', 153);
    expect(persistArenaState).toHaveBeenCalledTimes(2);
  });
});
