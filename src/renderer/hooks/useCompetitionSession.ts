/**
 * BellePoule Modern - Competition Session Hook
 * Gestion de la sauvegarde et restauration de l'état de session
 * Licensed under GPL-3.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Pool, PoolRanking } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { TableauMatch, FinalResult, ConsolationBracket } from '../components/tableau/tableauTypes';

export type Phase =
  | 'checkin'
  | 'poolprep'
  | 'pools'
  | 'ranking'
  | 'quest'
  | 'tableau'
  | 'results'
  | 'remote'
  | 'logs'
  | 'referees';

interface SessionState {
  currentPhase: number;
  pools: Pool[];
  poolHistory: Pool[][];
  overallRanking: PoolRanking[];
  tableauMatches: TableauMatch[];
  finalResults: FinalResult[];
  consolationBrackets: ConsolationBracket[];
  currentPoolRound: number;
  skipPoolPhase: boolean;
  remoteArenaCount?: number;
  poolPrepParams: {
    poolCount: number;
    minFencersPerPool: number;
    maxFencersPerPool: number;
  };
  uiState: {
    currentPhase: Phase;
    currentPoolRound: number;
    pools: number;
  };
}

interface UseCompetitionSessionProps {
  competitionId: string;
  currentPhase: Phase;
  currentPoolRound: number;
  pools: Pool[];
  poolHistory: Pool[][];
  overallRanking: PoolRanking[];
  tableauMatches: TableauMatch[];
  finalResults: FinalResult[];
  consolationBrackets: ConsolationBracket[];
  skipPoolPhase: boolean;
  remoteArenaCount: number;
  poolPrepParams: {
    poolCount: number;
    minFencersPerPool: number;
    maxFencersPerPool: number;
  };
}

export const useCompetitionSession = (props: UseCompetitionSessionProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [restoredState, setRestoredState] = useState<Partial<SessionState> | null>(null);
  const propsRef = useRef(props);
  const isLoadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  propsRef.current = props;
  isLoadedRef.current = isLoaded;

  // Phase mapping entre string et number
  const phaseToNumber: Record<Phase, number> = {
    checkin: 0,
    poolprep: 1,
    pools: 2,
    ranking: 3,
    quest: 4,
    tableau: 5,
    results: 6,
    remote: 7,
    logs: 8,
    referees: 9,
  };

  const numberToPhase: Record<number, Phase> = {
    0: 'checkin',
    1: 'poolprep',
    2: 'pools',
    3: 'ranking',
    4: 'quest',
    5: 'tableau',
    6: 'results',
    7: 'remote',
    8: 'logs',
    9: 'referees',
  };

  // Sauvegarder l'état - lit depuis propsRef pour rester stable (pas de re-création à chaque render)
  const saveState = useCallback(async () => {
    if (!window.electronAPI?.db?.saveSessionState || !isLoadedRef.current) return;
    const p = propsRef.current;

    const state: SessionState = {
      currentPhase: phaseToNumber[p.currentPhase],
      pools: p.pools,
      poolHistory: p.poolHistory,
      overallRanking: p.overallRanking,
      tableauMatches: p.tableauMatches,
      finalResults: p.finalResults,
      consolationBrackets: p.consolationBrackets,
      currentPoolRound: p.currentPoolRound,
      skipPoolPhase: p.skipPoolPhase,
      remoteArenaCount: p.remoteArenaCount,
      poolPrepParams: {
        poolCount: p.poolPrepParams?.poolCount || 0,
        minFencersPerPool: p.poolPrepParams?.minFencersPerPool || 5,
        maxFencersPerPool: p.poolPrepParams?.maxFencersPerPool || 7,
      },
      uiState: {
        currentPhase: p.currentPhase,
        currentPoolRound: p.currentPoolRound,
        pools: p.pools.length,
      },
    };

    try {
      await window.electronAPI.db.saveSessionState(p.competitionId, state);
    } catch (e) {
      logger.error(LogCategory.UI, 'Failed to save session state', e as Error);
    }
  }, []); // stable - lit les props depuis propsRef

  // Restaurer l'état
  const restoreState = useCallback(async () => {
    if (!window.electronAPI?.db?.getSessionState) {
      setIsLoaded(true);
      return;
    }

    try {
      const state = await window.electronAPI.db.getSessionState(props.competitionId);
      if (state) {
        const typedState = state as SessionState;
        const restoredPhase = numberToPhase[typedState.currentPhase || 0];

        setRestoredState({
          currentPhase: typedState.currentPhase,
          pools: typedState.pools || [],
          poolHistory: typedState.poolHistory || [],
          overallRanking: typedState.overallRanking || [],
          tableauMatches: typedState.tableauMatches || [],
          finalResults: typedState.finalResults || [],
          consolationBrackets: typedState.consolationBrackets || [],
          currentPoolRound: typedState.uiState?.currentPoolRound || 1,
          skipPoolPhase: typedState.skipPoolPhase ?? false,
          remoteArenaCount: typedState.remoteArenaCount,
          poolPrepParams: typedState.poolPrepParams || {
            poolCount: 0,
            minFencersPerPool: 5,
            maxFencersPerPool: 7,
          },
        });

        logger.debug(LogCategory.UI, 'Session state restored');
      }
    } catch (e) {
      logger.error(LogCategory.UI, 'Failed to restore session state', e as Error);
    }
    setIsLoaded(true);
  }, [props.competitionId]);

  // Restaurer au chargement
  useEffect(() => {
    restoreState();
  }, [restoreState]);

  // Sauvegarde synchrone avant fermeture fenêtre (saveState async non awaitable dans beforeunload)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (!window.electronAPI?.db?.saveSessionStateSync || !isLoadedRef.current) return;
      const p = propsRef.current;
      const phaseMap: Record<Phase, number> = {
        checkin: 0,
        poolprep: 1,
        pools: 2,
        ranking: 3,
        quest: 4,
        tableau: 5,
        results: 6,
        remote: 7,
        logs: 8,
        referees: 9,
      };
      window.electronAPI.db.saveSessionStateSync(p.competitionId, {
        currentPhase: phaseMap[p.currentPhase],
        pools: p.pools,
        poolHistory: p.poolHistory,
        overallRanking: p.overallRanking,
        tableauMatches: p.tableauMatches,
        finalResults: p.finalResults,
        consolationBrackets: p.consolationBrackets,
        currentPoolRound: p.currentPoolRound,
        skipPoolPhase: p.skipPoolPhase,
        remoteArenaCount: p.remoteArenaCount,
        poolPrepParams: p.poolPrepParams,
        uiState: {
          currentPhase: p.currentPhase,
          currentPoolRound: p.currentPoolRound,
          pools: p.pools.length,
        },
      });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Sauvegarder à chaque changement - debounced 500ms pour éviter les écritures en rafale
  useEffect(() => {
    if (!isLoaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      saveState();
    }, 500);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        saveState(); // fire immédiatement sur unmount
      }
    };
  }, [
    isLoaded,
    props.currentPhase,
    props.currentPoolRound,
    props.pools,
    props.poolHistory,
    props.overallRanking,
    props.tableauMatches,
    props.finalResults,
    props.consolationBrackets,
    props.skipPoolPhase,
    props.remoteArenaCount,
    props.poolPrepParams,
    saveState,
  ]);

  return {
    isLoaded,
    restoredState,
    restoreState,
    saveState,
  };
};

export default useCompetitionSession;
