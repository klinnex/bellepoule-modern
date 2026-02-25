/**
 * BellePoule Modern - Pool Calculation Utilities
 * Based on the original BellePoule pool ranking algorithm
 * Licensed under GPL-3.0
 */

import {
  Fencer,
  FencerStatus,
  Match,
  MatchStatus,
  Pool,
  PoolRanking,
  PoolStats,
  Score,
} from '../types';

// ============================================================================
// Pool Match Order Generator
// ============================================================================

/**
 * Génère l'ordre des matchs dans une poule selon la méthode FIE officielle
 * Utilise les tableaux d'ordre standard selon le nombre de tireurs
 */
export function generatePoolMatchOrder(fencerCount: number): [number, number][] {
  const orders: { [key: number]: [number, number][] } = {
    3: [
      [1, 2],
      [2, 3],
      [1, 3],
    ],
    4: [
      [1, 4],
      [2, 3],
      [1, 3],
      [2, 4],
      [3, 4],
      [1, 2],
    ],
    5: [
      [1, 2],
      [3, 4],
      [5, 1],
      [2, 3],
      [5, 4],
      [1, 3],
      [2, 5],
      [4, 1],
      [3, 5],
      [4, 2],
    ],
    6: [
      [1, 2],
      [4, 5],
      [2, 3],
      [5, 6],
      [3, 1],
      [6, 4],
      [2, 5],
      [1, 4],
      [5, 3],
      [2, 6],
      [4, 3],
      [1, 5],
      [3, 6],
      [4, 2],
      [6, 1],
    ],
    7: [
      [1, 4],
      [2, 5],
      [3, 6],
      [7, 1],
      [5, 4],
      [6, 2],
      [3, 7],
      [6, 1],
      [4, 2],
      [5, 3],
      [7, 6],
      [1, 2],
      [4, 3],
      [5, 7],
      [6, 4],
      [2, 3],
      [1, 5],
      [7, 4],
      [3, 1],
      [2, 7],
      [6, 5],
    ],
    8: [
      [1, 2],
      [5, 6],
      [3, 4],
      [7, 8],
      [1, 5],
      [2, 6],
      [4, 8],
      [3, 7],
      [1, 3],
      [2, 4],
      [5, 7],
      [6, 8],
      [1, 4],
      [2, 3],
      [5, 8],
      [6, 7],
      [1, 6],
      [2, 5],
      [3, 8],
      [4, 7],
      [1, 7],
      [2, 8],
      [3, 5],
      [4, 6],
      [1, 8],
      [2, 7],
      [3, 6],
      [4, 5],
    ],
  };

  return orders[fencerCount] || generateGenericMatchOrder(fencerCount);
}

/**
 * Génère un ordre de matchs générique pour des poules de taille non standard
 */
function generateGenericMatchOrder(fencerCount: number): [number, number][] {
  const matches: [number, number][] = [];
  for (let i = 1; i <= fencerCount; i++) {
    for (let j = i + 1; j <= fencerCount; j++) {
      matches.push([i, j]);
    }
  }
  return matches;
}

// ============================================================================
// Pool Score Processing
// ============================================================================

/**
 * Calcule les statistiques d'un tireur dans une poule
 * Règle forfait : Si l'adversaire est en forfait/abandon, le match ne compte pas
 */
