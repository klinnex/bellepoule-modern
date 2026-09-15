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
  if (!Number.isInteger(fencerCount) || fencerCount < 2) {
    throw new RangeError(
      `generatePoolMatchOrder: fencerCount doit être un entier ≥ 2 (reçu: ${fencerCount})`
    );
  }
  const orders: { [key: number]: [number, number][] } = {
    3: [
      [2, 3],
      [1, 3],
      [1, 2],
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
      [4, 3],
      [6, 5],
      [3, 1],
      [2, 6],
      [5, 4],
      [1, 6],
      [3, 5],
      [4, 2],
      [5, 1],
      [6, 4],
      [2, 3],
      [1, 4],
      [5, 2],
      [3, 6],
    ],
    7: [
      [1, 4],
      [2, 5],
      [3, 6],
      [7, 1],
      [5, 4],
      [2, 3],
      [6, 7],
      [5, 1],
      [4, 3],
      [6, 2],
      [5, 7],
      [3, 1],
      [4, 6],
      [7, 2],
      [3, 5],
      [1, 6],
      [2, 4],
      [7, 3],
      [6, 5],
      [1, 2],
      [4, 7],
    ],
    8: [
      [2, 3],
      [1, 5],
      [7, 4],
      [6, 8],
      [1, 2],
      [3, 4],
      [5, 6],
      [8, 7],
      [4, 1],
      [5, 2],
      [8, 3],
      [6, 7],
      [4, 2],
      [8, 1],
      [7, 5],
      [3, 6],
      [2, 8],
      [5, 4],
      [6, 1],
      [3, 7],
      [4, 8],
      [2, 6],
      [3, 5],
      [1, 7],
      [4, 6],
      [8, 5],
      [7, 2],
      [1, 3],
    ],
  };

  return orders[fencerCount] || generateGenericMatchOrder(fencerCount);
}

/**
 * Génère un ordre de matchs selon l'algorithme de Berger (méthode du cercle FIE)
 * Garantit qu'aucun tireur ne dispute deux matchs consécutifs.
 * Pour n pair : n-1 rondes de n/2 matchs.
 * Pour n impair : ajoute un fantôme n+1, applique Berger(n+1), supprime les matchs impliquant le fantôme.
 */
function generateGenericMatchOrder(fencerCount: number): [number, number][] {
  const n = fencerCount;
  const matches: [number, number][] = [];
  const size = n % 2 === 0 ? n : n + 1;
  const ghost = n % 2 === 0 ? -1 : size; // fantôme = n+1 si impair
  const fixed = size;
  const circle = Array.from({ length: size - 1 }, (_, i) => i + 1);

  for (let round = 0; round < size - 1; round++) {
    if (fixed !== ghost && circle[0] !== ghost) {
      matches.push([fixed, circle[0]]);
    }
    for (let i = 1; i < size / 2; i++) {
      const a = circle[i];
      const b = circle[size - 1 - i];
      if (a !== ghost && b !== ghost) {
        matches.push([a, b]);
      }
    }
    circle.unshift(circle.pop()!);
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
  if (!fencer)
    throw new TypeError('calculateFencerPoolStats: fencer ne peut pas être null/undefined');
  if (!Array.isArray(matches))
    throw new TypeError('calculateFencerPoolStats: matches doit être un tableau');
  let victories = 0;
  let defeats = 0;
  let touchesScored = 0;
  let touchesReceived = 0;
  let matchesPlayed = 0;
  let maxSingleMatchScore = 0;

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
    maxSingleMatchScore = Math.max(maxSingleMatchScore, myScore.value ?? 0);

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
    maxSingleMatchScore,
  };
}

// ============================================================================
// Ranking Helpers (shared between standard and Quest ranking)
// ============================================================================

/** Assigne les rangs en gérant les ex aequo (victoires + questPoints + indice identiques) */
function assignRanks(rankings: PoolRanking[]): void {
  let currentRank = 1;
  for (let i = 0; i < rankings.length; i++) {
    if (i > 0) {
      const prev = rankings[i - 1];
      const curr = rankings[i];
      const sameVictories = prev.ratio === curr.ratio;
      const sameQuest = (prev.questPoints ?? 0) === (curr.questPoints ?? 0);
      const sameCards = (prev.totalCards ?? 0) === (curr.totalCards ?? 0);
      const sameSingleMatch = (prev.maxSingleMatchScore ?? 0) === (curr.maxSingleMatchScore ?? 0);

      if (sameVictories && sameQuest && sameCards && sameSingleMatch) {
        rankings[i].rank = rankings[i - 1].rank;
      } else {
        rankings[i].rank = currentRank;
      }
    } else {
      rankings[i].rank = currentRank;
    }
    currentRank++;
  }
}

