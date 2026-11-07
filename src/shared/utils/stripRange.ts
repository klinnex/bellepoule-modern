/**
 * BellePoule Modern - Intervalle de pistes (piste de départ / piste de fin)
 * Les numéros de pistes réellement utilisés ne commencent pas forcément à 1
 * (ex. pistes 5 à 8 pour la compétition féminine) — issue #1501.
 * Licensed under GPL-3.0
 */

export const MAX_STRIP = 99;

/** Normalise un intervalle : bornes entières, 1 ≤ début ≤ fin ≤ MAX_STRIP. */
export function normalizeStripRange(start: number, end: number): { start: number; end: number } {
  const s = Math.max(1, Math.min(MAX_STRIP, Math.trunc(Number(start)) || 1));
  const e = Math.max(s, Math.min(MAX_STRIP, Math.trunc(Number(end)) || s));
  return { start: s, end: e };
}

/** Numéros de pistes de l'intervalle [start, end] (inclus). */
export function stripNumbers(start: number, end: number): number[] {
  const r = normalizeStripRange(start, end);
  return Array.from({ length: r.end - r.start + 1 }, (_, i) => r.start + i);
}

/** Piste du rang `index` (rotation circulaire) parmi les pistes de l'intervalle. */
export function stripAtIndex(start: number, end: number, index: number): number {
  const list = stripNumbers(start, end);
  return list[index % list.length];
}
