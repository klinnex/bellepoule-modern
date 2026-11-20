/**
 * BellePoule Modern - Optimized Pool Hooks
 * Memoized calculations for pool performance
 * Licensed under GPL-3.0
 */

import { useMemo, useCallback, useState } from 'react';
import { Pool, Fencer, Match, MatchStatus, Weapon, PoolRanking } from '../../shared/types';
import { calculatePoolRanking } from '../../shared/utils/poolCalculations';

// ============================================================================
// Pool Calculation Hooks
// ============================================================================

export const usePoolCalculations = (pool: Pool, weapon?: Weapon) => {
  const isLaserSabre = weapon === Weapon.LASER;

  // Memoized fencer calculations
  const fencerStats = useMemo(() => {
    const stats = new Map<
      string,
      {
        victories: number;
        defeats: number;
        touchesScored: number;
        touchesReceived: number;
        matchesPlayed: number;
      }
    >();

    // Initialize all fencers with zero stats
    pool.fencers.forEach(fencer => {
      stats.set(fencer.id, {
        victories: 0,
        defeats: 0,
        touchesScored: 0,
        touchesReceived: 0,
        matchesPlayed: 0,
      });
    });

    // Calculate stats from matches
    pool.matches.forEach(match => {
      if (match.status !== MatchStatus.FINISHED || !match.fencerA || !match.fencerB) {
        return;
      }

      const fencerAId = match.fencerA.id;
      const fencerBId = match.fencerB.id;

      const statA = stats.get(fencerAId);
      const statB = stats.get(fencerBId);

      if (!statA || !statB) return;

      const scoreA = match.scoreA?.value ?? 0;
      const scoreB = match.scoreB?.value ?? 0;

      // Update stats
      statA.matchesPlayed++;
      statB.matchesPlayed++;

      statA.touchesScored += scoreA;
      statA.touchesReceived += scoreB;

      statB.touchesScored += scoreB;
      statB.touchesReceived += scoreA;

      // Determine winner (considering victory overrides for laser sabre)
      const winnerA = match.scoreA?.isVictory || (scoreA > scoreB && !isLaserSabre);
      const winnerB = match.scoreB?.isVictory || (scoreB > scoreA && !isLaserSabre);

      if (winnerA) {
        statA.victories++;
        statB.defeats++;
      } else if (winnerB) {
        statB.victories++;
        statA.defeats++;
      }
    });

    return stats;
  }, [pool.fencers, pool.matches, isLaserSabre]);

  // Memoized pool ranking
  const poolRanking = useMemo(() => {
    return calculatePoolRanking(pool);
  }, [pool.fencers, fencerStats, isLaserSabre]);

  // Memoized match categories
  const matchCategories = useMemo(() => {
    const pending = pool.matches
      .map((m, idx) => ({ match: m, index: idx }))
      .filter(({ match }) => match.status !== MatchStatus.FINISHED);

    const finished = pool.matches
      .map((m, idx) => ({ match: m, index: idx }))
      .filter(({ match }) => match.status === MatchStatus.FINISHED);

    return { pending, finished };
  }, [pool.matches]);

  return {
    fencerStats,
    poolRanking,
    matchCategories,
    isLaserSabre,
  };
};

// ============================================================================
// Match Ordering Hook
// ============================================================================

export const useOrderedMatches = (pool: Pool) => {
  const orderedMatches = useMemo(() => {
    // Partitionner en une seule passe
    const pending: { match: Match; index: number }[] = [];
    const finished: { match: Match; index: number }[] = [];
    pool.matches.forEach((match, idx) => {
      if (match.status === MatchStatus.FINISHED) {
        finished.push({ match, index: idx });
      } else {
        pending.push({ match, index: idx });
      }
    });

    if (pending.length === 0) return { pending: [], finished };

    // Map O(1) pour les refs de tireurs — évite find() dans la boucle interne
    const fencerRef = new Map<string, number>();
    pool.fencers.forEach(f => fencerRef.set(f.id, f.ref));

    // Algorithme d'ordonnancement : éviter qu'un tireur enchaîne deux matchs
    const ordered: typeof pending = [];
    // Tableau booléen pour marquer les éléments consommés (évite indexOf + splice O(n))
    const consumed = new Array<boolean>(pending.length).fill(false);
    let remaining = pending.length;
    const lastFencerIds: Set<string> = new Set();

    while (remaining > 0) {
      let bestIdx = -1;
      let bestScore = -1;

      for (let i = 0; i < pending.length; i++) {
        if (consumed[i]) continue;
        const { match } = pending[i];
        const fencerAId = match.fencerA?.id;
        const fencerBId = match.fencerB?.id;

        let score = 0;
        if (fencerAId && !lastFencerIds.has(fencerAId)) score += 2;
        if (fencerBId && !lastFencerIds.has(fencerBId)) score += 2;
        if (fencerAId) score += (fencerRef.get(fencerAId) ?? 0) * 0.1;
        if (fencerBId) score += (fencerRef.get(fencerBId) ?? 0) * 0.1;

        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) break; // sécurité

      const best = pending[bestIdx];
      ordered.push(best);
      consumed[bestIdx] = true;
      remaining--;

      lastFencerIds.clear();
      if (best.match.fencerA) lastFencerIds.add(best.match.fencerA.id);
      if (best.match.fencerB) lastFencerIds.add(best.match.fencerB.id);
    }

    return { pending: ordered, finished };
  }, [pool.matches, pool.fencers]);

  return orderedMatches;
};

