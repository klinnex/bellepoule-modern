/**
 * BellePoule Modern - Optimisation des conflits de poules
 * Échanges de tireurs entre poules pour réduire les conflits club / région / nation,
 * sans changer la taille des poules ni (autant que possible) l'équilibre du serpentin.
 * Licensed under GPL-3.0
 */

import { Fencer } from '../types';
import { SeparationCriterionKey } from './poolCalculations';

/** Valeur de séparation d'un tireur pour un critère (vide → aucun conflit possible) */
export function separationValue(fencer: Fencer, key: SeparationCriterionKey): string | undefined {
  const raw =
    key === 'byClub' ? fencer.club : key === 'byRegion' ? fencer.region : fencer.nationality;
  const v = raw?.trim();
  return v ? v : undefined;
}

function countValues(fencers: Fencer[], key: SeparationCriterionKey): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of fencers) {
    const v = separationValue(f, key);
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

/**
 * Nombre de conflits d'un critère : pour chaque poule et chaque valeur présente n fois,
 * n − 1 tireurs « en trop ».
 */
export function countConflicts(pools: Fencer[][], key: SeparationCriterionKey): number {
  let total = 0;
  for (const pool of pools) {
    countValues(pool, key).forEach(n => {
      total += n - 1;
    });
  }
  return total;
}

/**
 * Minimum théorique de conflits : une valeur présente n fois sur P poules
 * produit au moins max(0, n − P) conflits.
 */
export function minConflicts(pools: Fencer[][], key: SeparationCriterionKey): number {
  const poolCount = pools.length;
  let total = 0;
  countValues(pools.flat(), key).forEach(n => {
    total += Math.max(0, n - poolCount);
  });
  return total;
}

/**
 * Réduit les conflits par échanges de tireurs entre poules (recherche locale).
 * Critères pondérés par priorité (le premier domine les suivants).
 * À gain égal, l'échange entre tireurs au classement le plus proche est préféré.
 * Retourne de nouveaux tableaux ; les positions dans les poules sont conservées.
 */
export function optimizePoolConflicts(
  pools: Fencer[][],
  criteria: SeparationCriterionKey[]
): Fencer[][] {
  const result = pools.map(p => [...p]);
  if (criteria.length === 0 || result.length < 2) return result;

  // Poids lexicographique : un conflit du critère i vaut plus que tous ceux des suivants
  const total = result.reduce((s, p) => s + p.length, 0);
  const weights = criteria.map((_, i) => Math.pow(total + 1, criteria.length - 1 - i));

  // counts[poule][critère] : valeur → occurrences
  const counts = result.map(pool => criteria.map(key => countValues(pool, key)));

  // Rang de tête de série (ordre initial) pour préserver l'équilibre du serpentin
  const seed = new Map<string, number>();
  [...result.flat()]
    .sort((a, b) => (a.ranking ?? 99999) - (b.ranking ?? 99999))
    .forEach((f, i) => seed.set(f.id, i));

  /** Variation pondérée des conflits si x (poule a) et y (poule b) sont échangés */
  const swapDelta = (a: number, x: Fencer, b: number, y: Fencer): number => {
    let delta = 0;
    criteria.forEach((key, c) => {
      const vx = separationValue(x, key);
      const vy = separationValue(y, key);
      if (vx === vy) return;
      const ca = counts[a][c];
      const cb = counts[b][c];
      let d = 0;
      if (vx && (ca.get(vx) ?? 0) >= 2) d--; // x quitte a
      if (vy && (ca.get(vy) ?? 0) >= 1) d++; // y arrive dans a
      if (vy && (cb.get(vy) ?? 0) >= 2) d--; // y quitte b
      if (vx && (cb.get(vx) ?? 0) >= 1) d++; // x arrive dans b
      delta += d * weights[c];
    });
    return delta;
  };

  const move = (map: Map<string, number>, from?: string, to?: string) => {
    if (from) {
      const n = map.get(from) ?? 0;
      if (n > 1) map.set(from, n - 1);
      else map.delete(from);
    }
    if (to) map.set(to, (map.get(to) ?? 0) + 1);
  };

  // Chaque échange accepté baisse strictement le coût (entier ≥ 0) : terminaison garantie
  for (;;) {
    let best: { a: number; i: number; b: number; j: number } | null = null;
    let bestDelta = 0;
    let bestDist = Infinity;
    for (let a = 0; a < result.length; a++) {
      for (let b = a + 1; b < result.length; b++) {
        for (let i = 0; i < result[a].length; i++) {
          for (let j = 0; j < result[b].length; j++) {
            const x = result[a][i];
            const y = result[b][j];
            const delta = swapDelta(a, x, b, y);
            if (delta >= 0) continue;
            const dist = Math.abs((seed.get(x.id) ?? 0) - (seed.get(y.id) ?? 0));
            if (delta < bestDelta || (delta === bestDelta && dist < bestDist)) {
              best = { a, i, b, j };
              bestDelta = delta;
              bestDist = dist;
            }
          }
        }
      }
    }
    if (!best) break;
    const { a, i, b, j } = best;
    const x = result[a][i];
    const y = result[b][j];
    criteria.forEach((key, c) => {
      move(counts[a][c], separationValue(x, key), separationValue(y, key));
      move(counts[b][c], separationValue(y, key), separationValue(x, key));
    });
    result[a][i] = y;
    result[b][j] = x;
  }
  return result;
}
