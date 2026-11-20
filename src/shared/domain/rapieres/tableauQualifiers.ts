/**
 * BellePoule Modern - Tournoi des rapières : qualification pour le tableau (#1441)
 * Règles pures (#1979, docs/adr/0002) : lues par l'écran (src/features/rapieres) et le moteur.
 * Licensed under GPL-3.0
 */
import { Fencer, Pool, PoolRanking } from '../../types';
import { calculatePoolRanking } from '../../utils/poolCalculations';

/**
 * Mode de tableau (#1441) : toutes les équipes qualifiées en « normal » (sans petite finale),
 * « third » (petite finale), « all » (toutes les places tirées) ; « semis » : 4 équipes, 3e place tirée.
 */
export type RapieresTableauMode = 'normal' | 'third' | 'all' | 'semis';

/** Équipe retirée (abandon, forfait, exclusion) : règle commune aux tireurs */
import { isWithdrawn } from '../fencers/fencerStatus';
export { isWithdrawn };

/**
 * Qualifiés pour le tableau selon le mode choisi (#1441) : demi-finales → les 4 équipes
 * désignées ; tableau normal, avec 3e place ou toutes places tirées → toutes les équipes.
 * Équipes retirées exclues, rangs recalculés.
 */
export function rapieresTableauQualifiers(
  pools: Pool[],
  overall: PoolRanking[],
  mode: RapieresTableauMode | undefined
): PoolRanking[] {
  if (mode === 'semis') return rapieresSemifinalists(pools, overall) ?? [];
  return overall.filter(r => !isWithdrawn(r.fencer)).map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Réglages du tableau pour un mode : match pour la 3e place, toutes les places tirées */
export function rapieresTableauSettings(mode: RapieresTableauMode): {
  thirdPlaceMatch: boolean;
  playAllPositions: boolean;
} {
  return {
    thirdPlaceMatch: mode !== 'normal',
    playAllPositions: mode === 'all',
  };
}

/**
 * Demi-finales (#1441) : les 4 équipes selon le nombre de poules, dans l'ordre de tête de série
 * (1 contre 4, 2 contre 3). 2 poules : 1res contre 2es de l'autre poule ; 3 poules : 1res + meilleure
 * 2e ; 4 poules : 1res ; 1 poule : 4 premières. Plus de 4 poules : pas de scénario (null).
 */
export function rapieresSemifinalists(pools: Pool[], overall: PoolRanking[]): PoolRanking[] | null {
  const n = pools.length;
  if (n === 0 || n > 4) return null;
  // Équipes retirées écartées, rangs de poule renumérotés
  const poolRankings = pools.map(p =>
    (p.ranking?.length ? p.ranking : calculatePoolRanking(p))
      .filter(r => !isWithdrawn(r.fencer))
      .map((r, i) => ({ ...r, rank: i + 1 }))
  );
  const overallOf = new Map(overall.map(r => [r.fencer.id, r]));
  const at = (ranking: PoolRanking[], rank: number) => ranking.find(r => r.rank === rank)?.fencer;
  const overallRank = (id: string) => overallOf.get(id)?.rank ?? Infinity;

  let picked: Fencer[];
  if (n === 1) {
    picked = poolRankings[0].filter(r => r.rank <= 4).map(r => r.fencer);
  } else if (n === 2) {
    const [a, b] = poolRankings;
    // Croisement : A1–B2 et B1–A2 (ordre de tête de série 1, 2, 3, 4)
    picked = [at(a, 1), at(b, 1), at(a, 2), at(b, 2)].filter((f): f is Fencer => !!f);
    if (picked.length < 4) return null;
    return picked
      .map(f => overallOf.get(f.id))
      .filter((r): r is PoolRanking => !!r)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  } else {
    const firsts = poolRankings.map(r => at(r, 1)).filter((f): f is Fencer => !!f);
    picked = firsts;
    if (n === 3) {
      const seconds = poolRankings.map(r => at(r, 2)).filter((f): f is Fencer => !!f);
      const best = [...seconds].sort((x, y) => overallRank(x.id) - overallRank(y.id))[0];
      if (best) picked = [...picked, best];
    }
  }
  if (picked.length < 4 || picked.some(f => !overallOf.has(f.id))) return null;
  return [...picked]
    .sort((x, y) => overallRank(x.id) - overallRank(y.id))
    .map((f, i) => ({ ...overallOf.get(f.id)!, rank: i + 1 }));
}
