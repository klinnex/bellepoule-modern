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
