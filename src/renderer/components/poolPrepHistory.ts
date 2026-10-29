/**
 * BellePoule Modern - Historique d'annulation de la préparation des poules
 * Licensed under GPL-3.0
 */

/** Nombre max d'états conservés (mémoire bornée, #1294) */
export const MAX_HISTORY_ENTRIES = 20;

/**
 * Ajoute un état après l'index courant (les états « refaits » sont abandonnés),
 * retire ceux hors fenêtre de restauration puis plafonne la taille.
 */
export function appendHistory<T extends { timestamp: number }>(
  history: T[],
  currentIndex: number,
  entry: T,
  windowMs: number
): T[] {
  const next = history.slice(0, currentIndex + 1);
  next.push(entry);
  const cutoff = entry.timestamp - windowMs;
  const recent = next.filter(state => state.timestamp >= cutoff);
  return recent.length > MAX_HISTORY_ENTRIES ? recent.slice(-MAX_HISTORY_ENTRIES) : recent;
}