// ============================================================================
// Score Editing Hook
// ============================================================================

export const useScoreEditing = () => {
  const [editingMatch, setEditingMatch] = useState<number | null>(null);
  const [editScoreA, setEditScoreA] = useState('');
  const [editScoreB, setEditScoreB] = useState('');
  const [victoryA, setVictoryA] = useState(false);
  const [victoryB, setVictoryB] = useState(false);

  const startEditing = useCallback((match: Match) => {
    setEditingMatch(match.number);
    setEditScoreA(match.scoreA?.value?.toString() ?? '');
    setEditScoreB(match.scoreB?.value?.toString() ?? '');
    setVictoryA(match.scoreA?.isVictory ?? false);
    setVictoryB(match.scoreB?.isVictory ?? false);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingMatch(null);
    setEditScoreA('');
    setEditScoreB('');
    setVictoryA(false);
    setVictoryB(false);
  }, []);

  const clearEditing = useCallback(() => {
    setEditingMatch(null);
  }, []);

  return {
    editingMatch,
    editScoreA,
    editScoreB,
    victoryA,
    victoryB,
    setEditScoreA,
    setEditScoreB,
    setVictoryA,
    setVictoryB,
    startEditing,
    cancelEditing,
    clearEditing,
  };
};

// ============================================================================
// Fencer Display Hook
// ============================================================================

export const useFencerDisplay = (fencers: Fencer[]) => {
  const fencerById = useMemo(() => {
    const map = new Map<string, Fencer>();
    fencers.forEach(fencer => map.set(fencer.id, fencer));
    return map;
  }, [fencers]);

  const getFencerDisplay = useCallback((fencer: Fencer | null) => {
    if (!fencer) return '';
    return `${fencer.ref}. ${fencer.firstName} ${fencer.lastName}`;
  }, []);

  const getFencerShortDisplay = useCallback((fencer: Fencer | null) => {
    if (!fencer) return '';
    return `${fencer.firstName[0]}. ${fencer.lastName}`;
  }, []);

  return {
    fencerById,
    getFencerDisplay,
    getFencerShortDisplay,
  };
};

// ============================================================================
// Pool Grid Data Hook
// ============================================================================

export const usePoolGridData = (pool: Pool, poolRanking: PoolRanking[]) => {
  const gridData = useMemo(() => {
    // Create grid data structure for efficient rendering
    const gridSize = pool.fencers.length;
    const grid: Array<
      Array<{
        fencerA: Fencer;
        fencerB: Fencer;
        match: Match | null;
        score: string;
        winner: 'A' | 'B' | null;
      }>
    > = [];

    // Initialize empty grid
    for (let i = 0; i < gridSize; i++) {
      grid[i] = [];
      for (let j = 0; j < gridSize; j++) {
        grid[i][j] = {
          fencerA: pool.fencers[i],
          fencerB: pool.fencers[j],
          match: null,
          score: '',
          winner: null,
        };
      }
    }

    // Map O(1) pour les index de tireurs — évite findIndex dans la boucle
    const fencerIndex = new Map<string, number>();
    pool.fencers.forEach((f, i) => fencerIndex.set(f.id, i));

    // Fill with match data
    pool.matches.forEach(match => {
      if (!match.fencerA || !match.fencerB) return;

      const indexA = fencerIndex.get(match.fencerA.id) ?? -1;
      const indexB = fencerIndex.get(match.fencerB.id) ?? -1;

      if (indexA !== -1 && indexB !== -1) {
        const scoreA = match.scoreA?.value ?? 0;
        const scoreB = match.scoreB?.value ?? 0;
        const victoryA = match.scoreA?.isVictory;
        const victoryB = match.scoreB?.isVictory;

        let winner: 'A' | 'B' | null = null;
        if (victoryA) winner = 'A';
        else if (victoryB) winner = 'B';
        else if (scoreA > scoreB) winner = 'A';
        else if (scoreB > scoreA) winner = 'B';

        grid[indexA][indexB] = {
          fencerA: pool.fencers[indexA],
          fencerB: pool.fencers[indexB],
          match,
          score: `${scoreA}-${scoreB}`,
          winner,
        };
      }
    });

    return { grid, gridSize };
  }, [pool.fencers, pool.matches]);

  return gridData;
};