/** Ajoute les tireurs forfait/abandon/exclu à la fin du classement */
function appendForfeitFencers(rankings: PoolRanking[], forfeitFencers: PoolRanking[]): void {
  if (forfeitFencers.length > 0) {
    const lastRank = rankings.length > 0 ? rankings[rankings.length - 1].rank + 1 : 1;
    forfeitFencers.forEach((ff, idx) => {
      ff.rank = lastRank + idx;
      rankings.push(ff);
    });
  }
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
  if (!pool) throw new TypeError('calculatePoolRanking: pool ne peut pas être null/undefined');
  if (!Array.isArray(pool.fencers))
    throw new TypeError('calculatePoolRanking: pool.fencers doit être un tableau');
  if (!Array.isArray(pool.matches))
    throw new TypeError('calculatePoolRanking: pool.matches doit être un tableau');
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
        matchesPlayed: 0,
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
      matchesPlayed: stats.matchesPlayed,
      touchesScored: stats.touchesScored,
      touchesReceived: stats.touchesReceived,
      index: stats.index,
      ratio: stats.victoryRatio,
      questPoints: questStats.questPoints,
      maxSingleMatchScore: stats.maxSingleMatchScore ?? 0,
    });
  }

  // Pré-construire une Map de matchs directs pour éviter O(n) dans le comparateur
  // Clé: `${idA}:${idB}` (les deux ordres sont stockés)
  const directMatchMap = new Map<string, Match>();
  for (const m of pool.matches) {
    if (m.fencerA && m.fencerB && m.status === MatchStatus.FINISHED) {
      directMatchMap.set(`${m.fencerA.id}:${m.fencerB.id}`, m);
      directMatchMap.set(`${m.fencerB.id}:${m.fencerA.id}`, m);
    }
  }

  // Trier selon les critères demandés
  rankings.sort((a, b) => {
    // 1. Ratio de victoires V/M (décroissant)
    if (a.ratio !== b.ratio) {
      return b.ratio - a.ratio;
    }

    // 2. Points Quest (décroissant)
    const aQuest = a.questPoints ?? 0;
    const bQuest = b.questPoints ?? 0;
    if (aQuest !== bQuest) {
      return bQuest - aQuest;
    }

    // 3. Indice TD-TR (décroissant) — critère officiel FIE/FFE de départage
    if (a.index !== b.index) {
      return b.index - a.index;
    }

    // 4. Confrontation directe — O(1) grâce à la Map
    const directMatch = directMatchMap.get(`${a.fencer.id}:${b.fencer.id}`);
    if (directMatch) {
      const aIsFirst = directMatch.fencerA?.id === a.fencer.id;
      const aScore = aIsFirst ? directMatch.scoreA : directMatch.scoreB;
      return aScore?.isVictory ? -1 : 1;
    }

    // En cas d'égalité parfaite, trier par classement initial
    return (a.fencer.ranking ?? 9999) - (b.fencer.ranking ?? 9999);
  });

  assignRanks(rankings);
  appendForfeitFencers(rankings, forfeitFencers);

  return rankings;
}

// ============================================================================
// Pool Distribution Algorithm
// ============================================================================

/**
 * Distribue les tireurs dans les poules selon la méthode serpentine FIE
 * en respectant les critères de séparation (club, région, nation)
 *
 * Algorithme (FIE §2 et §3) :
 * 1. Serpentine intégrée avec descente dans le classement si conflit (FIE §2)
 * 2. Rééquilibrage des tailles de poules
 * 3. Tirage au sort des positions dans la poule (FIE §3)
 */
export type SeparationCriterionKey = 'byClub' | 'byRegion' | 'byNation';

