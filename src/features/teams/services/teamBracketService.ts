/**
 * BellePoule Modern - Team Elimination Bracket
 * Génère et fait progresser un tableau à élimination directe entre équipes,
 * en réutilisant le calcul de seeding générique (agnostique du type de
 * compétiteur) de `tableCalculations.ts`.
 * Licensed under GPL-3.0
 */

import { v4 as uuidv4 } from 'uuid';
import { calculateTableSize, generateSeedingChart } from '../../../shared/utils/tableCalculations';
import { Team } from '../types/team.types';

export interface TeamTableNode {
  id: string;
  position: number; // Position dans le tour (0 = finale)
  round: number; // Nombre de matchs dans ce tour (1 = finale, 2 = demi, 4 = quart…)
  teamA?: Team;
  teamB?: Team;
  winner?: Team;
  parentA?: string; // ID du noeud parent haut (tour précédent)
  parentB?: string; // ID du noeud parent bas (tour précédent)
  isBye: boolean;
}

/** Place les équipes dans le tableau selon leur classement (rank croissant). */
export function placeTeamsInTable(teams: Team[], tableSize: number): (Team | null)[] {
  const placements: (Team | null)[] = new Array(tableSize).fill(null);
  const seedingChart = generateSeedingChart(tableSize);

  const seedToPosition = new Map<number, number>();
  for (let pos = 0; pos < seedingChart.length; pos++) {
    seedToPosition.set(seedingChart[pos], pos);
  }

  const sortedTeams = [...teams].sort((a, b) => (a.ranking || 999) - (b.ranking || 999));

  for (let i = 0; i < sortedTeams.length; i++) {
    const position = seedToPosition.get(i + 1);
    if (position !== undefined) {
      placements[position] = sortedTeams[i];
    }
  }

  return placements;
}

/**
 * Construit l'arbre complet du tableau équipes (tous tours), en propageant
 * automatiquement les exempts (byes) round par round.
 */
export function generateTeamBracket(teams: Team[]): TeamTableNode[] {
  const tableSize = calculateTableSize(teams.length);
  const placements = placeTeamsInTable(teams, tableSize);
  const nodes: TeamTableNode[] = [];

  // Premier tour (feuilles)
  for (let i = 0; i < tableSize / 2; i++) {
    const teamA = placements[i * 2];
    const teamB = placements[i * 2 + 1];
    const isBye = !teamA || !teamB;

    const node: TeamTableNode = {
      id: uuidv4(),
      position: i,
      round: tableSize / 2,
      teamA: teamA ?? undefined,
      teamB: teamB ?? undefined,
      isBye,
    };

    if (isBye && (teamA || teamB)) {
      node.winner = teamA ?? teamB ?? undefined;
    }

    nodes.push(node);
  }

  // Tours suivants jusqu'à la finale, en propageant les vainqueurs des byes
  let currentRound = tableSize / 4;
  let previousRoundStart = 0;

  while (currentRound >= 1) {
    const roundStart = nodes.length;

    for (let i = 0; i < currentRound; i++) {
      const parentA = nodes[previousRoundStart + i * 2];
      const parentB = nodes[previousRoundStart + i * 2 + 1];

      const node: TeamTableNode = {
        id: uuidv4(),
        position: i,
        round: currentRound,
        parentA: parentA.id,
        parentB: parentB.id,
        isBye: false,
        teamA: parentA.winner,
        teamB: parentB.winner,
      };

      nodes.push(node);
    }

    previousRoundStart = roundStart;
    currentRound = currentRound / 2;
  }

  return nodes;
}

/**
 * Fait progresser le vainqueur d'un noeud vers son noeud parent (tour suivant).
 * Retourne un nouvel arbre (immutable) avec le vainqueur propagé.
 */
export function propagateTeamWinner(
  nodes: TeamTableNode[],
  nodeId: string,
  winner: Team
): TeamTableNode[] {
  const updated = nodes.map(n => (n.id === nodeId ? { ...n, winner } : n));

  return updated.map(node => {
    if (node.parentA) {
      const parent = updated.find(n => n.id === node.parentA);
      if (parent?.winner && parent.winner.id === winner.id) {
        return { ...node, teamA: winner };
      }
    }
    if (node.parentB) {
      const parent = updated.find(n => n.id === node.parentB);
      if (parent?.winner && parent.winner.id === winner.id) {
        return { ...node, teamB: winner };
      }
    }
    return node;
  });
}
