/**
 * BellePoule Modern - Pool Management Hook
 * Gestion des poules, scores et classements
 * Licensed under GPL-3.0
 */

import { useState, useCallback, useMemo } from 'react';
import { Pool, Fencer, MatchStatus, FencerStatus, PoolRanking, Score } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { useToast } from '../components/Toast';
import type { AbandonSnapshot } from '../../shared/types/preload';
import { mergeRoundRankings } from '../../shared/utils/poolRounds';
import {
  applyFencerForfeit,
  applyScoreToPool,
  buildMatchScores,
  buildPools,
  computeOverallRankingFor,
  computePoolRankingFor,
} from '../../shared/utils/poolOrchestration';
import { useTranslation } from './useTranslation';
import { areAllPoolsComplete as allPoolsComplete } from '../../shared/domain/pools/poolCompletion';
import { winnerByScore } from '../../shared/domain/match/matchEndValidation';

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
  const { t } = useTranslation();
  const [pools, setPools] = useState<Pool[]>([]);
  const [poolHistory, setPoolHistory] = useState<Pool[][]>([]);
  // Appel figé de chaque tour terminé (#1051) — non resynchronisé avec les tireurs
  const [appelHistory, setAppelHistory] = useState<Fencer[][]>([]);
  const [currentPoolRound, setCurrentPoolRound] = useState(1);
  const [overallRanking, setOverallRanking] = useState<PoolRanking[]>([]);

  // Helper pour calculer le classement selon le type
  const computePoolRanking = useCallback(
    (pool: Pool) => computePoolRankingFor(pool, isLaserSabre),
    [isLaserSabre]
  );

  const computeOverallRanking = useCallback(
    (poolsList: Pool[]) => computeOverallRankingFor(poolsList, isLaserSabre),
    [isLaserSabre]
  );

  // Classement multi-tours (#1051) : dernier tour, puis éliminés des tours précédents.
  // Pas de cumul : chaque tour repart de zéro.
  const computeOverallRankingAllRounds = useCallback(
    (currentPools: Pool[], extraHistory?: Pool[][]) => {
      const history = extraHistory ?? poolHistory;
      const rounds = [...history, currentPools].filter(r => r.length > 0);
      if (rounds.length <= 1) return computeOverallRanking(rounds[0] ?? []);
      return mergeRoundRankings(rounds.map(r => computeOverallRanking(r)));
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
  // round > 1 : nouveau tirage d'un tour suivant (historique conservé)
  const generatePools = useCallback(
    (checkedInFencers: Fencer[], round = 1) => {
      if (checkedInFencers.length < 4) {
        showToast('Il faut au moins 4 tireurs pointés pour créer les poules.', 'warning');
        return null;
      }

      // Tirage partagé avec la couche domaine (MCP, #1880)
      const generatedPools = buildPools(checkedInFencers, {
        poolMaxScore,
        round,
        newId: () => crypto.randomUUID(),
      });

      setPools(generatedPools);
      if (round > 1) {
        setOverallRanking(computeOverallRankingAllRounds(generatedPools));
      } else {
        setCurrentPoolRound(1);
        setPoolHistory([]);
        setOverallRanking(computeOverallRanking(generatedPools));
      }

      showToast(`${generatedPools.length} poules créées avec succès`, 'success');
      return generatedPools;
    },
    [poolMaxScore, computeOverallRanking, computeOverallRankingAllRounds, showToast]
  );

  // Mettre à jour un score
  const updateScore = useCallback(
    (
      poolIndex: number,
      matchIndex: number,
      scoreA: number,
      scoreB: number,
      winnerOverride?: 'A' | 'B',
      specialStatus?: 'abandon' | 'forfait' | 'exclusion',
      /** Égalité sans V : le tireur prioritaire (tirage avant la minute supplémentaire) gagne (#1442) */
      priority?: 'A' | 'B',
      /** Correction après tirage du tableau : motif pour le journal des scores (#1996) */
      correction?: string,
      /** Exclusion sur carton noir : motif posé par le moteur (recordScore, docs/adr/0016) */
      _blackCard?: boolean
    ) => {
      setPools(prevPools => {
        const updatedPools = [...prevPools];
        // Scores, statut et classement partagés avec la couche domaine (MCP, #1880)
        const scored = applyScoreToPool(
          updatedPools[poolIndex],
          matchIndex,
          buildMatchScores(scoreA, scoreB, winnerOverride, specialStatus, priority),
          isLaserSabre
        );
        const pool = correction
          ? {
              ...scored,
              matches: scored.matches.map((m, i) =>
                i === matchIndex
                  ? { ...m, correction: { reason: correction, at: new Date().toISOString() } }
                  : m
              ),
            }
          : scored;

        updatedPools[poolIndex] = pool;

        // Recalculer le classement général (tous les tours cumulés)
        const newOverallRanking = computeOverallRankingAllRounds(updatedPools);
        setOverallRanking(newOverallRanking);

        return updatedPools;
      });
    },
    [isLaserSabre, computeOverallRankingAllRounds]
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

  // Clôturer le tour courant (#1051) : archivé dans l'historique, nouveau tirage à faire
  // après l'appel du tour suivant (generatePools(fencers, round)).
  // `appelSnapshot` : appel du tour clôturé, conservé pour consultation / export.
  const nextPoolRound = useCallback(
    (appelSnapshot?: Fencer[]) => {
      if (pools.length === 0) return;
      const history = [...poolHistory, pools];
      setPoolHistory(history);
      if (appelSnapshot) {
        setAppelHistory(prev => {
          const next = prev.slice(0, history.length - 1);
          next[history.length - 1] = appelSnapshot;
          return next;
        });
      }
      setPools([]);
      setCurrentPoolRound(history.length + 1);
      setOverallRanking(computeOverallRankingAllRounds([], history));
    },
    [pools, poolHistory, computeOverallRankingAllRounds]
  );

  // Vérifier si toutes les poules sont complètes
  // Règle unique écran / moteur (#1979, lot 4)
  const areAllPoolsComplete = useCallback(() => allPoolsComplete(pools), [pools]);

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

      // --- Statut propagé, matchs restants perdus : logique partagée (MCP, #1880) ---
      setPools(prevPools => {
        const { pools: updatedPools, modifiedCount } = applyFencerForfeit(
          prevPools,
          fencerId,
          status,
          isLaserSabre
        );

        // Recalculer le classement général (tous les tours cumulés)
        setOverallRanking(computeOverallRankingAllRounds(updatedPools));
        if (modifiedCount > 0) {
          showToast(t('plural.matches_not_played', { count: modifiedCount, status }), 'success');
        }

        return updatedPools;
      });
    },
    [competitionId, pools, isLaserSabre, computeOverallRankingAllRounds, showToast, t]
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
          showToast(t('plural.matches_restored', { count: restoredCount }), 'success');
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
    [competitionId, computePoolRanking, computeOverallRankingAllRounds, showToast, t]
  );

  // Mettre à jour un match depuis une source externe (serveur distant)
  const updateMatchFromRemote = useCallback(
    (
      matchId: string,
      scoreA: number,
      scoreB: number,
      status: MatchStatus,
      winnerOverride?: 'A' | 'B',
      loserMark?: 'abandon' | 'exclusion'
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
              // Le vainqueur transmis par le serveur fait foi, comme au tableau : tirage au sort
              // (scores égaux), mais aussi abandon / exclusion signalés par l'appareil de piste
              // (#1720), où le perdant peut mener au score
              const winner = winnerOverride ?? winnerByScore(scoreA, scoreB);

              // Abandon / exclusion du perdant signalés par l'appareil : marque conservée,
              // sinon l'annulation des résultats (#1144) ne s'applique pas (#1829)
              const markA = !!winner && winner !== 'A' && loserMark !== undefined;
              const markB = !!winner && winner !== 'B' && loserMark !== undefined;
              const updatedPool = { ...pool };
              const updatedMatches = [...pool.matches];
              updatedMatches[matchIdx] = {
                ...match,
                scoreA: {
                  value: scoreA,
                  isVictory: winner === 'A',
                  isAbstention: markA && loserMark === 'abandon',
                  isExclusion: markA && loserMark === 'exclusion',
                  isForfait: false,
                },
                scoreB: {
                  value: scoreB,
                  isVictory: winner === 'B',
                  isAbstention: markB && loserMark === 'abandon',
                  isExclusion: markB && loserMark === 'exclusion',
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
    appelHistory,
    setAppelHistory,
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
