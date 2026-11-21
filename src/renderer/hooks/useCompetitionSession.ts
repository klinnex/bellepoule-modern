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
import type { CompetitionStateDTO } from '../../shared/api/contract';
import { useBpmClient } from '../api/BpmClientContext';
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

/** État lu : projection du moteur et ses révisions */
interface FetchedState {
  state: (Partial<CompetitionStateDTO> & Pick<CompetitionStateDTO, 'currentPoolRound'>) | null;
  sessionRevision: number;
  revision: number;
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
  // Révision du journal de l'état chargé (getCompetitionState, docs/adr/0017)
  const journalRevisionRef = useRef(0);
  const reloadInFlightRef = useRef<Promise<void> | null>(null);
  const reloadPendingRef = useRef(0);
  const client = useBpmClient();
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
  /**
   * État de l'épreuve tenu par le moteur (getCompetitionState, docs/adr/0017) avec sa révision
   * de journal ; hors moteur (navigateur, tests sans pont), lecture directe du bloc.
   */
  const fetchState = useCallback(async (): Promise<FetchedState | null> => {
    try {
      const r = await client.query('getCompetitionState', { competitionId: props.competitionId });
      // Pont sans moteur (bouchon de test) : réponse vide, lecture directe ci-dessous
      if (r && typeof r === 'object' && typeof r.revision === 'number') {
        return { state: r.state, sessionRevision: r.sessionRevision, revision: r.revision };
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'unavailable' && code !== 'unknown_operation') throw e;
    }
    if (!window.electronAPI?.db?.getSessionState) return null;
    const raw = (await window.electronAPI.db.getSessionState(props.competitionId)) as
      (SessionState & { uiState?: { currentPoolRound?: number } }) | null;
    if (!raw) return { state: null, sessionRevision: 0, revision: 0 };
    return {
      state: { ...raw, currentPoolRound: raw.uiState?.currentPoolRound || 1 },
      sessionRevision: typeof raw.revision === 'number' ? raw.revision : 0,
      revision: 0,
    };
  }, [client, props.competitionId]);

  // Restaurer l'état
  // `onlyIfChanged` (relecture sur signal) : l'état n'est appliqué que si le moteur a réécrit le
  // bloc (révision de session changée) ; sinon la saisie locale en attente est conservée
  // (un pointage avance le journal sans toucher au bloc).
  const restoreState = useCallback(
    async (onlyIfChanged = false) => {
      try {
        const fetched = await fetchState();
        if (fetched) {
          journalRevisionRef.current = Math.max(journalRevisionRef.current, fetched.revision);
          if (onlyIfChanged && fetched.sessionRevision === revisionRef.current) return;
          revisionRef.current = fetched.sessionRevision;
        }
        const state = fetched?.state;
        if (state && onlyIfChanged && saveTimerRef.current) {
          // Bloc réécrit par le moteur : la sauvegarde en attente, faite sur l'ancien, est annulée
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        if (state) {
          setRestoredState({
            currentPhase: state.currentPhase,
            pools: state.pools || [],
            poolHistory: state.poolHistory || [],
            appelHistory: state.appelHistory || [],
            overallRanking: state.overallRanking || [],
            tableauMatches: state.tableauMatches || [],
            finalResults: state.finalResults || [],
            consolationBrackets: state.consolationBrackets || [],
            currentPoolRound: state.currentPoolRound || 1,
            skipPoolPhase: state.skipPoolPhase ?? false,
            poolsLaunched: state.poolsLaunched,
            remoteArenaCount: state.remoteArenaCount,
            remoteStripStart: state.remoteStripStart,
            rapieres: state.rapieres,
            poolPrepParams: state.poolPrepParams || {
              poolCount: 0,
              minFencersPerPool: 5,
              maxFencersPerPool: 7,
            },
          });

          logger.debug(LogCategory.UI, 'Session state restored');
        }
      } catch (e) {
        logger.error(LogCategory.UI, 'Failed to restore session state', e as Error);
      } finally {
        setIsLoaded(true);
      }
    },
    [fetchState]
  );

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

  /**
   * Relecture coalescée (docs/adr/0017, étape 4a) : une relecture à la fois ; un signal reçu
   * pendant une relecture en déclenche une seule autre. `minRevision` (signal de journal) :
   * rien à faire si l'état lu est déjà à cette révision. L'état relu n'est appliqué que si le
   * moteur a réécrit le bloc ; il fait alors foi.
   */
  const requestReload = useCallback(
    (minRevision?: number) => {
      if (minRevision !== undefined && journalRevisionRef.current >= minRevision) return;
      if (reloadInFlightRef.current) {
        reloadPendingRef.current = Math.max(reloadPendingRef.current, minRevision ?? Infinity);
        return;
      }
      reloadInFlightRef.current = (async () => {
        try {
          do {
            reloadPendingRef.current = 0;
            await restoreState(true);
          } while (
            reloadPendingRef.current > 0 &&
            journalRevisionRef.current < reloadPendingRef.current
          );
        } finally {
          reloadInFlightRef.current = null;
        }
      })();
    },
    [restoreState]
  );

  // Signaux de l'épreuve par le contrat : journal:appended (révision du journal) et
  // session:changed (écritures du moteur pas encore journalisées, jusqu'à l'étape 4b).
  // Hors moteur : signal session:changed de l'ancien canal.
  useEffect(() => {
    const competitionId = props.competitionId;
    try {
      return client.subscribe('onCompetitionEvents', { competitionId }, event => {
        if (event.competitionId && event.competitionId !== competitionId) return;
        if (event.type === 'journal:appended') requestReload(event.revision ?? Infinity);
        else if (event.type === 'session:changed') requestReload();
      });
    } catch {
      const subscribe = window.electronAPI?.onCompetitionEvent;
      if (!subscribe) return;
      return subscribe(event => {
        if (event.type !== 'session:changed') return;
        if (event.competitionId !== competitionId) return;
        requestReload();
      });
    }
  }, [client, props.competitionId, requestReload]);

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
