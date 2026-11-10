/**
 * BellePoule Modern - Persistance et restauration de l'état de la compétition (extrait de
 * CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import { useEffect, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Pool, PoolRanking } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import type {
  ConsolationBracket,
  FinalResult,
  TableauMatch,
} from '../components/tableau/tableauTypes';
import { inferPoolsLaunched } from '../components/poolLaunchState';
import type { useRapieresSessionState } from '../../features/rapieres/useRapieresSessionState';
import { useCompetitionSession, phaseFromNumber } from './useCompetitionSession';
import type { Phase } from './useCompetitionSession';
import type { usePoolManagement } from './usePoolManagement';

type Setter<T> = Dispatch<SetStateAction<T>>;
type PoolManagement = ReturnType<typeof usePoolManagement>;

interface UseCompetitionRestoreParams {
  competitionId: string;
  currentPhase: Phase;
  setCurrentPhase: Setter<Phase>;
  currentPoolRound: number;
  setCurrentPoolRound: PoolManagement['setCurrentPoolRound'];
  pools: Pool[];
  setPools: Setter<Pool[]>;
  poolHistory: Pool[][];
  setPoolHistory: PoolManagement['setPoolHistory'];
  appelHistory: PoolManagement['appelHistory'];
  setAppelHistory: PoolManagement['setAppelHistory'];
  overallRanking: PoolRanking[];
  setOverallRanking: Setter<PoolRanking[]>;
  tableauMatches: TableauMatch[];
  setTableauMatches: Setter<TableauMatch[]>;
  finalResults: FinalResult[];
  setFinalResults: Setter<FinalResult[]>;
  consolationBrackets: ConsolationBracket[];
  setConsolationBrackets: Setter<ConsolationBracket[]>;
  skipPoolPhase: boolean;
  setSkipPoolPhase: Setter<boolean>;
  setRankingValidated: Setter<boolean>;
  remoteArenaCount: number;
  setRemoteArenaCount: Setter<number>;
  remoteStripStart: number;
  setRemoteStripStart: Setter<number>;
  isRapieres: boolean;
  rapieresState: ReturnType<typeof useRapieresSessionState>['rapieresState'];
  setRapieresState: ReturnType<typeof useRapieresSessionState>['setRapieresState'];
  minFencersPerPool: number;
  maxFencersPerPool: number;
  setMinFencersPerPool: Setter<number>;
  setMaxFencersPerPool: Setter<number>;
  poolsLaunched: boolean;
  setPoolsLaunched: Setter<boolean>;
}

/** Sauvegarde la session (phase, poules, tableau…) et la restaure au chargement. */
export function useCompetitionRestore({
  competitionId,
  currentPhase,
  setCurrentPhase,
  currentPoolRound,
  setCurrentPoolRound,
  pools,
  setPools,
  poolHistory,
  setPoolHistory,
  appelHistory,
  setAppelHistory,
  overallRanking,
  setOverallRanking,
  tableauMatches,
  setTableauMatches,
  finalResults,
  setFinalResults,
  consolationBrackets,
  setConsolationBrackets,
  skipPoolPhase,
  setSkipPoolPhase,
  setRankingValidated,
  remoteArenaCount,
  setRemoteArenaCount,
  remoteStripStart,
  setRemoteStripStart,
  isRapieres,
  rapieresState,
  setRapieresState,
  minFencersPerPool,
  maxFencersPerPool,
  setMinFencersPerPool,
  setMaxFencersPerPool,
  poolsLaunched,
  setPoolsLaunched,
}: UseCompetitionRestoreParams) {
  const poolPrepParams = useMemo(
    () => ({
      poolCount: pools.length,
      minFencersPerPool,
      maxFencersPerPool,
    }),
    [pools.length, minFencersPerPool, maxFencersPerPool]
  );

  // Session state persistence
  const { isLoaded, restoredState } = useCompetitionSession({
    competitionId: competitionId,
    currentPhase,
    currentPoolRound,
    pools,
    poolHistory,
    appelHistory,
    overallRanking,
    tableauMatches,
    finalResults,
    consolationBrackets,
    skipPoolPhase,
    remoteArenaCount,
    remoteStripStart,
    rapieres: isRapieres ? rapieresState : undefined,
    poolPrepParams,
    poolsLaunched,
  });

  // Synchroniser le nombre d'arènes avec le nombre de poules
  useEffect(() => {
    if (!isLoaded) return;
    if (pools.length > 0) {
      // Si les poules ont rétréci depuis le dernier run : clamp pour éviter des arènes fantômes.
      const maxStrip = remoteStripStart + pools.length - 1;
      if (!restoredState?.remoteArenaCount || remoteArenaCount > maxStrip) {
        setRemoteArenaCount(maxStrip);
      }
    }
  }, [isLoaded, pools.length, remoteArenaCount, remoteStripStart]);

  // Restaurer l'état au chargement
  useEffect(() => {
    if (restoredState && isLoaded) {
      const restoredPhase = phaseFromNumber(restoredState.currentPhase);
      if (restoredPhase) setCurrentPhase(restoredPhase);
      if (
        ['tableau', 'results', 'remote', 'ranking'].includes(restoredPhase ?? '') ||
        (restoredState.tableauMatches && restoredState.tableauMatches.length > 0)
      ) {
        setRankingValidated(true);
      }
      if (restoredState.currentPoolRound) setCurrentPoolRound(restoredState.currentPoolRound);
      if (restoredState.pools) setPools(restoredState.pools);
      if (restoredState.poolHistory) setPoolHistory(restoredState.poolHistory || []);
      if (restoredState.appelHistory) setAppelHistory(restoredState.appelHistory);
      if (restoredState.overallRanking) setOverallRanking(restoredState.overallRanking);
      if (restoredState.tableauMatches) setTableauMatches(restoredState.tableauMatches);
      if (restoredState.finalResults) setFinalResults(restoredState.finalResults);
      if (restoredState.consolationBrackets?.length)
        setConsolationBrackets(restoredState.consolationBrackets);
      if (restoredState.poolPrepParams) {
        setMinFencersPerPool(restoredState.poolPrepParams.minFencersPerPool);
        setMaxFencersPerPool(restoredState.poolPrepParams.maxFencersPerPool);
      }
      if (restoredState.skipPoolPhase) setSkipPoolPhase(restoredState.skipPoolPhase);
      setPoolsLaunched(
        restoredState.poolsLaunched ??
          inferPoolsLaunched(restoredPhase, restoredState.pools, restoredState.poolHistory)
      );
      if (restoredState.remoteArenaCount != null)
        setRemoteArenaCount(restoredState.remoteArenaCount);
      setRemoteStripStart(restoredState.remoteStripStart ?? 1);
      if (restoredState.rapieres) setRapieresState(restoredState.rapieres);
    }
  }, [restoredState, isLoaded]);

  // Fallback DB : si session state n'a pas de poules, essayer de les charger depuis la DB.
  // Guard: ne pas déclencher si restoredState a déjà des poules (elles seront appliquées par
  // l'effet [restoredState, isLoaded] dans le même cycle de rendu, évitant la race condition
  // où l'IPC SQLite répond avant le prochain rendu React et écrase la session state).
  useEffect(() => {
    if (!isLoaded || pools.length > 0) return;
    if (restoredState?.pools && restoredState.pools.length > 0) return;
    let cancelled = false;
    window.electronAPI.db
      .getPhasesByCompetition(competitionId)
      .then(phases => {
        if (cancelled) return [];
        const poolPhase = phases.find((p: { type: string }) => p.type === 'pool');
        return poolPhase ? window.electronAPI.db.getPoolsByPhase(poolPhase.id) : [];
      })
      .then(dbPools => {
        if (!cancelled && dbPools.length > 0) setPools(dbPools);
      })
      .catch((e: unknown) =>
        logger.warn(
          LogCategory.DATABASE,
          'DB pool fallback failed',
          e instanceof Error ? e : undefined
        )
      );
    return () => {
      cancelled = true;
    };
  }, [isLoaded, pools.length, competitionId, restoredState]);

  return { isLoaded, restoredState };
}
