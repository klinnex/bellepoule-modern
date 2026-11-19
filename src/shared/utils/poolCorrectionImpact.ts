/**
 * BellePoule Modern - Correction d'un résultat de poule après le tirage du tableau (#1996)
 * Règle partagée : dès qu'un tableau existe, les poules sont figées ; une correction
 * passe par une mesure d'impact (classement, qualifiés, têtes de série, matchs joués).
 * Licensed under GPL-3.0
 */

import { FencerStatus, type Fencer, type PoolRanking } from '../types';

/** Forme minimale d'un match de tableau (principal ou consolante) */
export interface CorrectionTableauMatch {
  fencerA: Fencer | null;
  fencerB: Fencer | null;
  winner: Fencer | null;
  isBye: boolean;
  seedA?: number | null;
  seedB?: number | null;
}

/** Poules figées : un tableau (principal ou consolante) a été tiré */
export const arePoolsFrozenByTableau = (
  tableauMatches: readonly unknown[],
  consolationMatchCount = 0
): boolean => tableauMatches.length > 0 || consolationMatchCount > 0;

export interface RankChange {
  fencer: Fencer;
  from: number;
  to: number;
}

export interface SeedChange {
  fencer: Fencer;
  /** Rang au tirage du tableau */
  drawn: number;
  /** Rang après correction */
  corrected: number;
}

export interface PoolCorrectionImpact {
  /** Tireurs dont le rang après poules change */
  rankChanges: RankChange[];
  /** Tireurs qui entreraient dans le tableau / qui en sortiraient */
  entering: Fencer[];
  leaving: Fencer[];
  /** Tireurs du tableau dont la tête de série change */
  seedChanges: SeedChange[];
  /** Matchs de tableau (principal + consolantes) déjà joués */
  playedMatches: number;
  /** Le tableau tiré ne correspond plus au classement corrigé */
  tableauOutdated: boolean;
}

const OUT_STATUSES = new Set<FencerStatus>([
  FencerStatus.ABANDONED,
  FencerStatus.FORFAIT,
  FencerStatus.EXCLUDED,
  FencerStatus.ELIMINATED,
]);

/** Tireurs admis au tableau, par rang (même filtre que le tirage du tableau) */
const eligible = (ranking: PoolRanking[]): PoolRanking[] =>
  ranking.filter(r => !OUT_STATUSES.has(r.fencer.status)).sort((a, b) => a.rank - b.rank);

/**
 * Impact d'une correction de poule sur un tableau déjà tiré.
 * `before` : classement au moment de la correction ; `after` : classement recalculé.
 * Les rangs du tirage sont lus sur le tableau (`seedA` / `seedB`), sinon sur `before`.
 */
export function computePoolCorrectionImpact(input: {
  before: PoolRanking[];
  after: PoolRanking[];
  tableauMatches: CorrectionTableauMatch[];
  consolationMatches?: CorrectionTableauMatch[];
}): PoolCorrectionImpact {
  const { before, after, tableauMatches } = input;
  const beforeRank = new Map(before.map(r => [r.fencer.id, r.rank]));
  const afterRank = new Map(after.map(r => [r.fencer.id, r.rank]));

  const rankChanges: RankChange[] = after
    .filter(r => beforeRank.has(r.fencer.id) && beforeRank.get(r.fencer.id) !== r.rank)
    .map(r => ({ fencer: r.fencer, from: beforeRank.get(r.fencer.id)!, to: r.rank }))
    .sort((a, b) => a.to - b.to);

  // Tireurs placés au tirage et leur rang de tirage
  const drawn = new Map<string, { fencer: Fencer; seed: number | undefined }>();
  for (const m of tableauMatches) {
    for (const [f, seed] of [
      [m.fencerA, m.seedA],
      [m.fencerB, m.seedB],
    ] as const) {
      if (!f || drawn.has(f.id)) continue;
      drawn.set(f.id, { fencer: f, seed: seed ?? beforeRank.get(f.id) });
    }
  }

  // Qualifiés après correction : autant de places que de tireurs tirés
  const qualifiedAfter = eligible(after).slice(0, drawn.size);
  const qualifiedIds = new Set(qualifiedAfter.map(r => r.fencer.id));
  const entering = drawn.size > 0 ? qualifiedAfter.filter(r => !drawn.has(r.fencer.id)) : [];
  const leaving = [...drawn.values()].filter(d => !qualifiedIds.has(d.fencer.id));

  const seedChanges: SeedChange[] = [...drawn.values()]
    .filter(
      d => d.seed != null && afterRank.has(d.fencer.id) && afterRank.get(d.fencer.id) !== d.seed
    )
    .map(d => ({ fencer: d.fencer, drawn: d.seed!, corrected: afterRank.get(d.fencer.id)! }))
    .sort((a, b) => a.drawn - b.drawn);

  const played = (ms: CorrectionTableauMatch[]) => ms.filter(m => !m.isBye && m.winner).length;
  const playedMatches = played(tableauMatches) + played(input.consolationMatches ?? []);

  return {
    rankChanges,
    entering: entering.map(r => r.fencer),
    leaving: leaving.map(d => d.fencer),
    seedChanges,
    playedMatches,
    tableauOutdated: entering.length > 0 || leaving.length > 0 || seedChanges.length > 0,
  };
}