export function calculateFencerPoolStats(fencer: Fencer, matches: Match[]): PoolStats {
  let victories = 0;
  let defeats = 0;
  let touchesScored = 0;
  let touchesReceived = 0;
  let matchesPlayed = 0;

  for (const match of matches) {
    // Vérifier si le tireur est dans ce match
    const isA = match.fencerA?.id === fencer.id;
    const isB = match.fencerB?.id === fencer.id;

    if (!isA && !isB) continue;
    if (match.status !== MatchStatus.FINISHED) continue;

    const myScore = isA ? match.scoreA : match.scoreB;
    const oppScore = isA ? match.scoreB : match.scoreA;
    const opponent = isA ? match.fencerB : match.fencerA;

    if (!myScore || !oppScore) continue;

    // Si l'adversaire est en forfait/abandon/exclusion, le match ne compte pas
    if (
      opponent?.status === FencerStatus.FORFAIT ||
      opponent?.status === FencerStatus.ABANDONED ||
      opponent?.status === FencerStatus.EXCLUDED
    ) {
      continue;
    }

    matchesPlayed++;

    // Gestion des cas spéciaux
    if (myScore.isAbstention || myScore.isExclusion || myScore.isForfait) {
      defeats++;
      touchesReceived += oppScore.value ?? 0;
      touchesScored += myScore.value ?? 0;
    } else if (oppScore.isAbstention || oppScore.isExclusion || oppScore.isForfait) {
      victories++;
      touchesScored += myScore.value ?? 0;
      touchesReceived += oppScore.value ?? 0;
    } else if (myScore.isVictory) {
      victories++;
      touchesScored += myScore.value ?? 0;
      touchesReceived += oppScore.value ?? 0;
    } else {
      defeats++;
      touchesScored += myScore.value ?? 0;
      touchesReceived += oppScore.value ?? 0;
    }
  }

  const index = touchesScored - touchesReceived;
  const victoryRatio = matchesPlayed > 0 ? victories / matchesPlayed : 0;

  return {
    victories,
    defeats,
    touchesScored,
    touchesReceived,
    index,
    matchesPlayed,
    victoryRatio,
  };
}

/**
 * Calcule le classement d'une poule selon les règles demandées
 * Ordre de priorité:
 * 1. Nombre de victoires (décroissant)
 * 2. Points Quest (décroissant)
 * 3. Indice (TD - TR) (décroissant)
 * 4. Confrontation directe (si 2 tireurs à égalité)
 */
export function calculatePoolRanking(pool: Pool): PoolRanking[] {
  const rankings: PoolRanking[] = [];
  const forfeitFencers: PoolRanking[] = [];

  // Calculer les stats pour chaque tireur
  for (const fencer of pool.fencers) {
    // Si tireur forfait/abandon/exclu, l'ajouter à la liste séparée
    if (
      fencer.status === FencerStatus.EXCLUDED ||
      fencer.status === FencerStatus.FORFAIT ||
      fencer.status === FencerStatus.ABANDONED
    ) {
      forfeitFencers.push({
        fencer,
        rank: 0,
        victories: 0,
        defeats: 0,
        touchesScored: 0,
        touchesReceived: 0,
        index: 0,
        ratio: 0,
        questPoints: 0,
      });
      continue;
    }

    const stats = calculateFencerPoolStats(fencer, pool.matches);

    // Calculer les points Quest
    const questStats = calculateFencerQuestStats(fencer, pool.matches);

    rankings.push({
      fencer,
      rank: 0,
      victories: stats.victories,
      defeats: stats.defeats,
      touchesScored: stats.touchesScored,
      touchesReceived: stats.touchesReceived,
      index: stats.index,
      ratio: stats.victoryRatio,
      questPoints: questStats.questPoints,
    });
  }

  // Trier selon les critères demandés
  rankings.sort((a, b) => {
    // 1. Nombre de victoires (décroissant)
    if (a.victories !== b.victories) {
      return b.victories - a.victories;
    }

    // 2. Points Quest (décroissant)
    const aQuest = a.questPoints ?? 0;
    const bQuest = b.questPoints ?? 0;
    if (aQuest !== bQuest) {
      return bQuest - aQuest;
    }

    // 3. Indice (TD - TR) (décroissant)
    if (a.index !== b.index) {
      return b.index - a.index;
    }

    // 4. Confrontation directe (si 2 tireurs à égalité)
    const directMatch = pool.matches.find(
      m =>
        (m.fencerA?.id === a.fencer.id && m.fencerB?.id === b.fencer.id) ||
        (m.fencerA?.id === b.fencer.id && m.fencerB?.id === a.fencer.id)
    );

    if (directMatch && directMatch.status === MatchStatus.FINISHED) {
      const aIsFirst = directMatch.fencerA?.id === a.fencer.id;
      const aScore = aIsFirst ? directMatch.scoreA : directMatch.scoreB;

      if (aScore?.isVictory) {
        return -1;
      } else {
        return 1;
      }
    }

    // En cas d'égalité parfaite, trier par classement initial
    return (a.fencer.ranking ?? 9999) - (b.fencer.ranking ?? 9999);
  });

  // Assigner les rangs
  let currentRank = 1;
  for (let i = 0; i < rankings.length; i++) {
    if (i > 0) {
      const prev = rankings[i - 1];
      const curr = rankings[i];

      // Vérifier si vraiment à égalité (même victoires, même points Quest, même indice)
      const sameVictories = prev.victories === curr.victories;
      const sameQuest = (prev.questPoints ?? 0) === (curr.questPoints ?? 0);
      const sameIndex = prev.index === curr.index;

      if (sameVictories && sameQuest && sameIndex) {
        // Même rang (ex aequo)
        rankings[i].rank = rankings[i - 1].rank;
      } else {
        rankings[i].rank = currentRank;
      }
    } else {
      rankings[i].rank = currentRank;
    }
    currentRank++;
  }

  // Ajouter les tireurs forfait à la fin avec le dernier rang
  if (forfeitFencers.length > 0) {
    const lastRank = rankings.length > 0 ? rankings[rankings.length - 1].rank + 1 : 1;
    forfeitFencers.forEach((ff, idx) => {
      ff.rank = lastRank + idx;
      rankings.push(ff);
    });
  }

  return rankings;
}

