/**
 * applyLeftHandedSwap (#1439) : gaucher à gauche (rouge) face à un droitier, armes olympiques.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../mainWindowRef', () => ({ getSharedMainWindow: () => null }));

import { applyLeftHandedSwap } from './arenaBroadcast';
import type { Arena, ArenaMatch } from '../../shared/types/remote';

const arena = (swapped = false): Arena =>
  ({
    id: 'a1',
    name: 'P1',
    number: 1,
    currentMatch: null,
    status: 'ready',
    startTime: null,
    settings: {} as Arena['settings'],
    swapped,
  }) as Arena;
const match = (id: string, a: 'L' | 'R', b: 'L' | 'R'): ArenaMatch =>
  ({ id, fencerA: { handedness: a }, fencerB: { handedness: b } }) as unknown as ArenaMatch;

describe('applyLeftHandedSwap', () => {
  it('gaucher A contre droitier B : bascule, une seule fois par match', () => {
    const ar = arena();
    applyLeftHandedSwap(ar, match('m1', 'L', 'R'), 'E');
    expect(ar.swapped).toBe(true);
    applyLeftHandedSwap(ar, match('m1', 'L', 'R'), 'E');
    expect(ar.swapped).toBe(true);
  });
  it('match suivant normal : retour au placement de l’appel', () => {
    const ar = arena();
    applyLeftHandedSwap(ar, match('m1', 'L', 'R'), 'F');
    applyLeftHandedSwap(ar, match('m2', 'R', 'L'), 'F');
    expect(ar.swapped).toBe(false);
  });
  it('inversion manuelle de l’écran conservée (XOR)', () => {
    const ar = arena(true);
    applyLeftHandedSwap(ar, match('m1', 'L', 'R'), 'S');
    expect(ar.swapped).toBe(false);
    applyLeftHandedSwap(ar, match('m2', 'L', 'L'), 'S');
    expect(ar.swapped).toBe(true);
  });
  it('arme non olympique ou pas de match : rien', () => {
    const ar = arena();
    applyLeftHandedSwap(ar, match('m1', 'L', 'R'), 'L');
    applyLeftHandedSwap(ar, null, 'E');
    expect(ar.swapped).toBe(false);
  });
});
