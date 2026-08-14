/**
 * BellePoule Modern - Laser Sabre "arena" team format
 * Règle d'évitement de revanche au 1er tour du tableau : si deux équipes
 * déjà rencontrées en poule tombent l'une contre l'autre au 1er tour du
 * tableau à élimination directe, l'équipe la moins bien classée change de
 * place — seed 5↔6 ou 7↔8 uniquement (règlement, section "Déroulement de la
 * compétition"). Réutilise `placeRankedTeamsInTable`/`calculateTableSize`
 * tels quels, sans les modifier.
 * Licensed under GPL-3.0
 */

import { TeamRow, TeamMatchRow } from '../types/team.types';
import { calculateTableSize, placeRankedTeamsInTable } from './teamCalculations';

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

/** Construit l'historique des rencontres de poule déjà jouées (paires d'équipes). */
export function buildPoolPairHistory(matches: TeamMatchRow[]): Set<string> {
  const history = new Set<string>();
  for (const m of matches) {
    if (m.status !== 'finished') continue;
    history.add(pairKey(m.teamAId, m.teamBId));
  }
  return history;
}

/**
 * Échange les équipes classées 5/6 (ou 7/8) si l'échange évite une revanche
 * de poule au 1er tour du tableau. N'échange que ces deux paires précises,
 * conformément au règlement. Ne modifie rien si moins de 6 équipes classées.
 */
export function applyRematchAvoidanceSwap(
  rankedTeams: TeamRow[],
  poolPairHistory: Set<string>
): TeamRow[] {
  if (rankedTeams.length < 6) return rankedTeams;

  const tableSize = calculateTableSize(rankedTeams.length);
  const result = [...rankedTeams];

  const trySwap = (rankA: number, rankB: number) => {
    if (result.length < rankB) return;
    const placements = placeRankedTeamsInTable(result, tableSize);
    const teamA = result[rankA - 1];
    const posA = placements.findIndex(t => t?.id === teamA.id);
    if (posA === -1) return;
    const opponentPos = posA % 2 === 0 ? posA + 1 : posA - 1;
    const opponent = placements[opponentPos];
    if (!opponent) return; // exempt (bye) au 1er tour : pas de revanche possible
    if (poolPairHistory.has(pairKey(teamA.id, opponent.id))) {
      const tmp = result[rankA - 1];
      result[rankA - 1] = result[rankB - 1];
      result[rankB - 1] = tmp;
    }
  };

  trySwap(5, 6);
  trySwap(7, 8);

  return result;
}
