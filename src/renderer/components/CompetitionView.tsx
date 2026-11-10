/**
 * BellePoule Modern - Competition View Component (Refactored)
 * Licensed under GPL-3.0
 */

import { GregAutoPublish } from './remote/GregAutoPublishToggle';
import { useStateGroup } from '../hooks/useStateGroup';
import { usePrintShortcut } from '../hooks/usePrintShortcut';
import {
  CV_REMOTE_INIT,
  CV_PLANNING_INIT,
  CV_SPLIT_INIT,
  CV_DATA_INIT,
} from './competition/competitionViewState';
import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import EmptyState from './common/EmptyState';
import { PoolViewSkeleton } from './Skeleton';
import { useOperation } from './common/OperationProgress';
import { PhaseEmptyIcon } from './competition/phaseIcons';
import {
  Competition,
  Fencer,
  FencerStatus,
  MatchStatus,
  Weapon,
  Referee,
  Gender,
  Pool,
} from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import FencerList from './FencerList';
import { TableauMatch, ConsolationBracket } from './tableau/tableauTypes';
import PoolRankingView from './PoolRankingView';
import ResultsView from './ResultsView';
import AddFencerModal from './AddFencerModal';
import CompetitionPropertiesModal from './CompetitionPropertiesModal';
import SplitCompetitionModal from './SplitCompetitionModal';
import {
  defaultSplitCompetitionTitle,
  extractSplitGroupRanking,
} from '../../shared/utils/splitCompetition';
import ImportModal from './ImportModal';
import PoolPrepView, { PoolPrepLaunchAction } from './PoolPrepView';
import { inferPoolsLaunched, poolsHaveScores } from './poolLaunchState';
import { persistPools } from './poolPersistence';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { useTranslation } from '../hooks/useTranslation';
import { useCompetitionSession, Phase, phaseFromNumber } from '../hooks/useCompetitionSession';
import { useFencerManagement } from '../hooks/useFencerManagement';
import { usePoolManagement } from '../hooks/usePoolManagement';
import { buildStripQrs, useExport } from '../hooks/useExport';
import { usePoolStripChange } from '../hooks/usePoolStripChange';
import { useCompetitionPhases } from '../hooks/useCompetitionPhases';
import { useRemoteCheckinSync } from '../hooks/useRemoteCheckinSync';
import { TEAM_PHASE_VIEWS, isTeamPhase } from './competition/teamPhases';
import type { TeamPhase } from './competition/teamPhases';
import { useSplitGroups } from '../hooks/useSplitGroups';
import { useCompetitionImport } from '../hooks/useCompetitionImport';
import { usePoolsWindowSize } from '../hooks/usePoolsWindowSize';
import { buildMatchAuditOptions } from './competition/matchAuditOptions';
import { CV_STYLES } from './competition/competitionViewStyles';
import { useCompetitionNavigation } from '../hooks/useCompetitionNavigation';
import { useCompetitionMenu } from '../hooks/useCompetitionMenu';
import { useRemoteScoreSync } from '../hooks/useRemoteScoreSync';
import { useCompetitionReferees } from '../hooks/useCompetitionReferees';
import { useRapieresCompetition } from '../../features/rapieres/useRapieresCompetition';
import { useMatchDbSync } from '../hooks/useMatchDbSync';
import { filterPoolWinners } from '../../shared/utils/poolCalculations';
import { seedFencersFromRanking } from '../../shared/utils/poolRounds';
import {
  applyTableauAdvancement,
  getActiveFormula,
  getTableauAdvancement,
  isRapieresMode,
  resolveCompetitionSettings,
} from '../../shared/utils/customFormulaSettings';
import { allowsVictoryTieBreak } from '../../shared/utils/tieBreak';
import { emptyRapieresTeamInfo } from '../../features/rapieres/rapieres.types';
import {
  rapieresTableauQualifiers,
  rapieresPoolNumbers,
  rapieresSemifinalists,
  mergeFinalRanking,
  RAPIERES_MAX_POOL_SIZE,
} from '../../features/rapieres/rapieresCalculations';
import RapieresTeamModal from '../../features/rapieres/RapieresTeamModal';
import RapieresTableauModeDialog from '../../features/rapieres/RapieresTableauModeDialog';
import { useRapieresSessionState } from '../../features/rapieres/useRapieresSessionState';
import RapieresImportModal from '../../features/rapieres/RapieresImportModal';
import { useRapieresTeams } from '../../features/rapieres/useRapieresTeams';
import RapieresWaveBar from '../../features/rapieres/RapieresWaveBar';
import { useRapieresViewProps } from '../../features/rapieres/useRapieresViewProps';
import RapieresRankingPanel from '../../features/rapieres/RapieresRankingPanel';
import { checkInStatusUpdate } from '../../shared/utils/forfeit';
import { ScoreAuditLog } from './ScoreAuditLog';
import CompetitionHeader from './competition/CompetitionHeader';
import CompetitionNav from './competition/CompetitionNav';
const PlanningAssistant = React.lazy(() => import('./competition/PlanningAssistant'));
const ExportCenterModal = React.lazy(() => import('./competition/ExportCenterModal'));
import { presetScale } from './pool/WindowSizePresets';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { useModalFlags } from '../hooks/useModalFlags';
import { usePoolsViewSettings } from '../hooks/usePoolsViewSettings';
import { MODAL_FLAGS } from './competition/modalFlags';
import { Button } from './common/Button';
import CompetitionExportModals from './competition/CompetitionExportModals';
import CompetitionSecondaryModals from './competition/CompetitionSecondaryModals';
import RefereesPhase from './competition/RefereesPhase';
import TableauPhase from './competition/TableauPhase';
import CompetitionPoolCard from './competition/CompetitionPoolCard';
import PoolsToolbar from './competition/PoolsToolbar';
import SinglePoolNav from './competition/SinglePoolNav';

const PoolView = React.lazy(() => import('./PoolView'));
const TableauView = React.lazy(() => import('./TableauView'));
const RemoteScoreManager = React.lazy(() => import('./RemoteScoreManager'));
const KioskDisplay = React.lazy(() => import('./KioskDisplay'));
const FencerComparison = React.lazy(() =>
  import('./FencerComparison').then(m => ({ default: m.FencerComparison }))
);
const MatchAuditLog = React.lazy(() =>
  import('./MatchAuditLog').then(m => ({ default: m.MatchAuditLog }))
);

