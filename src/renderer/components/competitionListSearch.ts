/**
 * BellePoule Modern - Recherche dans la liste des compétitions (#1534)
 * Filtre sans accents ni casse sur le nom, le lieu et la date (ISO). Licensed under GPL-3.0
 */

import type { Competition } from '../../shared/types';

/** Minuscules sans accents, espaces réduits : comparaison tolérante */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Compétitions dont le nom, le lieu ou la date contiennent toutes les parties de la requête */
export function filterCompetitions(competitions: Competition[], query: string): Competition[] {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return competitions;
  return competitions.filter(c => {
    const haystack = normalizeSearchText(
      [c.title, c.location ?? '', String(c.date ?? '')].join(' ')
    );
    return terms.every(term => haystack.includes(term));
  });
}
