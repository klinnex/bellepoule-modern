import { describe, it, expect } from 'vitest';
import { Category, Weapon } from '../types';
import { getDefaultMaxScores, isOlympicWeapon } from './defaultMaxScores';

describe('getDefaultMaxScores (#1826)', () => {
  it('olympique senior : 5 / 15', () => {
    for (const w of [Weapon.EPEE, Weapon.FOIL, Weapon.SABRE]) {
      expect(getDefaultMaxScores(w, Category.SENIOR)).toEqual({ pool: 5, table: 15 });
    }
    expect(getDefaultMaxScores(Weapon.EPEE, Category.U17)).toEqual({ pool: 5, table: 15 });
  });

  it('M9 : 3 / 6', () => {
    expect(getDefaultMaxScores(Weapon.FOIL, Category.U9)).toEqual({ pool: 3, table: 6 });
  });

  it('M11 et M13 : 4 / 8', () => {
    expect(getDefaultMaxScores(Weapon.SABRE, Category.U11)).toEqual({ pool: 4, table: 8 });
    expect(getDefaultMaxScores(Weapon.SABRE, Category.U13)).toEqual({ pool: 4, table: 8 });
  });

  it('vétérans : 5 / 10', () => {
    for (const c of [Category.V1, Category.V2, Category.V3, Category.V4]) {
      expect(getDefaultMaxScores(Weapon.EPEE, c)).toEqual({ pool: 5, table: 10 });
    }
  });

  it('hors olympique : comportement historique', () => {
    expect(getDefaultMaxScores(Weapon.LASER, Category.SENIOR)).toEqual({ pool: 21, table: 0 });
    expect(isOlympicWeapon(Weapon.CUSTOM)).toBe(false);
    expect(isOlympicWeapon(undefined)).toBe(false);
  });
});
