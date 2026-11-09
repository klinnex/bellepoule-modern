/**
 * BellePoule Modern - Compétitions récentes et épinglées de l'accueil (#1534)
 * Mémorisées dans le navigateur (préférence par poste). Licensed under GPL-3.0
 */

import type { Competition } from '../../shared/types';

export const RECENT_KEY = 'bellepoule-competition-recent';
export const PINNED_KEY = 'bellepoule-competition-pinned';
export const RECENT_MAX = 5;
/** En dessous, la liste complète est déjà lisible : pas de section « Récentes » */
export const RECENT_MIN_COMPETITIONS = 6;

export function readIds(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* stockage indisponible : non mémorisé */
  }
}

/** Place l'identifiant en tête des récentes (sans doublon, borné) */
export function recordOpen(id: string): string[] {
  const next = [id, ...readIds(RECENT_KEY).filter(x => x !== id)].slice(0, RECENT_MAX * 2);
  writeIds(RECENT_KEY, next);
  return next;
}

export function togglePinned(id: string): string[] {
  const current = readIds(PINNED_KEY);
  const next = current.includes(id) ? current.filter(x => x !== id) : [id, ...current];
  writeIds(PINNED_KEY, next);
  return next;
}

/** Épinglées d'abord, puis récentes ; ignore les identifiants disparus ; 5 au plus */
export function pickRecent(
  competitions: Competition[],
  recentIds: string[],
  pinnedIds: string[],
  max = RECENT_MAX
): Competition[] {
  const byId = new Map(competitions.map(c => [c.id, c]));
  const ordered = [...new Set([...pinnedIds, ...recentIds])];
  return ordered
    .map(id => byId.get(id))
    .filter((c): c is Competition => c !== undefined)
    .slice(0, max);
}
