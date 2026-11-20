/**
 * Relevé de cohérence formule ↔ catégorie (#2013, étape A)
 */
import { describe, it, expect } from 'vitest';
import { Category, Weapon } from '../types';
import { getCoherenceIssues, hasCoherenceReference } from './formulaCoherence';
import { getFallbackCompetitionSettings } from './defaultCompetitionSettings';

const base = { poolMaxScore: 5, tableMaxScore: 15, hasPools: true, hasDirectElimination: true };

describe('getCoherenceIssues', () => {
  it('épée seniors 5 / 15 : conforme', () => {
    expect(getCoherenceIssues(Weapon.EPEE, Category.SENIOR, base)).toEqual([]);
  });

  it('M13 en 5 / 15 : deux écarts, valeurs attendues 4 / 8', () => {
    expect(getCoherenceIssues(Weapon.FOIL, Category.U13, base)).toEqual([
      { phase: 'pools', field: 'poolMaxScore', actual: 5, expected: 4 },
      { phase: 'tableau', field: 'tableMaxScore', actual: 15, expected: 8 },
    ]);
  });

  it('phase absente : pas de relevé sur elle', () => {
    expect(
      getCoherenceIssues(Weapon.SABRE, Category.U13, {
        ...base,
        poolMaxScore: 4,
        hasDirectElimination: false,
      })
    ).toEqual([]);
  });

  it('pas de référentiel pour le laser et « À la carte »', () => {
    expect(hasCoherenceReference(Weapon.LASER)).toBe(false);
    expect(getCoherenceIssues(Weapon.CUSTOM, Category.U13, base)).toEqual([]);
  });
});

describe('getFallbackCompetitionSettings (défauts unifiés)', () => {
  it('arme olympique : touches de la catégorie, pas de petite finale', () => {
    expect(getFallbackCompetitionSettings(Weapon.EPEE, Category.U9)).toMatchObject({
      defaultPoolMaxScore: 3,
      defaultTableMaxScore: 6,
      thirdPlaceMatch: false,
      poolRounds: 1,
      hasDirectElimination: true,
    });
  });

  it('autres armes : 5 / 21 (comportement existant)', () => {
    expect(getFallbackCompetitionSettings(Weapon.LASER, Category.SENIOR)).toMatchObject({
      defaultPoolMaxScore: 5,
      defaultTableMaxScore: 21,
    });
  });
});
