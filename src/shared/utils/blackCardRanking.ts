/**
 * BellePoule Modern - Classement final et carton noir (#1418)
 *
 * Un tireur exclu avec carton noir perd son classement (rang « - », NULL à l'export XML) et passe
 * en bas de la liste ; les tireurs classés derrière remontent d'une place. Si des ex aequo se
 * trouvent derrière un tireur au carton noir (ex. 3e non départagé), ils sont départagés par leur
 * classement de composition du tableau (rang de sortie de poules). Un carton noir de passivité
 * (perte de match « P ») n'est pas un carton noir d'exclusion : il n'est pas concerné.
 * Licensed under GPL-3.0
 */

import { Fencer, FencerStatus } from '../types';

type RankedFencer = Pick<Fencer, 'id' | 'status' | 'exclusionReason'>;

export interface RankedResult {
  rank: number | null;
  fencer: RankedFencer;
}

/** Tireur exclu avec carton noir confirmé (motif `black_card`) */
export const isBlackCarded = (f: Pick<Fencer, 'status' | 'exclusionReason'>): boolean =>
  f.status === FencerStatus.EXCLUDED && f.exclusionReason === 'black_card';

/**
 * Recalcule le classement final. Idempotent : une liste déjà recalculée (carton noir à rang null)
 * est rendue telle quelle. Sans carton noir, la liste est rendue inchangée.
 *
 * @param seedRank classement de composition du tableau (id tireur -> rang) pour départager les ex aequo
 */
export function applyBlackCardRanking<T extends RankedResult>(
  results: readonly T[],
  seedRank: ReadonlyMap<string, number> = new Map()
): T[] {
  if (!results.some(r => isBlackCarded(r.fencer))) return [...results];

  const seed = (r: T) => seedRank.get(r.fencer.id) ?? Number.MAX_SAFE_INTEGER;
  const byRank = (a: T, b: T) =>
    (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || seed(a) - seed(b);

  const sorted = [...results].sort(byRank);
  const carded = sorted.filter(r => isBlackCarded(r.fencer));
  const ranked = sorted.filter(r => !isBlackCarded(r.fencer));

  // Nombre de tireurs au carton noir classés avant chaque tireur : 0 => rang conservé
  const out: T[] = ranked.map((r, i) => {
    const cardedAbove = carded.filter(
      c => c.rank !== null && (r.rank === null || c.rank <= r.rank)
    );
    return cardedAbove.length > 0 && r.rank !== null ? { ...r, rank: i + 1 } : r;
  });
  return [...out, ...carded.map(c => ({ ...c, rank: null }) as T)];
}