export function distributeFencersToPoolsSerpentine(
  fencers: Fencer[],
  poolCount: number,
  separation: SeparationCriterionKey[]
): Fencer[][] {
  if (!Array.isArray(fencers))
    throw new TypeError('distributeFencersToPoolsSerpentine: fencers doit être un tableau');
  if (!Number.isInteger(poolCount) || poolCount < 1) {
    throw new RangeError(
      `distributeFencersToPoolsSerpentine: poolCount doit être un entier ≥ 1 (reçu: ${poolCount})`
    );
  }
  if (fencers.length < poolCount) {
    throw new RangeError(
      `distributeFencersToPoolsSerpentine: pas assez de tireurs (${fencers.length}) pour ${poolCount} poules`
    );
  }
  const pools: Fencer[][] = Array.from({ length: poolCount }, () => []);
  const indexes = createPoolIndexes(pools);

  // Trier les tireurs par classement (meilleur classement = premier, non-classés = derniers)
  const pending = [...fencers].sort((a, b) => (a.ranking ?? 99999) - (b.ranking ?? 99999));

  // Distribution serpentine avec descente dans le classement (FIE §2) :
  // pour chaque slot, prendre le premier tireur sans conflit dans la poule cible.
  // Si impossible (tous en conflit), prendre le suivant naturel (FIE : "rester dans la poule initiale").
  let direction = 1;
  let poolIndex = 0;

  while (pending.length > 0) {
    const pool = pools[poolIndex];

    let chosen = 0;
    if (separation.length > 0) {
      // Relâchement progressif : d'abord tous les critères, puis en retirant le moins
      // prioritaire (dernier) jusqu'à ne garder que le plus prioritaire (premier).
      // Garantit que le critère 1 n'est jamais sacrifié si une solution existe.
      let found = false;
      for (let take = separation.length; take >= 1 && !found; take--) {
        const activeSub = separation.slice(0, take);
        for (let i = 0; i < pending.length; i++) {
          if (!hasConflictWith(pending[i], indexes[poolIndex], activeSub)) {
            chosen = i;
            found = true;
            break;
          }
        }
      }
    }

    const picked = pending.splice(chosen, 1)[0];
    pool.push(picked);
    indexAddFencer(indexes[poolIndex], picked);

    poolIndex += direction;
    if (poolIndex >= poolCount) {
      direction = -1;
      poolIndex = poolCount - 1;
    } else if (poolIndex < 0) {
      direction = 1;
      poolIndex = 0;
    }
  }

  // Rééquilibrer les poules pour assurer un nombre égal (ou presque égal) de tireurs
  rebalancePools(pools, separation, indexes);

  // Tirage au sort des positions dans la poule (FIE §3)
  for (const pool of pools) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }

  return pools;
}

/**
 * Index multiensemble (valeur → occurrences) des clubs/régions/nations d'une poule,
 * pour vérifier les conflits en O(1) au lieu de scanner la poule à chaque test.
 * Les nations conservent les valeurs vides/undefined (égalité brute, cf. rééquilibrage).
 */
interface PoolConflictIndex {
  clubs: Map<string, number>;
  regions: Map<string, number>;
  nations: Map<string | undefined, number>;
}

function indexAdd<K>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function indexRemove<K>(map: Map<K, number>, key: K): void {
  const count = map.get(key);
  if (count === undefined) return;
  if (count > 1) map.set(key, count - 1);
  else map.delete(key);
}

function indexAddFencer(index: PoolConflictIndex, fencer: Fencer): void {
  if (fencer.club) indexAdd(index.clubs, fencer.club);
  if (fencer.region) indexAdd(index.regions, fencer.region);
  indexAdd(index.nations, fencer.nationality);
}

function indexRemoveFencer(index: PoolConflictIndex, fencer: Fencer): void {
  if (fencer.club) indexRemove(index.clubs, fencer.club);
  if (fencer.region) indexRemove(index.regions, fencer.region);
  indexRemove(index.nations, fencer.nationality);
}

function createPoolIndexes(pools: Fencer[][]): PoolConflictIndex[] {
  return pools.map(pool => {
    const index: PoolConflictIndex = { clubs: new Map(), regions: new Map(), nations: new Map() };
    for (const fencer of pool) indexAddFencer(index, fencer);
    return index;
  });
}

/**
 * Vérifie si un tireur crée un conflit (club/région/nation) avec une poule existante.
 */
