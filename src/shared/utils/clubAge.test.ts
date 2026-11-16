/**
 * Tests - Mode Club (#1872) : catégories d'âge, plages, séances récurrentes
 */
import { describe, it, expect } from 'vitest';
import {
  addDays,
  ageCategoryFromBirthYear,
  compareByAgeCategory,
  exerciseMatchesRange,
  inAgeRange,
  memberAgeCategory,
  normalizeAgeCategories,
  normalizeAgeCategory,
  rangesOverlap,
  recurrenceDates,
} from './clubAge';

const ref = new Date(2026, 10, 16); // saison 2026-2027

describe('catégories d’âge (#1872)', () => {
  it('jeunes : âge atteint l’année de fin de saison ; vétérans : année de début', () => {
    expect(ageCategoryFromBirthYear(2019, ref)).toBe('U9');
    expect(ageCategoryFromBirthYear(2016, ref)).toBe('U11');
    expect(ageCategoryFromBirthYear(2015, ref)).toBe('U13');
    expect(ageCategoryFromBirthYear(2012, ref)).toBe('U15');
    expect(ageCategoryFromBirthYear(2010, ref)).toBe('U17');
    expect(ageCategoryFromBirthYear(2007, ref)).toBe('U20');
    expect(ageCategoryFromBirthYear(2006, ref)).toBe('SEN');
    expect(ageCategoryFromBirthYear(1987, ref)).toBe('SEN');
    expect(ageCategoryFromBirthYear(1986, ref)).toBe('V1');
    expect(ageCategoryFromBirthYear(1976, ref)).toBe('V2');
    expect(ageCategoryFromBirthYear(1966, ref)).toBe('V3');
    expect(ageCategoryFromBirthYear(1950, ref)).toBe('V4');
    // Avant le 1er septembre : saison précédente
    expect(ageCategoryFromBirthYear(2015, new Date(2026, 5, 1))).toBe('U11');
  });

  it('membre : date, puis année de naissance, sinon catégorie saisie', () => {
    expect(memberAgeCategory({ birthDate: '2015-03-02' }, ref)).toBe('U13');
    expect(memberAgeCategory({ birthYear: 2010 }, ref)).toBe('U17');
    expect(memberAgeCategory({ category: 'Senior' }, ref)).toBe('SEN');
    expect(memberAgeCategory({ category: 'M15' }, ref)).toBe('U15');
    expect(memberAgeCategory({}, ref)).toBeUndefined();
  });

  it('codes reconnus, listes nettoyées et ordonnées', () => {
    expect(normalizeAgeCategory(' v2 ')).toBe('V2');
    expect(normalizeAgeCategory('zzz')).toBeUndefined();
    expect(normalizeAgeCategories(['V1', 'M11', 'x', 'U11', 7])).toEqual(['U11', 'V1']);
    expect(normalizeAgeCategories('U11')).toEqual([]);
  });

  it('plages : bornes incluses, dans les deux sens, ouvertes', () => {
    expect(inAgeRange('U13', { ageFrom: 'U11', ageTo: 'U15' })).toBe(true);
    expect(inAgeRange('U13', { ageFrom: 'U15', ageTo: 'U11' })).toBe(true);
    expect(inAgeRange('U17', { ageFrom: 'U11', ageTo: 'U15' })).toBe(false);
    expect(inAgeRange('V3', { ageFrom: 'V1' })).toBe(true);
    expect(inAgeRange('U9', { ageTo: 'U11' })).toBe(true);
    expect(inAgeRange('U13', {})).toBe(true);
    // Catégorie inconnue : visible sauf si demandé
    expect(inAgeRange(undefined, { ageFrom: 'U11', ageTo: 'U11' })).toBe(true);
    expect(inAgeRange(undefined, { ageFrom: 'U11', ageTo: 'U11' }, false)).toBe(false);
    expect(rangesOverlap({ ageFrom: 'U11', ageTo: 'U13' }, { ageFrom: 'U13', ageTo: 'U17' })).toBe(
      true
    );
    expect(rangesOverlap({ ageFrom: 'U11', ageTo: 'U13' }, { ageFrom: 'U15' })).toBe(false);
    expect(rangesOverlap({}, { ageFrom: 'V1' })).toBe(true);
  });

  it('exercices : aucune catégorie = commun à tous', () => {
    const r = { ageFrom: 'U11', ageTo: 'U13' };
    expect(exerciseMatchesRange([], r)).toBe(true);
    expect(exerciseMatchesRange(['U13', 'U15'], r)).toBe(true);
    expect(exerciseMatchesRange(['SEN'], r)).toBe(false);
    expect(exerciseMatchesRange(['SEN'], {})).toBe(true);
  });

  it('tri par catégorie puis nom, inconnues à la fin', () => {
    const list = [
      { lastName: 'B', firstName: 'x', c: 'SEN' },
      { lastName: 'Z', firstName: 'x', c: undefined },
      { lastName: 'C', firstName: 'x', c: 'U11' },
      { lastName: 'A', firstName: 'x', c: 'SEN' },
    ];
    expect(list.sort(compareByAgeCategory(m => m.c)).map(m => m.lastName)).toEqual([
      'C',
      'A',
      'B',
      'Z',
    ]);
  });
});

describe('séances récurrentes (#1872)', () => {
  it('tous les N jours, N fois ou jusqu’à une date (incluse)', () => {
    expect(addDays('2026-10-24', 7)).toBe('2026-10-31');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(recurrenceDates('2026-11-18', 7, { count: 3 })).toEqual([
      '2026-11-18',
      '2026-11-25',
      '2026-12-02',
    ]);
    expect(recurrenceDates('2026-11-18', 14, { until: '2026-12-16' })).toEqual([
      '2026-11-18',
      '2026-12-02',
      '2026-12-16',
    ]);
  });

  it('bornes : 60 séances au plus, pas invalide = une seule date, date invalide = aucune', () => {
    expect(recurrenceDates('2026-01-01', 1, { count: 500 })).toHaveLength(60);
    expect(recurrenceDates('2026-01-01', 0, { count: 5 })).toEqual(['2026-01-01']);
    expect(recurrenceDates('2026-02-30', 7, { count: 5 })).toEqual([]);
    expect(recurrenceDates('2026-01-10', 7, { until: '2026-01-01' })).toEqual([]);
  });
});