// ============================================================================
// Pool Distribution Algorithm
// ============================================================================

/**
 * Distribue les tireurs dans les poules selon la méthode serpentine
 * en respectant les critères de séparation (club, ligue, nation)
 *
 * Algorithme:
 * 1. Distribution serpentine pure: 1→2→3→...→8→8→7→6→...→1→1→2→...
 * 2. Détection des conflits de club
 * 3. Échange de tireurs entre poules pour résoudre les conflits
 */
export function distributeFencersToPoolsSerpentine(
  fencers: Fencer[],
  poolCount: number,
  separation: {
    byClub: boolean;
    byLeague: boolean;
    byNation: boolean;
  }
): Fencer[][] {
  const pools: Fencer[][] = Array.from({ length: poolCount }, () => []);

  // Trier les tireurs par classement (meilleur classement = premier)
  const sortedFencers = [...fencers].sort((a, b) => (a.ranking ?? 99999) - (b.ranking ?? 99999));

  // Distribution serpentine pure
  let direction = 1; // 1 = aller, -1 = retour
  let poolIndex = 0;

  for (const fencer of sortedFencers) {
    pools[poolIndex].push(fencer);

    // Avancer dans la serpentine
    poolIndex += direction;
    if (poolIndex >= poolCount) {
      // On arrive à la fin, on repart en arrière (la dernière poule est visitée deux fois)
      direction = -1;
      poolIndex = poolCount - 1;
    } else if (poolIndex < 0) {
      // On arrive au début, on repart en avant (la première poule est visitée deux fois)
      direction = 1;
      poolIndex = 0;
    }
  }

  // Résoudre les conflits de club par échanges
  if (separation.byClub) {
    resolveClubConflicts(pools, separation);
  }

  // Rééquilibrer les poules pour assurer un nombre égal (ou presque égal) de tireurs
  rebalancePools(pools, separation);

  return pools;
}

/**
 * Résout les conflits de club en échangeant des tireurs entre poules
 * tout en préservant au mieux l'équilibre de la serpentine
 */
