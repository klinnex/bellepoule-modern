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
import { PoolViewSkeleton, TableSkeleton } from './Skeleton';
import { useOperation } from './common/OperationProgress';
import { PhaseEmptyIcon } from './competition/phaseIcons';
import {
  Competition,
  Fencer,
  FencerStatus,
  MatchStatus,
  Weapon,
  QuestPhaseConfig,
  Referee,
  Gender,
  Pool,
} from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { RankingImportResult } from '../../shared/utils/fileParser';
import FencerList from './FencerList';
import { TableauMatch, ConsolationBracket } from './tableau/tableauTypes';
import { getRoundName } from './tableau/tableauCalculations';
import { poolMatchesWithReferee } from '../../shared/utils/refereeStats';
import type { MatchAuditOption } from './MatchAuditLog';
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
import { useMenuEvents } from '../hooks/useMenuEvents';
import { useCompetitionPhases } from '../hooks/useCompetitionPhases';
import { useRemoteCheckinSync } from '../hooks/useRemoteCheckinSync';
import { TEAM_PHASE_VIEWS, isTeamPhase } from './competition/teamPhases';
import type { TeamPhase } from './competition/teamPhases';
import { useSplitGroups } from '../hooks/useSplitGroups';
import { useRemoteScoreSync } from '../hooks/useRemoteScoreSync';
import { useCompetitionReferees } from '../hooks/useCompetitionReferees';
import { useRapieresCompetition } from '../../features/rapieres/useRapieresCompetition';
import { useMatchDbSync } from '../hooks/useMatchDbSync';
import { generateInitialRanking, filterPoolWinners } from '../../shared/utils/poolCalculations';
import {
  getRoundQualifierCount,
  selectNextRoundFencers,
  seedFencersFromRanking,
} from '../../shared/utils/poolRounds';
import {
  applyTableauAdvancement,
  getActiveFormula,
  getAdvancementCount,
  getPoolRoundAdvancement,
  getTableauAdvancement,
  isRapieresMode,
  resolveCompetitionSettings,
} from '../../shared/utils/customFormulaSettings';
import { allowsVictoryTieBreak } from '../../shared/utils/tieBreak';
import { emptyRapieresTeamInfo, RapieresTableauMode } from '../../features/rapieres/rapieres.types';
import {
  rapieresTableauQualifiers,
  rapieresTableauSettings,
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
import { checkInStatusUpdate, specialStatusPatch } from '../../shared/utils/forfeit';
import { ScoreAuditLog } from './ScoreAuditLog';
import { RefereeManagerComponent } from './RefereeManager';
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
import PoolsToolbar from './competition/PoolsToolbar';
import SinglePoolNav from './competition/SinglePoolNav';
import { SplitGroupTabs } from './competition/SplitGroupTabs';

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

/** Libellés + arbitres des matchs pour le journal (sélection par match / arbitre) */
function buildMatchAuditOptions(
  allPools: Pool[],
  tableau: TableauMatch[],
  competitionId: string
): MatchAuditOption[] {
  const name = (f: { lastName: string } | null | undefined) => f?.lastName ?? '?';
  const refName = (r: { firstName: string; lastName: string }) =>
    `${r.firstName} ${r.lastName}`.trim();
  const poolOpts = allPools.flatMap(p =>
    (p.matches ?? []).map(m => ({
      id: m.id,
      label: `Poule ${p.number} — M${m.number} : ${name(m.fencerA)} vs ${name(m.fencerB)}`,
      referees: m.referee ? [refName(m.referee)] : [],
    }))
  );
  const tableauOpts = tableau
    .filter(m => !m.isBye && (m.fencerA || m.fencerB))
    .sort((a, b) => b.round - a.round || a.position - b.position)
    .flatMap(m => {
      const opt = {
        id: m.id,
        label: `${getRoundName(m.round)} — ${name(m.fencerA)} vs ${name(m.fencerB)}`,
        referees: (m.referees?.length ? m.referees : m.referee ? [m.referee] : []).map(refName),
      };
      // Événements de tablette stockés sous l'id DB composite (#1031)
      return [opt, { ...opt, id: `${competitionId}-${m.id}` }];
    });
  return [...poolOpts, ...tableauOpts];
}

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

const CV_STYLES = {
  root: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } satisfies React.CSSProperties,
  thirdPlaceOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } satisfies React.CSSProperties,
  thirdPlaceModal: {
    backgroundColor: 'var(--color-raised)',
    padding: '2rem',
    borderRadius: '8px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.25)',
    maxWidth: '500px',
    width: '90%',
  } satisfies React.CSSProperties,
  thirdPlaceTitle: {
    margin: '0 0 1rem 0',
    color: 'var(--color-text)',
  } satisfies React.CSSProperties,
  thirdPlaceBtnRow: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'flex-end' as const,
    marginTop: '1.5rem',
  } satisfies React.CSSProperties,
  poolsExportRow: {
    textAlign: 'center' as const,
    marginBottom: '2rem',
  } satisfies React.CSSProperties,
  questWrapper: { display: 'none' } satisfies React.CSSProperties,
  phaseContent: { flex: 1, overflow: 'auto' as const } satisfies React.CSSProperties,
  roundSelector: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0.5rem',
    margin: '0.75rem 0 1.25rem',
  } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;

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
  const [importData, setImportData] = useState<{
    format: string;
    filepath: string;
    content: string;
  } | null>(null);
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
  const singlePoolIndexRef = useRef(singlePoolIndex);
  singlePoolIndexRef.current = singlePoolIndex;

  useEffect(() => {
    if (poolsViewMode !== 'single' || currentPhase !== 'pools') return;
    const pool = poolsRef.current[singlePoolIndexRef.current];
    if (!pool) return;

    const POOL_CELL = 52; // px — doit rester synchro avec .pool-cell (main.css)
    const POOL_NAME_COL = 210; // px — .pool-cell-name (main.css)
    const CHROME_WIDTH = 140; // marges, bordures de carte, cadre de fenêtre
    const CHROME_HEIGHT = 380; // en-tête compétition, navigation, barre d'outils, prochain match

    const visibleColumnsCount = getVisibleColumns('pool', pool.id).filter(
      c => c !== 'quest' || isLaserSabre
    ).length;
    const fencerCount = pool.fencers.length;

    const width = Math.min(
      window.screen.availWidth,
      POOL_NAME_COL + fencerCount * POOL_CELL + visibleColumnsCount * POOL_CELL + CHROME_WIDTH
    );
    const height = Math.min(
      window.screen.availHeight,
      (fencerCount + 1) * POOL_CELL + CHROME_HEIGHT
    );

    window.electronAPI?.setWindowSize(Math.round(width), Math.round(height));
  }, [poolsViewMode, currentPhase, getVisibleColumns, isLaserSabre]);

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

  // Menu events
  useMenuEvents({
    currentPhase,
    onShowProperties: () => modals.setShowPropertiesModal(true),
    onShowAddFencer: () => modals.setShowAddFencerModal(true),
    onExportFencers: format => exportFencersList(fencers, format),
    onExportFencersBpf: async () => {
      const result = await window.electronAPI.dialog.saveFile({
        title: t('dialogs.exportFencersArchive'),
        defaultPath: `tireurs-${competition.title}.bpf`,
        filters: [{ name: 'BellePoule Fencers', extensions: ['bpf'] }],
      });
      if (result && !result.canceled && result.filePath) {
        const { count } = await runOperation('export', () =>
          window.electronAPI.file.exportFencersArchive(competition.id, result.filePath!)
        );
        showToast(
          `${count} tireur${count !== 1 ? 's' : ''} exporté${count !== 1 ? 's' : ''} (.bpf)`,
          'success'
        );
      }
    },
    onExportPhotos: async () => {
      const result = await window.electronAPI.dialog.saveFile({
        title: t('dialogs.exportPhotos'),
        defaultPath: `photos-${competition.title}.zip`,
        filters: [{ name: 'Archive ZIP', extensions: ['zip'] }],
      });
      if (result && !result.canceled && result.filePath) {
        const { count } = await runOperation('export', () =>
          window.electronAPI.file.exportPhotos(competition.id, result.filePath!)
        );
        showToast(
          `${count} photo${count !== 1 ? 's' : ''} exportée${count !== 1 ? 's' : ''}`,
          'success'
        );
      }
    },
    onExportRanking: format => exportRanking(overallRanking, format, isLaserSabre),
    onExportResults: format => exportResults(finalResults, format),
    onImport: async (format, filepath, content) => {
      if (format === 'fencers-bpf') {
        try {
          await runOperation('import', () =>
            window.electronAPI.file.importFencersArchive(competition.id, filepath)
          );
          loadFencers();
        } catch (err) {
          showActionableError('messages.import_archive_failed', err);
        }
        return;
      }
      setImportData({ format, filepath, content });
    },
    onNextPhase: () => {},
    loadFencers,
    hasPools: pools.length > 0,
    overallRanking,
    finalResults,
    isLaserSabre,
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

  const handleImportFencers = async (importedFencers: Partial<Fencer>[]) => {
    await bulkAddFencers(importedFencers as any);
    setImportData(null);
  };

  const handleOpenImportDialog = async (type: 'xml' | 'fff' | 'ranking' = 'fff') => {
    const configs = {
      xml: {
        title: 'Importer un fichier XML BellePoule',
        filters: [{ name: 'XML BellePoule', extensions: ['xml', 'cotcot'] }],
      },
      fff: {
        title: 'Importer une liste FFE (.fff, .csv, .txt, .xlsx)',
        filters: [
          { name: 'Fichiers FFE / CSV / Excel', extensions: ['fff', 'csv', 'txt', 'xlsx'] },
        ],
      },
      ranking: {
        title: 'Importer un classement (FFF ou CSV : NOM, PRENOM, CLASSEMENT)',
        filters: [{ name: 'Fichier classement', extensions: ['fff', 'csv', 'txt', 'xlsx'] }],
      },
    };
    const cfg = configs[type];
    const result = await window.electronAPI.dialog.openFile({
      title: cfg.title,
      filters: [...cfg.filters, { name: 'Tous les fichiers', extensions: ['*'] }],
      properties: ['openFile'],
    });

    if (result && result.filePath) {
      const filepath = result.filePath;
      const content = result.content || '';
      const extension = filepath.split('.').pop()?.toLowerCase();

      // TXT simple → parseur libre ; CSV/Excel → parseur FFE (modèle d'import : en-tête + colonnes)
      let format: string = type;
      if (type === 'fff' && extension === 'txt') {
        format = 'txt';
      }

      setImportData({ format, filepath, content });
    }
  };

  const handleImportRanking = async (result: RankingImportResult) => {
    if (!window.electronAPI?.db?.updateFencer) {
      showToast('Erreur: API non disponible', 'error');
      return;
    }

    try {
      const updatePromises = result.details
        .filter(d => d.matched && d.fencerId)
        .map(d =>
          window.electronAPI!.db!.updateFencer!(d.fencerId!, { ranking: d.ranking }).catch(err =>
            logger.error(
              LogCategory.UI,
              `Failed to update ranking for fencer ${d.fencerId}`,
              err as Error
            )
          )
        );
      await Promise.allSettled(updatePromises);

      onUpdate({
        ...competition,
        fencers: (competition.fencers || []).map(f => {
          const detail = result.details.find(d => d.fencerId === f.id);
          return detail?.matched ? { ...f, ranking: detail.ranking, updatedAt: new Date() } : f;
        }),
      });

      showToast(
        t('plural.ranking_imported', { count: result.updated }),
        result.errors.length > 0 ? 'warning' : 'success'
      );
      setImportData(null);
    } catch (error) {
      logger.error(LogCategory.UI, 'Failed to import ranking', error as Error);
      showToast("Erreur lors de l'import du classement", 'error');
    }
  };

  const handleQuestConfigUpdate = useCallback(
    async (updates: Partial<QuestPhaseConfig>) => {
      if (!competition.settings?.questConfig) return;
      const updatedCompetition = {
        ...competition,
        settings: {
          ...competition.settings,
          questConfig: { ...competition.settings.questConfig, ...updates },
        },
      };
      onUpdate(updatedCompetition);
      await window.electronAPI?.db.updateCompetition(competition.id, updatedCompetition);
    },
    [competition, onUpdate]
  );

  const handleGoToRanking = () => {
    if (overallRanking.length === 0) {
      const ranking = computeOverallRanking(pools);
      setOverallRanking(ranking);
    }
    setCurrentPhase('ranking');
  };

  const handleSkipToRanking = () => {
    const checkedIn = getCheckedInFencers();
    const initialRanking = generateInitialRanking(checkedIn);
    setOverallRanking(initialRanking);
    setSkipPoolPhase(true);
    setPools([]);
    setRankingValidated(false);
    setCurrentPhase('ranking');
  };

  const handleGoToTableau = (splitGroup?: string) => {
    setRankingValidated(true);
    // Ne pas recalculer : overallRanking est déjà à jour

    if (splitGroup && splitGroup !== activeSplitGroup) {
      // Sauvegarder l'état du groupe courant avant de basculer
      if (activeSplitGroup) {
        setSplitTableauStates(prev => ({
          ...prev,
          [activeSplitGroup]: {
            matches: tableauMatches,
            consolation: consolationBrackets,
            results: finalResults,
          },
        }));
      }
      // Charger l'état sauvegardé du nouveau groupe (ou partir de zéro)
      const saved = splitTableauStates[splitGroup];
      setTableauMatches(saved?.matches ?? []);
      setConsolationBrackets(saved?.consolation ?? []);
      setFinalResults(saved?.results ?? []);
      setActiveSplitGroup(splitGroup);
    }

    // Si le classement a changé, réinitialiser les matches du tableau
    if (rankingChanged) {
      setTableauMatches([]);
      setConsolationBrackets([]);
      setRankingChanged(false);
      showToast("Le classement a changé. Le tableau d'élimination va être régénéré.", 'warning');
    }

    // Rapières : mode de tableau demandé à chaque passage au tableau (#1441)
    if (isRapieres) {
      setShowRapieresTableauDialog(true);
      return;
    }
    // Tirer toutes les places → 3ème place implicite, pas de question
    if (playAllPositions) {
      handleThirdPlaceDecision(true);
      return;
    }
    // Formule personnalisée : 3ème place déjà choisie dans la formule (#1125)
    if (customFormula && hasDirectElimination) {
      handleThirdPlaceDecision(thirdPlaceMatch);
      return;
    }
    modals.setShowThirdPlaceDialog(true);
  };

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

  /** Rapières : mode de tableau choisi dans la popup (#1441) */
  const handleRapieresTableauMode = (mode: RapieresTableauMode) => {
    if (mode === 'semis' && !rapieresSemifinalists(pools, overallRanking)) {
      showToast(t('rapieres.semis_unavailable'), 'error');
      return;
    }
    updateRapieres({ tableauMode: mode });
    setShowRapieresTableauDialog(false);
    const { thirdPlaceMatch, ...extra } = rapieresTableauSettings(mode); // toutes places (#1441)
    handleThirdPlaceDecision(thirdPlaceMatch, extra);
  };

  const handleThirdPlaceDecision = (thirdPlace: boolean, extra?: { playAllPositions: boolean }) => {
    const settings = { ...competition.settings, ...extra, thirdPlaceMatch: thirdPlace };
    const updatedCompetition = { ...competition, settings };

    if (window.electronAPI) {
      window.electronAPI.db.updateCompetition(competition.id, updatedCompetition);
    }

    onUpdate(updatedCompetition);
    setTableauMatches([]);
    setConsolationBrackets([]);
    setCurrentPhase('tableau');
    modals.setShowThirdPlaceDialog(false);
  };

  // Tour suivant (#1051) : qualifiés selon le classement du tour terminé, non-qualifiés
  // éliminés, puis appel + nouveau tirage seedé sur ce classement.
  const handleNextPoolRound = async () => {
    const nextRound = currentPoolRound + 1;
    const qualifierCount = customFormula
      ? getAdvancementCount(
          computeOverallRanking(pools).length,
          getPoolRoundAdvancement(customFormula, currentPoolRound - 1)
        )
      : getRoundQualifierCount(poolRoundQualifiers, nextRound);
    const { qualified, eliminated } = selectNextRoundFencers(
      computeOverallRanking(pools),
      qualifierCount
    );
    if (qualified.length < 4) {
      showToast('Il faut au moins 4 qualifiés pour un nouveau tour de poules.', 'warning');
      return;
    }
    const toEliminate = eliminated.filter(f => {
      const status = fencers.find(x => x.id === f.id)?.status;
      return (
        status !== undefined &&
        status !== FencerStatus.ELIMINATED &&
        status !== FencerStatus.ABANDONED &&
        status !== FencerStatus.FORFAIT &&
        status !== FencerStatus.EXCLUDED
      );
    });
    const ok = await confirm(
      t('pools.next_round_confirm', {
        n: nextRound,
        qualified: qualified.length,
        eliminated: toEliminate.length,
      })
    );
    if (!ok) return;
    // Appel du tour terminé figé avant MAJ (consultation + export PDF par tour)
    const appelSnapshot = currentAppelFencers;
    // Non-qualifiés éliminés ; qualifiés : classement = place au tour terminé
    const updates: Record<string, Partial<Fencer>> = {};
    for (const f of toEliminate) updates[f.id] = { status: FencerStatus.ELIMINATED };
    for (const f of qualified) {
      if (fencers.find(x => x.id === f.id)?.ranking !== f.ranking) {
        updates[f.id] = { ranking: f.ranking };
      }
    }
    await updateFencers(updates);
    nextPoolRound(appelSnapshot);
    setPoolsLaunched(false);
    setRankingValidated(false);
    setViewedPoolRound(null);
    setCurrentPhase('checkin');
    showToast(t('pools.next_round_checkin', { n: nextRound }), 'success');
  };

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

  const renderPoolCard = (pool: (typeof pools)[number], poolIndex: number) => (
    <div key={pool.id} style={{ minWidth: 0, overflow: 'auto' }}>
      <PoolView
        pool={pool}
        weapon={competition.weapon}
        tieBreakByVictory={tieBreakByVictory}
        competitionName={competition.title}
        maxScore={poolMaxScore}
        competitionId={competition.id}
        maxRefereesPerPool={maxRefereesPerPool}
        onScoreUpdate={(matchIndex, scoreA, scoreB, winner, specialStatus, priority) => {
          updateScore(poolIndex, matchIndex, scoreA, scoreB, winner, specialStatus, priority);
          if (winner) {
            const m = pool.matches[matchIndex];
            const nameA = m?.fencerA ? `${m.fencerA.lastName}` : 'A';
            const nameB = m?.fencerB ? `${m.fencerB.lastName}` : 'B';
            fireWebhookNotif(
              `Match terminé — ${competition.title}`,
              `${nameA} ${scoreA} – ${scoreB} ${nameB} (Poule ${pool.number})`
            );
          }
          if (isRemoteActive && competition?.id) {
            const match = pool.matches[matchIndex];
            if (match) {
              window.electronAPI.remote
                .finishPoolMatch(competition.id, match.id, scoreA, scoreB, winner, specialStatus)
                .catch(() => {});
            }
          }
        }}
        onMatchReset={matchIndex => {
          const match = pool.matches[matchIndex];
          if (!match) return;
          resetMatch(poolIndex, matchIndex);
          if (competition?.id) {
            window.electronAPI.remote.resetPoolMatch(competition.id, match.id).catch(() => {});
          }
        }}
        onMatchCancel={matchIndex => {
          const match = pool.matches[matchIndex];
          if (!match) return;
          cancelMatch(poolIndex, matchIndex);
          if (competition?.id) {
            window.electronAPI.remote.resetPoolMatch(competition.id, match.id).catch(() => {});
          }
        }}
        onFencerStatusChange={(fencerId, status, blackCard) => {
          if (status === 'abandon' || status === 'forfait' || status === 'exclusion') {
            handleFencerForfeit(fencerId, status);
            // Liste d'appel : statut aligné avec la saisie manuelle du score
            updateFencer(fencerId, specialStatusPatch(status, blackCard));
          }
        }}
        assignedFencerIds={assignedPoolFencerIds}
        onFencerAdded={updatedPool => {
          updatedPool.ranking = computePoolRanking(updatedPool);
          setPools(prev => prev.map(p => (p.id === updatedPool.id ? updatedPool : p)));
        }}
        stripRange={{ start: remoteStripStart, end: remoteArenaCount }}
        onStripChange={handlePoolStripChange}
        arenas={arenaStates}
        isRemoteActive={isRemoteActive}
        remoteServerUrl={remoteServerUrl ?? undefined}
        cardScale={presetScale(poolCardSize)}
        stripQr={buildStripQrs(pools, poolsRemoteInfo)?.[pool.id]}
        onMatchArenaChange={(matchId, oldArena, newArena, fencerA, fencerB) => {
          if (!isRemoteActive || !competition?.id) return;
          window.electronAPI.remote
            .updateMatchArena(
              competition.id,
              matchId,
              oldArena,
              newArena,
              fencerA ?? undefined,
              fencerB ?? undefined
            )
            .catch(() => {});
        }}
        autoFillReferees={autoFillReferees}
        onAutoFillReferees={handlePoolAutoFillReferees}
        onRefereeAssigned={handlePoolRefereeAssigned}
        waveMatchIds={currentWaveMatchIds}
      />
    </div>
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
          <Suspense fallback={<TableSkeleton label={t('competitionView.loading_tableau')} />}>
            {/* Sélecteur de groupe pour compétition couplée */}
            {postPoolSplitCriteria && activeSplitGroup && splitGroups.length > 1 && (
              <SplitGroupTabs
                groups={splitGroups}
                active={activeSplitGroup}
                onSelect={handleSwitchSplitGroup}
              />
            )}
            {finalResults.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.625rem 1rem',
                  marginBottom: '0.75rem',
                  background: 'var(--color-notice-bg)',
                  border: '1px solid var(--color-notice-border)',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  color: 'var(--color-notice-text)',
                }}
              >
                <span>{t('competitionView.readonly')}</span>
                <button
                  onClick={async () => {
                    if (await confirm(t('competitionView.edit_confirm'))) {
                      setFinalResults([]);
                    }
                  }}
                  style={{
                    marginLeft: 'auto',
                    background: '#f59e0b',
                    color: 'white',
                    border: 'none',
                    padding: '0.375rem 0.75rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                  }}
                >
                  {t('competitionView.edit_tableau')}
                </button>
              </div>
            )}
            <TableauView
              ranking={effectiveTableauRanking}
              matches={tableauMatches}
              onMatchesChange={setTableauMatches}
              consolationBrackets={consolationBrackets}
              onConsolationBracketsChange={setConsolationBrackets}
              maxScore={tableMaxScore === 0 ? 999 : tableMaxScore}
              thirdPlaceMatch={thirdPlaceMatch}
              playAllPositions={playAllPositions}
              arenaCount={remoteArenaCount}
              stripStart={remoteStripStart}
              readOnly={finalResults.length > 0}
              competitionId={competition.id}
              maxRefereesPerMatch={maxRefereesPerMatch}
              autoFillReferees={autoFillReferees}
              tieBreakByVictory={tieBreakByVictory}
              onBlackCard={id => updateFencer(id, specialStatusPatch('exclusion', true))}
              onComplete={results => {
                setFinalResults(results);
                setTableauEditUnlocked(false);
                setCurrentPhase('results');
              }}
              onMatchArenaChange={(matchId, oldArena, newArena, fencerAParam, fencerBParam) => {
                if (isRemoteActive) {
                  const match = tableauMatches.find(m => m.id === matchId);
                  window.electronAPI.remote.updateMatchArena(
                    competition.id,
                    matchId,
                    oldArena,
                    newArena,
                    fencerAParam ?? match?.fencerA ?? null,
                    fencerBParam ?? match?.fencerB ?? null
                  );
                }
              }}
              onMatchRefereeChange={(matchId, refereeId) => {
                // updateMatch lève une erreur synchrone si l'ID n'est pas un UUID (ex. « 64-0 »)
                Promise.resolve()
                  .then(() =>
                    window.electronAPI.db.updateMatch(matchId, {
                      refereeId: refereeId ?? undefined,
                    })
                  )
                  .catch((e: unknown) =>
                    logger.warn(
                      LogCategory.DATABASE,
                      'updateMatch (arbitre tableau) failed',
                      e instanceof Error ? e : undefined
                    )
                  );
              }}
            />
          </Suspense>
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
          <RefereeManagerComponent
            competition={competition}
            referees={referees}
            pools={pools}
            matches={refereeAssignableMatches}
            statsPoolMatches={[...poolHistory.flat(), ...pools].flatMap(poolMatchesWithReferee)}
            statsTableauMatches={[
              ...tableauMatches,
              ...consolationBrackets.flatMap(b => b.matches),
            ]}
            onRefereesChange={setReferees}
            onAssignmentsChange={assignments => {
              applyPoolRefereeAssignments(assignments);
              // Matchs de tableau / consolation : referees[0] = arbitre principal
              const applyToTableau = (list: TableauMatch[]) =>
                list.map(m => {
                  const ref = assignments.get(m.id);
                  if (!ref) return m;
                  const principal = {
                    id: ref.id,
                    firstName: ref.firstName,
                    lastName: ref.lastName,
                  };
                  const others = (m.referees ?? []).slice(1).filter(r => r.id !== ref.id);
                  return { ...m, referee: principal, referees: [principal, ...others] };
                });
              if (tableauMatches.some(m => assignments.has(m.id))) {
                setTableauMatches(prev => applyToTableau(prev));
              }
              if (consolationBrackets.some(b => b.matches.some(m => assignments.has(m.id)))) {
                setConsolationBrackets(prev =>
                  prev.map(b => ({ ...b, matches: applyToTableau(b.matches) }))
                );
              }
            }}
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
