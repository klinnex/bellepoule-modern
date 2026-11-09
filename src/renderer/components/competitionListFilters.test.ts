// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyFilters,
  availableValues,
  emptyFilters,
  readSort,
  sortCompetitions,
  writeSort,
} from './competitionListFilters';
import type { Competition } from '../../shared/types';

const c = (title: string, date: string, extra: Record<string, unknown> = {}) =>
  ({
    id: title,
    title,
    date,
    weapon: 'E',
    gender: 'M',
    category: 'SEN',
    status: 'draft',
    ...extra,
  }) as unknown as Competition;

const list = [
  c('Bravo', '2026-02-01'),
  c('Alpha', '2026-03-01', { weapon: 'F', status: 'completed' }),
  c('Charlie', '2026-01-01', { gender: 'F', category: 'U15' }),
];

describe('competitionListFilters', () => {
  beforeEach(() => localStorage.clear());

  it('filtre en ET entre groupes et OU dans un groupe', () => {
    expect(applyFilters(list, emptyFilters())).toBe(list);
    expect(applyFilters(list, { ...emptyFilters(), weapon: ['F'] }).map(x => x.title)).toEqual([
      'Alpha',
    ]);
    expect(applyFilters(list, { ...emptyFilters(), weapon: ['E', 'F'] })).toHaveLength(3);
    expect(applyFilters(list, { ...emptyFilters(), weapon: ['E'], gender: ['F'] })).toHaveLength(1);
    expect(applyFilters(list, { ...emptyFilters(), status: ['in_progress'] })).toHaveLength(0);
  });

  it('liste les valeurs présentes', () => {
    expect(availableValues(list, 'weapon').sort()).toEqual(['E', 'F']);
  });

  it('trie par date et par nom sans muter la liste', () => {
    expect(sortCompetitions(list, 'date_desc').map(x => x.title)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
    expect(sortCompetitions(list, 'date_asc').map(x => x.title)).toEqual([
      'Charlie',
      'Bravo',
      'Alpha',
    ]);
    expect(sortCompetitions(list, 'name_asc').map(x => x.title)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
    expect(list[0].title).toBe('Bravo');
  });

  it('mémorise le tri', () => {
    expect(readSort()).toBe('date_desc');
    writeSort('name_asc');
    expect(readSort()).toBe('name_asc');
    localStorage.setItem('bellepoule-competition-sort', 'bogus');
    expect(readSort()).toBe('date_desc');
  });
});
