/**
 * BellePoule Modern - Pool Management Hook
 * Gestion des poules, scores et classements
 * Licensed under GPL-3.0
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Pool,
  Fencer,
  Match,
  MatchStatus,
  FencerStatus,
  Weapon,
  PoolRanking,
  Score,
} from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { useToast } from '../components/Toast';
import type { AbandonSnapshot } from '../../shared/types/preload';
import {
  distributeFencersToPoolsSerpentine,
  calculateOptimalPoolCount,
  generatePoolMatchOrder,
  calculatePoolRanking,
  calculatePoolRankingQuest,
  calculateOverallRanking,
  calculateOverallRankingQuest,
} from '../../shared/utils/poolCalculations';

interface UsePoolManagementProps {
  isLaserSabre: boolean;
  poolMaxScore: number;
  showToast: ReturnType<typeof useToast>['showToast'];
  competitionId?: string;
}

export const usePoolManagement = ({
  isLaserSabre,
  poolMaxScore,
  showToast,
  competitionId,
}: UsePoolManagementProps) => {
  const [pools, setPools] = useState<Pool[]>([]);
  const [poolHistory, setPoolHistory] = useState<Pool[][]>([]);
  const [currentPoolRound, setCurrentPoolRound] = useState(1);
  const [overallRanking, setOverallRanking] = useState<PoolRanking[]>([]);

  // Helper pour calculer le classement selon le type
  const computePoolRanking = useCallback(
    (pool: Pool) => {
      return isLaserSabre ? calculatePoolRankingQuest(pool) : calculatePoolRanking(pool);
    },
    [isLaserSabre]
  );

  const computeOverallRanking = useCallback(
    (poolsList: Pool[]) => {
      return isLaserSabre
        ? calculateOverallRankingQuest(poolsList)
        : calculateOverallRanking(poolsList);
    },
    [isLaserSabre]
  );

  // Inclut l'historique des tours précédents pour un classement cumulatif
  const computeOverallRankingAllRounds = useCallback(
    (currentPools: Pool[], extraHistory?: Pool[][]) => {
      const history = extraHistory ?? poolHistory;
      const allPools = [...history.flat(), ...currentPools];
      return computeOverallRanking(allPools);
    },
    [poolHistory, computeOverallRanking]
  );

  // Classement global courant mémoïsé — recalculé seulement quand pools ou poolHistory change
  const currentOverallRanking = useMemo(
    () => computeOverallRankingAllRounds(pools),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pools, poolHistory, isLaserSabre]
  );

  // Générer les poules
  const generatePools = useCallback(
    (checkedInFencers: Fencer[]) => {
      if (checkedInFencers.length < 4) {
        showToast('Il faut au moins 4 tireurs pointés pour créer les poules.', 'warning');
        return null;
      }

      const poolCount = calculateOptimalPoolCount(checkedInFencers.length, 5, 7);
      const distribution = distributeFencersToPoolsSerpentine(checkedInFencers, poolCount, [
        'byClub',
        'byRegion',
      ]);

      const generatedPools: Pool[] = distribution.map((poolFencers, index) => {
        const poolId = crypto.randomUUID();
        const matchOrder = generatePoolMatchOrder(poolFencers.length);
        const matches: Match[] = matchOrder.map(([a, b], matchIndex) => ({
          id: crypto.randomUUID(),
          poolId,
          number: matchIndex + 1,
          fencerA: poolFencers[a - 1],
          fencerB: poolFencers[b - 1],
          scoreA: null,
          scoreB: null,
          maxScore: poolMaxScore,
          status: MatchStatus.NOT_STARTED,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        return {
          id: poolId,
          number: index + 1,
          phaseId: 'phase-pools',
          fencers: poolFencers,
          matches,
          referees: [],
          isComplete: false,
          hasError: false,
          ranking: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      setPools(generatedPools);
      setCurrentPoolRound(1);
      setPoolHistory([]);

      const ranking = computeOverallRanking(generatedPools);
      setOverallRanking(ranking);

      showToast(`${generatedPools.length} poules créées avec succès`, 'success');
      return generatedPools;
    },
    [poolMaxScore, computeOverallRanking, showToast]
  );

  // Mettre à jour un score
  const updateScore = useCallback(
    (
      poolIndex: number,
      matchIndex: number,
      scoreA: number,
      scoreB: number,
      winnerOverride?: 'A' | 'B',
      specialStatus?: 'abandon' | 'forfait' | 'exclusion'
    ) => {
      setPools(prevPools => {
        const updatedPools = [...prevPools];
        const pool = { ...updatedPools[poolIndex] };
        const match = { ...pool.matches[matchIndex] };

        // Mettre à jour les scores avec la structure Score
        const isVictoryA = winnerOverride === 'A' || (!winnerOverride && scoreA > scoreB);
        const isVictoryB = winnerOverride === 'B' || (!winnerOverride && scoreB > scoreA);

        match.scoreA = {
          value: scoreA,
          isVictory: isVictoryA,
          isAbstention: specialStatus === 'abandon',
          isExclusion: specialStatus === 'exclusion',
          isForfait: specialStatus === 'forfait',
        };

        match.scoreB = {
          value: scoreB,
          isVictory: isVictoryB,
          isAbstention: false,
          isExclusion: false,
          isForfait: false,
        };

        // Mettre à jour le statut
        match.status = MatchStatus.FINISHED;
        match.updatedAt = new Date();

        // Mettre à jour le pool (nouveau tableau pour invalider le useMemo)
        pool.matches = [...pool.matches];
        pool.matches[matchIndex] = match;
        pool.updatedAt = new Date();

        // Recalculer le classement de la poule
        pool.ranking = computePoolRanking(pool);
        pool.isComplete = pool.matches.every(m => m.status === MatchStatus.FINISHED);

        updatedPools[poolIndex] = pool;

        // Recalculer le classement général (tous les tours cumulés)
        const newOverallRanking = computeOverallRankingAllRounds(updatedPools);
        setOverallRanking(newOverallRanking);

        return updatedPools;
      });
    },
    [computePoolRanking, computeOverallRankingAllRounds]
  );

  // Annuler un match terminé pour le remettre à NOT_STARTED
  const cancelMatch = useCallback(
    (poolIndex: number, matchIndex: number) => {
      setPools(prevPools => {
        const updatedPools = [...prevPools];
        const pool = { ...updatedPools[poolIndex] };
        const match = { ...pool.matches[matchIndex] };

        match.scoreA = null;
        match.scoreB = null;
        match.status = MatchStatus.NOT_STARTED;
        match.updatedAt = new Date();

        pool.matches = [...pool.matches];
        pool.matches[matchIndex] = match;
        pool.updatedAt = new Date();
        pool.ranking = computePoolRanking(pool);
        pool.isComplete = false;

        updatedPools[poolIndex] = pool;

        const newOverallRanking = computeOverallRankingAllRounds(updatedPools);
        setOverallRanking(newOverallRanking);

        return updatedPools;
      });
    },
    [computePoolRanking, computeOverallRankingAllRounds]
  );

  const resetMatch = useCallback(
    (poolIndex: number, matchIndex: number) => {
      setPools(prevPools => {
        const updatedPools = [...prevPools];
        const pool = { ...updatedPools[poolIndex] };
        const match = { ...pool.matches[matchIndex] };

        match.scoreA = null;
        match.scoreB = null;
        match.status = MatchStatus.NOT_STARTED;
        match.updatedAt = new Date();

        pool.matches = [...pool.matches];
        pool.matches[matchIndex] = match;
        pool.updatedAt = new Date();
        pool.ranking = computePoolRanking(pool);
        pool.isComplete = false;

        updatedPools[poolIndex] = pool;

        const newOverallRanking = computeOverallRankingAllRounds(updatedPools);
        setOverallRanking(newOverallRanking);

        return updatedPools;
      });
    },
    [computePoolRanking, computeOverallRankingAllRounds]
  );

  // Passer au tour de poules suivant
  const nextPoolRound = useCallback(
    (checkedInFencers: Fencer[]) => {
      if (pools.length === 0) return;

      // Sauvegarder l'état actuel dans l'historique
      setPoolHistory(prev => [...prev, pools]);

      // Générer de nouvelles poules avec le classement actuel
      const newPoolCount = calculateOptimalPoolCount(checkedInFencers.length, 5, 7);
      const distribution = distributeFencersToPoolsSerpentine(checkedInFencers, newPoolCount, [
        'byClub',
        'byRegion',
      ]);

      const newPools: Pool[] = distribution.map((poolFencers, index) => {
        const poolId = crypto.randomUUID();
        const matchOrder = generatePoolMatchOrder(poolFencers.length);
        const matches: Match[] = matchOrder.map(([a, b], matchIndex) => ({
          id: crypto.randomUUID(),
          poolId,
          number: matchIndex + 1,
          fencerA: poolFencers[a - 1],
          fencerB: poolFencers[b - 1],
          scoreA: null,
          scoreB: null,
          maxScore: poolMaxScore,
          status: MatchStatus.NOT_STARTED,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        return {
          id: poolId,
          number: index + 1,
          phaseId: 'phase-pools',
          fencers: poolFencers,
          matches,
          referees: [],
          isComplete: false,
          hasError: false,
          ranking: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      setPools(newPools);
      setCurrentPoolRound(prev => prev + 1);

      // Classement cumulatif sur tous les tours terminés (historique + tour courant)
      // newPools est vide, le classement reflète l'état après le tour qui vient de finir
      const allCompletedPools = [...poolHistory, pools];
      const ranking = computeOverallRanking(allCompletedPools.flat());
      setOverallRanking(ranking);

      showToast(`Tour ${currentPoolRound + 1} de poules créé`, 'success');
    },
    [pools, poolHistory, currentPoolRound, poolMaxScore, computeOverallRanking, showToast]
  );

  // Vérifier si toutes les poules sont complètes
  const areAllPoolsComplete = useCallback(() => {
    const inactiveStatuses = new Set<FencerStatus>([
      FencerStatus.ABANDONED,
      FencerStatus.FORFAIT,
      FencerStatus.EXCLUDED,
    ]);
    return pools.every(pool =>
      pool.matches.every(match => {
        const hasInactive =
          inactiveStatuses.has(match.fencerA?.status as FencerStatus) ||
          inactiveStatuses.has(match.fencerB?.status as FencerStatus);
        return hasInactive || match.status === MatchStatus.FINISHED;
      })
    );
  }, [pools]);

  // Obtenir les statistiques des poules
  const getPoolStats = useCallback(() => {
    const totalMatches = pools.reduce((sum, pool) => sum + pool.matches.length, 0);
    const completedMatches = pools.reduce(
      (sum, pool) => sum + pool.matches.filter(m => m.status === MatchStatus.FINISHED).length,
      0
    );

    return {
      totalPools: pools.length,
      totalMatches,
      completedMatches,
      completionRate: totalMatches > 0 ? (completedMatches / totalMatches) * 100 : 0,
    };
  }, [pools]);

  // Gérer le forfait/abandon/exclusion d'un tireur sur tous ses matchs non encore disputés
  // Met à jour le statut du tireur et grise ses matchs restants dans la grille
  const handleFencerForfeit = useCallback(
    async (fencerId: string, status: 'abandon' | 'forfait' | 'exclusion') => {
      // --- Snapshot AVANT modification (pour pouvoir annuler) ---
      const previousStatus =
        pools.flatMap(p => p.fencers).find(f => f.id === fencerId)?.status ??
        FencerStatus.CHECKED_IN;

      const affectedSnapshots = pools.flatMap(pool =>
        pool.matches
          .filter(m => m.fencerA?.id === fencerId || m.fencerB?.id === fencerId)
          .map(m => ({
            matchId: m.id,
            status: m.status as string,
            scoreA: m.scoreA ? { ...m.scoreA } : null,
            scoreB: m.scoreB ? { ...m.scoreB } : null,
          }))
      );

      if (competitionId && window.electronAPI?.db?.saveAbandonSnapshot) {
        await window.electronAPI.db
          .saveAbandonSnapshot(fencerId, competitionId, previousStatus, status, affectedSnapshots)
          .catch((e: Error) => logger.warn(LogCategory.DATABASE, 'Snapshot abandon échoué', e));
      }

      // --- Logique existante ---
      const newFencerStatus =
        status === 'abandon'
          ? FencerStatus.ABANDONED
          : status === 'forfait'
            ? FencerStatus.FORFAIT
            : FencerStatus.EXCLUDED;

      setPools(prevPools => {
        let modifiedCount = 0;

        const updatedPools = prevPools.map(pool => {
          const hasFencer =
            pool.fencers.some(f => f.id === fencerId) ||
            pool.matches.some(m => m.fencerA?.id === fencerId || m.fencerB?.id === fencerId);
          if (!hasFencer) return pool;

          const newFencers = pool.fencers.map(f =>
            f.id === fencerId ? { ...f, status: newFencerStatus } : f
          );

          const newMatches = pool.matches.map(match => {
            const isFencerA = match.fencerA?.id === fencerId;
            const isFencerB = match.fencerB?.id === fencerId;
            if (!isFencerA && !isFencerB) return match;

            // Ne pas écraser les matchs déjà disputés avec de vrais scores,
            // mais propager quand même le statut dans la référence fencer
            // pour que calculateFencerPoolStats annule ces matchs pour les adversaires.
            const isAlreadyPlayed =
              match.status === MatchStatus.FINISHED &&
              !match.scoreA?.isForfait &&
              !match.scoreB?.isForfait;

            const newMatch = {
              ...match,
              fencerA:
                isFencerA && match.fencerA
                  ? { ...match.fencerA, status: newFencerStatus }
                  : match.fencerA,
              fencerB:
                isFencerB && match.fencerB
                  ? { ...match.fencerB, status: newFencerStatus }
                  : match.fencerB,
            };

            if (!isAlreadyPlayed) {
              if (isFencerA) {
                newMatch.scoreA = {
                  value: 0,
                  isVictory: false,
                  isAbstention: status === 'abandon',
                  isExclusion: status === 'exclusion',
                  isForfait: status === 'forfait',
                };
              } else {
                newMatch.scoreB = {
                  value: 0,
                  isVictory: false,
                  isAbstention: status === 'abandon',
                  isExclusion: status === 'exclusion',
                  isForfait: status === 'forfait',
                };
              }
              newMatch.status = MatchStatus.FINISHED;
              newMatch.updatedAt = new Date();
              modifiedCount++;
            }

            return newMatch;
          });

          const newPool = { ...pool, fencers: newFencers, matches: newMatches };
          if (modifiedCount > 0) {
            newPool.ranking = computePoolRanking(newPool);
            newPool.updatedAt = new Date();
          }
          return newPool;
        });

        // Recalculer le classement général (tous les tours cumulés)
        if (modifiedCount > 0) {
          const newOverallRanking = computeOverallRankingAllRounds(updatedPools);
          setOverallRanking(newOverallRanking);
          showToast(
            `${modifiedCount} match(s) marqué(s) comme non disputés (${status})`,
            'success'
          );
        }

        return updatedPools;
      });
    },
    [competitionId, pools, computePoolRanking, computeOverallRankingAllRounds, showToast]
  );

  // Annuler un abandon/forfait/exclusion et restaurer les matchs affectés
  const handleUndoAbandon = useCallback(
    async (fencerId: string) => {
      let snapshot: AbandonSnapshot | null = null;

      if (competitionId && window.electronAPI?.db?.getAbandonSnapshot) {
        snapshot = await window.electronAPI.db.getAbandonSnapshot(fencerId).catch(() => null);
      }

      setPools(prevPools => {
        let restoredCount = 0;
        const restoredStatus = snapshot
          ? (snapshot.previousStatus as FencerStatus)
          : FencerStatus.CHECKED_IN;

        const updatedPools = prevPools.map(pool => {
          const hasFencer =
            pool.fencers.some(f => f.id === fencerId) ||
            pool.matches.some(m => m.fencerA?.id === fencerId || m.fencerB?.id === fencerId);
          if (!hasFencer) return pool;

          const newFencers = pool.fencers.map(f =>
            f.id === fencerId ? { ...f, status: restoredStatus } : f
          );

          const newMatches = pool.matches.map(match => {
            const isFencerA = match.fencerA?.id === fencerId;
            const isFencerB = match.fencerB?.id === fencerId;
            if (!isFencerA && !isFencerB) return match;

            if (snapshot) {
              // Restauration depuis le snapshot
              const saved = snapshot.matchSnapshots.find(s => s.matchId === match.id);
              if (!saved) return match;
              restoredCount++;
              return {
                ...match,
                status: saved.status as MatchStatus,
                scoreA: saved.scoreA as Score | null,
                scoreB: saved.scoreB as Score | null,
                fencerA:
                  isFencerA && match.fencerA
                    ? { ...match.fencerA, status: restoredStatus }
                    : match.fencerA,
                fencerB:
                  isFencerB && match.fencerB
                    ? { ...match.fencerB, status: restoredStatus }
                    : match.fencerB,
              };
            } else {
              // Fallback sans snapshot : réinitialise les matchs marqués abandon/forfait/exclusion
              // uniquement si l'adversaire n'est pas lui-même en statut spécial
              const myScore = isFencerA ? match.scoreA : match.scoreB;
              const oppScore = isFencerA ? match.scoreB : match.scoreA;
              if (
                (myScore?.isAbstention || myScore?.isForfait || myScore?.isExclusion) &&
                !oppScore?.isAbstention &&
                !oppScore?.isForfait &&
                !oppScore?.isExclusion
              ) {
                restoredCount++;
                return {
                  ...match,
                  status: MatchStatus.NOT_STARTED,
                  scoreA: null,
                  scoreB: null,
                  fencerA:
                    isFencerA && match.fencerA
                      ? { ...match.fencerA, status: FencerStatus.CHECKED_IN }
                      : match.fencerA,
                  fencerB:
                    isFencerB && match.fencerB
                      ? { ...match.fencerB, status: FencerStatus.CHECKED_IN }
                      : match.fencerB,
                };
              }
              return match;
            }
          });

          const newPool = { ...pool, fencers: newFencers, matches: newMatches };
          newPool.ranking = computePoolRanking(newPool);
          newPool.updatedAt = new Date();
          return newPool;
        });

        const newOverallRanking = computeOverallRankingAllRounds(updatedPools);
        setOverallRanking(newOverallRanking);

        if (restoredCount > 0) {
          showToast(`Abandon annulé — ${restoredCount} match(s) restauré(s)`, 'success');
        } else {
          showToast('Statut restauré (aucun match à rétablir)', 'info');
        }

        return updatedPools;
      });

      // Supprimer le snapshot après restauration
      if (snapshot && window.electronAPI?.db?.deleteAbandonSnapshot) {
        await window.electronAPI.db.deleteAbandonSnapshot(fencerId).catch(() => {});
      }
    },
    [competitionId, computePoolRanking, computeOverallRankingAllRounds, showToast]
  );

  // Mettre à jour un match depuis une source externe (serveur distant)
  const updateMatchFromRemote = useCallback(
    (
      matchId: string,
      scoreA: number,
      scoreB: number,
      status: MatchStatus,
      winnerOverride?: 'A' | 'B'
    ) => {
      setPools(prevPools => {
        const updatedPools = [...prevPools];
        let matchFound = false;

        for (let poolIdx = 0; poolIdx < updatedPools.length; poolIdx++) {
          const pool = updatedPools[poolIdx];
          for (let matchIdx = 0; matchIdx < pool.matches.length; matchIdx++) {
            if (pool.matches[matchIdx].id === matchId) {
              matchFound = true;
              const match = pool.matches[matchIdx];
              // Pour le tirage au sort : scores égaux mais vainqueur explicite
              const winner =
                scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : (winnerOverride ?? null);

              const updatedPool = { ...pool };
              const updatedMatches = [...pool.matches];
              updatedMatches[matchIdx] = {
                ...match,
                scoreA: {
                  value: scoreA,
                  isVictory: winner === 'A',
                  isAbstention: false,
                  isExclusion: false,
                  isForfait: false,
                },
                scoreB: {
                  value: scoreB,
                  isVictory: winner === 'B',
                  isAbstention: false,
                  isExclusion: false,
                  isForfait: false,
                },
                status,
                updatedAt: new Date(),
              };
              updatedPool.matches = updatedMatches;
              updatedPool.updatedAt = new Date();
              updatedPool.ranking = computePoolRanking(updatedPool);
              updatedPools[poolIdx] = updatedPool;
              break;
            }
          }
          if (matchFound) break;
        }

        if (!matchFound) {
          logger.warn(LogCategory.UI, '[usePoolManagement] Match non trouvé', { matchId });
          return prevPools;
        }

        // Recalculer le classement général (tous les tours cumulés)
        const newOverallRanking = computeOverallRankingAllRounds(updatedPools);
        setOverallRanking(newOverallRanking);

        logger.debug(
          LogCategory.UI,
          `[usePoolManagement] Match ${matchId} mis à jour depuis remote: ${scoreA}-${scoreB}`
        );
        return updatedPools;
      });
    },
    [computePoolRanking, computeOverallRankingAllRounds]
  );

  // Synchroniser les données des tireurs (ex: photo) dans les matches de poule
  // Annulation d'un carton noir distant : réintègre le combattant, rouvre le match
  // interrompu (score conservé) et libère ses matchs marqués « exclusion »
  const handleBlackCardCancelled = useCallback(
    (
      fencerId: string,
      matchId: string,
      restoredStatus: FencerStatus,
      scoreA: number,
      scoreB: number
    ) => {
      const reopened = (value: number): Score => ({
        value,
        isVictory: false,
        isAbstention: false,
        isExclusion: false,
        isForfait: false,
      });
      setPools(prevPools => {
        let changed = false;
        const updatedPools = prevPools.map(pool => {
          const hasFencer =
            pool.fencers.some(f => f.id === fencerId) ||
            pool.matches.some(m => m.fencerA?.id === fencerId || m.fencerB?.id === fencerId);
          if (!hasFencer) return pool;
          changed = true;

          const restore = <T extends Fencer | null | undefined>(f: T): T =>
            f && f.id === fencerId
              ? ({ ...f, status: restoredStatus, exclusionReason: null } as T)
              : f;

          const newMatches = pool.matches.map(match => {
            const isFencerA = match.fencerA?.id === fencerId;
            const isFencerB = match.fencerB?.id === fencerId;
            if (!isFencerA && !isFencerB) return match;
            const base = {
              ...match,
              fencerA: restore(match.fencerA),
              fencerB: restore(match.fencerB),
            };

            if (match.id === matchId) {
              return {
                ...base,
                scoreA: reopened(scoreA),
                scoreB: reopened(scoreB),
                status: MatchStatus.IN_PROGRESS,
                updatedAt: new Date(),
              };
            }
            // Matchs suivants marqués non disputés suite à l'exclusion → à nouveau jouables
            const myScore = isFencerA ? match.scoreA : match.scoreB;
            const oppScore = isFencerA ? match.scoreB : match.scoreA;
            if (
              myScore?.isExclusion &&
              !oppScore?.isAbstention &&
              !oppScore?.isForfait &&
              !oppScore?.isExclusion
            ) {
              return {
                ...base,
                scoreA: null,
                scoreB: null,
                status: MatchStatus.NOT_STARTED,
                updatedAt: new Date(),
              };
            }
            return base;
          });

          const newPool = {
            ...pool,
            fencers: pool.fencers.map(restore),
            matches: newMatches,
            updatedAt: new Date(),
          };
          newPool.ranking = computePoolRanking(newPool);
          return newPool;
        });
        if (!changed) return prevPools;
        setOverallRanking(computeOverallRankingAllRounds(updatedPools));
        return updatedPools;
      });
    },
    [computePoolRanking, computeOverallRankingAllRounds]
  );

  const syncFencersToPool = useCallback((updatedFencers: Fencer[]) => {
    if (updatedFencers.length === 0) return;
    const fencerMap = new Map(updatedFencers.map(f => [f.id, f]));

    const syncPools = (poolList: Pool[]): Pool[] =>
      poolList.map(pool => ({
        ...pool,
        fencers: pool.fencers.map(f => fencerMap.get(f.id) ?? f),
        matches: pool.matches.map(match => ({
          ...match,
          fencerA: match.fencerA
            ? (fencerMap.get(match.fencerA.id) ?? match.fencerA)
            : match.fencerA,
          fencerB: match.fencerB
            ? (fencerMap.get(match.fencerB.id) ?? match.fencerB)
            : match.fencerB,
        })),
      }));

    setPools(prev => (prev.length === 0 ? prev : syncPools(prev)));
    setPoolHistory(prev => (prev.length === 0 ? prev : prev.map(round => syncPools(round))));
  }, []);

  return {
    pools,
    setPools,
    poolHistory,
    setPoolHistory,
    currentPoolRound,
    setCurrentPoolRound,
    overallRanking,
    setOverallRanking,
    generatePools,
    updateScore,
    resetMatch,
    cancelMatch,
    updateMatchFromRemote,
    nextPoolRound,
    areAllPoolsComplete,
    getPoolStats,
    computePoolRanking,
    computeOverallRanking,
    computeOverallRankingAllRounds,
    currentOverallRanking,
    handleFencerForfeit,
    handleUndoAbandon,
    handleBlackCardCancelled,
    syncFencersToPool,
  };
};

export default usePoolManagement;
