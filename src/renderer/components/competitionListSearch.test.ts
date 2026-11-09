/**
 * Tests - recherche dans la liste des compétitions (#1534)
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import type { Competition } from '../../shared/types';
import { filterCompetitions, normalizeSearchText } from './competitionListSearch';

const make = (id: string, title: string, location?: string, date = '2026-11-12'): Competition =>
  ({ id, title, location, date: new Date(date) }) as unknown as Competition;

const list = [
  make('1', 'Challenge Éléonore Dupont', 'Salle Léo-Lagrange'),
  make('2', 'Coupe de Lyon', 'Gymnase Tony Garnier', '2026-03-01'),
  make('3', 'Finale régionale', undefined, '2027-06-20'),
];

describe('normalizeSearchText', () => {
  it('ignore la casse, les accents et les espaces multiples', () => {
    expect(normalizeSearchText('  Éléonore   DUPONT ')).toBe('eleonore dupont');
  });
});

describe('filterCompetitions', () => {
  it('requête vide : liste inchangée', () => {
    expect(filterCompetitions(list, '   ')).toBe(list);
  });

  it('cherche dans le nom sans tenir compte des accents ni de la casse', () => {
    expect(filterCompetitions(list, 'eleonore').map(c => c.id)).toEqual(['1']);
  });

  it('cherche dans le lieu', () => {
    expect(filterCompetitions(list, 'garnier').map(c => c.id)).toEqual(['2']);
  });

  it('cherche dans la date (année)', () => {
    expect(filterCompetitions(list, '2027').map(c => c.id)).toEqual(['3']);
  });

  it('toutes les parties de la requête doivent correspondre', () => {
    expect(filterCompetitions(list, 'coupe lyon').map(c => c.id)).toEqual(['2']);
    expect(filterCompetitions(list, 'coupe paris')).toEqual([]);
  });
});
