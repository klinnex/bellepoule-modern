/**
 * Tests : égalité tranchée par V selon l'arme (#1442)
 * Licensed under GPL-3.0
 */
import { describe, it, expect } from 'vitest';
import { Weapon } from '../types';
import { allowsVictoryTieBreak, parseVictoryScoreInput } from './tieBreak';

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

describe('parseVictoryScoreInput', () => {
  it('lit V4-4 (V à gauche) et 4-V4 (V à droite)', () => {
    expect(parseVictoryScoreInput('V4-4')).toEqual({
      left: 4,
      right: 4,
      victoryLeft: true,
      victoryRight: false,
    });
    expect(parseVictoryScoreInput('4 - V4')).toEqual({
      left: 4,
      right: 4,
      victoryLeft: false,
      victoryRight: true,
    });
  });

  it('score sans V accepté ; saisie invalide refusée', () => {
    expect(parseVictoryScoreInput('5-3')?.victoryLeft).toBe(false);
    expect(parseVictoryScoreInput('V4-V4')).toBeNull();
    expect(parseVictoryScoreInput('abc')).toBeNull();
    expect(parseVictoryScoreInput('')).toBeNull();
  });
});
