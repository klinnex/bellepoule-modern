/**
 * select_match (#1882) : la tablette renvoie les noms abrégés qu'elle a reçus (masquage
 * RGPD) ; l'arène garde les tireurs de la session, pas ceux de la tablette.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Socket } from 'socket.io';
import { handleArenaControl, type ArenaControlContext } from './arenaControl';

describe('arena_control select_match (#1882)', () => {
  it('reprend fencerA / fencerB / referee de la session', () => {
    const real = {
      fencerA: { id: 'a', lastName: 'DUPONT', firstName: 'Léa' },
      fencerB: { id: 'b', lastName: 'DURAND', firstName: 'Léo' },
      referee: { id: 'r', name: 'MARTIN Paul' },
    };
    const assignMatchToArena = vi.fn();
    const ctx = {
      getArena: () => ({ id: '1' }),
      sessionMatches: [{ id: 'm1', isTableau: false, ...real }],
      assignMatchToArena,
      logDiag: () => {},
      arenaCards: new Map(),
      arenaTouches: new Map(),
      arenaExits: new Map(),
      arenaEventTimes: new Map(),
    } as unknown as ArenaControlContext;
    handleArenaControl(ctx, { id: 's1', emit: vi.fn() } as unknown as Socket, {
      arenaId: '1',
      action: 'select_match',
      match: {
        id: 'm1',
        fencerA: { id: 'a', lastName: 'D.', firstName: 'L.' },
        fencerB: { id: 'b', lastName: 'D.', firstName: 'L.' },
        referee: { id: 'r', name: 'M. P.' },
        scoreA: 0,
        scoreB: 0,
      } as never,
    });
    const assigned = assignMatchToArena.mock.calls[0][1];
    expect(assigned.fencerA).toEqual(real.fencerA);
    expect(assigned.fencerB).toEqual(real.fencerB);
    expect(assigned.referee).toEqual(real.referee);
  });
});
