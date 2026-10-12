/**
 * BellePoule Modern - Compétitions en plusieurs tours de poules (#1051)
 * Qualifiés pour le tour suivant, tirage seedé sur le tour précédent, classement final.
 * Licensed under GPL-3.0
 */

import { Fencer, FencerStatus, PoolRanking } from '../types';

const INACTIVE_STATUSES = new Set<FencerStatus>([
  FencerStatus.ABANDONED,
  FencerStatus.FORFAIT,
  FencerStatus.EXCLUDED,
]);

/**
 * Nombre de qualifiés pour le tour `nextRound` (≥ 2).
 * `qualifiers[i]` = qualifiés pour le tour i+2. 0 / absent = tous les tireurs actifs.
 */
export function getRoundQualifierCount(
  qualifiers: number[] | undefined,
  nextRound: number
): number | undefined {
  const n = qualifiers?.[nextRound - 2];
  return n && n > 0 ? n : undefined;
}

/**
 * Tireurs qualifiés pour le tour suivant, dans l'ordre du classement du tour terminé.
 * `ranking` du tireur = sa place au tour terminé (seed du nouveau tirage serpentin).
 * Abandons / forfaits / exclusions écartés. Égalités à la coupure : toutes retenues.
 */
export function selectNextRoundFencers(
  roundRanking: PoolRanking[],
  qualifierCount?: number
): { qualified: Fencer[]; eliminated: Fencer[] } {
  const sorted = [...roundRanking].sort((a, b) => a.rank - b.rank);
  const active = sorted.filter(r => !INACTIVE_STATUSES.has(r.fencer.status));
  let cut = active.length;
  if (qualifierCount !== undefined && qualifierCount < active.length) {
    const cutoffRank = active[qualifierCount - 1].rank;
    cut = qualifierCount;
    while (cut < active.length && active[cut].rank === cutoffRank) cut++;
  }
  const qualified = active.slice(0, cut).map((r, i) => ({ ...r.fencer, ranking: i + 1 }));
  const qualifiedIds = new Set(qualified.map(f => f.id));
  const eliminated = sorted.filter(r => !qualifiedIds.has(r.fencer.id)).map(r => r.fencer);
  return { qualified, eliminated };
}

/**
 * Seed du tirage d'un nouveau tour : place au classement du tour précédent.
 * Tireurs absents du classement précédent placés en fin, ordre d'origine.
 */
export function seedFencersFromRanking(
  fencers: Fencer[],
  previousRanking: PoolRanking[]
): Fencer[] {
  const order = new Map<string, number>();
  [...previousRanking]
    .sort((a, b) => a.rank - b.rank)
    .forEach((r, i) => order.set(r.fencer.id, i + 1));
  const unranked = order.size + 1;
  return fencers
    .map((f, i) => ({ f, i, seed: order.get(f.id) ?? unranked }))
    .sort((a, b) => a.seed - b.seed || a.i - b.i)
    .map(({ f }, i) => ({ ...f, ranking: i + 1 }));
}

/**
 * Classement final multi-tours : classement du dernier tour, puis les éliminés
 * des tours précédents (du plus récent au plus ancien) dans l'ordre de leur tour.
 * Pas de cumul des matchs : chaque tour repart de zéro.
 * Les éliminés d'un tour précédent sont marqués ELIMINATED (exclus du tableau).
 */
export function mergeRoundRankings(roundRankings: PoolRanking[][]): PoolRanking[] {
  const result: PoolRanking[] = [];
  const seen = new Set<string>();
  for (let round = roundRankings.length - 1; round >= 0; round--) {
    const isLatest = round === roundRankings.length - 1;
    const leftovers = [...roundRankings[round]]
      .sort((a, b) => a.rank - b.rank)
      .filter(r => !seen.has(r.fencer.id));
    const offset = result.length;
    let prevRank = NaN;
    let tieStart = 0;
    leftovers.forEach((r, i) => {
      if (r.rank !== prevRank) {
        tieStart = i;
        prevRank = r.rank;
      }
      seen.add(r.fencer.id);
      const fencer =
        isLatest || INACTIVE_STATUSES.has(r.fencer.status)
          ? r.fencer
          : { ...r.fencer, status: FencerStatus.ELIMINATED };
      result.push({ ...r, fencer, rank: offset + tieStart + 1 });
    });
  }
  return result;
}
