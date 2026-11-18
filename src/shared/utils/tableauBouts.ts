/**
 * Décompte des matchs d'un tableau à élimination directe (#1817).
 *
 * Tous les tours sont créés à la génération : un match des tours suivants reste
 * à jouer même si ses tireurs ne sont pas encore connus. Seuls les exempts du
 * premier tour (un seul tireur) et les qualifications d'office (vainqueur sans
 * adversaire) sont hors décompte.
 */

export interface TableauBoutLike {
  round?: number;
  fencerA: unknown;
  fencerB: unknown;
  winner: unknown;
}

/** Premier tour = plus grand numéro de tour (64, 32, …). */
export function firstTableauRound(matches: TableauBoutLike[]): number {
  let max = -Infinity;
  for (const m of matches) if (m.round != null && m.round > max) max = m.round;
  return max;
}

/** Match disputé ou à disputer (exempts et qualifications d'office exclus). */
export function isTableauBout(m: TableauBoutLike, firstRound: number): boolean {
  if (m.fencerA && m.fencerB) return true;
  if (m.round == null || m.round >= firstRound) return false;
  return !m.winner;
}

export interface TableauBoutCount {
  done: number;
  total: number;
  /** Matchs restants par tour ; petite finale (3) regroupée avec la finale (2). */
  remainingByRound: Map<number, number>;
}

export function countTableauBouts(matches: TableauBoutLike[]): TableauBoutCount {
  const first = firstTableauRound(matches);
  let done = 0;
  let total = 0;
  const remainingByRound = new Map<number, number>();
  for (const m of matches) {
    if (!isTableauBout(m, first)) continue;
    total++;
    if (m.winner) {
      done++;
      continue;
    }
    const key = m.round === 3 ? 2 : (m.round ?? 0);
    remainingByRound.set(key, (remainingByRound.get(key) ?? 0) + 1);
  }
  return { done, total, remainingByRound };
}

/** Vagues restantes : les tours s'enchaînent, les matchs d'un tour se partagent les pistes. */
export function tableauRemainingWaves(count: TableauBoutCount, arenas: number): number {
  const a = Math.max(1, Math.floor(arenas));
  let waves = 0;
  for (const n of count.remainingByRound.values()) waves += Math.ceil(n / a);
  return waves;
}

// ── Mode « toutes les places » (#1817) ───────────────────────────────────────

const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(n));

/**
 * Matchs d'un tableau « toutes les places » de k tireurs : exempts au premier tour,
 * petite finale, puis un sous-tableau pour les perdants de chaque tour > 4.
 * Ex. 8 tireurs → 12 matchs ; 64 → 192.
 */
export function allPlacesBracketBouts(k: number): number {
  if (k < 2) return 0;
  const size = nextPow2(k);
  let total = 0;
  for (let r = size; r >= 2; r /= 2) {
    const real = r === size ? k - size / 2 : r / 2;
    total += real;
    if (r > 4) total += allPlacesBracketBouts(real);
    if (r === 4 && real === 2) total += 1;
  }
  return total;
}

/**
 * Matchs de la compétition « toutes les places » pour n tireurs qualifiés : barrages
 * (tireurs au-delà de la plus grande puissance de 2), tableau principal complet,
 * tableau des perdants de barrage.
 */
export function allPlacesCompetitionBouts(n: number): number {
  if (n < 2) return 0;
  const main = 2 ** Math.floor(Math.log2(n));
  const barrages = n - main;
  return barrages + allPlacesBracketBouts(main) + allPlacesBracketBouts(barrages);
}

/** Tireurs qualifiés d'un tableau « toutes les places » : tableau principal + barrages. */
export function allPlacesFieldSize(main: TableauBoutLike[]): number {
  const first = firstTableauRound(main);
  if (!Number.isFinite(first) || first < 2) return 0;
  const firstCount = main.filter(m => m.round === first).length;
  const hasBarrages = firstCount < first / 2 && main.some(m => m.round === first / 2);
  return hasBarrages ? first / 2 + firstCount : first;
}

export interface CompetitionBoutCount {
  /** Tableau principal (barrages et petite finale compris) */
  main: TableauBoutCount;
  /** Tous les matchs de tableau, consolantes comprises (= main sans « toutes les places ») */
  done: number;
  total: number;
  /** Mode « toutes les places » actif (deux décomptes à afficher) */
  allPlaces: boolean;
}

/**
 * Décompte des matchs de tableau de la compétition. En mode « toutes les places »,
 * le total est connu dès la génération (consolantes à venir comprises) ; les
 * consolantes déjà créées comptent leurs matchs joués.
 */
export function countCompetitionBouts(
  main: TableauBoutLike[],
  consolations: Array<{ matches: TableauBoutLike[] }> = [],
  playAllPositions = false
): CompetitionBoutCount {
  const mainCount = countTableauBouts(main);
  if (!playAllPositions || main.length === 0)
    return { main: mainCount, done: mainCount.done, total: mainCount.total, allPlaces: false };
  let done = mainCount.done;
  let known = mainCount.total;
  for (const c of consolations) {
    const cc = countTableauBouts(c.matches);
    done += cc.done;
    known += cc.total;
  }
  const projected = allPlacesCompetitionBouts(allPlacesFieldSize(main));
  return { main: mainCount, done, total: Math.max(projected, known), allPlaces: true };
}
