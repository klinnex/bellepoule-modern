/**
 * arena_control prev (#2001) : le verdict du rappel est renvoyé à la tablette demandeuse
 * (`arena:{id}:prev_result`), qui affiche le succès ou le motif du refus.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Socket } from 'socket.io';
import { handleArenaControl, type ArenaControlContext } from './arenaControl';

function run(verdict: unknown) {
  const recallPrev = vi.fn().mockReturnValue(verdict);
  const emit = vi.fn();
  const ctx = { getArena: () => ({ id: '1' }), recallPrev, logDiag: () => {} };
  const socket = { id: 's1', emit } as unknown as Socket;
  handleArenaControl(ctx as unknown as ArenaControlContext, socket, {
    arenaId: '1',
    action: 'prev',
  });
  return { recallPrev, emit };
}

describe('arena_control prev (#2001)', () => {
  it('renvoie le succès au demandeur', () => {
    const { recallPrev, emit } = run({ ok: true });
    expect(recallPrev).toHaveBeenCalledWith('1');
    expect(emit).toHaveBeenCalledWith('arena:1:prev_result', { ok: true });
  });

  it('renvoie le motif du refus', () => {
    const { emit } = run({ ok: false, reason: 'in_progress' });
    expect(emit).toHaveBeenCalledWith('arena:1:prev_result', { ok: false, reason: 'in_progress' });
  });
});
