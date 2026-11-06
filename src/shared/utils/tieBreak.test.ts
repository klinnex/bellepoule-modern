/**
 * Tests : égalité tranchée par V selon l'arme (#1442)
 * Licensed under GPL-3.0
 */
import { describe, it, expect } from 'vitest';
import { Weapon } from '../types';
import { allowsVictoryTieBreak } from './tieBreak';

describe('allowsVictoryTieBreak', () => {
  it('vrai pour laser, épée, fleuret, sabre et rapières', () => {
    expect(allowsVictoryTieBreak(Weapon.LASER)).toBe(true);
    expect(allowsVictoryTieBreak(Weapon.EPEE)).toBe(true);
    expect(allowsVictoryTieBreak(Weapon.FOIL)).toBe(true);
    expect(allowsVictoryTieBreak(Weapon.SABRE)).toBe(true);
    expect(allowsVictoryTieBreak(Weapon.CUSTOM, true)).toBe(true);
  });

  it('faux pour arme à la carte hors rapières', () => {
    expect(allowsVictoryTieBreak(Weapon.CUSTOM)).toBe(false);
    expect(allowsVictoryTieBreak(undefined)).toBe(false);
  });
});