const AnalyticsDashboard = React.lazy(() =>
  import('./AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard }))
);
const SeasonRankingView = React.lazy(() =>
  import('./SeasonRankingView').then(m => ({ default: m.SeasonRankingView }))
);
const TeamManagerView = React.lazy(() =>
  import('./TeamManagerView').then(m => ({ default: m.TeamManagerView }))
);

const FFEConnectModal = React.lazy(() => import('./FFEConnectModal'));
const FFEExportModal = React.lazy(() => import('./FFEExportModal'));
const PresentationMode = React.lazy(() =>
  import('./PresentationMode').then(m => ({ default: m.PresentationMode }))
);
const QuestPhaseView = React.lazy(() => import('./QuestPhaseView'));

interface CompetitionViewProps {
  competition: Competition;
  onUpdate: (competition: Competition) => void;
  requestPhase?: string;
  onPhaseApplied?: () => void;
  onRemoteServerChange?: (url: string | null, arenaCount: number) => void;
  onOpenCompetition?: (competitionId: string) => void;
}

// ─── Static style constants ───────────────────────────────────────────────────

const CompetitionView: React.FC<CompetitionViewProps> = ({
  competition,
  onUpdate,
  requestPhase,
  onPhaseApplied,
  onRemoteServerChange,
  onOpenCompetition,
}) => {
  const { showToast, showActionableError } = useToast();
  const { confirm } = useConfirm();
  const { runOperation } = useOperation();
  const { t, language } = useTranslation();

  // Settings avec valeurs par défaut (formule personnalisée prioritaire, #1125)
  const customFormula = getActiveFormula(competition.weapon, competition.settings);
  const effectiveSettings = resolveCompetitionSettings(competition.weapon, competition.settings);
  const poolRounds = effectiveSettings?.poolRounds ?? 1;
  const poolRoundQualifiers = competition.settings?.poolRoundQualifiers;
  const hasDirectElimination = effectiveSettings?.hasDirectElimination ?? true;
  const thirdPlaceMatch = effectiveSettings?.thirdPlaceMatch ?? false;
  const playAllPositions = competition.settings?.playAllPositions ?? false;
  const poolMaxScore = effectiveSettings?.defaultPoolMaxScore ?? 21;
  const tableMaxScore = effectiveSettings?.defaultTableMaxScore ?? 0;
  const isLaserSabre = competition.weapon === Weapon.LASER;
  const expertMode = competition.settings?.expertMode ?? true; // actif par défaut (#1501)
  // Arbitres simultanés par poule (principal + assistant/vidéo) : mode expert uniquement
  const maxRefereesPerPool = expertMode
    ? Math.max(1, competition.settings?.maxRefereesPerPool ?? 1)
    : 1;
  const maxRefereesPerMatch = expertMode
    ? Math.max(1, competition.settings?.maxRefereesPerMatch ?? 1)
    : 1;
  const poolWinnersOnly = effectiveSettings?.poolWinnersOnly ?? false;
  // Tournoi des rapières (#1118) : équipes = tireurs, poules en vagues
  const isRapieres = isRapieresMode(competition.weapon, competition.settings);
  /** Égalité tranchée par un vainqueur désigné (#1442) */
  const tieBreakByVictory = allowsVictoryTieBreak(competition.weapon, isRapieres);
  const postPoolSplitCriteria = competition.settings?.postPoolSplitCriteria;
  // Groupes déjà extraits dans une compétition séparée (genre → id compétition)
  const splitOffCompetitionIds = competition.settings?.splitOffCompetitionIds;

  const auditLogEnabled = localStorage.getItem('bellepoule-audit-log-enabled') !== 'false';
  const { getVisibleColumns } = useColumnVisibility();

  // États locaux
  const [currentPhase, setCurrentPhase] = useState<Phase>('checkin');

  useEffect(() => {
    if (requestPhase) {
      setCurrentPhase(requestPhase as Phase);
      onPhaseApplied?.();
    }
  }, [requestPhase]);

  // Modales / menus : un seul état (#1241)
  const modals = useModalFlags(MODAL_FLAGS);
  const { setShowConfetti, setShowActionsMenu } = modals;
  const {
    isRemoteActive,
    setIsRemoteActive,
    remoteServerUrl,
    setRemoteServerUrl,
    remoteArenaCount,
    setRemoteArenaCount,
    remoteStripStart,
    setRemoteStripStart,
  } = useStateGroup(CV_REMOTE_INIT);
  useEffect(() => {
    onRemoteServerChange?.(remoteServerUrl, remoteArenaCount);
  }, [remoteServerUrl, remoteArenaCount]);
  const {
    arenaStates,
    setArenaStates,
    tableauMatches,
    setTableauMatches,
    consolationBrackets,
    setConsolationBrackets,
    finalResults,
    setFinalResults,
    appelFencers,
    setAppelFencers,
    appelVisibleColumns,
    setAppelVisibleColumns,
    setTableauEditUnlocked,
    referees,
    setReferees,
  } = useStateGroup(CV_DATA_INIT);
  // Refs pour connaître la présence d'un match dans le tableau/consolante de façon synchrone
  // (mises à jour distantes : éviter le warning "Match non trouvé" côté poule pour les matchs DE)
  const tableauMatchesRef = useRef<TableauMatch[]>([]);
  const consolationBracketsRef = useRef<ConsolationBracket[]>([]);
  tableauMatchesRef.current = tableauMatches;
  consolationBracketsRef.current = consolationBrackets;
  const handleAppelStateChange = useCallback((f: Fencer[], cols: string[]) => {
    setAppelFencers(f);
    setAppelVisibleColumns(cols);
  }, []);

  // Tournoi des rapières : état de session et fenêtre d'équipe (#1241)
  const {
    rapieresState,
    setRapieresState,
    rapieresTeamModal,
    setRapieresTeamModal,
    rapieres,
    updateRapieres,
    setRapieresTeam,
  } = useRapieresSessionState();
  // Préparation des poules et classement (#1241)
  const {
    minFencersPerPool,
    setMinFencersPerPool,
    maxFencersPerPool,
    setMaxFencersPerPool,
    rankingChanged,
    setRankingChanged,
    rankingValidated,
    setRankingValidated,
    skipPoolPhase,
    setSkipPoolPhase,
  } = useStateGroup(CV_PLANNING_INIT);

  // Compétition couplée (#1241)
  const {
    activeSplitGroup,
    setActiveSplitGroup,
    pendingSplitOffGroup,
    setPendingSplitOffGroup,
    splitOffInProgress,
    setSplitOffInProgress,
    splitTableauStates,
    setSplitTableauStates,
  } = useStateGroup(CV_SPLIT_INIT);

  // Hooks personnalisés
  const {
    fencers,
    loadFencers,
    addFencer,
    bulkAddFencers,
    updateFencer,
    updateFencers,
    deleteFencer,
    deleteAllFencers,
    checkInAll,
    uncheckAll,
    getCheckedInFencers,
  } = useFencerManagement({ competition, onUpdate });

  const {
    importData,
    setImportData,
    handleImportFencers,
    handleOpenImportDialog,
    handleImportRanking,
  } = useCompetitionImport({ competition, onUpdate, bulkAddFencers });

  const {
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
    generatePools: generatePoolsHook,
    updateScore,
    resetMatch,
    cancelMatch,
    updateMatchFromRemote,
    nextPoolRound,
    computePoolRanking,
    computeOverallRanking,
    areAllPoolsComplete,
    handleFencerForfeit,
    handleUndoAbandon,
    handleBlackCardCancelled,
    syncFencersToPool,
  } = usePoolManagement({ isLaserSabre, poolMaxScore, showToast, competitionId: competition?.id });

  // Affichage des poules : grille (toutes les poules) ou poule unique avec navigation
  const {
    poolCardSize,
    setPoolCardSize,
    poolsViewMode,
    setPoolsViewMode,
    singlePoolIndex,
    setSinglePoolIndex,
  } = usePoolsViewSettings(pools.length);

  // Tours de poules (#1051) : seed du tirage = classement du tour précédent
  const previousRoundRanking = useMemo(
    () =>
      currentPoolRound > 1 && poolHistory.length > 0
        ? computeOverallRanking(poolHistory[poolHistory.length - 1])
        : null,
    [currentPoolRound, poolHistory, computeOverallRanking]
  );
  const getSeededCheckedInFencers = useCallback(() => {
    const checkedIn = getCheckedInFencers();
    return previousRoundRanking
      ? seedFencersFromRanking(checkedIn, previousRoundRanking)
      : checkedIn;
  }, [getCheckedInFencers, previousRoundRanking]);
  // Tour consulté (null = tour courant)
  const [viewedPoolRound, setViewedPoolRound] = useState<number | null>(null);
  const [showRapieresTableauDialog, setShowRapieresTableauDialog] = useState(false);
  // Appel du tour courant : éliminés des tours précédents retirés (#1051)
  const currentAppelFencers = useMemo(
    () =>
      currentPoolRound > 1 ? fencers.filter(f => f.status !== FencerStatus.ELIMINATED) : fencers,
    [fencers, currentPoolRound]
  );
  // Appel figé d'un tour terminé consulté
  const viewedRoundAppel =
    viewedPoolRound !== null && viewedPoolRound < currentPoolRound
      ? (appelHistory[viewedPoolRound - 1] ?? null)
      : null;
  const viewedRoundPools =
    viewedPoolRound !== null && viewedPoolRound < currentPoolRound
      ? (poolHistory[viewedPoolRound - 1] ?? null)
      : null;

  // Ajuste la taille de la fenêtre à l'entrée en vue "poule unique" (colonnes choisies
  // + nb de tireurs de la poule affichée) pour éviter les ascenseurs. Ne se redéclenche
  // pas à chaque changement de poule : naviguer d'une poule à l'autre ne doit pas
  // réinitialiser la taille de fenêtre choisie par l'utilisateur (cf. bug dimension reset).
  const poolsRef = useRef(pools);
  poolsRef.current = pools;
  const handleFencerForfeitRef = useRef(handleFencerForfeit);
  handleFencerForfeitRef.current = handleFencerForfeit;

  usePoolsWindowSize({
    poolsViewMode,
    currentPhase,
    pools,
    singlePoolIndex,
    getVisibleColumns,
    isLaserSabre,
  });

  const exports = useExport({
    competition,
    showToast,
    tableauMatches,
    fencers,
  });
  const {
    exportFencersList,
    exportRanking,
    exportResults,
    exportPoolsPDF,
    printPoolsPDF,
    exportResultsXML,
  } = exports;

  // Poules lancées au moins une fois (onglet Poules libéré, boutons « Relancer ») (#1499)
  const [poolsLaunched, setPoolsLaunched] = useState(false);

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
    competitionId: competition.id,
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
      .getPhasesByCompetition(competition.id)
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
  }, [isLoaded, pools.length, competition.id, restoredState]);

  // Rétablir isRemoteActive si une session est déjà en cours (ex: rechargement après phase poules)
  useEffect(() => {
    window.electronAPI.remote
      .getSession(competition.id)
      .then((result: any) => {
        if (result?.success && result?.session) setIsRemoteActive(true);
      })
      .catch(() => {});
  }, [competition.id]);

  // Charger les tireurs au montage
  useEffect(() => {
    loadFencers();
  }, [loadFencers]);

  // Charger les arbitres si la fonction est activée
  useEffect(() => {
    if (!competition.settings?.refereeFeatureEnabled) return;
    window.electronAPI.db
      .getRefereesByCompetition(competition.id)
      .then((rows: Referee[]) => setReferees(rows))
      .catch(() => {});
  }, [competition.id, competition.settings?.refereeFeatureEnabled]);

  // Synchroniser les photos/données tireurs dans les matches de poule à chaque mise à jour
  useEffect(() => {
    if (fencers.length > 0) {
      syncFencersToPool(fencers);
    }
  }, [fencers]);

  // Restaurer l'état actif de la saisie distante si le serveur tourne déjà (ex : retour sur l'onglet)
  useEffect(() => {
    if (!window.electronAPI?.remote) return;
    window.electronAPI.remote.getServerInfo(competition.id).then((res: any) => {
      if (res?.success && res.serverInfo) {
        setIsRemoteActive(true);
        setRemoteServerUrl(res.serverInfo.url);
      }
    });
  }, [competition.id]);

  // Mettre à jour l'URL du serveur distant quand il devient actif
  useEffect(() => {
    if (!isRemoteActive || !window.electronAPI?.remote) return;
    // Petit délai pour laisser le serveur démarrer si besoin
    const timer = setTimeout(() => {
      window.electronAPI.remote.getServerInfo(competition.id).then((res: any) => {
        if (res?.success && res.serverInfo) setRemoteServerUrl(res.serverInfo.url);
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [isRemoteActive, competition.id]);

  // Scores, cartons et pistes distants (#1599)
  const { fireWebhookNotif } = useRemoteScoreSync({
    competitionId: competition.id,
    competitionTitle: competition.title,
    isRemoteActive,
    tableauMatchesRef,
    consolationBracketsRef,
    poolsRef,
    handleFencerForfeitRef,
    setTableauMatches,
    setConsolationBrackets,
    setArenaStates,
    updateMatchFromRemote,
    handleBlackCardCancelled,
    updateFencer,
  });

  // Sync scores/statuts de poule et matchs de tableau vers la DB (#1599)
  useMatchDbSync({
    competitionId: competition.id,
    pools,
    tableauMatches,
    isLoaded,
    tableMaxScore: effectiveSettings?.defaultTableMaxScore,
  });

  // Menu natif
  useCompetitionMenu({
    competitionId: competition.id,
    competitionTitle: competition.title,
    currentPhase,
    fencers,
    hasPools: pools.length > 0,
    overallRanking,
    finalResults,
    isLaserSabre,
    exports,
    loadFencers,
    setImportData,
    setShowPropertiesModal: modals.setShowPropertiesModal,
    setShowAddFencerModal: modals.setShowAddFencerModal,
  });

  // Persister les poules générées dans les tables DB (pools, pool_fencers, matches)
  const persistPoolsToDB = useCallback(
    (generatedPools: Pool[]) => persistPools(competition.id, generatedPools),
    [competition.id]
  );

  // Handlers
  const handleCheckInFencer = (id: string) => {
    const fencer = fencers.find(f => f.id === id);
    if (fencer) {
      const newStatus =
        fencer.status === FencerStatus.CHECKED_IN
          ? FencerStatus.NOT_CHECKED_IN
          : FencerStatus.CHECKED_IN;
      updateFencer(id, { status: newStatus });
    }
  };

  /** Alerte « scores perdus » avant de régénérer des poules déjà saisies (#1499) */
  const confirmScoresLoss = async (): Promise<boolean> =>
    !poolsHaveScores(pools) || (await confirm(t('pools.relaunch_confirm')));

  const handleGeneratePools = async () => {
    if (!(await confirmScoresLoss())) return;
    const newPools = generatePoolsHook(getSeededCheckedInFencers(), currentPoolRound);
    if (newPools) {
      resetRapieresWaves(newPools);
      await persistPoolsToDB(newPools);
      // Fermer l'inscription distante dès que les poules sont générées
      if (isRemoteActive && window.electronAPI?.remote?.setRegistrationEnabled) {
        window.electronAPI.remote.setRegistrationEnabled(competition.id, false).catch(() => {});
        window.electronAPI.remote.setCheckinEnabled?.(competition.id, false).catch(() => {});
      }
      setCurrentPhase('poolprep');
    }
  };

  // ─── Tournoi des rapières : équipes enregistrées comme tireurs (#1118) ─────
  const rapieresViewProps = useRapieresViewProps(rapieres.teams, t); // appel + préparation (#1441)
  const rapieresTeams = useRapieresTeams({
    competitionDate: competition.date,
    addFencer,
    bulkAddFencers,
    updateFencer,
    setRapieresTeam,
  });
  const { rapieresFencerFields, handleSaveRapieresTeam } = rapieresTeams;

  const {
    resetRapieresWaves,
    rapieresStats,
    currentWaveMatchIds,
    printWaves,
    handlePrintWaveSheets,
  } = useRapieresCompetition({
    competitionId: competition.id,
    competitionTitle: competition.title,
    isRapieres,
    isLoaded,
    isRemoteActive,
    fencers,
    pools,
    overallRanking,
    rapieres,
    rapieresState,
    setRapieresState,
    updateRapieres,
    bulkAddFencers,
    rapieresFencerFields,
  });

  // Saisie distante active : QR de la piste sur chaque feuille de poule (#1037)
  const poolsRemoteInfo =
    isRemoteActive && remoteServerUrl
      ? { serverUrl: remoteServerUrl, arenaCount: remoteArenaCount, stripStart: remoteStripStart }
      : undefined;

  const handleExportAllPoolsPDF = () => {
    exportPoolsPDF(pools, currentPoolRound, poolsRemoteInfo);
  };

  const handlePrintAllPoolsPDF = () => {
    printPoolsPDF(pools, currentPoolRound, poolsRemoteInfo);
  };

  // Ctrl+P / Cmd+P → imprimer les feuilles de poule (le tableau gère son propre raccourci)
  usePrintShortcut(currentPhase === 'pools' && pools.length > 0, handlePrintAllPoolsPDF);

  const {
    handleQuestConfigUpdate,
    handleGoToRanking,
    handleSkipToRanking,
    handleGoToTableau,
    handleRapieresTableauMode,
    handleThirdPlaceDecision,
    handleNextPoolRound,
  } = useCompetitionNavigation({
    competition,
    onUpdate,
    setCurrentPhase,
    fencers,
    updateFencers,
    getCheckedInFencers,
    pools,
    setPools,
    overallRanking,
    setOverallRanking,
    computeOverallRanking,
    nextPoolRound,
    currentPoolRound,
    currentAppelFencers,
    poolRoundQualifiers,
    customFormula,
    hasDirectElimination,
    thirdPlaceMatch,
    playAllPositions,
    isRapieres,
    updateRapieres,
    setShowRapieresTableauDialog,
    setShowThirdPlaceDialog: modals.setShowThirdPlaceDialog,
    setPoolsLaunched,
    setViewedPoolRound,
    setRankingValidated,
    setSkipPoolPhase,
    rankingChanged,
    setRankingChanged,
    tableauMatches,
    setTableauMatches,
    consolationBrackets,
    setConsolationBrackets,
    finalResults,
    setFinalResults,
    activeSplitGroup,
    setActiveSplitGroup,
    splitTableauStates,
    setSplitTableauStates,
  });
  const { splitGroups, handleSwitchSplitGroup, handleSplitOff, createSplitOffCompetition } =
    useSplitGroups({
      competition,
      onUpdate,
      onOpenCompetition,
      setCurrentPhase,
      overallRanking,
      tableauMatches,
      setTableauMatches,
      consolationBrackets,
      setConsolationBrackets,
      finalResults,
      setFinalResults,
      activeSplitGroup,
      setActiveSplitGroup,
      setPendingSplitOffGroup,
      splitOffInProgress,
      setSplitOffInProgress,
      splitTableauStates,
      setSplitTableauStates,
    });

  const questConfig = competition.settings?.questConfig;
  const questEnabled = isLaserSabre && questConfig?.enabled === true;
  const questNoPool = questEnabled && !questConfig?.hasPreliminaryPools;

  // Arbitres proposés au remplissage automatique (tests) — uniquement si la gestion des arbitres est active
  const autoFillReferees = competition.settings?.refereeFeatureEnabled ? referees : undefined;

  const {
    applyPoolRefereeAssignments,
    handlePoolAutoFillReferees,
    handlePoolRefereeAssigned,
    refereeAssignableMatches,
  } = useCompetitionReferees({
    competitionId: competition.id,
    pools,
    setPools,
    referees,
    setReferees,
    tableauMatches,
    setTableauMatches,
    consolationBrackets,
    setConsolationBrackets,
    tableMaxScore,
  });

  const isTeamEvent = !!competition.isTeamEvent;
  const { phases, handleGoBack, canAdvanceFromPools, isLastPoolRound } = useCompetitionPhases({
    isTeamEvent,
    currentPhase,
    setCurrentPhase,
    setRankingValidated,
    rankingValidated,
    skipPoolPhase,
    poolsLaunched,
    pools,
    poolHistory,
    areAllPoolsComplete,
    isRapieres,
    rapieresWavesEnded: rapieres.wavesEnded,
    currentPoolRound,
    poolRounds,
    hasDirectElimination,
    finalResults,
    tableauMatches,
    questEnabled,
    questNoPool,
    questConfig,
    auditLogEnabled,
    refereeFeatureEnabled: !!competition.settings?.refereeFeatureEnabled,
  });
  useRemoteCheckinSync({
    competitionId: competition.id,
    currentPhase,
    isRemoteActive,
    remoteServerUrl,
    loadFencers,
    setReferees,
  });

  const getPoolsNextAction = () => {
    if (!canAdvanceFromPools) return null;

    // Tour intermédiaire : classement du tour d'abord, passage au tour suivant depuis
    // l'écran de classement (#1051)
    return {
      label: t('pools.view_ranking_action'),
      action: handleGoToRanking,
    };
  };

  const poolsNextAction = getPoolsNextAction();
  const [poolPrepLaunch, setPoolPrepLaunch] = useState<PoolPrepLaunchAction | null>(null);

  // Confetti + menu état
  const prevAllPoolsComplete = useRef(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  // Détecter complétion des poules → confetti
  useEffect(() => {
    const allDone = canAdvanceFromPools && pools.length > 0;
    if (allDone && !prevAllPoolsComplete.current) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3200);
    }
    prevAllPoolsComplete.current = allDone;
  }, [canAdvanceFromPools, pools.length, setShowConfetti]);

  // Fermer le menu actions au clic extérieur
  useEffect(() => {
    if (!modals.showActionsMenu) return;
    const handler = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modals.showActionsMenu, setShowActionsMenu]);

  // Classement effectif pour le tableau (filtré par vainqueurs de poule et/ou groupe actif)
  const effectiveTableauRanking = useMemo(() => {
    let ranking = overallRanking;
    if (isRapieres && pools.length > 0) {
      // Rapières : toutes les équipes, ou les 4 demi-finalistes (#1441)
      ranking = rapieresTableauQualifiers(pools, ranking, rapieres.tableauMode);
    } else if (poolWinnersOnly && pools.length > 0) {
      ranking = filterPoolWinners(pools, ranking);
    } else if (customFormula) {
      // Qualifiés pour le tableau selon la formule (pourcentage, nombre, taille de tableau)
      ranking = applyTableauAdvancement(ranking, getTableauAdvancement(customFormula));
    }
    if (postPoolSplitCriteria === 'gender' && activeSplitGroup) {
      ranking = ranking
        .filter(r => (r.fencer.gender as string) === activeSplitGroup)
        .map((r, i) => ({ ...r, rank: i + 1 }));
    } else if (postPoolSplitCriteria === 'gender' && splitOffCompetitionIds) {
      // Groupes extraits dans une compétition séparée : exclus du tableau de cette compétition
      ranking = ranking
        .filter(r => !splitOffCompetitionIds[r.fencer.gender as string])
        .map((r, i) => ({ ...r, rank: i + 1 }));
    }
    return ranking;
  }, [
    overallRanking,
    pools,
    isRapieres,
    rapieres.tableauMode,
    poolWinnersOnly,
    customFormula,
    postPoolSplitCriteria,
    activeSplitGroup,
    splitOffCompetitionIds,
  ]);

  // Calcul progression matchs
  const matchProgress = useMemo(() => {
    if (pools.length === 0 && tableauMatches.length === 0) return null;
    if (pools.length > 0) {
      const total = pools.reduce((s, p) => s + p.matches.length, 0);
      const done = pools.reduce(
        (s, p) => s + p.matches.filter(m => m.status === MatchStatus.FINISHED).length,
        0
      );
      return { done, total, label: 'poules' };
    }
    if (tableauMatches.length > 0) {
      const total = tableauMatches.filter(m => m.fencerA && m.fencerB).length;
      const done = tableauMatches.filter(m => m.winner !== null).length;
      return { done, total, label: 'tableau' };
    }
    return null;
  }, [pools, tableauMatches]);

  // Matchs + arbitres assignés pour l'onglet Historique
  const matchAuditOptions = useMemo(
    () =>
      buildMatchAuditOptions(
        [...poolHistory.flat(), ...pools],
        [...tableauMatches, ...consolationBrackets.flatMap(b => b.matches)],
        competition.id
      ),
    [poolHistory, pools, tableauMatches, consolationBrackets, competition.id]
  );

  // Tireurs déjà placés dans une poule (exclus de l'ajout en cours de compétition)
  const assignedPoolFencerIds = useMemo(
    () => new Set(pools.flatMap(p => p.fencers.map(f => f.id))),
    [pools]
  );

  // Rendu d'une carte de poule (réutilisé par la vue grille et la vue poule unique)
  // Pools en consultation : tour sélectionné, ou dernier tour terminé pendant l'appel (#1051)
  const historyPoolsToShow =
    viewedRoundPools ??
    (pools.length === 0 && poolHistory.length > 0 ? poolHistory[poolHistory.length - 1] : null);

  // Sélecteur de tour (#1051) : visible dès qu'un tour est terminé
  const poolRoundSelector =
    poolRounds > 1 && poolHistory.length > 0 ? (
      <div style={CV_STYLES.roundSelector}>
        <label htmlFor="pool-round-select" style={{ fontWeight: 600 }}>
          {t('pools.round_select_label')}
        </label>
        <select
          id="pool-round-select"
          className="form-input"
          style={{ width: 'auto', fontWeight: 600 }}
          value={viewedPoolRound ?? currentPoolRound}
          onChange={e => {
            const r = Number(e.target.value);
            setViewedPoolRound(r === currentPoolRound ? null : r);
          }}
        >
          {Array.from({ length: currentPoolRound }, (_, i) => i + 1).map(r => (
            <option key={r} value={r}>
              {t('pools.round_option', { n: r })}
              {r === currentPoolRound ? ` (${t('pools.round_current')})` : ''}
            </option>
          ))}
        </select>
      </div>
    ) : null;

  const handlePoolStripChange = usePoolStripChange(competition.id, pools, setPools);

  const stripQrs = buildStripQrs(pools, poolsRemoteInfo);
  const renderPoolCard = (pool: (typeof pools)[number], poolIndex: number) => (
    <CompetitionPoolCard
      key={pool.id}
      pool={pool}
      poolIndex={poolIndex}
      weapon={competition.weapon}
      competitionId={competition.id}
      competitionTitle={competition.title}
      tieBreakByVictory={tieBreakByVictory}
      poolMaxScore={poolMaxScore}
      maxRefereesPerPool={maxRefereesPerPool}
      updateScore={updateScore}
      resetMatch={resetMatch}
      cancelMatch={cancelMatch}
      handleFencerForfeit={handleFencerForfeit}
      computePoolRanking={computePoolRanking}
      setPools={setPools}
      updateFencer={updateFencer}
      fireWebhookNotif={fireWebhookNotif}
      assignedPoolFencerIds={assignedPoolFencerIds}
      remoteStripStart={remoteStripStart}
      remoteArenaCount={remoteArenaCount}
      onStripChange={handlePoolStripChange}
      arenaStates={arenaStates}
      isRemoteActive={isRemoteActive}
      remoteServerUrl={remoteServerUrl}
      poolCardSize={poolCardSize}
      stripQrs={stripQrs}
      autoFillReferees={autoFillReferees}
      onAutoFillReferees={handlePoolAutoFillReferees}
      onRefereeAssigned={handlePoolRefereeAssigned}
      waveMatchIds={currentWaveMatchIds}
    />
  );

  return (
    <div style={CV_STYLES.root}>
      <CompetitionHeader
        competition={competition}
        language={language}
        t={t}
        matchProgress={matchProgress}
        showConfetti={modals.showConfetti}
        showActionsMenu={modals.showActionsMenu}
        setShowActionsMenu={modals.setShowActionsMenu}
        actionsMenuRef={actionsMenuRef}
        currentPhase={currentPhase}
        pools={pools}
        tableauMatches={tableauMatches}
        fencersCount={fencers.length}
        checkedInCount={getCheckedInFencers().length}
        setShowFencerComparison={modals.setShowFencerComparison}
        setShowAnalytics={modals.setShowAnalytics}
        setShowSeasonRanking={modals.setShowSeasonRanking}
        setShowQRCode={modals.setShowQRCode}
        setShowPresentation={modals.setShowPresentation}
        setShowKiosk={modals.setShowKiosk}
        setShowKioskDisplay={modals.setShowKioskDisplay}
        setShowPropertiesModal={modals.setShowPropertiesModal}
        setShowExportCenter={modals.setShowExportCenter}
        onOpenRemote={() => setCurrentPhase('remote')}
      />
      <CompetitionNav
        competition={competition}
        phases={phases}
        currentPhase={currentPhase}
        setCurrentPhase={setCurrentPhase}
        language={language}
        t={t}
        handleGoBack={handleGoBack}
        handleGeneratePools={handleGeneratePools}
        poolsNextAction={poolsNextAction}
        poolPrepLaunch={currentPhase === 'poolprep' ? poolPrepLaunch : null}
        questEnabled={questEnabled}
        questConfig={questConfig}
        fencers={fencers}
        getCheckedInFencers={getCheckedInFencers}
        pools={pools}
        tableauMatches={tableauMatches}
        onOpenPlanningAssistant={() => modals.setShowPlanningAssistant(true)}
        isTeamEvent={isTeamEvent}
        tourReady={isLoaded}
        remoteActive={isRemoteActive}
        poolsLaunched={poolsLaunched}
      />

      {/* Content — keyed pour animation de transition */}
      <div key={currentPhase} className="phase-content" style={CV_STYLES.phaseContent}>
        {currentPhase === 'checkin' && currentPoolRound > 1 && pools.length === 0 && (
          <div className="alert alert-info" role="status" style={{ margin: '0.75rem 1rem 0' }}>
            {t('pools.round_checkin_banner', { n: currentPoolRound })}
          </div>
        )}
        {currentPhase === 'checkin' && poolRoundSelector}
        {currentPhase === 'checkin' && viewedRoundAppel && (
          <FencerList
            key={`appel-round-${viewedPoolRound}`}
            fencers={viewedRoundAppel}
            competitionId={competition.id}
            onCheckIn={() => {}}
            onAddFencer={() => {}}
            readOnly
          />
        )}
        {currentPhase === 'checkin' && !viewedRoundAppel && (
          <FencerList
            fencers={currentAppelFencers}
            competitionId={competition.id}
            onCheckIn={handleCheckInFencer}
            onAddFencer={() =>
              isRapieres ? setRapieresTeamModal({}) : modals.setShowAddFencerModal(true)
            }
            {...(isRapieres
              ? {
                  ...rapieresViewProps.appel,
                  onEditRequest: (fencer: Fencer) => setRapieresTeamModal({ fencer }),
                  ...rapieresTeams.importButtons,
                }
              : {})}
            registerUrl={
              isRemoteActive && remoteServerUrl ? `${remoteServerUrl}/register` : undefined
            }
            onEditFencer={updateFencer}
            onDeleteFencer={deleteFencer}
            onDeleteAllFencers={deleteAllFencers}
            onCheckInAll={checkInAll}
            onUncheckAll={uncheckAll}
            onImport={isRapieres ? undefined : type => handleOpenImportDialog(type)}
            onImportFFEConnect={isRapieres ? undefined : () => modals.setShowFFEConnect(true)}
            onFencersImported={loadFencers}
            onAppelStateChange={handleAppelStateChange}
            onSetFencerStatus={(id, status) => {
              const update = checkInStatusUpdate(pools, id, status); // DNS (#1256), avant annulation
              // Si forfait, abandon ou exclusion, mettre à jour tous les matchs du tireur
              if (status === FencerStatus.FORFAIT) {
                handleFencerForfeit(id, 'forfait');
              } else if (status === FencerStatus.ABANDONED) {
                handleFencerForfeit(id, 'abandon');
              } else if (status === FencerStatus.EXCLUDED) {
                handleFencerForfeit(id, 'exclusion');
              } else if (status === FencerStatus.CHECKED_IN) {
                // Si réactivation depuis un statut spécial, restaurer les matchs affectés
                const currentFencer = fencers.find(f => f.id === id);
                const wasInSpecialStatus =
                  currentFencer?.status === FencerStatus.ABANDONED ||
                  currentFencer?.status === FencerStatus.FORFAIT ||
                  currentFencer?.status === FencerStatus.EXCLUDED;
                if (wasInSpecialStatus) handleUndoAbandon(id);
              }
              updateFencer(id, update);
            }}
          />
        )}

        {isTeamEvent && isTeamPhase(currentPhase) && (
          <Suspense fallback={null}>
            <TeamManagerView
              competition={competition}
              fencers={fencers}
              view={TEAM_PHASE_VIEWS[currentPhase]}
              onNavigate={v =>
                setCurrentPhase(
                  (Object.keys(TEAM_PHASE_VIEWS) as TeamPhase[]).find(
                    k => TEAM_PHASE_VIEWS[k] === v
                  ) ?? 'teams'
                )
              }
            />
          </Suspense>
        )}
        {currentPhase === 'poolprep' && (
          <PoolPrepView
            fencers={getSeededCheckedInFencers()}
            initialPools={pools.length > 0 ? pools : undefined}
            maxScore={poolMaxScore}
            minFencersPerPool={isRapieres ? 2 : minFencersPerPool}
            maxFencersPerPool={isRapieres ? RAPIERES_MAX_POOL_SIZE : maxFencersPerPool}
            {...(isRapieres ? rapieresViewProps.poolPrep : {})}
            expertMode={expertMode}
            arenaCount={remoteArenaCount}
            stripStart={remoteStripStart}
            onStripChange={handlePoolStripChange}
            poolsLaunched={poolsLaunched}
            onPoolsConfirm={async confirmedPools => {
              if (!(await confirmScoresLoss())) return;
              setPoolsLaunched(true);
              resetRapieresWaves(confirmedPools);
              setPools(confirmedPools);
              setSkipPoolPhase(false);
              setCurrentPhase('pools');
              // Les poules peuvent avoir été régénérées/modifiées en préparation :
              // les persister pour que les saisies (tablette, UI) alimentent l'historique (#907)
              await persistPoolsToDB(confirmedPools);
              confirmedPools.forEach(pool => {
                if (pool.strip != null) window.electronAPI?.db?.updatePool(pool);
              });
            }}
            onSkipPools={handleSkipToRanking}
            onLaunchActionChange={setPoolPrepLaunch}
            onSettingsChange={(min, max) => {
              setMinFencersPerPool(min);
              setMaxFencersPerPool(max);
            }}
          />
        )}

        {currentPhase === 'pools' && (
          <div className="content">
            {poolRoundSelector}
            {historyPoolsToShow ? (
              <div
                style={{
                  display: 'grid',
                  gap: '2rem',
                  width: '100%',
                  boxSizing: 'border-box',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 480px), 1fr))',
                }}
              >
                <Suspense fallback={null}>
                  {historyPoolsToShow.map(pool => (
                    <div key={pool.id} style={{ minWidth: 0, overflow: 'auto' }}>
                      {/* Tour terminé : consultation seule */}
                      <div inert>
                        <PoolView
                          pool={pool}
                          weapon={competition.weapon}
                          tieBreakByVictory={tieBreakByVictory}
                          competitionName={competition.title}
                          maxScore={poolMaxScore}
                          competitionId={competition.id}
                          onScoreUpdate={() => {}}
                        />
                      </div>
                    </div>
                  ))}
                </Suspense>
              </div>
            ) : pools.length === 0 ? (
              <EmptyState
                icon={<PhaseEmptyIcon />}
                title={t('competitionView.no_pools')}
                description={t('competitionView.no_pools_hint')}
                actionLabel={t('competitionView.back_checkin')}
                onAction={() => setCurrentPhase('checkin')}
              />
            ) : (
              <>
                {isRapieres && (
                  <RapieresWaveBar
                    pools={pools}
                    launchedWave={rapieres.launchedWave}
                    wavesEnded={rapieres.wavesEnded}
                    onLaunchWave={wave => updateRapieres({ launchedWave: wave })}
                    onEndWaves={async () => {
                      if (!(await confirm(t('rapieres.confirm_end_waves')))) return;
                      updateRapieres({ wavesEnded: true });
                      setOverallRanking(computeOverallRanking(pools));
                      setCurrentPhase('ranking');
                    }}
                    onResumeWaves={() => updateRapieres({ wavesEnded: false })}
                    onPrintWaveSheets={handlePrintWaveSheets}
                    onPrintWaveRange={printWaves}
                  />
                )}
                <PoolsToolbar
                  isLaserSabre={isLaserSabre}
                  poolCardSize={poolCardSize}
                  onPoolCardSizeChange={setPoolCardSize}
                  poolsViewMode={poolsViewMode}
                  onPoolsViewModeChange={setPoolsViewMode}
                  poolCount={pools.length}
                  onPrintAll={handlePrintAllPoolsPDF}
                  onExportAll={handleExportAllPoolsPDF}
                />
                {poolsViewMode === 'single' ? (
                  <>
                    <SinglePoolNav
                      pools={pools}
                      singlePoolIndex={singlePoolIndex}
                      setSinglePoolIndex={setSinglePoolIndex}
                    />
                    {/* Largeur ajustée au contenu, plafonnée (#1502) ; la taille de carte agit comme un zoom (#1124) */}
                    <div style={{ width: '100%', overflowX: 'auto' }}>
                      <div
                        className="pools-single-card"
                        style={{
                          maxWidth: `${100 / presetScale(poolCardSize)}%`,
                          zoom: presetScale(poolCardSize),
                        }}
                      >
                        <Suspense fallback={null}>
                          {pools[singlePoolIndex] &&
                            renderPoolCard(pools[singlePoolIndex], singlePoolIndex)}
                        </Suspense>
                      </div>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gap: '2rem',
                      width: '100%',
                      boxSizing: 'border-box',
                      gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${Math.round(Math.max(480, 280 + (pools[0]?.fencers?.length ?? 6) * 38) * presetScale(poolCardSize))}px), 1fr))`,
                    }}
                  >
                    <Suspense fallback={<PoolViewSkeleton />}>
                      {pools.map((pool, poolIndex) => renderPoolCard(pool, poolIndex))}
                    </Suspense>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {currentPhase === 'ranking' && poolRoundSelector}
        {currentPhase === 'ranking' && viewedRoundPools && (
          <PoolRankingView
            key={`round-${viewedPoolRound}`}
            pools={viewedRoundPools}
            ranking={computeOverallRanking(viewedRoundPools)}
            weapon={competition.weapon}
            hasDirectElimination={hasDirectElimination}
            rapieres={isRapieres}
          />
        )}
        {currentPhase === 'ranking' && !viewedRoundPools && (
          <PoolRankingView
            pools={pools}
            ranking={overallRanking}
            weapon={competition.weapon}
            hasDirectElimination={hasDirectElimination}
            isInitialRanking={skipPoolPhase}
            rapieres={isRapieres}
            onGoToTableau={handleGoToTableau}
            onGoToResults={() => setCurrentPhase('results')}
            onPoolsChange={(updatedPools, hasRankingChanged) => {
              setPools(updatedPools);
              if (hasRankingChanged) {
                setRankingChanged(true);
              }
            }}
            onRankingChange={ranking => setOverallRanking(ranking)}
            poolWinnersOnly={poolWinnersOnly}
            splitCriteria={postPoolSplitCriteria}
            splitOffGroups={splitOffCompetitionIds}
            onSplitOff={handleSplitOff}
            nextRoundAction={
              !isLastPoolRound && pools.length > 0 && canAdvanceFromPools
                ? {
                    label: t('pools.next_round_n', { n: currentPoolRound + 1 }),
                    onClick: handleNextPoolRound,
                  }
                : undefined
            }
          />
        )}
        {currentPhase === 'ranking' && isRapieres && !viewedRoundPools && (
          <RapieresRankingPanel
            competitionTitle={competition.title}
            wave={rapieres.launchedWave}
            ranked={overallRanking.map(r => ({ teamId: r.fencer.id, rank: r.rank }))}
            fencers={fencers}
            teams={rapieres.teams}
            stats={rapieresStats}
            poolOf={rapieresPoolNumbers(pools)}
          />
        )}

        {questEnabled && questConfig && (
          <div style={currentPhase === 'quest' ? undefined : CV_STYLES.questWrapper}>
            <Suspense fallback={null}>
              <QuestPhaseView
                fencers={(() => {
                  const checked = getCheckedInFencers();
                  if (questConfig.hasPreliminaryPools && questConfig.qualifiersCount) {
                    return overallRanking
                      .slice(0, questConfig.qualifiersCount)
                      .map(r => r.fencer)
                      .filter(Boolean);
                  }
                  return checked;
                })()}
                questConfig={questConfig}
                competitionWeapon={competition.weapon}
                maxScore={poolMaxScore}
                onQuestComplete={ranking => {
                  if (!questConfig.hasPreliminaryPools) {
                    setOverallRanking(ranking);
                  } else {
                    // Fusionner qualifiés re-classés par quest + non-qualifiés du classement poules
                    const questFencerIds = new Set(ranking.map(r => r.fencer?.id).filter(Boolean));
                    const nonQualifiers = overallRanking
                      .filter(r => !questFencerIds.has(r.fencer?.id))
                      .map((r, i) => ({ ...r, rank: ranking.length + i + 1 }));
                    setOverallRanking([...ranking, ...nonQualifiers]);
                  }
                  setRankingValidated(true);
                  setCurrentPhase('ranking');
                }}
                onConfigUpdate={handleQuestConfigUpdate}
              />
            </Suspense>
          </div>
        )}

        {currentPhase === 'tableau' && (
          <TableauPhase
            competitionId={competition.id}
            postPoolSplitCriteria={postPoolSplitCriteria}
            activeSplitGroup={activeSplitGroup}
            splitGroups={splitGroups}
            onSwitchSplitGroup={handleSwitchSplitGroup}
            ranking={effectiveTableauRanking}
            tableauMatches={tableauMatches}
            setTableauMatches={setTableauMatches}
            consolationBrackets={consolationBrackets}
            setConsolationBrackets={setConsolationBrackets}
            finalResults={finalResults}
            setFinalResults={setFinalResults}
            setTableauEditUnlocked={setTableauEditUnlocked}
            setCurrentPhase={setCurrentPhase}
            tableMaxScore={tableMaxScore}
            thirdPlaceMatch={thirdPlaceMatch}
            playAllPositions={playAllPositions}
            remoteArenaCount={remoteArenaCount}
            remoteStripStart={remoteStripStart}
            isRemoteActive={isRemoteActive}
            maxRefereesPerMatch={maxRefereesPerMatch}
            autoFillReferees={autoFillReferees}
            tieBreakByVictory={tieBreakByVictory}
            updateFencer={updateFencer}
          />
        )}

        {currentPhase === 'results' && (
          <ResultsView
            competition={competition}
            poolRanking={effectiveTableauRanking}
            finalResults={finalResults}
            fencers={fencers}
            pools={[...poolHistory.flat(), ...pools]}
            tableauMatches={tableauMatches}
            consolationBrackets={consolationBrackets}
            isLaserSabre={isLaserSabre}
            appelFencers={appelFencers.length > 0 ? appelFencers : undefined}
            appelHistory={appelHistory}
            appelVisibleColumns={appelVisibleColumns.length > 0 ? appelVisibleColumns : undefined}
          />
        )}
        {currentPhase === 'results' && isRapieres && (
          <RapieresRankingPanel
            competitionTitle={competition.title}
            final={finalResults.length > 0}
            wave={rapieres.launchedWave}
            ranked={mergeFinalRanking(finalResults, overallRanking)}
            fencers={fencers}
            teams={rapieres.teams}
            stats={rapieresStats}
          />
        )}
        {currentPhase === 'remote' && (
          <GregAutoPublish
            competitionId={competition.id}
            publish={() => void exportResultsXML(overallRanking, finalResults, pools, 'greg-auto')}
          />
        )}
        <Suspense fallback={null}>
          <RemoteScoreManager
            competition={competition}
            pools={pools}
            tableauMatches={tableauMatches}
            consolationBrackets={consolationBrackets}
            initialStripCount={remoteArenaCount}
            initialStripStart={remoteStripStart}
            onArenaCountChange={setRemoteArenaCount}
            onStripStartChange={setRemoteStripStart}
            onStartRemote={() => setIsRemoteActive(true)}
            onStopRemote={() => {
              setIsRemoteActive(false);
              setArenaStates([]);
              setRemoteServerUrl(null);
            }}
            onServerStarted={setRemoteServerUrl}
            isRemoteActive={isRemoteActive}
            isVisible={currentPhase === 'remote'}
          />
        </Suspense>

        {currentPhase === 'logs' && (
          <>
            <ScoreAuditLog competitionId={competition.id} matchOptions={matchAuditOptions} />
            <Suspense fallback={null}>
              <MatchAuditLog
                competitionId={competition.id}
                competitionName={competition.title}
                matchOptions={matchAuditOptions}
              />
            </Suspense>
          </>
        )}

        {currentPhase === 'referees' && competition.settings?.refereeFeatureEnabled && (
          <RefereesPhase
            competition={competition}
            referees={referees}
            setReferees={setReferees}
            pools={pools}
            poolHistory={poolHistory}
            assignableMatches={refereeAssignableMatches}
            tableauMatches={tableauMatches}
            setTableauMatches={setTableauMatches}
            consolationBrackets={consolationBrackets}
            setConsolationBrackets={setConsolationBrackets}
            applyPoolRefereeAssignments={applyPoolRefereeAssignments}
          />
        )}
      </div>

      {/* Modals */}
      <CompetitionExportModals
        modals={modals}
        competition={competition}
        currentPhase={currentPhase}
        setCurrentPhase={setCurrentPhase}
        fencers={fencers}
        pools={pools}
        currentPoolRound={currentPoolRound}
        overallRanking={overallRanking}
        finalResults={finalResults}
        tableauMatches={tableauMatches}
        consolationBrackets={consolationBrackets}
        arenaCount={arenaStates.length}
        isLaserSabre={isLaserSabre}
        exports={exports}
        poolsRemoteInfo={poolsRemoteInfo}
      />

      {rapieresTeams.rapieresImportModal && (
        <RapieresImportModal {...rapieresTeams.rapieresImportModal} />
      )}
      {rapieresTeamModal && (
        <RapieresTeamModal
          initial={
            rapieresTeamModal.fencer
              ? {
                  name: rapieresTeamModal.fencer.lastName,
                  info: rapieres.teams[rapieresTeamModal.fencer.id] ?? emptyRapieresTeamInfo(),
                }
              : undefined
          }
          onSave={team => handleSaveRapieresTeam(team, rapieresTeamModal.fencer)}
          onClose={() => setRapieresTeamModal(null)}
        />
      )}

      {modals.showAddFencerModal && (
        <AddFencerModal
          onClose={() => modals.setShowAddFencerModal(false)}
          onAdd={fencer => addFencer(fencer as any)}
          competitionGender={competition.gender}
        />
      )}

      {pendingSplitOffGroup && (
        <SplitCompetitionModal
          groupLabel={
            pendingSplitOffGroup === Gender.FEMALE
              ? t('genders.female')
              : pendingSplitOffGroup === Gender.MALE
                ? t('genders.male')
                : pendingSplitOffGroup
          }
          fencerCount={extractSplitGroupRanking(overallRanking, pendingSplitOffGroup).length}
          defaultTitle={defaultSplitCompetitionTitle(competition.title, pendingSplitOffGroup)}
          onConfirm={title => createSplitOffCompetition(pendingSplitOffGroup, title)}
          onCancel={() => setPendingSplitOffGroup(null)}
        />
      )}

      {modals.showPropertiesModal && (
        <CompetitionPropertiesModal
          competition={competition}
          onSave={async updates => {
            const updatedCompetition = { ...competition, ...updates };
            // Mettre à jour l'UI immédiatement avant l'écriture DB pour éviter le flash
            onUpdate(updatedCompetition);
            if (window.electronAPI) {
              await window.electronAPI.db.updateCompetition(competition.id, updatedCompetition);
            }
          }}
          onClose={() => modals.setShowPropertiesModal(false)}
        />
      )}

      {importData && (
        <ImportModal
          format={importData.format}
          filepath={importData.filepath}
          content={importData.content}
          fencers={fencers}
          onImport={handleImportFencers}
          onImportRanking={handleImportRanking}
          onClose={() => setImportData(null)}
        />
      )}

      {showRapieresTableauDialog && (
        <RapieresTableauModeDialog
          semisAvailable={!!rapieresSemifinalists(pools, overallRanking)}
          onChoose={handleRapieresTableauMode}
          onClose={() => setShowRapieresTableauDialog(false)}
        />
      )}

      {modals.showThirdPlaceDialog && (
        <div className="modal-overlay" style={CV_STYLES.thirdPlaceOverlay}>
          <div style={CV_STYLES.thirdPlaceModal}>
            <h3 style={CV_STYLES.thirdPlaceTitle}>{t('competition.third_place_match_dialog')}</h3>
            <div style={CV_STYLES.thirdPlaceBtnRow}>
              <Button onClick={() => handleThirdPlaceDecision(false)}>{t('actions.no')}</Button>
              <Button variant="primary" onClick={() => handleThirdPlaceDecision(true)}>
                {t('actions.yes')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <CompetitionSecondaryModals
        modals={modals}
        competition={competition}
        fencers={fencers}
        pools={pools}
        tableauMatches={tableauMatches}
        poolMaxScore={poolMaxScore}
        allPoolsComplete={areAllPoolsComplete()}
        updateScore={updateScore}
        onImportFencers={handleImportFencers}
        onKioskFinish={() => {
          modals.setShowKiosk(false);
          handleGoToRanking();
        }}
      />
    </div>
  );
};

export default React.memo(CompetitionView);
