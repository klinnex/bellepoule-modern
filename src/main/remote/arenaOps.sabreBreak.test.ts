/**
 * Sabre, tableau à 15 : pause de première période à 8 touches (t.39.1, #2001) signalée à la
 * tablette par l'événement `arena:{id}:sabre_break`, une seule fois par franchissement.
 */
import { describe, it, expect, vi } from 'vitest';
import { Weapon } from '../../shared/types';
import { updateArenaScore, type ArenaOpsContext } from './arenaOps';

function setup(opts: { weapon: Weapon; isTableau: boolean; max?: number }) {
  const emit = vi.fn();
  const arena = {
    status: 'in_progress',
    currentMatch: {
      id: 'm1',
      isTableau: opts.isTableau,
      scoreA: 0,
      scoreB: 0,
      status: 'in_progress',
    },
  };
  const ctx = {
    arenas: new Map([['a1', arena]]),
    db: { getMatch: () => null },
    resolveDbMatchId: (m: { id: string }) => m.id,
    broadcastArenaUpdate: vi.fn(),
    arenaSuddenDeath: new Map(),
    arenaOvertimeType: new Map(),
    io: { to: () => ({ emit }) },
    sessionMatches: [],
    sessionPoolMaxScore: 5,
    sessionTableMaxScore: opts.max ?? 15,
    sessionWeapon: opts.weapon,
  } as unknown as ArenaOpsContext;
  const score = (a: number, b: number) => updateArenaScore(ctx, 'a1', a, b);
  const events = () => emit.mock.calls.map(c => c[0] as string);
  return { score, events, emit };
}

describe('pause sabre à 8 touches (#2001)', () => {
  it('émet sabre_break une fois en franchissant 8 au sabre en tableau à 15', () => {
    const t = setup({ weapon: Weapon.SABRE, isTableau: true });
    t.score(7, 3);
    expect(t.events()).not.toContain('arena:a1:sabre_break');
    t.score(8, 3);
    expect(t.emit).toHaveBeenCalledWith('arena:a1:sabre_break', { seconds: 60 });
    t.score(9, 3);
    expect(t.events().filter(e => e === 'arena:a1:sabre_break')).toHaveLength(1);
  });

  it('pas de pause hors sabre, hors tableau, ou limite différente de 15', () => {
    for (const o of [
      { weapon: Weapon.EPEE, isTableau: true },
      { weapon: Weapon.SABRE, isTableau: false },
      { weapon: Weapon.SABRE, isTableau: true, max: 10 },
    ]) {
      const t = setup(o);
      t.score(8, 0);
      expect(t.events()).not.toContain('arena:a1:sabre_break');
    }
  });
});
