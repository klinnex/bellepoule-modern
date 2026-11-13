/**
 * arenaLeftHanded (#1439) : gaucher (A) rouge face à un droitier, armes olympiques.
 * Couleur réelle, indépendante de l'inversion de vue (`arena.swapped`).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../mainWindowRef', () => ({ getSharedMainWindow: () => null }));

import { arenaLeftHanded } from './arenaBroadcast';
import type { ArenaMatch } from '../../shared/types/remote';

const match = (a: string, b: string) =>
  ({ id: 'm1', fencerA: { handedness: a }, fencerB: { handedness: b } }) as unknown as ArenaMatch;

describe('arenaLeftHanded', () => {
  it('gaucher A contre droitier B : A rouge', () => {
    expect(arenaLeftHanded(match('L', 'R'), 'E')).toBe(true);
    expect(arenaLeftHanded(match('L', 'R'), 'F')).toBe(true);
    expect(arenaLeftHanded(match('L', 'R'), 'S')).toBe(true);
  });
  it('droitier A ou deux gauchers : placement de l’appel (A vert)', () => {
    expect(arenaLeftHanded(match('R', 'L'), 'E')).toBe(false);
    expect(arenaLeftHanded(match('L', 'L'), 'E')).toBe(false);
    expect(arenaLeftHanded(match('R', 'R'), 'E')).toBe(false);
  });
  it('arme non olympique ou pas de match : rien', () => {
    expect(arenaLeftHanded(match('L', 'R'), 'L')).toBe(false);
    expect(arenaLeftHanded(null, 'E')).toBe(false);
  });
});
