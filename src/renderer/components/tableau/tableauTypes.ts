/**
 * BellePoule Modern - Types et utilitaires partagés du tableau d'élimination directe
 * Séparé de TableauView pour permettre le lazy-loading du composant.
 */

import { Fencer } from '../../../shared/types';

export interface TableauMatch {
  id: string;
  round: number;
  position: number;
  fencerA: Fencer | null;
  fencerB: Fencer | null;
  scoreA: number | null;
  scoreB: number | null;
  winner: Fencer | null;
  isBye: boolean;
  arena?: number | null;
  referee?: { id: string; firstName: string; lastName: string } | null;
  /** Arbitres multiples (mode expert, #908) : referees[0] = arbitre principal = referee */
  referees?: Array<{ id: string; firstName: string; lastName: string }>;
}

export interface FinalResult {
  rank: number;
  fencer: Fencer;
  eliminatedAt: string;
  poolTouches?: number;
  tableTouches?: number;
  totalTouches?: number;
}

export interface ConsolationBracket {
  id: string;
  name: string;
  firstPlace: number;
  matches: TableauMatch[];
  size: number;
  isComplete: boolean;
  sourceRound: number;
  parentBracketId: string;
}

/**
 * Déduit le vainqueur d'un match à partir des scores quand il n'est pas déjà fixé.
 * Couvre les chemins qui posent un score sans renseigner `winner`
 * (restauration DB, statuts spéciaux, synchro partielle). En cas d'égalité,
 * `winner` reste inchangé : seul un tirage au sort explicite peut le fixer.
 */
export function resolveWinnerFromScores(match: TableauMatch): void {
  if (match.winner) return;
  if (match.scoreA === null || match.scoreB === null) return;
  if (match.scoreA > match.scoreB) match.winner = match.fencerA;
  else if (match.scoreB > match.scoreA) match.winner = match.fencerB;
}

/**
 * Déduit le premier tour du tableau principal à partir des matchs existants.
 * Source de vérité robuste face à un `size` absent (0), périmé (restauration de
 * session avant que `tableauSize` ne soit recalculé) ou trop grand (round de
 * barrage = mainSize*2). Le premier tour est le plus grand round (hors petite
 * finale round=3) dont le nombre de matchs vaut round/2 : un round de barrage,
 * partiellement rempli, est ainsi écarté.
 */
export function deriveFirstRound(matchList: TableauMatch[]): number {
  const counts = new Map<number, number>();
  for (const m of matchList) {
    if (m.round === 3) continue; // petite finale
    counts.set(m.round, (counts.get(m.round) ?? 0) + 1);
  }
  let best = 0;
  for (const [round, count] of counts) {
    if (count === round / 2 && round > best) best = round;
  }
  return best;
}

export function propagateWinners(matchList: TableauMatch[], size: number): void {
  // Normalise les vainqueurs manquants avant toute propagation : un match dont
  // les deux scores sont saisis a forcément un vainqueur (hors égalité).
  for (const m of matchList) resolveWinnerFromScores(m);

  // Ignore un `size` invalide/périmé : on repart toujours du premier tour réel.
  const firstRound = deriveFirstRound(matchList);
  const effectiveSize = firstRound > 0 ? firstRound : size;

  // Indexe les matchs par (round, position). L'appariement feeder→tour suivant se fait
  // STRICTEMENT par `position`, jamais par index de tableau : l'ordre de `matchList`
  // n'est pas garanti (restauration DB, synchro tablette) et des positions peuvent
  // manquer (byes). Un match en position P d'un tour est alimenté par les positions
  // 2P et 2P+1 du tour précédent ; router par index isolerait un vainqueur au lieu de
  // le faire affronter son adversaire réel.
  const byRoundPos = new Map<number, Map<number, TableauMatch>>();
  for (const m of matchList) {
    let perRound = byRoundPos.get(m.round);
    if (!perRound) { perRound = new Map(); byRoundPos.set(m.round, perRound); }
    perRound.set(m.position, m);
  }
  const emptyRound = new Map<number, TableauMatch>();

  let currentRound = effectiveSize;

  while (currentRound > 2) {
    const nextRound = currentRound / 2;
    const currentMatches = byRoundPos.get(currentRound) ?? emptyRound;
    const nextMatches = byRoundPos.get(nextRound) ?? emptyRound;

    currentMatches.forEach(match => {
      if (match.winner) {
        const nextMatch = nextMatches.get(Math.floor(match.position / 2));
        if (nextMatch) {
          if (match.position % 2 === 0) {
            nextMatch.fencerA = match.winner;
          } else {
            nextMatch.fencerB = match.winner;
          }
        }
      }
    });

    nextMatches.forEach(nextMatch => {
      if (nextMatch.scoreA !== null && nextMatch.scoreB !== null) return;

      const feederA = currentMatches.get(nextMatch.position * 2);
      const feederB = currentMatches.get(nextMatch.position * 2 + 1);

      const feederAResolved =
        !feederA ||
        feederA.winner !== null ||
        (feederA.isBye && !feederA.fencerA && !feederA.fencerB);
      const feederBResolved =
        !feederB ||
        feederB.winner !== null ||
        (feederB.isBye && !feederB.fencerA && !feederB.fencerB);

      if (feederAResolved && feederBResolved) {
        if (nextMatch.fencerA && !nextMatch.fencerB) {
          nextMatch.winner = nextMatch.fencerA;
          nextMatch.isBye = true;
        } else if (!nextMatch.fencerA && nextMatch.fencerB) {
          nextMatch.winner = nextMatch.fencerB;
          nextMatch.isBye = true;
        } else if (nextMatch.fencerA && nextMatch.fencerB) {
          nextMatch.isBye = false;
          nextMatch.winner = null;
        }
      }
    });

    currentRound = nextRound;
  }

  const thirdPlaceMatchEntry = matchList.find(m => m.round === 3);
  if (thirdPlaceMatchEntry && effectiveSize >= 4) {
    const semiFinalMatches = [...(byRoundPos.get(4) ?? emptyRound).values()].sort(
      (a, b) => a.position - b.position
    );

    if (semiFinalMatches.length === 2) {
      const losers: Fencer[] = [];

      semiFinalMatches.forEach(semiFinal => {
        if (semiFinal.winner) {
          const loser =
            semiFinal.fencerA?.id === semiFinal.winner.id ? semiFinal.fencerB : semiFinal.fencerA;
          if (loser) losers.push(loser);
        }
      });

      if (losers.length === 2) {
        thirdPlaceMatchEntry.fencerA = losers[0];
        thirdPlaceMatchEntry.fencerB = losers[1];
      }
    }
  }
}