function resolveClubConflicts(
  pools: Fencer[][],
  separation: { byClub: boolean; byLeague: boolean; byNation: boolean }
): void {
  const poolCount = pools.length;
  let maxIterations = 100; // Éviter les boucles infinies
  let improved = true;

  while (improved && maxIterations > 0) {
    improved = false;
    maxIterations--;

    // Pour chaque poule
    for (let poolIdx = 0; poolIdx < poolCount; poolIdx++) {
      const pool = pools[poolIdx];

      // Pour chaque tireur dans la poule
      for (let fencerIdx = 0; fencerIdx < pool.length; fencerIdx++) {
        const fencer = pool[fencerIdx];

        // Vérifier si ce tireur a un conflit de club dans cette poule
        const hasClubConflict = pool.some(
          (other, idx) => idx !== fencerIdx && other.club === fencer.club
        );

        if (!hasClubConflict) continue;

        // Chercher un tireur dans une autre poule avec qui échanger
        const swapPartner = findSwapPartner(fencer, fencerIdx, poolIdx, pools, separation);

        if (swapPartner) {
          // Effectuer l'échange
          const { poolIdx: otherPoolIdx, fencerIdx: otherFencerIdx } = swapPartner;
          const temp = pools[poolIdx][fencerIdx];
          pools[poolIdx][fencerIdx] = pools[otherPoolIdx][otherFencerIdx];
          pools[otherPoolIdx][otherFencerIdx] = temp;
          improved = true;
          break;
        }
      }

      if (improved) break;
    }
  }
}

/**
 * Trouve un partenaire d'échange pour résoudre un conflit de club
 * Retourne null si aucun échange valide n'est trouvé
 */
function findSwapPartner(
  fencer: Fencer,
  fencerIdx: number,
  currentPoolIdx: number,
  pools: Fencer[][],
  separation: { byClub: boolean; byLeague: boolean; byNation: boolean }
): { poolIdx: number; fencerIdx: number } | null {
  const poolCount = pools.length;
  let bestSwap: { poolIdx: number; fencerIdx: number; score: number } | null = null;

  // Chercher dans les poules voisines d'abord (préserver l'équilibre)
  for (let offset = 1; offset < poolCount; offset++) {
    // Chercher d'abord dans les poules proches (offset petit)
    const directions = [offset, -offset];

    for (const dir of directions) {
      const otherPoolIdx = (currentPoolIdx + dir + poolCount) % poolCount;
      const otherPool = pools[otherPoolIdx];

      for (let otherFencerIdx = 0; otherFencerIdx < otherPool.length; otherFencerIdx++) {
        const otherFencer = otherPool[otherFencerIdx];

        // Vérifier si l'échange résoudrait le conflit
        if (
          canSwapResolveConflict(
            fencer,
            otherFencer,
            currentPoolIdx,
            otherPoolIdx,
            pools,
            separation
          )
        ) {
          // Calculer le score de cet échange (préférer les échanges proches)
          const score = 1000 - offset * 10 - Math.abs(fencerIdx - otherFencerIdx);

          if (!bestSwap || score > bestSwap.score) {
            bestSwap = {
              poolIdx: otherPoolIdx,
              fencerIdx: otherFencerIdx,
              score,
            };
          }
        }
      }
    }
  }

  return bestSwap ? { poolIdx: bestSwap.poolIdx, fencerIdx: bestSwap.fencerIdx } : null;
}

/**
 * Vérifie si un échange entre deux tireurs résoudrait les conflits de club
 */
