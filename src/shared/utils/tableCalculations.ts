/**
 * BellePoule Modern - Direct Elimination Table Utilities
 * Based on the original BellePoule tableau algorithm
 * Licensed under GPL-3.0
 */

import {
  DirectEliminationTable,
  Fencer,
  Match,
  MatchStatus,
  TableNode,
  TableRanking,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Table Size Calculation
// ============================================================================

/**
 * Calcule la taille du tableau (puissance de 2 supérieure ou égale)
 */
export function calculateTableSize(fencerCount: number): number {
  let size = 2;
  while (size < fencerCount) {
    size *= 2;
  }
  return size;
}

/**
 * Calcule le nombre d'exempts (byes) nécessaires
 */
export function calculateByeCount(fencerCount: number, tableSize: number): number {
  return tableSize - fencerCount;
}

// ============================================================================
// Seeding and Placement
// ============================================================================

/**
 * Génère le tableau de placement FIE : chart[position] = seed.
 *
 * Construction par dédoublement : à chaque tour, chaque seed s d'indice i
 * devient la paire [s, n+1-s] (i pair) ou [n+1-s, s] (i impair).
 * Tableau de 8 : [1, 8, 5, 4, 3, 6, 7, 2]
 *   → 1-8, 5-4, 3-6, 7-2 ; 1 et 2 ne se rencontrent qu'en finale.
 */
export function generateSeedingChart(tableSize: number): number[] {
  if (!Number.isInteger(tableSize) || tableSize < 1 || (tableSize & (tableSize - 1)) !== 0) {
    throw new RangeError(
      `generateSeedingChart: tableSize doit être une puissance de 2 (reçu: ${tableSize})`
    );
  }
  let chart = [1];
  for (let n = 2; n <= tableSize; n *= 2) {
    const next: number[] = [];
    chart.forEach((seed, i) => {
      const opponent = n + 1 - seed;
      if (i % 2 === 0) next.push(seed, opponent);
      else next.push(opponent, seed);
    });
    chart = next;
  }
  return chart;
}

/**
 * Position (0-based) d'une tête de série dans le tableau, selon le placement FIE.
 */
export function getSeedPosition(seed: number, tableSize: number): number {
  return generateSeedingChart(tableSize).indexOf(seed);
}

/**
 * Place les tireurs dans le tableau selon leur classement
 */
export function placeFencersInTable(fencers: Fencer[], tableSize: number): (Fencer | null)[] {
  const placements: (Fencer | null)[] = new Array(tableSize).fill(null);
  const seedingChart = generateSeedingChart(tableSize);

  // Précalcule seed→position en O(n) pour éviter indexOf en boucle
  const seedToPosition = new Map<number, number>();
  for (let pos = 0; pos < seedingChart.length; pos++) {
    seedToPosition.set(seedingChart[pos], pos);
  }

  // Trier les tireurs par classement général (après poules)
  const sortedFencers = [...fencers].sort(
    (a, b) => (a.poolStats?.overallRank ?? 999) - (b.poolStats?.overallRank ?? 999)
  );

  // Placer chaque tireur selon son seed
  for (let i = 0; i < sortedFencers.length; i++) {
    const position = seedToPosition.get(i + 1);
    if (position !== undefined) {
      placements[position] = sortedFencers[i];
    }
  }

  return placements;
}

// ============================================================================
// Table Generation
// ============================================================================

/**
 * Crée la structure complète d'un tableau à élimination directe
 */
export function createDirectEliminationTable(
  fencers: Fencer[],
  maxScore: number,
  name: string = 'Tableau principal',
  firstPlace: number = 1
): DirectEliminationTable {
  const tableSize = calculateTableSize(fencers.length);
  const placements = placeFencersInTable(fencers, tableSize);

  const now = new Date();
  const tableId = uuidv4();

  const nodes: TableNode[] = [];
  const rounds = Math.log2(tableSize);

  // Créer tous les noeuds du tableau
  // Premier tour (feuilles)
  for (let i = 0; i < tableSize / 2; i++) {
    const fencerA = placements[i * 2];
    const fencerB = placements[i * 2 + 1];
    const isBye = !fencerA || !fencerB;

    const node: TableNode = {
      id: uuidv4(),
      position: i,
      round: tableSize / 2,
      fencerA: fencerA ?? undefined,
      fencerB: fencerB ?? undefined,
      isBye,
      createdAt: now,
      updatedAt: now,
    };

    // Si bye, le tireur présent gagne automatiquement
    if (isBye && (fencerA || fencerB)) {
      node.winner = fencerA ?? fencerB ?? undefined;
    }

    // Créer le match si les deux tireurs sont présents
    if (fencerA && fencerB) {
      node.match = createTableMatch(fencerA, fencerB, i + 1, maxScore, tableSize / 2);
    }

    nodes.push(node);
  }

  // Créer les tours suivants (jusqu'à la finale)
  let currentRound = tableSize / 4;
  let previousRoundStart = 0;

  while (currentRound >= 1) {
    const matchesInRound = currentRound;
    const roundStart = nodes.length;

    for (let i = 0; i < matchesInRound; i++) {
      const parentAIndex = previousRoundStart + i * 2;
      const parentBIndex = previousRoundStart + i * 2 + 1;

      const parentA = nodes[parentAIndex];
      const parentB = nodes[parentBIndex];

      const node: TableNode = {
        id: uuidv4(),
        position: i,
        round: currentRound,
        parentA: parentA.id,
        parentB: parentB.id,
        isBye: false,
        createdAt: now,
        updatedAt: now,
      };

      // Si les parents ont des gagnants (byes), les propager
      if (parentA.winner) {
        node.fencerA = parentA.winner;
      }
      if (parentB.winner) {
        node.fencerB = parentB.winner;
      }

      // Si les deux tireurs sont connus, créer le match
      if (node.fencerA && node.fencerB) {
        node.match = createTableMatch(
          node.fencerA,
          node.fencerB,
          nodes.length + 1,
          maxScore,
          currentRound
        );
      }

      nodes.push(node);
    }

    previousRoundStart = roundStart;
    currentRound = currentRound / 2;
  }

  return {
    id: tableId,
    competitionId: '',
    name,
    size: tableSize,
    maxScore,
    nodes,
    isComplete: false,
    ranking: [],
    firstPlace,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Crée un match de tableau
 */
function createTableMatch(
  fencerA: Fencer,
  fencerB: Fencer,
  matchNumber: number,
  maxScore: number,
  round: number
): Match {
  const now = new Date();
  return {
    id: uuidv4(),
    number: matchNumber,
    fencerA,
    fencerB,
    scoreA: null,
    scoreB: null,
    maxScore,
    status: MatchStatus.NOT_STARTED,
    round,
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// Table Updates
// ============================================================================

/**
 * Met à jour le tableau après qu'un match soit terminé
 */
export function updateTableAfterMatch(
  table: DirectEliminationTable,
  matchId: string,
  winner: Fencer
): DirectEliminationTable {
  const updatedNodes = table.nodes.map(node => {
    if (node.match?.id === matchId) {
      return { ...node, winner };
    }
    return node;
  });

  // Construire des Maps en une passe unique pour éviter les find() O(n) répétés
  const byMatchId = new Map<string, TableNode>();
  // byParent : childId → parent node (le nœud dont parentA ou parentB === childId)
  const byParent = new Map<string, TableNode>();
  for (const node of updatedNodes) {
    if (node.match) byMatchId.set(node.match.id, node);
    if (node.parentA) byParent.set(node.parentA, node);
    if (node.parentB) byParent.set(node.parentB, node);
  }

  // Propager le gagnant vers le tour suivant
  const nodeWithMatch = byMatchId.get(matchId);
  if (nodeWithMatch) {
    const nextNode = byParent.get(nodeWithMatch.id);

    if (nextNode) {
      const isFromA = nextNode.parentA === nodeWithMatch.id;
      if (isFromA) {
        nextNode.fencerA = winner;
      } else {
        nextNode.fencerB = winner;
      }

      // Créer le match si les deux tireurs sont maintenant connus
      if (nextNode.fencerA && nextNode.fencerB && !nextNode.match) {
        nextNode.match = createTableMatch(
          nextNode.fencerA,
          nextNode.fencerB,
          getNextMatchNumber(updatedNodes),
          table.maxScore,
          nextNode.round
        );
      }
    }
  }

  // Vérifier si le tableau est complet (une seule passe, pas de filter+every)
  const isComplete = updatedNodes.every(n => n.round !== 1 || !!n.winner);

  return {
    ...table,
    nodes: updatedNodes,
    isComplete,
    updatedAt: new Date(),
  };
}

/**
 * Obtient le prochain numéro de match disponible
 */
function getNextMatchNumber(nodes: TableNode[]): number {
  const maxNumber = nodes
    .filter(n => n.match)
    .reduce((max, n) => Math.max(max, n.match?.number ?? 0), 0);
  return maxNumber + 1;
}

// ============================================================================
// Table Ranking
// ============================================================================

/**
 * Calcule les touches marquées par un tireur dans le tableau
 */
function calculateTableTouchesScored(fencerId: string, table: DirectEliminationTable): number {
  let touches = 0;

  for (const node of table.nodes) {
    if (!node.match || node.match.status !== MatchStatus.FINISHED) continue;

    // Vérifier si le tireur a participé à ce match
    if (node.fencerA?.id === fencerId) {
      // Le tireur est fencerA
      const scoreA = node.match.scoreA;
      if (typeof scoreA === 'number') {
        touches += scoreA;
      } else if (scoreA && typeof scoreA === 'object' && 'value' in scoreA) {
        touches += (scoreA.value as number) || 0;
      }
    } else if (node.fencerB?.id === fencerId) {
      // Le tireur est fencerB
      const scoreB = node.match.scoreB;
      if (typeof scoreB === 'number') {
        touches += scoreB;
      } else if (scoreB && typeof scoreB === 'object' && 'value' in scoreB) {
        touches += (scoreB.value as number) || 0;
      }
    }
  }

  return touches;
}

/**
 * Calcule le total des touches (poules + tableau) pour un tireur
 */
function calculateTotalTouches(fencer: Fencer, table: DirectEliminationTable): number {
  const poolTouches = fencer.poolStats?.touchesScored || 0;
  const tableTouches = calculateTableTouchesScored(fencer.id, table);
  return poolTouches + tableTouches;
}

/**
 * Calcule le classement final d'un tableau
 *
 * Règles de classement :
 * 1. Places 1-4 : Déterminées par les résultats des finales
 * 2. Places 5+ : Départagées par le total des touches marquées (poules + tableau)
 *
 * Issues corrigées :
 * - #60 : Chaque tireur éliminé à un tour donné a un rang distinct (pas d'ex aequo)
 * - #59 : Départage au-delà de la 4e place par somme des touches
 * - #61 : Correction du tri des classements
 */
export function calculateTableRanking(table: DirectEliminationTable): TableRanking[] {
  const rankings: TableRanking[] = [];
  const firstPlace = table.firstPlace;

  // Pré-calculer les touches tableau par tireur en une seule passe (O(n) au lieu de O(n²))
  const tableTouchesMap = new Map<string, number>();
  for (const node of table.nodes) {
    if (!node.match || node.match.status !== MatchStatus.FINISHED) continue;
    const scoreA = node.match.scoreA;
    const scoreB = node.match.scoreB;
    const valA = typeof scoreA === 'number' ? scoreA : ((scoreA as any)?.value ?? 0);
    const valB = typeof scoreB === 'number' ? scoreB : ((scoreB as any)?.value ?? 0);
    if (node.fencerA)
      tableTouchesMap.set(node.fencerA.id, (tableTouchesMap.get(node.fencerA.id) ?? 0) + valA);
    if (node.fencerB)
      tableTouchesMap.set(node.fencerB.id, (tableTouchesMap.get(node.fencerB.id) ?? 0) + valB);
  }

  // Finale (place 1 et 2)
  const finale = table.nodes.find(n => n.round === 1);
  if (finale?.winner) {
    rankings.push({
      fencer: finale.winner,
      rank: firstPlace,
      eliminatedAt: 1,
    });

    const loser = finale.fencerA?.id === finale.winner.id ? finale.fencerB : finale.fencerA;
    if (loser) {
      rankings.push({
        fencer: loser,
        rank: firstPlace + 1,
        eliminatedAt: 1,
      });
    }
  }

  // Match pour la 3ème place (si activé)
  const thirdPlaceMatch = table.nodes.find(n => n.round === 0);
  if (thirdPlaceMatch?.winner) {
    rankings.push({
      fencer: thirdPlaceMatch.winner,
      rank: firstPlace + 2,
      eliminatedAt: 0,
    });

    const loser =
      thirdPlaceMatch.fencerA?.id === thirdPlaceMatch.winner.id
        ? thirdPlaceMatch.fencerB
        : thirdPlaceMatch.fencerA;
    if (loser) {
      rankings.push({
        fencer: loser,
        rank: firstPlace + 3,
        eliminatedAt: 0,
      });
    }
  }

  // Parcourir les autres tours (demi-finales et suivants)
  let currentPlace = firstPlace + (thirdPlaceMatch?.winner ? 4 : 2);
  let round = 2;

  while (round <= table.size / 2) {
    const roundNodes = table.nodes.filter(n => n.round === round);
    const losers: Array<{ fencer: Fencer; totalTouches: number }> = [];

    for (const node of roundNodes) {
      if (node.winner) {
        const loser = node.fencerA?.id === node.winner.id ? node.fencerB : node.fencerA;
        if (loser) {
          const totalTouches =
            (loser.poolStats?.touchesScored ?? 0) + (tableTouchesMap.get(loser.id) ?? 0);
          losers.push({ fencer: loser, totalTouches });
        }
      }
    }

    // Au-delà de la 4e place (firstPlace + 3), départager par touches
    if (currentPlace > firstPlace + 3) {
      // Trier par touches marquées (décroissant)
      losers.sort((a, b) => b.totalTouches - a.totalTouches);
    }

    // Attribuer un rang distinct à chaque perdant
    for (let i = 0; i < losers.length; i++) {
      rankings.push({
        fencer: losers[i].fencer,
        rank: currentPlace + i,
        eliminatedAt: round,
      });
    }

    currentPlace += losers.length;
    round *= 2;
  }

  // Trier le classement final par rang
  rankings.sort((a, b) => a.rank - b.rank);

  return rankings;
}

// ============================================================================
// Round Names
// ============================================================================

/**
 * Retourne le nom d'un tour de tableau
 */
export function getRoundName(round: number, locale: string = 'fr'): string {
  const names: { [key: string]: { [key: number]: string } } = {
    fr: {
      1: 'Finale',
      2: 'Demi-finales',
      4: 'Quarts de finale',
      8: '8èmes de finale',
      16: '16èmes de finale',
      32: '32èmes de finale',
      64: '64èmes de finale',
      128: '128èmes de finale',
    },
    en: {
      1: 'Final',
      2: 'Semi-finals',
      4: 'Quarter-finals',
      8: 'Round of 16',
      16: 'Round of 32',
      32: 'Round of 64',
      64: 'Round of 128',
      128: 'Round of 256',
    },
  };

  return names[locale]?.[round] ?? `Tableau de ${round * 2}`;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Trouve un noeud par son ID
 */
export function findNodeById(table: DirectEliminationTable, nodeId: string): TableNode | undefined {
  return table.nodes.find(n => n.id === nodeId);
}

/**
 * Trouve un noeud par son match
 */
export function findNodeByMatch(
  table: DirectEliminationTable,
  matchId: string
): TableNode | undefined {
  return table.nodes.find(n => n.match?.id === matchId);
}

/**
 * Obtient tous les matchs d'un tour
 */
export function getMatchesInRound(table: DirectEliminationTable, round: number): Match[] {
  return table.nodes.filter(n => n.round === round && n.match).map(n => n.match!);
}

/**
 * Compte les matchs restants dans un tableau
 */
export function countRemainingMatches(table: DirectEliminationTable): number {
  return table.nodes.filter(n => n.match && n.match.status !== MatchStatus.FINISHED).length;
}

/**
 * Vérifie si un tableau peut démarrer (premier tour complet)
 */
export function canTableStart(table: DirectEliminationTable): boolean {
  const firstRound = table.size / 2;
  const firstRoundNodes = table.nodes.filter(n => n.round === firstRound);

  return firstRoundNodes.every(n => n.isBye || (n.fencerA && n.fencerB));
}
