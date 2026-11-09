/**
 * BellePoule Modern - Filtres et tri de la liste des compétitions (#1534)
 * Licensed under GPL-3.0
 */

import type { Competition } from '../../shared/types';

export type FilterGroup = 'weapon' | 'gender' | 'category' | 'status';
export type CompetitionFilters = Record<FilterGroup, string[]>;
export type CompetitionSort = 'date_desc' | 'date_asc' | 'name_asc';

export const FILTER_GROUPS: FilterGroup[] = ['weapon', 'gender', 'category', 'status'];
export const SORT_OPTIONS: CompetitionSort[] = ['date_desc', 'date_asc', 'name_asc'];
export const SORT_STORAGE_KEY = 'bellepoule-competition-sort';

export const emptyFilters = (): CompetitionFilters => ({
  weapon: [],
  gender: [],
  category: [],
  status: [],
});

export function hasActiveFilters(filters: CompetitionFilters): boolean {
  return FILTER_GROUPS.some(g => filters[g].length > 0);
}

/** Valeur d'une compétition pour un groupe de filtres */
export function filterValue(c: Competition, group: FilterGroup): string {
  return String(c[group] ?? '');
}

/** Valeurs distinctes présentes dans les données (les puces inutiles ne sont pas proposées) */
export function availableValues(competitions: Competition[], group: FilterGroup): string[] {
  return [...new Set(competitions.map(c => filterValue(c, group)).filter(Boolean))];
}

/** ET entre groupes, OU au sein d'un groupe */
export function applyFilters(
  competitions: Competition[],
  filters: CompetitionFilters
): Competition[] {
  if (!hasActiveFilters(filters)) return competitions;
  return competitions.filter(c =>
    FILTER_GROUPS.every(g => filters[g].length === 0 || filters[g].includes(filterValue(c, g)))
  );
}

const time = (c: Competition): number => new Date(c.date).getTime() || 0;

export function sortCompetitions(
  competitions: Competition[],
  sort: CompetitionSort
): Competition[] {
  const copy = [...competitions];
  if (sort === 'date_asc') return copy.sort((a, b) => time(a) - time(b));
  if (sort === 'name_asc') {
    return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  }
  return copy.sort((a, b) => time(b) - time(a));
}

export function readSort(): CompetitionSort {
  try {
    const v = localStorage.getItem(SORT_STORAGE_KEY);
    return SORT_OPTIONS.includes(v as CompetitionSort) ? (v as CompetitionSort) : 'date_desc';
  } catch {
    return 'date_desc';
  }
}

export function writeSort(sort: CompetitionSort): void {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, sort);
  } catch {
    /* stockage indisponible : la préférence n'est pas mémorisée */
  }
}