function canSwapResolveConflict(
  fencer1: Fencer,
  fencer2: Fencer,
  pool1Idx: number,
  pool2Idx: number,
  pools: Fencer[][],
  separation: { byClub: boolean; byLeague: boolean; byNation: boolean }
): boolean {
  const pool1 = pools[pool1Idx];
  const pool2 = pools[pool2Idx];

  // Compter les conflits actuels
  const conflicts1Before = pool1.filter(f => f !== fencer1 && f.club === fencer1.club).length;
  const conflicts2Before = pool2.filter(f => f !== fencer2 && f.club === fencer2.club).length;

  // Simuler l'échange et compter les conflits après
  const conflicts1After = pool1.filter(f => f !== fencer1 && f.club === fencer2.club).length;
  const conflicts2After = pool2.filter(f => f !== fencer2 && f.club === fencer1.club).length;

  // Vérifier si le tireur 1 créerait un conflit dans la poule 2
  const newConflict1InPool2 = pool2.some(f => f !== fencer2 && f.club === fencer1.club);
  // Vérifier si le tireur 2 créerait un conflit dans la poule 1
  const newConflict2InPool1 = pool1.some(f => f !== fencer1 && f.club === fencer2.club);

  // L'échange est valide si:
  // 1. Il ne crée pas de nouveaux conflits
  // 2. Il réduit ou maintient le nombre total de conflits
  if (newConflict1InPool2 || newConflict2InPool1) {
    return false;
  }

  const totalConflictsBefore = conflicts1Before + conflicts2Before;
  const totalConflictsAfter = conflicts1After + conflicts2After;

  return totalConflictsAfter <= totalConflictsBefore;
}

/**
 * Rééquilibre les poules pour assurer un nombre égal (ou presque égal) de tireurs
 * Déplace des tireurs des poules surchargées vers les poules sous-chargées
 */
function rebalancePools(
  pools: Fencer[][],
  separation: { byClub: boolean; byLeague: boolean; byNation: boolean }
): void {
  const poolCount = pools.length;
  if (poolCount === 0) return;

  // Calculer la taille idéale
  const totalFencers = pools.reduce((sum, pool) => sum + pool.length, 0);
  const idealSize = Math.floor(totalFencers / poolCount);
  const maxSize = idealSize + (totalFencers % poolCount > 0 ? 1 : 0);

  let rebalanced = true;
  let iterations = 0;
  const maxIterations = 100;

  while (rebalanced && iterations < maxIterations) {
    rebalanced = false;
    iterations++;

    // Trouver les poules sources (> idealSize) et sous-chargées (< idealSize)
    // On utilise idealSize comme seuil source (pas maxSize) pour corriger les cas où
    // toutes les poules sont à maxSize mais certaines restent sous idealSize
    const overloaded = pools
      .map((pool, idx) => ({ idx, pool, size: pool.length }))
      .filter(p => p.size > idealSize)
      .sort((a, b) => b.size - a.size);

    const underloaded = pools
      .map((pool, idx) => ({ idx, pool, size: pool.length }))
      .filter(p => p.size < idealSize)
      .sort((a, b) => a.size - b.size);

    if (overloaded.length === 0 || underloaded.length === 0) break;

    // Déplacer des tireurs des poules surchargées vers les sous-chargées
    for (const source of overloaded) {
      for (const target of underloaded) {
        if (source.size <= idealSize || target.size >= idealSize) continue;

        // Chercher un tireur à déplacer qui ne crée pas de conflit
        for (let i = source.pool.length - 1; i >= 0; i--) {
          const fencer = source.pool[i];

          // Vérifier que le déplacement ne crée pas de conflit de club
          const wouldCreateConflict =
            separation.byClub && target.pool.some(f => f.club === fencer.club);

          if (!wouldCreateConflict) {
            // Déplacer le tireur
            source.pool.splice(i, 1);
            target.pool.push(fencer);
            source.size--;
            target.size++;
            rebalanced = true;
            break;
          }
        }
      }
    }
  }
}

// ============================================================================
// Pool Validation
// ============================================================================

/**
 * Vérifie si une poule est complète et valide
 */