function hasConflictWith(
  fencer: Fencer,
  index: PoolConflictIndex,
  separation: SeparationCriterionKey[]
): boolean {
  if (separation.length === 0) return false;
  return separation.some(key => {
    switch (key) {
      case 'byClub': return !!fencer.club && index.clubs.has(fencer.club);
      case 'byRegion': return !!fencer.region && index.regions.has(fencer.region);
      case 'byNation': return index.nations.has(fencer.nationality);
    }
  });
}

/**
 * Rééquilibre les poules pour assurer un nombre égal (ou presque égal) de tireurs
 * Déplace des tireurs des poules surchargées vers les poules sous-chargées
 */
function rebalancePools(
  pools: Fencer[][],
  separation: SeparationCriterionKey[],
  indexes: PoolConflictIndex[] = createPoolIndexes(pools)
): void {
  const poolCount = pools.length;
  if (poolCount === 0) return;

  // Calculer la taille idéale
  const totalFencers = pools.reduce((sum, pool) => sum + pool.length, 0);
  const idealSize = Math.floor(totalFencers / poolCount);

  let rebalanced = true;
  let iterations = 0;
  const maxIterations = 100;

  while (rebalanced && iterations < maxIterations) {
    rebalanced = false;
    iterations++;

    // Trouver les poules sources (> idealSize) et sous-chargées (< idealSize)
    // On utilise idealSize comme seuil source (pas maxSize) pour corriger les cas où
    // toutes les poules sont à maxSize mais certaines restent sous idealSize
    const overloaded: { idx: number; pool: Fencer[]; size: number }[] = [];
    const underloaded: { idx: number; pool: Fencer[]; size: number }[] = [];
    pools.forEach((pool, idx) => {
      const size = pool.length;
      if (size > idealSize) overloaded.push({ idx, pool, size });
      else if (size < idealSize) underloaded.push({ idx, pool, size });
    });
    overloaded.sort((a, b) => b.size - a.size);
    underloaded.sort((a, b) => a.size - b.size);

    if (overloaded.length === 0 || underloaded.length === 0) break;

    // Déplacer des tireurs des poules surchargées vers les sous-chargées
    for (const source of overloaded) {
      for (const target of underloaded) {
        if (source.size <= idealSize || target.size >= idealSize) continue;
        const targetIndex = indexes[target.idx];

        // Chercher un tireur à déplacer qui ne crée pas de conflit
        for (let i = source.pool.length - 1; i >= 0; i--) {
          const fencer = source.pool[i];

          // Vérifier que le déplacement ne crée pas de conflit sur les critères actifs
          // (nation : égalité brute, y compris valeurs vides — comportement historique)
          const wouldCreateConflict = hasConflictWith(fencer, targetIndex, separation);

          if (!wouldCreateConflict) {
            // Déplacer le tireur
            source.pool.splice(i, 1);
            target.pool.push(fencer);
            indexRemoveFencer(indexes[source.idx], fencer);
            indexAddFencer(targetIndex, fencer);
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
  const incompleteMatches = (pool.matches ?? []).filter(
    m => m.status !== MatchStatus.FINISHED && m.status !== MatchStatus.CANCELLED
  );
  if (incompleteMatches.length > 0) {
    errors.push(`${incompleteMatches.length} match(s) non terminé(s)`);
  }

  // Vérifier la cohérence des scores
  for (const match of pool.matches ?? []) {
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
  if (!Number.isFinite(fencerCount) || fencerCount < 1) {
    throw new RangeError(
      `calculateOptimalPoolCount: fencerCount doit être ≥ 1 (reçu: ${fencerCount})`
    );
  }
  if (minPoolSize < 2)
    throw new RangeError(
      `calculateOptimalPoolCount: minPoolSize doit être ≥ 2 (reçu: ${minPoolSize})`
    );
  if (maxPoolSize < minPoolSize)
    throw new RangeError(
      `calculateOptimalPoolCount: maxPoolSize (${maxPoolSize}) doit être ≥ minPoolSize (${minPoolSize})`
    );
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
  if (!Number.isInteger(fencerCount) || fencerCount < 0) {
    throw new RangeError(
      `calculatePoolMatchCount: fencerCount doit être un entier ≥ 0 (reçu: ${fencerCount})`
    );
  }
  return (fencerCount * (fencerCount - 1)) / 2;
}

/**
 * Formate le ratio V/M pour l'affichage
 */
export function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return '0.000';
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
export function calculatePoolRankingQuest(
  pool: Pool,
  cardsByFencer: Record<string, number> = {}
): PoolRanking[] {
  const rankings: PoolRanking[] = [];
  const forfeitFencers: PoolRanking[] = [];

  for (const fencer of pool.fencers) {
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
        matchesPlayed: 0,
        touchesScored: 0,
        touchesReceived: 0,
        index: 0,
        ratio: 0,
        questPoints: 0,
        questVictories4: 0,
        questVictories3: 0,
        questVictories2: 0,
        questVictories1: 0,
        totalCards: cardsByFencer[fencer.id] ?? 0,
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
      matchesPlayed: stats.matchesPlayed,
      touchesScored: stats.touchesScored,
      touchesReceived: stats.touchesReceived,
      index: stats.index,
      ratio: stats.victoryRatio,
      questPoints: questStats.questPoints,
      questVictories4: questStats.v4,
      questVictories3: questStats.v3,
      questVictories2: questStats.v2,
      questVictories1: questStats.v1,
      totalCards: cardsByFencer[fencer.id] ?? 0,
    });
  }

  // Critères de classement Quest :
  // 1. Ratio V/M décroissant
  // 2. Points Quest décroissants
  // 3. Moins de cartons (croissant)
  // 4. Indice (TD-TR) décroissant
  // 5. Classement initial
  rankings.sort((a, b) => {
    if (a.ratio !== b.ratio) return b.ratio - a.ratio;

    const aQuest = a.questPoints ?? 0;
    const bQuest = b.questPoints ?? 0;
    if (aQuest !== bQuest) return bQuest - aQuest;

    const aCards = a.totalCards ?? 0;
    const bCards = b.totalCards ?? 0;
    if (aCards !== bCards) return aCards - bCards;

    if (a.index !== b.index) return b.index - a.index;

    return (a.fencer.ranking ?? 9999) - (b.fencer.ranking ?? 9999);
  });

  assignRanks(rankings);
  appendForfeitFencers(rankings, forfeitFencers);

  return rankings;
}

/**
 * Calcule le classement général Quest à partir de toutes les poules
 * Ordre de priorité:
 * 1. Ratio V/M (décroissant)
 * 2. Points Quest (décroissant)
 * 3. V4 décroissant, puis V3, V2, V1
 */
export function calculateOverallRankingQuest(pools: Pool[]): PoolRanking[] {
  const allRankings: PoolRanking[] = [];

  pools.forEach(pool => {
    const ranking = calculatePoolRankingQuest(pool);
    allRankings.push(...ranking);
  });

  // Fusionner les stats du même tireur (multi-tours de poules)
  const mergedRankings = mergeFencerRankings(allRankings);

  mergedRankings.sort((a, b) => {
    // 1. Ratio de victoires V/M (décroissant)
    if (a.ratio !== b.ratio) {
      return b.ratio - a.ratio;
    }
    // 2. Points Quest (décroissant)
    const aQuest = a.questPoints ?? 0;
    const bQuest = b.questPoints ?? 0;
    if (aQuest !== bQuest) {
      return bQuest - aQuest;
    }
    // 3. V4 décroissant, puis V3, V2, V1
    const aV4 = a.questVictories4 ?? 0;
    const bV4 = b.questVictories4 ?? 0;
    if (aV4 !== bV4) return bV4 - aV4;
    const aV3 = a.questVictories3 ?? 0;
    const bV3 = b.questVictories3 ?? 0;
    if (aV3 !== bV3) return bV3 - aV3;
    const aV2 = a.questVictories2 ?? 0;
    const bV2 = b.questVictories2 ?? 0;
    if (aV2 !== bV2) return bV2 - aV2;
    const aV1 = a.questVictories1 ?? 0;
    const bV1 = b.questVictories1 ?? 0;
    if (aV1 !== bV1) return bV1 - aV1;
    // 4. Égalité parfaite - garder l'ordre
    return 0;
  });

  assignRanks(mergedRankings);

  return mergedRankings;
}

/**
 * Fusionne les entrées de classement du même tireur (multi-tours de poules).
 * Additionne victoires, défaites, touches, et recalcule ratio et indice.
 */
function mergeFencerRankings(rankings: PoolRanking[]): PoolRanking[] {
  const byFencer = new Map<string, PoolRanking>();
  for (const r of rankings) {
    const existing = byFencer.get(r.fencer.id);
    if (!existing) {
      byFencer.set(r.fencer.id, { ...r });
    } else {
      existing.victories += r.victories;
      existing.defeats += r.defeats;
      existing.matchesPlayed += r.matchesPlayed;
      existing.touchesScored += r.touchesScored;
      existing.touchesReceived += r.touchesReceived;
      existing.index = existing.touchesScored - existing.touchesReceived;
      existing.ratio =
        existing.matchesPlayed > 0 ? existing.victories / existing.matchesPlayed : 0;
      existing.maxSingleMatchScore = Math.max(
        existing.maxSingleMatchScore ?? 0,
        r.maxSingleMatchScore ?? 0
      );
      existing.questPoints = (existing.questPoints ?? 0) + (r.questPoints ?? 0);
      existing.questVictories4 = (existing.questVictories4 ?? 0) + (r.questVictories4 ?? 0);
      existing.questVictories3 = (existing.questVictories3 ?? 0) + (r.questVictories3 ?? 0);
      existing.questVictories2 = (existing.questVictories2 ?? 0) + (r.questVictories2 ?? 0);
      existing.questVictories1 = (existing.questVictories1 ?? 0) + (r.questVictories1 ?? 0);
    }
  }
  return Array.from(byFencer.values());
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

  // Fusionner les stats du même tireur (multi-tours de poules)
  const mergedRankings = mergeFencerRankings(allRankings);

  mergedRankings.sort((a, b) => {
    // 1. Ratio de victoires V/M
    if (a.ratio !== b.ratio) {
      return b.ratio - a.ratio;
    }
    // 2. Points Quest
    const aQuest = a.questPoints ?? 0;
    const bQuest = b.questPoints ?? 0;
    if (aQuest !== bQuest) {
      return bQuest - aQuest;
    }
    // 3. Meilleur score en un match
    const aMax = a.maxSingleMatchScore ?? 0;
    const bMax = b.maxSingleMatchScore ?? 0;
    if (aMax !== bMax) {
      return bMax - aMax;
    }
    // 4. Égalité parfaite - garder l'ordre
    return 0;
  });

  assignRanks(mergedRankings);

  return mergedRankings;
}

// Génère un classement initial depuis la liste des tireurs (sans données de poules)
export function generateInitialRanking(fencers: Fencer[]): PoolRanking[] {
  return fencers.map((fencer, index) => ({
    fencer,
    rank: index + 1,
    victories: 0,
    defeats: 0,
    matchesPlayed: 0,
    touchesScored: 0,
    touchesReceived: 0,
    index: 0,
    ratio: 0,
    questPoints: 0,
  }));
}

// ============================================================================
// Mode vainqueurs de poule
// ============================================================================

/** Renvoie les IDs des tireurs classés 1er dans leur poule respective */
export function getPoolWinnerIds(pools: Pool[]): Set<string> {
  const ids = new Set<string>();
  for (const pool of pools) {
    const ranking = pool.ranking?.length ? pool.ranking : calculatePoolRanking(pool);
    ranking.filter(r => r.rank === 1).forEach(r => ids.add(r.fencer.id));
  }
  return ids;
}

/** Filtre le classement général pour ne garder que les vainqueurs de poule */
export function filterPoolWinners(pools: Pool[], overallRanking: PoolRanking[]): PoolRanking[] {
  const winnerIds = getPoolWinnerIds(pools);
  return overallRanking
    .filter(r => winnerIds.has(r.fencer.id))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

// ============================================================================
// Mode compétition couplée (séparation par genre)
// ============================================================================

/** Répartit le classement général en sous-classements par genre */
export function splitRankingByGender(overallRanking: PoolRanking[]): Map<string, PoolRanking[]> {
  const groups = new Map<string, PoolRanking[]>();
  for (const r of overallRanking) {
    const key = r.fencer.gender as string;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  for (const [key, rankings] of groups) {
    groups.set(key, rankings.map((r, i) => ({ ...r, rank: i + 1 })));
  }
  return groups;
}
