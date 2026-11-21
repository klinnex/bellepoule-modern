/**
 * BellePoule Modern - Competition Session Hook
 * Gestion de la sauvegarde et restauration de l'état de session
 * Licensed under GPL-3.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DEFAULT_POOL_SIZE_MAX,
  DEFAULT_POOL_SIZE_MIN,
} from '../../shared/domain/formula/formulaDraft';
import { Fencer, Pool, PoolRanking } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import {
  TableauMatch,
  FinalResult,
  ConsolationBracket,
} from '../../shared/domain/tableau/tableauTypes';
import type {
  RapieresLegacyState,
  RapieresSession,
} from '../../shared/domain/rapieres/rapieres.types';

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
  | 'referees'
  // Compétition par équipes (#1085)
  | 'teams'
  | 'teampool'
  | 'teamtableau'
  | 'teamranking';

/** Numéro persistant de chaque phase (sessions sauvegardées) — ne jamais renuméroter */
const PHASE_NUMBERS: Record<Phase, number> = {
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
  teams: 10,
  teampool: 11,
  teamtableau: 12,
  teamranking: 13,
};
const PHASES_BY_NUMBER: Record<number, Phase> = Object.fromEntries(
  Object.entries(PHASE_NUMBERS).map(([phase, n]) => [n, phase as Phase])
);

/** Phase correspondant au numéro sauvegardé (undefined si inconnu) */
export const phaseFromNumber = (n: number | undefined): Phase | undefined =>
  PHASES_BY_NUMBER[n ?? 0];

export interface SessionState {
  currentPhase: number;
  pools: Pool[];
  poolHistory: Pool[][];
  /** Appel figé de chaque tour de poules terminé (#1051) */
  appelHistory?: Fencer[][];
  overallRanking: PoolRanking[];
  tableauMatches: TableauMatch[];
  finalResults: FinalResult[];
  consolationBrackets: ConsolationBracket[];
  currentPoolRound: number;
  skipPoolPhase: boolean;
  /** Poules lancées au moins une fois (#1499) ; absent des anciennes sessions */
  poolsLaunched?: boolean;
  remoteArenaCount?: number;
  remoteStripStart?: number;
  /** Tournoi des rapières : composition des équipes et vagues (#1118) */
  rapieres?: RapieresSession | RapieresLegacyState;
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
  /** Révision de l'état : incrémentée par la couche domaine (MCP, #1880) */
  revision?: number;
}

interface UseCompetitionSessionProps {
  competitionId: string;
  currentPhase: Phase;
  currentPoolRound: number;
  pools: Pool[];
  poolHistory: Pool[][];
  /** Appel figé de chaque tour de poules terminé (#1051) */
  appelHistory?: Fencer[][];
  overallRanking: PoolRanking[];
  tableauMatches: TableauMatch[];
  finalResults: FinalResult[];
  consolationBrackets: ConsolationBracket[];
  skipPoolPhase: boolean;
  poolsLaunched?: boolean;
  remoteArenaCount: number;
  remoteStripStart?: number;
  rapieres?: RapieresSession | RapieresLegacyState;
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
  const reloadingRef = useRef(false);
  // Révision chargée : une sauvegarde sur un état réécrit depuis par le MCP est refusée
  const revisionRef = useRef(0);
  const restoreRef = useRef<() => Promise<void>>(async () => undefined);
  propsRef.current = props;
  isLoadedRef.current = isLoaded;