export function validatePool(pool: Pool): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Vérifier que tous les matchs sont terminés
  const incompleteMatches = pool.matches.filter(
    m => m.status !== MatchStatus.FINISHED && m.status !== MatchStatus.CANCELLED
  );
  if (incompleteMatches.length > 0) {
    errors.push(`${incompleteMatches.length} match(s) non terminé(s)`);
  }

  // Vérifier la cohérence des scores
  for (const match of pool.matches) {
    if (match.status !== MatchStatus.FINISHED) continue;

    if (!match.scoreA || !match.scoreB) {
      errors.push(`Match ${match.number}: scores manquants`);
      continue;
    }

    // Vérifier qu'il y a un gagnant et un perdant
    const aWins = match.scoreA.isVictory;
    const bWins = match.scoreB.isVictory;

    if (aWins === bWins && !match.scoreA.isAbstention && !match.scoreB.isAbstention) {
      errors.push(`Match ${match.number}: pas de vainqueur clair`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calcule le nombre optimal de poules selon le nombre de tireurs
 */
export function calculateOptimalPoolCount(
  fencerCount: number,
  minPoolSize: number = 5,
  maxPoolSize: number = 8
): number {
  // Objectif: avoir des poules de taille similaire entre min et max
  for (
    let poolCount = Math.ceil(fencerCount / maxPoolSize);
    poolCount <= Math.ceil(fencerCount / minPoolSize);
    poolCount++
  ) {
    const avgSize = fencerCount / poolCount;
    if (avgSize >= minPoolSize && avgSize <= maxPoolSize) {
      return poolCount;
    }
  }

  // Fallback
  return Math.ceil(fencerCount / 6);
}

/**
 * Calcule le nombre de matchs dans une poule
 */
export function calculatePoolMatchCount(fencerCount: number): number {
  return (fencerCount * (fencerCount - 1)) / 2;
}

/**
 * Formate le ratio V/M pour l'affichage
 */
export function formatRatio(ratio: number): string {
  return ratio.toFixed(3);
}

/**
 * Formate l'indice pour l'affichage
 */
export function formatIndex(index: number): string {
  return index >= 0 ? `+${index}` : `${index}`;
}

// ============================================================================
// Quest Points System (Sabre Laser only)
// ============================================================================

/**
 * Calcule les points Quest pour une victoire selon l'écart de score
 * @param winnerScore Score du vainqueur
 * @param loserScore Score du perdant
 * @returns Nombre de points Quest (1 à 4)
 */
export function calculateQuestPoints(winnerScore: number, loserScore: number): number {
  const diff = winnerScore - loserScore;

  if (diff >= 12) return 4; // Écart très important (≥12 points)
  if (diff >= 8) return 3; // Écart important (8-11 points)
  if (diff >= 4) return 2; // Écart moyen (4-7 points)
  return 1; // Écart faible (≤3 points)
}

/**
 * Calcule les statistiques Quest d'un tireur
 * Règle forfait : Si l'adversaire est en forfait/abandon, le match ne compte pas
 */
export function calculateFencerQuestStats(
  fencer: Fencer,
  matches: Match[]
): { questPoints: number; v4: number; v3: number; v2: number; v1: number } {
  let questPoints = 0;
  let v4 = 0,
    v3 = 0,
    v2 = 0,
    v1 = 0;

  for (const match of matches) {
    const isA = match.fencerA?.id === fencer.id;
    const isB = match.fencerB?.id === fencer.id;

    if (!isA && !isB) continue;
    if (match.status !== MatchStatus.FINISHED) continue;

    const myScore = isA ? match.scoreA : match.scoreB;
    const oppScore = isA ? match.scoreB : match.scoreA;
    const opponent = isA ? match.fencerB : match.fencerA;

    if (!myScore || !oppScore) continue;

    // Si l'adversaire est en forfait/abandon/exclusion, le match ne compte pas
    if (
      opponent?.status === FencerStatus.FORFAIT ||
      opponent?.status === FencerStatus.ABANDONED ||
      opponent?.status === FencerStatus.EXCLUDED
    ) {
      continue;
    }

    // Vérifier si victoire
    const isVictory =
      myScore.isVictory || oppScore.isAbstention || oppScore.isExclusion || oppScore.isForfait;

    if (isVictory && myScore.value !== null && oppScore.value !== null) {
      const points = calculateQuestPoints(myScore.value, oppScore.value);
      questPoints += points;

      switch (points) {
        case 4:
          v4++;
          break;
        case 3:
          v3++;
          break;
        case 2:
          v2++;
          break;
        case 1:
          v1++;
          break;
      }
    }
  }

  return { questPoints, v4, v3, v2, v1 };
}

/**
 * Calcule le classement d'une poule selon les règles Quest (Sabre Laser)
 * Ordre de priorité:
 * 1. Points Quest (total)
 * 2. Touches données (TD)
 * 3. Nombre de victoires
 * 4. Nombre de victoires à 4 points, puis 3, puis 2, puis 1
 */
export function calculatePoolRankingQuest(pool: Pool): PoolRanking[] {
  const rankings: PoolRanking[] = [];
  const forfeitFencers: PoolRanking[] = [];

  for (const fencer of pool.fencers) {
    // Si tireur forfait/abandon/exclu, l'ajouter à la liste séparée
    if (
      fencer.status === FencerStatus.EXCLUDED ||
      fencer.status === FencerStatus.FORFAIT ||
      fencer.status === FencerStatus.ABANDONED
    ) {
      forfeitFencers.push({
        fencer,
        rank: 0,
        victories: 0,
        defeats: 0,
        touchesScored: 0,
        touchesReceived: 0,
        index: 0,
        ratio: 0,
        questPoints: 0,
        questVictories4: 0,
        questVictories3: 0,
        questVictories2: 0,
        questVictories1: 0,
      });
      continue;
    }

    const stats = calculateFencerPoolStats(fencer, pool.matches);
    const questStats = calculateFencerQuestStats(fencer, pool.matches);

    rankings.push({
      fencer,
      rank: 0,
      victories: stats.victories,
      defeats: stats.defeats,
      touchesScored: stats.touchesScored,
      touchesReceived: stats.touchesReceived,
      index: stats.index,
      ratio: stats.victoryRatio,
      questPoints: questStats.questPoints,
      questVictories4: questStats.v4,
      questVictories3: questStats.v3,
      questVictories2: questStats.v2,
      questVictories1: questStats.v1,
    });
  }

  // Trier selon les critères demandés (même ordre que calculatePoolRanking)
  rankings.sort((a, b) => {
    // 1. Nombre de victoires (décroissant)
    if (a.victories !== b.victories) {
      return b.victories - a.victories;
    }

    // 2. Points Quest (décroissant)
    const aQuest = a.questPoints ?? 0;
    const bQuest = b.questPoints ?? 0;
    if (aQuest !== bQuest) {
      return bQuest - aQuest;
    }

    // 3. Indice (TD-TR) (décroissant)
    if (a.index !== b.index) {
      return b.index - a.index;
    }

    // 4. Égalité parfaite - classement initial
    return (a.fencer.ranking ?? 9999) - (b.fencer.ranking ?? 9999);
  });

  // Assigner les rangs avec gestion des ex-aequo
  let currentRank = 1;
  for (let i = 0; i < rankings.length; i++) {
    if (i > 0) {
      const prev = rankings[i - 1];
      const curr = rankings[i];

      // Vérifier si vraiment à égalité (même victoires, même points Quest, même indice)
      const sameVictories = prev.victories === curr.victories;
      const sameQuest = (prev.questPoints ?? 0) === (curr.questPoints ?? 0);
      const sameIndex = prev.index === curr.index;

      if (sameVictories && sameQuest && sameIndex) {
        rankings[i].rank = rankings[i - 1].rank;
      } else {
        rankings[i].rank = currentRank;
      }
    } else {
      rankings[i].rank = currentRank;
    }
    currentRank++;
  }

  // Ajouter les tireurs forfait à la fin avec le dernier rang
  if (forfeitFencers.length > 0) {
    const lastRank = rankings.length > 0 ? rankings[rankings.length - 1].rank + 1 : 1;
    forfeitFencers.forEach((ff, idx) => {
      ff.rank = lastRank + idx;
      rankings.push(ff);
    });
  }

  return rankings;
}

/**
 * Calcule le classement général Quest à partir de toutes les poules
 * Ordre de priorité:
 * 1. Nombre de victoires (décroissant)
 * 2. Points Quest (décroissant)
 * 3. Indice (TD-TR) (décroissant)
 */
export function calculateOverallRankingQuest(pools: Pool[]): PoolRanking[] {
  const allRankings: PoolRanking[] = [];

  pools.forEach(pool => {
    const ranking = calculatePoolRankingQuest(pool);
    allRankings.push(...ranking);
  });

  // Trier selon les critères demandés (même ordre que calculateOverallRanking)
  allRankings.sort((a, b) => {
    // 1. Nombre de victoires (décroissant)
    if (a.victories !== b.victories) {
      return b.victories - a.victories;
    }
    // 2. Points Quest (décroissant)
    const aQuest = a.questPoints ?? 0;
    const bQuest = b.questPoints ?? 0;
    if (aQuest !== bQuest) {
      return bQuest - aQuest;
    }
    // 3. Indice (TD-TR) (décroissant)
    if (a.index !== b.index) {
      return b.index - a.index;
    }
    // 4. Égalité parfaite - garder l'ordre
    return 0;
  });

  // Assigner les rangs avec gestion des ex-aequo
  let currentRank = 1;
  for (let i = 0; i < allRankings.length; i++) {
    if (i > 0) {
      const prev = allRankings[i - 1];
      const curr = allRankings[i];

      // Vérifier si vraiment à égalité (même victoires, même points Quest, même indice)
      const sameVictories = prev.victories === curr.victories;
      const sameQuest = (prev.questPoints ?? 0) === (curr.questPoints ?? 0);
      const sameIndex = prev.index === curr.index;

      if (sameVictories && sameQuest && sameIndex) {
        // Même rang (ex aequo)
        allRankings[i].rank = allRankings[i - 1].rank;
      } else {
        allRankings[i].rank = currentRank;
      }
    } else {
      allRankings[i].rank = currentRank;
    }
    currentRank++;
  }

  return allRankings;
}

/**
 * Calcule le classement général à partir de toutes les poules
 * Combine les classements de chaque poule selon les règles FIE
 */
export function calculateOverallRanking(pools: Pool[]): PoolRanking[] {
  // Collecter tous les classements de poules
  const allRankings: PoolRanking[] = [];

  pools.forEach(pool => {
    if (pool.ranking && pool.ranking.length > 0) {
      allRankings.push(...pool.ranking);
    } else {
      // Calculer le classement si pas déjà fait
      const ranking = calculatePoolRanking(pool);
      allRankings.push(...ranking);
    }
  });

  // Trier selon les critères demandés:
  // 1. Nombre de victoires (décroissant)
  // 2. Points Quest (décroissant)
  // 3. Indice (TD-TR) (décroissant)
  allRankings.sort((a, b) => {
    // 1. Nombre de victoires
    if (a.victories !== b.victories) {
      return b.victories - a.victories;
    }
    // 2. Points Quest
    const aQuest = a.questPoints ?? 0;
    const bQuest = b.questPoints ?? 0;
    if (aQuest !== bQuest) {
      return bQuest - aQuest;
    }
    // 3. Indice (TD-TR)
    if (a.index !== b.index) {
      return b.index - a.index;
    }
    // 4. Égalité parfaite - garder l'ordre
    return 0;
  });

  // Assigner les rangs avec gestion des ex-aequo
  let currentRank = 1;
  for (let i = 0; i < allRankings.length; i++) {
    if (i > 0) {
      const prev = allRankings[i - 1];
      const curr = allRankings[i];

      // Vérifier si vraiment à égalité (même victoires, même points Quest, même indice)
      const sameVictories = prev.victories === curr.victories;
      const sameQuest = (prev.questPoints ?? 0) === (curr.questPoints ?? 0);
      const sameIndex = prev.index === curr.index;

      if (sameVictories && sameQuest && sameIndex) {
        // Même rang (ex aequo)
        allRankings[i].rank = allRankings[i - 1].rank;
      } else {
        allRankings[i].rank = currentRank;
      }
    } else {
      allRankings[i].rank = currentRank;
    }
    currentRank++;
  }

  return allRankings;
}
