/**
 * Tests : âge et catégorie des équipes du tournoi des rapières (#1441)
 * Licensed under GPL-3.0
 */
import { describe, it, expect } from 'vitest';
import {
  rapieresBirthYear,
  rapieresCategoryFromBirthYear,
  rapieresTeamCategory,
  rapieresTeamGender,
} from './rapieresAge';
import type { RapieresTeamInfo } from './rapieres.types';

// Saison 2026-2027 (refDate après le 1er septembre 2026)
const REF = new Date(2026, 10, 5);

const team = (
  a: Partial<RapieresTeamInfo['fencers'][0]>,
  b: Partial<RapieresTeamInfo['fencers'][0]>
): RapieresTeamInfo => ({
  level: 'beginner',
  fencers: [
    { firstName: 'A', lastName: 'a', category: 'SENIOR', ...a },
    { firstName: 'B', lastName: 'b', category: 'SENIOR', ...b },
  ],
});

describe('rapieresAge', () => {
  it('lit l’année de naissance depuis AAAA-MM-JJ', () => {
    expect(rapieresBirthYear({ birthDate: '1989-01-06' })).toBe(1989);
    expect(rapieresBirthYear({})).toBeUndefined();
  });

  it('applique les tranches d’âge de la saison (1er septembre)', () => {
    expect(rapieresCategoryFromBirthYear(2008, REF)).toBe('M20'); // 18 ans
    expect(rapieresCategoryFromBirthYear(1993, REF)).toBe('SENIOR'); // 33 ans
    expect(rapieresCategoryFromBirthYear(1980, REF)).toBe('V1'); // 46 ans
    expect(rapieresCategoryFromBirthYear(1965, REF)).toBe('V3'); // 61 ans
  });

  it('catégorie d’équipe = moyenne des années de naissance des deux tireurs', () => {
    // (1989 + 1961) / 2 = 1975 → 51 ans → V2
    const t = team({ birthDate: '1989-06-01' }, { birthDate: '1961-08-27' });
    expect(rapieresTeamCategory(t, REF)).toBe('V2');
    // (2008 + 1980) / 2 = 1994 → 32 ans → SENIOR
    expect(
      rapieresTeamCategory(team({ birthDate: '2008-06-14' }, { birthDate: '1980-03-01' }), REF)
    ).toBe('SENIOR');
  });

  it('une seule date connue : elle sert ; aucune : catégorie saisie', () => {
    expect(rapieresTeamCategory(team({ birthDate: '1980-03-01' }, {}), REF)).toBe('V1');
    expect(rapieresTeamCategory(team({ category: 'V3' }, { category: 'M20' }), REF)).toBe('V3');
  });

  it('sexe d’équipe : M, F, mixte ; indéterminé si un sexe manque', () => {
    expect(rapieresTeamGender(team({ gender: 'M' }, { gender: 'M' }))).toBe('M');
    expect(rapieresTeamGender(team({ gender: 'F' }, { gender: 'F' }))).toBe('F');
    expect(rapieresTeamGender(team({ gender: 'F' }, { gender: 'M' }))).toBe('MIXED');
    expect(rapieresTeamGender(team({ gender: 'F' }, {}))).toBeUndefined();
  });
});