  // Sauvegarder l'état - lit depuis propsRef pour rester stable (pas de re-création à chaque render)
  const saveState = useCallback(async () => {
    if (!window.electronAPI?.db?.saveSessionState || !isLoadedRef.current) return;
    // Relecture en cours après une écriture du domaine : l'état affiché est périmé
    if (reloadingRef.current) return;
    const p = propsRef.current;

    const state: SessionState = {
      currentPhase: PHASE_NUMBERS[p.currentPhase],
      pools: p.pools,
      poolHistory: p.poolHistory,
      appelHistory: p.appelHistory,
      overallRanking: p.overallRanking,
      tableauMatches: p.tableauMatches,
      finalResults: p.finalResults,
      consolationBrackets: p.consolationBrackets,
      currentPoolRound: p.currentPoolRound,
      skipPoolPhase: p.skipPoolPhase,
      poolsLaunched: p.poolsLaunched,
      remoteArenaCount: p.remoteArenaCount,
      remoteStripStart: p.remoteStripStart,
      ...(p.rapieres ? { rapieres: p.rapieres } : {}),
      poolPrepParams: {
        poolCount: p.poolPrepParams?.poolCount || 0,
        minFencersPerPool: p.poolPrepParams?.minFencersPerPool || DEFAULT_POOL_SIZE_MIN,
        maxFencersPerPool: p.poolPrepParams?.maxFencersPerPool || DEFAULT_POOL_SIZE_MAX,
      },
      uiState: {
        currentPhase: p.currentPhase,
        currentPoolRound: p.currentPoolRound,
        pools: p.pools.length,
      },
    };

    try {
      state.revision = revisionRef.current;
      const result = await window.electronAPI.db.saveSessionState(p.competitionId, state);
      if (result && result.conflict) {
        // État réécrit hors écran entre-temps : on relit plutôt que d'écraser
        logger.warn(LogCategory.UI, 'Session state changed elsewhere: reloading');
        reloadingRef.current = true;
        void restoreRef.current().finally(() => {
          reloadingRef.current = false;
        });
      }
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
        revisionRef.current = typeof typedState.revision === 'number' ? typedState.revision : 0;
        setRestoredState({
          currentPhase: typedState.currentPhase,
          pools: typedState.pools || [],
          poolHistory: typedState.poolHistory || [],
          appelHistory: typedState.appelHistory || [],
          overallRanking: typedState.overallRanking || [],
          tableauMatches: typedState.tableauMatches || [],
          finalResults: typedState.finalResults || [],
          consolationBrackets: typedState.consolationBrackets || [],
          currentPoolRound: typedState.uiState?.currentPoolRound || 1,
          skipPoolPhase: typedState.skipPoolPhase ?? false,
          poolsLaunched: typedState.poolsLaunched,
          remoteArenaCount: typedState.remoteArenaCount,
          remoteStripStart: typedState.remoteStripStart,
          rapieres: typedState.rapieres,
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

  restoreRef.current = restoreState;

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
      window.electronAPI.db.saveSessionStateSync(p.competitionId, {
        revision: revisionRef.current,
        currentPhase: PHASE_NUMBERS[p.currentPhase],
        pools: p.pools,
        poolHistory: p.poolHistory,
        appelHistory: p.appelHistory,
        overallRanking: p.overallRanking,
        tableauMatches: p.tableauMatches,
        finalResults: p.finalResults,
        consolationBrackets: p.consolationBrackets,
        currentPoolRound: p.currentPoolRound,
        skipPoolPhase: p.skipPoolPhase,
        poolsLaunched: p.poolsLaunched,
        remoteArenaCount: p.remoteArenaCount,
        remoteStripStart: p.remoteStripStart,
        ...(p.rapieres ? { rapieres: p.rapieres } : {}),
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

  // État de session réécrit hors écran (MCP : poules, scores, tableau, #1880) : la sauvegarde
  // en attente est annulée et l'état est relu en base, sans écraser l'écriture du domaine.
  useEffect(() => {
    const subscribe = window.electronAPI?.onCompetitionEvent;
    if (!subscribe) return;
    return subscribe(event => {
      if (event.type !== 'session:changed') return;
      if (event.competitionId !== propsRef.current.competitionId) return;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      reloadingRef.current = true;
      void restoreState().finally(() => {
        reloadingRef.current = false;
      });
    });
  }, [restoreState]);

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
    props.appelHistory,
    props.overallRanking,
    props.tableauMatches,
    props.finalResults,
    props.consolationBrackets,
    props.skipPoolPhase,
    props.poolsLaunched,
    props.remoteArenaCount,
    props.remoteStripStart,
    props.rapieres,
    props.poolPrepParams,
    saveState,
  ]);

  /** Écrit tout de suite une sauvegarde en attente (avant une commande du moteur, #1980) */
  const flushPendingSave = useCallback(async () => {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    await saveState();
  }, [saveState]);

  return {
    isLoaded,
    restoredState,
    restoreState,
    saveState,
    flushPendingSave,
  };
};

export default useCompetitionSession;
