/**
 * BellePoule Modern - Competition View Component (Refactored)
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import {
  Competition,
  Fencer,
  FencerStatus,
  Match,
  MatchStatus,
  Weapon,
  QuestPhaseConfig,
  Referee,
  Gender,
  Pool,
} from '../../shared/types';
import { Arena } from '../../shared/types/remote';
import { logger, LogCategory } from '@shared/services/logger';
import { NotificationService } from '../../shared/services/notificationService';
import { RankingImportResult } from '../../shared/utils/fileParser';
import FencerList from './FencerList';
import {
  TableauMatch,
  FinalResult,
  propagateWinners,
  ConsolationBracket,
  isBracketComplete,
} from './tableau/tableauTypes';
import { getRoundName } from './tableau/tableauCalculations';
import { poolMatchesWithReferee, propagatePoolReferee } from '../../shared/utils/refereeStats';
import type { MatchAuditOption } from './MatchAuditLog';
import PoolRankingView from './PoolRankingView';
import ResultsView from './ResultsView';
import AddFencerModal from './AddFencerModal';
import CompetitionPropertiesModal from './CompetitionPropertiesModal';
import SplitCompetitionModal from './SplitCompetitionModal';
import {
  defaultSplitCompetitionTitle,
  buildSplitCompetitionData,
  extractSplitGroupRanking,
  toSplitFencerData,
  remapRankingFencers,
} from '../../shared/utils/splitCompetition';
import type { CompetitionCreateData, FencerCreateData } from '../../shared/types/preload';
import ImportModal from './ImportModal';
import PoolPrepView, { PoolPrepLaunchAction } from './PoolPrepView';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { useTranslation } from '../hooks/useTranslation';
import { useCompetitionSession, Phase, phaseFromNumber } from '../hooks/useCompetitionSession';
import { useFencerManagement } from '../hooks/useFencerManagement';
import { usePoolManagement } from '../hooks/usePoolManagement';
import { useExport } from '../hooks/useExport';
import { useMenuEvents } from '../hooks/useMenuEvents';
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
import {
  createRapieresSession,
  RapieresLegacyState,
  RapieresSession,
  RapieresTeamInfo,
} from '../../features/rapieres/rapieres.types';
import {
  distributeByLevel,
  filterRapieresQualifiers,
  mergeFinalRanking,
  RAPIERES_MAX_POOL_SIZE,
  teamMembersLabel,
  waveMatchIds,
  waveSheetMatches,
  waveMatchOrder,
} from '../../features/rapieres/rapieresCalculations';
import RapieresTeamModal, { RapieresTeamDraft } from '../../features/rapieres/RapieresTeamModal';
import { usePdfTemplateStore } from '../../features/pdfTemplates/hooks/usePdfTemplateStore';
import RapieresWaveBar from '../../features/rapieres/RapieresWaveBar';
import RapieresRankingPanel, {
  RapieresTeamStats,
} from '../../features/rapieres/RapieresRankingPanel';
import { QRCodeShare } from './QRCodeShare';
import { computePoolStrips } from '../../shared/utils/poolStrips';
import { TouchOptimizedReferee } from './TouchOptimizedReferee';
import KioskScoreEntry from './competition/KioskScoreEntry';
import { ScoreAuditLog } from './ScoreAuditLog';
import { RefereeManagerComponent } from './RefereeManager';
import CompetitionHeader from './competition/CompetitionHeader';
import CompetitionNav from './competition/CompetitionNav';
const PlanningAssistant = React.lazy(() => import('./competition/PlanningAssistant'));
const ExportCenterModal = React.lazy(() => import('./competition/ExportCenterModal'));
import GlobalPoolColumnsMenu from './pool/GlobalPoolColumnsMenu';
import WindowSizePresets, {
  presetScale,
  readSavedPoolCardSize,
  type PresetLabel,
} from './pool/WindowSizePresets';
import { useColumnVisibility } from '../hooks/useColumnVisibility';

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

/** Phases d'une compétition par équipes ↔ onglet de TeamManagerView (#1085) */
const TEAM_PHASE_VIEWS = {
  teams: 'teams',
  teampool: 'pool',
  teamtableau: 'tableau',
  teamranking: 'ranking',
} as const;
type TeamPhase = keyof typeof TEAM_PHASE_VIEWS;
const isTeamPhase = (p: string): p is TeamPhase => p in TEAM_PHASE_VIEWS;
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
  const { showToast } = useToast();
  const { confirm } = useConfirm();
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
  const expertMode = competition.settings?.expertMode ?? false;
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

  const [showAddFencerModal, setShowAddFencerModal] = useState(false);
  const [showPlanningAssistant, setShowPlanningAssistant] = useState(false);
  const [showExportCenter, setShowExportCenter] = useState(false);
  const [showPropertiesModal, setShowPropertiesModal] = useState(false);
  const [importData, setImportData] = useState<{
    format: string;
    filepath: string;
    content: string;
  } | null>(null);
  const [isRemoteActive, setIsRemoteActive] = useState(false);
  const [remoteServerUrl, setRemoteServerUrl] = useState<string | null>(null);
  const [remoteArenaCount, setRemoteArenaCount] = useState<number>(1);
  useEffect(() => {
    onRemoteServerChange?.(remoteServerUrl, remoteArenaCount);
  }, [remoteServerUrl, remoteArenaCount]);
  const [arenaStates, setArenaStates] = useState<Arena[]>([]);
  const [showThirdPlaceDialog, setShowThirdPlaceDialog] = useState(false);
  const [tableauMatches, setTableauMatches] = useState<TableauMatch[]>([]);
  const [consolationBrackets, setConsolationBrackets] = useState<ConsolationBracket[]>([]);
  // Refs pour connaître la présence d'un match dans le tableau/consolante de façon synchrone
  // (mises à jour distantes : éviter le warning "Match non trouvé" côté poule pour les matchs DE)
  const tableauMatchesRef = useRef<TableauMatch[]>([]);
  const consolationBracketsRef = useRef<ConsolationBracket[]>([]);
  tableauMatchesRef.current = tableauMatches;
  consolationBracketsRef.current = consolationBrackets;
  const [finalResults, setFinalResults] = useState<FinalResult[]>([]);
  const [appelFencers, setAppelFencers] = useState<Fencer[]>([]);
  const [appelVisibleColumns, setAppelVisibleColumns] = useState<string[]>([]);
  const handleAppelStateChange = useCallback((f: Fencer[], cols: string[]) => {
    setAppelFencers(f);
    setAppelVisibleColumns(cols);
  }, []);
  const [tableauEditUnlocked, setTableauEditUnlocked] = useState(false);
  const [showFencerComparison, setShowFencerComparison] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showSeasonRanking, setShowSeasonRanking] = useState(false);
  const [showFFEConnect, setShowFFEConnect] = useState(false);
  const [showFFEExport, setShowFFEExport] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showKiosk, setShowKiosk] = useState(false);
  const [showPresentation, setShowPresentation] = useState(false);
  const [showKioskDisplay, setShowKioskDisplay] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [referees, setReferees] = useState<Referee[]>([]);

  // Tournoi des rapières : composition des équipes et vagues (état de session)
  const [rapieresState, setRapieresState] = useState<
    RapieresSession | RapieresLegacyState | undefined
  >(undefined);
  const rapieres: RapieresSession =
    rapieresState?.version === 2 ? rapieresState : createRapieresSession();
  const updateRapieres = useCallback(
    (patch: Partial<RapieresSession>) =>
      setRapieresState(prev => ({
        ...(prev?.version === 2 ? prev : createRapieresSession()),
        ...patch,
      })),
    []
  );
  const setRapieresTeam = useCallback(
    (id: string, info: RapieresTeamInfo) =>
      setRapieresState(prev => {
        const base = prev?.version === 2 ? prev : createRapieresSession();
        return { ...base, teams: { ...base.teams, [id]: info } };
      }),
    []
  );
  // Fenêtre d'équipe : null = fermée, {} = ajout, { fencer } = modification
  const [rapieresTeamModal, setRapieresTeamModal] = useState<{ fencer?: Fencer } | null>(null);

  // Paramètres de préparation des poules (persistés entre les phases)
  const [minFencersPerPool, setMinFencersPerPool] = useState<number>(5);
  const [maxFencersPerPool, setMaxFencersPerPool] = useState<number>(7);

  // Affichage des poules : grille (toutes les poules) ou poule unique avec navigation
  const [poolCardSize, setPoolCardSize] = useState<PresetLabel>(readSavedPoolCardSize);
  const [poolsViewMode, setPoolsViewMode] = useState<'grid' | 'single'>(
    () => (localStorage.getItem('bellepoule-pools-view-mode') as 'grid' | 'single') || 'grid'
  );
  const [singlePoolIndex, setSinglePoolIndex] = useState(0);

  // Flag pour indiquer si le classement a changé (nécessite régénération du tableau)
  const [rankingChanged, setRankingChanged] = useState(false);

  // Flag pour indiquer si le classement a été validé (débloque l'onglet Tableau)
  const [rankingValidated, setRankingValidated] = useState(false);

  // Flag pour indiquer que la phase de poules est sautée (0 poules configurées)
  const [skipPoolPhase, setSkipPoolPhase] = useState(false);

  // Mode compétition couplée : groupe actif ('M' | 'F' | null)
  const [activeSplitGroup, setActiveSplitGroup] = useState<string | null>(null);
  // État des tableaux par groupe (pour conserver les matchs quand on bascule)
  // Groupe en attente de création de compétition séparée (saisie du nom)
  const [pendingSplitOffGroup, setPendingSplitOffGroup] = useState<string | null>(null);
  const [splitOffInProgress, setSplitOffInProgress] = useState(false);
  const [splitTableauStates, setSplitTableauStates] = useState<
    Record<
      string,
      { matches: TableauMatch[]; consolation: ConsolationBracket[]; results: FinalResult[] }
    >
  >({});

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

  useEffect(() => {
    localStorage.setItem('bellepoule-pools-view-mode', poolsViewMode);
  }, [poolsViewMode]);

  // Recale l'index sélectionné si le nombre de poules change (ex: fusion/suppression)
  useEffect(() => {
    if (singlePoolIndex >= pools.length) {
      setSinglePoolIndex(Math.max(0, pools.length - 1));
    }
  }, [pools.length, singlePoolIndex]);

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

  const {
    exportFencersList,
    exportRanking,
    exportResults,
    exportPoolsPDF,
    printPoolsPDF,
    exportResultsHTML,
    exportRankingExcelCSV,
    exportResultsXML,
    exportDetailedStats,
  } = useExport({
    competition,
    showToast,
  });

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
    rapieres: isRapieres ? rapieresState : undefined,
    poolPrepParams,
  });

  // Synchroniser le nombre d'arènes avec le nombre de poules
  useEffect(() => {
    if (!isLoaded) return;
    if (pools.length > 0) {
      if (!restoredState?.remoteArenaCount) {
        setRemoteArenaCount(pools.length);
      } else if (remoteArenaCount > pools.length) {
        // Les poules ont rétréci depuis le dernier run : clamp pour éviter des arènes fantômes.
        setRemoteArenaCount(pools.length);
      }
    }
  }, [isLoaded, pools.length, remoteArenaCount]);

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
      if (restoredState.remoteArenaCount != null)
        setRemoteArenaCount(restoredState.remoteArenaCount);
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

  // Appliquer un score distant au bon conteneur : tableau DE, consolante, ou poule.
  // Évite le warning "Match non trouvé" côté poule pour les matchs du tableau.
  const applyRemoteScore = useCallback(
    (
      matchIdRaw: string,
      scoreARaw: number,
      scoreBRaw: number,
      finished: boolean,
      winnerOverride?: 'A' | 'B'
    ) => {
      const matchId = matchIdRaw;
      // Le score peut arriver sous forme d'objet Score ({ value }) ou de chaîne
      // selon le chemin (IPC tablette, sync DB). On normalise en nombre, sinon les
      // comparaisons scoreA > scoreB échouent (NaN) → aucun vainqueur, aucune
      // propagation au tour suivant.
      const toNum = (s: unknown): number =>
        typeof s === 'object' && s !== null
          ? Number((s as { value?: number }).value ?? 0)
          : Number(s ?? 0);
      const scoreA = toNum(scoreARaw);
      const scoreB = toNum(scoreBRaw);
      const status = finished ? MatchStatus.FINISHED : MatchStatus.IN_PROGRESS;
      // Le vainqueur transmis par le serveur (winnerOverride) fait foi : il gère les
      // cas d'égalité (tirage au sort) et reste correct même si le score transporté
      // est ambigu. On retombe sur la comparaison des scores en dernier recours.
      const resolveWinner = (match: TableauMatch) =>
        !finished
          ? (match.winner ?? null)
          : winnerOverride === 'A'
            ? match.fencerA
            : winnerOverride === 'B'
              ? match.fencerB
              : scoreA > scoreB
                ? match.fencerA
                : scoreB > scoreA
                  ? match.fencerB
                  : null;

      // La tablette/serveur peut renvoyer l'ID brut du match ('16-0') ou l'ID
      // composite stocké en base ('${competitionId}-16-0'). On apparie les deux
      // sens pour ne pas rater un match du tableau (sinon : pas de propagation).
      const idMatches = (m: { id: string }) =>
        m.id === matchId ||
        matchId === `${competition.id}-${m.id}` ||
        `${competition.id}-${matchId}` === m.id;

      const inTableau = tableauMatchesRef.current.some(idMatches);
      const inConsolation = consolationBracketsRef.current.some(b => b.matches.some(idMatches));

      // DIAGNOSTIC (visible en prod, niveau WARN) : tracer le routage du score distant.
      logger.warn(
        LogCategory.UI,
        `[applyRemoteScore] match=${matchId} score=${scoreA}-${scoreB} fini=${finished} ` +
          `→ tableau=${inTableau} consolante=${inConsolation} | ` +
          `ids tableau=[${tableauMatchesRef.current.map(m => m.id).join(',')}]`
      );

      // Un match déjà gagné ne doit pas être écrasé par une fin distante sans vainqueur
      // déterminable (ex. piste qui renvoie un match déjà saisi dans l'appli, score 0-0) :
      // sinon le vainqueur est effacé et les résultats finaux ne s'affichent plus (#909).
      const isStaleFinish = (match: TableauMatch) =>
        finished && !!match.winner && !resolveWinner(match);

      if (inTableau) {
        setTableauMatches(prev => {
          const idx = prev.findIndex(idMatches);
          if (idx === -1) return prev;
          if (isStaleFinish(prev[idx])) return prev;
          const updated = prev.map((m, i) =>
            i === idx
              ? {
                  ...m,
                  scoreA,
                  scoreB,
                  winner: resolveWinner(m),
                  specialStatus: finished ? null : m.specialStatus,
                }
              : m
          );
          if (finished) {
            const size = prev.length > 0 ? Math.max(...prev.map(m => m.round)) : 0;
            propagateWinners(updated, size);
          }
          return [...updated];
        });
      }

      if (inConsolation) {
        setConsolationBrackets(prev =>
          prev.map(bracket => {
            const idx = bracket.matches.findIndex(idMatches);
            if (idx === -1) return bracket;
            if (isStaleFinish(bracket.matches[idx])) return bracket;
            const updated = bracket.matches.map((m, i) =>
              i === idx
                ? {
                    ...m,
                    scoreA,
                    scoreB,
                    winner: resolveWinner(m),
                    specialStatus: finished ? null : m.specialStatus,
                  }
                : m
            );
            if (finished) {
              const size = updated.length > 0 ? Math.max(...updated.map(m => m.round)) : 0;
              propagateWinners(updated, size);
            }
            return { ...bracket, matches: updated, isComplete: isBracketComplete(updated) };
          })
        );
      }

      // Match de poule uniquement s'il n'est pas dans le tableau/consolante
      if (!inTableau && !inConsolation) {
        logger.warn(
          LogCategory.UI,
          `[applyRemoteScore] match=${matchId} routé vers POULES (non trouvé en tableau/consolante)`
        );
        updateMatchFromRemote(matchId, scoreA, scoreB, status, winnerOverride);
      }
    },
    [updateMatchFromRemote, competition.id]
  );

  // Charger les arènes quand le serveur distant devient actif et s'abonner aux updates
  useEffect(() => {
    if (!isRemoteActive || !competition?.id || !window.electronAPI?.remote) return;
    window.electronAPI.remote
      .getArenas(competition.id)
      .then((res: any) => {
        if (res?.success && res.arenas) setArenaStates(res.arenas);
      })
      .catch(() => {});
    let unlisten: (() => void) | undefined;
    if (window.electronAPI.onRemoteArenaUpdate) {
      unlisten = window.electronAPI.onRemoteArenaUpdate((data: any) => {
        setArenaStates(prev => {
          const idx = prev.findIndex((a: Arena) => a.id === data.arenaId);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            currentMatch: data.update?.match ?? updated[idx].currentMatch,
            status: data.update?.status ?? updated[idx].status,
          };
          return updated;
        });

        // NB : on ne propage PAS le score touche-par-touche vers les données du
        // match (poule/tableau). Le score n'est appliqué que lorsque l'arbitre
        // valide « match terminé » (event match:finished). Ici on ne met à jour
        // que l'affichage live de la piste (arenaStates, ci-dessus).
      });
    }
    return () => unlisten?.();
  }, [isRemoteActive, competition.id]);

  const fireWebhookNotif = useCallback((title: string, body: string) => {
    try {
      const webhookUrl = localStorage.getItem('bellepoule-webhook-url');
      if (!webhookUrl) return;
      const svc = new NotificationService({
        browser: false,
        webhook: { url: webhookUrl },
        events: {
          matchCompleted: true,
          matchStarting: false,
          competitionStarted: false,
          competitionEnded: false,
          fencerLate: false,
        },
      });
      svc.notify({ title, body }).catch(() => {});
    } catch {
      /* non bloquant */
    }
  }, []);

  // Écouter les mises à jour des matches distants
  // Note: pas de garde sur currentPhase car la phase 'remote' affiche le panel de saisie distante
  // mais les mises à jour doivent quand même être appliquées aux pools
  useEffect(() => {
    if (!window.electronAPI?.onRemoteMatchFinished) return;

    const handleMatchFinished = (data: {
      matchId: string;
      scoreA: number;
      scoreB: number;
      winner?: 'A' | 'B';
      isTableau?: boolean;
    }) => {
      const { matchId, scoreA, scoreB, winner: winnerOverride, isTableau } = data;
      logger.warn(
        LogCategory.UI,
        `[CompetitionView] match:finished REÇU matchId=${matchId} score=${scoreA}-${scoreB} tableau=${!!isTableau}`
      );
      applyRemoteScore(matchId, scoreA, scoreB, true, winnerOverride);
      fireWebhookNotif(
        `✅ Match terminé — ${competition.title}`,
        `Score : ${scoreA} – ${scoreB}${isTableau ? ' (tableau)' : ''}`
      );
    };

    const offMatchFinished = window.electronAPI.onRemoteMatchFinished(handleMatchFinished);

    // Carton noir distant : exclure le combattant fautif dans le store
    const offExcluded = window.electronAPI.onRemoteFencerExcluded?.(({ fencerId, reason }) => {
      logger.debug(LogCategory.UI, `[CompetitionView] Combattant exclu (carton noir): ${fencerId}`);
      updateFencer(fencerId, {
        status: FencerStatus.EXCLUDED,
        exclusionReason: reason ?? 'black_card',
      });
      // Poules : matchs restants marqués non disputés et résultats de l'exclu retirés
      // du classement des adversaires, comme une exclusion saisie localement (#1011)
      if (poolsRef.current.some(p => p.fencers.some(f => f.id === fencerId))) {
        void handleFencerForfeitRef.current(fencerId, 'exclusion');
      }
    });

    // Carton noir annulé depuis la tablette : réintégrer le combattant et rouvrir le match
    const offReinstated = window.electronAPI.onRemoteFencerReinstated?.(
      ({ fencerId, matchId, status, scoreA, scoreB }) => {
        logger.debug(LogCategory.UI, `[CompetitionView] Carton noir annulé: ${fencerId}`);
        const restored = status as FencerStatus;
        handleBlackCardCancelled(fencerId, matchId, restored, scoreA, scoreB);
        updateFencer(fencerId, { status: restored, exclusionReason: null });
      }
    );

    return () => {
      offMatchFinished?.();
      offExcluded?.();
      offReinstated?.();
    };
  }, [
    applyRemoteScore,
    updateFencer,
    handleBlackCardCancelled,
    fireWebhookNotif,
    competition.title,
  ]);

  // Sync scores/statuts des matches de poule vers la DB quand ils changent
  const prevPoolsRef = useRef(pools);
  useEffect(() => {
    if (!window.electronAPI?.db?.updateMatch || !isLoaded) return;
    const prev = prevPoolsRef.current;
    prevPoolsRef.current = pools;
    pools.forEach((pool, pIdx) => {
      pool.matches.forEach((match, mIdx) => {
        const prevMatch = prev[pIdx]?.matches[mIdx];
        if (!prevMatch) return;
        if (
          match.status !== prevMatch.status ||
          match.scoreA !== prevMatch.scoreA ||
          match.scoreB !== prevMatch.scoreB
        ) {
          try {
            window
              .electronAPI!.db!.updateMatch(match.id, {
                scoreA: match.scoreA ?? undefined,
                scoreB: match.scoreB ?? undefined,
                status: match.status,
              })
              .catch((e: unknown) =>
                logger.warn(
                  LogCategory.DATABASE,
                  'updateMatch pool failed',
                  e instanceof Error ? e : undefined
                )
              );
          } catch (e: unknown) {
            logger.warn(
              LogCategory.DATABASE,
              'updateMatch pool failed',
              e instanceof Error ? e : undefined
            );
          }
        }
      });
    });
  }, [pools, isLoaded]);

  // Sync matchs tableau vers DB (batch, inclut la 3e place)
  useEffect(() => {
    if (!competition?.id || tableauMatches.length === 0) return;
    const maxScore = effectiveSettings?.defaultTableMaxScore ?? 15;
    window.electronAPI.db
      .upsertMultipleTableauMatches(
        competition.id,
        tableauMatches.map(m => ({
          matchId: m.id,
          round: m.round,
          position: m.position,
          fencerAId: m.fencerA?.id ?? null,
          fencerBId: m.fencerB?.id ?? null,
          scoreA:
            m.scoreA != null
              ? { value: m.scoreA, isVictory: m.winner?.id === m.fencerA?.id }
              : null,
          scoreB:
            m.scoreB != null
              ? { value: m.scoreB, isVictory: m.winner?.id === m.fencerB?.id }
              : null,
          status: m.winner ? 'finished' : m.isBye ? 'finished' : 'not_started',
          maxScore,
          isBye: m.isBye,
        }))
      )
      .catch((e: unknown) =>
        logger.warn(
          LogCategory.DATABASE,
          'upsertMultipleTableauMatches failed',
          e instanceof Error ? e : undefined
        )
      );
  }, [tableauMatches, competition?.id]);

  // Menu events
  useMenuEvents({
    currentPhase,
    onShowProperties: () => setShowPropertiesModal(true),
    onShowAddFencer: () => setShowAddFencerModal(true),
    onExportFencers: format => exportFencersList(fencers, format),
    onExportFencersBpf: async () => {
      const result = await window.electronAPI.dialog.saveFile({
        title: t('dialogs.exportFencersArchive'),
        defaultPath: `tireurs-${competition.title}.bpf`,
        filters: [{ name: 'BellePoule Fencers', extensions: ['bpf'] }],
      });
      if (result && !result.canceled && result.filePath) {
        const { count } = await window.electronAPI.file.exportFencersArchive(
          competition.id,
          result.filePath
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
        const { count } = await window.electronAPI.file.exportPhotos(
          competition.id,
          result.filePath
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
          await window.electronAPI.file.importFencersArchive(competition.id, filepath);
          loadFencers();
        } catch (err) {
          logger.error(LogCategory.UI, 'Erreur import .bpf', err as Error);
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
    async (generatedPools: typeof pools) => {
      if (!window.electronAPI?.db) return;
      try {
        const phases = await window.electronAPI.db.getPhasesByCompetition(competition.id);
        let poolPhase = phases.find(p => p.type === 'pool');
        if (!poolPhase) {
          poolPhase = await window.electronAPI.db.createPhase(competition.id, 'pool', 1, 'Poules');
        }
        await window.electronAPI.db.clearPoolsForPhase(poolPhase.id);
        for (const pool of generatedPools) {
          await window.electronAPI.db.createPool(poolPhase.id, pool.number, pool.id);
          pool.fencers.forEach((fencer, pos) => {
            window.electronAPI!.db!.addFencerToPool(pool.id, fencer.id, pos);
          });
          for (const match of pool.matches) {
            await window.electronAPI.db.createMatch(
              {
                id: match.id,
                number: match.number,
                fencerAId: match.fencerA?.id,
                fencerBId: match.fencerB?.id,
                maxScore: match.maxScore,
              },
              pool.id
            );
          }
        }
      } catch (e) {
        logger.error(LogCategory.DATABASE, 'persistPoolsToDB failed', e as Error);
      }
    },
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

  const handleGeneratePools = async () => {
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
  // Nom = nom d'équipe, prénom = noms des deux tireurs, club = niveau (affiché partout)
  const rapieresFencerFields = (team: RapieresTeamDraft) => ({
    lastName: team.name,
    firstName: teamMembersLabel(team.info.fencers),
    club: t(`rapieres.level_${team.info.level}`),
  });

  const handleSaveRapieresTeam = async (team: RapieresTeamDraft, fencer?: Fencer) => {
    if (fencer) {
      await updateFencer(fencer.id, rapieresFencerFields(team));
      setRapieresTeam(fencer.id, team.info);
      return;
    }
    const added = await addFencer({
      ...rapieresFencerFields(team),
      gender: Gender.MIXED,
      nationality: 'FRA',
      status: FencerStatus.NOT_CHECKED_IN,
    } as Omit<Fencer, 'id' | 'createdAt' | 'updatedAt'>);
    if (added) setRapieresTeam(added.id, team.info);
  };

  // Migration de la première version (vue dédiée) : équipes recréées comme tireurs
  const rapieresMigrating = useRef(false);
  useEffect(() => {
    if (!isRapieres || !isLoaded || rapieresState?.version !== 1 || rapieresMigrating.current)
      return;
    rapieresMigrating.current = true;
    const legacy = rapieresState;
    const LEGACY_STATUS: Record<string, FencerStatus> = {
      checked_in: FencerStatus.CHECKED_IN,
      abandoned: FencerStatus.ABANDONED,
      forfait: FencerStatus.FORFAIT,
      excluded: FencerStatus.EXCLUDED,
    };
    (async () => {
      const teams: Record<string, RapieresTeamInfo> = {};
      if (fencers.length === 0 && legacy.teams.length > 0) {
        const added = await bulkAddFencers(
          legacy.teams.map(
            tm =>
              ({
                ...rapieresFencerFields({
                  name: tm.name,
                  info: { level: tm.level, fencers: tm.fencers },
                }),
                gender: Gender.MIXED,
                nationality: 'FRA',
                status: LEGACY_STATUS[tm.status ?? 'checked_in'] ?? FencerStatus.NOT_CHECKED_IN,
              }) as Omit<Fencer, 'id' | 'createdAt' | 'updatedAt'>
          )
        );
        added.forEach((f, i) => {
          teams[f.id] = { level: legacy.teams[i].level, fencers: legacy.teams[i].fencers };
        });
      }
      setRapieresState({ ...createRapieresSession(), teams });
    })().catch(error => {
      rapieresMigrating.current = false;
      logger.error(LogCategory.UI, 'Rapières : migration impossible', error as Error);
    });
  }, [isRapieres, isLoaded, rapieresState, fencers.length]);

  /** Nouvelles poules : aucune vague lancée tant qu'aucun match n'est joué */
  const resetRapieresWaves = (newPools: Pool[]) => {
    if (!isRapieres) return;
    const played = newPools.some(p => p.matches.some(m => m.status !== MatchStatus.NOT_STARTED));
    if (!played) updateRapieres({ launchedWave: 0, wavesEnded: false });
  };

  // Statistiques de poule par équipe (classements rapières)
  const rapieresStats = useMemo(
    () =>
      new Map<string, RapieresTeamStats>(
        overallRanking.map(r => [
          r.fencer.id,
          {
            victories: r.victories,
            matches: r.matchesPlayed,
            index: r.index,
            touchesGiven: r.touchesScored,
          },
        ])
      ),
    [overallRanking]
  );

  // Matchs de la vague en cours (surbrillance violette)
  const currentWaveMatchIds = useMemo(
    () =>
      isRapieres && !rapieres.wavesEnded ? waveMatchIds(pools, rapieres.launchedWave) : undefined,
    [isRapieres, pools, rapieres.launchedWave, rapieres.wavesEnded]
  );

  // Tablettes arbitre : matchs de la vague active seulement (rapières, #1118), mémorisé par le main
  useEffect(() => {
    if (!isRapieres || !competition?.id) return;
    window.electronAPI?.remote
      ?.setActiveWave?.(competition.id, currentWaveMatchIds ? [...currentWaveMatchIds] : null)
      ?.catch?.(() => undefined);
  }, [isRapieres, isRemoteActive, competition?.id, currentWaveMatchIds]);

  // Impression des feuilles de match de la vague active (même rendu que les feuilles du tableau) (#1118)
  const handlePrintWaveSheets = useCallback(async () => {
    const wave = rapieres.launchedWave;
    const sheets = waveSheetMatches(pools, wave);
    if (sheets.length === 0) {
      showToast(t('rapieres.print_wave_sheets_empty'), 'error');
      return;
    }
    try {
      const logo = localStorage.getItem('bellepoule-logo') ?? undefined;
      const { printTableauHTML } = await import('../../shared/utils/pdfExport');
      await printTableauHTML(
        sheets,
        3,
        `${competition.title} — Vague ${wave}`,
        logo,
        usePdfTemplateStore.getState().templates.tableau,
        undefined,
        { subtitle: `Feuilles d'arbitrage — Vague ${wave}`, badge: 'V' + wave }
      );
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  }, [pools, rapieres.launchedWave, competition.title, showToast, t]);

  // Saisie distante active : QR de la piste sur chaque feuille de poule (#1037)
  const poolsRemoteInfo =
    isRemoteActive && remoteServerUrl
      ? { serverUrl: remoteServerUrl, arenaCount: remoteArenaCount }
      : undefined;

  const handleExportAllPoolsPDF = () => {
    exportPoolsPDF(pools, currentPoolRound, poolsRemoteInfo);
  };

  const handlePrintAllPoolsPDF = () => {
    printPoolsPDF(pools, currentPoolRound, poolsRemoteInfo);
  };

  // Ctrl+P / Cmd+P → imprimer les feuilles de poule (le tableau gère son propre raccourci)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        if (currentPhase === 'pools' && pools.length > 0) {
          e.preventDefault();
          handlePrintAllPoolsPDF();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentPhase, pools, currentPoolRound, isRemoteActive, remoteServerUrl, remoteArenaCount]);

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
        title: 'Importer une liste FFE (.fff, .csv, .txt)',
        filters: [{ name: 'Fichiers FFE / TXT', extensions: ['fff', 'csv', 'txt'] }],
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

      let format: string = type;
      if (type === 'fff' && (extension === 'csv' || extension === 'txt')) {
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

    // Tirer toutes les places → 3ème place implicite, pas de question
    if (playAllPositions) {
      handleThirdPlaceDecision(true);
      return;
    }
    // Rapières : match pour la 3e place toujours tiré (#1118)
    if (isRapieres) {
      handleThirdPlaceDecision(true);
      return;
    }
    // Formule personnalisée : 3ème place déjà choisie dans la formule (#1125)
    if (customFormula && hasDirectElimination) {
      handleThirdPlaceDecision(thirdPlaceMatch);
      return;
    }
    setShowThirdPlaceDialog(true);
  };

  // Basculer vers un autre groupe dans un tableau déjà ouvert
  const handleSwitchSplitGroup = (newGroup: string) => {
    if (newGroup === activeSplitGroup) return;
    // Sauvegarder l'état courant
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
    const saved = splitTableauStates[newGroup];
    setTableauMatches(saved?.matches ?? []);
    setConsolationBrackets(saved?.consolation ?? []);
    setFinalResults(saved?.results ?? []);
    setActiveSplitGroup(newGroup);
    // Revenir au classement si le groupe choisi n'a pas de résultats
    if (!saved?.results?.length) {
      setCurrentPhase('tableau');
    }
  };

  // Compétition couplée : extraire un groupe dans une compétition séparée (ou l'ouvrir si déjà créée)
  const handleSplitOff = (group: string) => {
    const existingId = splitOffCompetitionIds?.[group];
    if (existingId) {
      onOpenCompetition?.(existingId);
      return;
    }
    setPendingSplitOffGroup(group);
  };

  const createSplitOffCompetition = async (group: string, title: string) => {
    if (splitOffInProgress) return;
    setSplitOffInProgress(true);
    try {
      const db = window.electronAPI.db;
      const groupRanking = extractSplitGroupRanking(overallRanking, group);
      const created = await db.createCompetition(
        buildSplitCompetitionData(competition, title, group) as unknown as CompetitionCreateData
      );
      const newFencerByOldId = new Map<string, Fencer>();
      for (const r of groupRanking) {
        const f = await db.addFencer(
          created.id,
          toSplitFencerData(r) as unknown as FencerCreateData
        );
        newFencerByOldId.set(r.fencer.id, f);
      }
      // Démarrer la nouvelle compétition directement au classement après poules
      await db.saveSessionState(created.id, {
        currentPhase: 3,
        overallRanking: remapRankingFencers(groupRanking, newFencerByOldId),
        pools: [],
        poolHistory: [],
        tableauMatches: [],
        finalResults: [],
        consolationBrackets: [],
        currentPoolRound: 1,
        skipPoolPhase: false,
      } as unknown as Parameters<typeof db.saveSessionState>[1]);

      const settings = {
        ...competition.settings,
        splitOffCompetitionIds: { ...splitOffCompetitionIds, [group]: created.id },
      };
      await db.updateCompetition(competition.id, { settings });
      onUpdate({ ...competition, settings } as Competition);
      if (activeSplitGroup === group) setActiveSplitGroup(null);
      setPendingSplitOffGroup(null);
      showToast(
        `Compétition « ${created.title} » créée (${groupRanking.length} tireurs)`,
        'success'
      );
      onOpenCompetition?.(created.id);
    } catch (e) {
      logger.error(
        LogCategory.DATABASE,
        'Split-off competition creation failed',
        e instanceof Error ? e : undefined
      );
      showToast('Erreur lors de la création de la compétition séparée', 'error');
    } finally {
      setSplitOffInProgress(false);
    }
  };

  const handleThirdPlaceDecision = (shouldHaveThirdPlace: boolean) => {
    const updatedCompetition = {
      ...competition,
      settings: {
        ...competition.settings,
        thirdPlaceMatch: shouldHaveThirdPlace,
      },
    };

    if (window.electronAPI) {
      window.electronAPI.db.updateCompetition(competition.id, updatedCompetition);
    }

    onUpdate(updatedCompetition);
    setTableauMatches([]);
    setConsolationBrackets([]);
    setCurrentPhase('tableau');
    setShowThirdPlaceDialog(false);
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

  // Applique des assignations d'arbitres (matchId → arbitre) aux matchs de poule
  const applyPoolRefereeAssignments = useCallback(
    (assignments: Map<string, Referee>) => {
      setPools(prev =>
        prev.map(pool => ({
          ...pool,
          matches: (pool.matches ?? []).map(m => {
            const ref = assignments.get(m.id);
            return ref !== undefined ? { ...m, referee: ref } : m;
          }),
        }))
      );
    },
    [setPools]
  );

  // Remplissage automatique des poules : assignation persistée en DB
  const handlePoolAutoFillReferees = useCallback(
    (assignments: Map<string, Referee>) => {
      applyPoolRefereeAssignments(assignments);
      for (const [matchId, ref] of assignments) {
        // updateMatch lève une erreur synchrone si l'ID n'est pas un UUID
        Promise.resolve()
          .then(() => window.electronAPI.db.updateMatch(matchId, { refereeId: ref.id }))
          .catch((e: unknown) =>
            logger.warn(
              LogCategory.DATABASE,
              'updateMatch (arbitre auto) failed',
              e instanceof Error ? e : undefined
            )
          );
      }
    },
    [applyPoolRefereeAssignments]
  );

  // Arbitre(s) assigné(s) à une poule entière : l'arbitre principal est répercuté
  // sur les matchs de la poule (onglet Assignations + statistiques) (#977)
  const handlePoolRefereeAssigned = useCallback(
    (poolId: string, poolReferees: Referee[]) => {
      const pool = pools.find(p => p.id === poolId);
      if (!pool) return;
      const { matches, changes } = propagatePoolReferee(
        pool.matches ?? [],
        pool.referees?.[0]?.id,
        poolReferees[0]
      );
      setPools(prev =>
        prev.map(p => (p.id === poolId ? { ...p, referees: poolReferees, matches } : p))
      );
      for (const { matchId, refereeId } of changes) {
        Promise.resolve()
          .then(() => window.electronAPI.db.updateMatch(matchId, { refereeId }))
          .catch((e: unknown) =>
            logger.warn(
              LogCategory.DATABASE,
              'updateMatch (arbitre de poule) failed',
              e instanceof Error ? e : undefined
            )
          );
      }
    },
    [pools, setPools]
  );

  // Arbitre changé depuis une tablette : répercuté sur poules, tableau et consolantes (#977)
  const refereesRef = useRef(referees);
  refereesRef.current = referees;
  useEffect(() => {
    const off = window.electronAPI?.onRemoteRefereeChanged?.(async ({ matchId, refereeId }) => {
      let ref = refereesRef.current.find(r => r.id === refereeId);
      if (!ref) {
        const rows: Referee[] = await window.electronAPI.db
          .getRefereesByCompetition(competition.id)
          .catch(() => []);
        setReferees(rows);
        ref = rows.find(r => r.id === refereeId);
      }
      if (!ref) return;
      const principal = ref;
      const withReferee = <T extends { id: string; referees?: Array<{ id: string }> }>(m: T): T =>
        m.id !== matchId
          ? m
          : {
              ...m,
              referee: principal,
              ...(m.referees?.length ? { referees: [principal, ...m.referees.slice(1)] } : {}),
            };
      applyPoolRefereeAssignments(new Map([[matchId, principal]]));
      setTableauMatches(prev => prev.map(withReferee));
      setConsolationBrackets(prev =>
        prev.map(b =>
          b.matches.some(m => m.id === matchId) ? { ...b, matches: b.matches.map(withReferee) } : b
        )
      );
    });
    return () => off?.();
  }, [competition.id, applyPoolRefereeAssignments]);

  // Matchs proposés à l'assignation d'arbitres : poules + tableau + consolation
  const refereeAssignableMatches = useMemo<Match[]>(() => {
    const now = new Date();
    const toMatch = (m: TableauMatch, tableId: string): Match => ({
      id: m.id,
      number: m.position,
      fencerA: m.fencerA,
      fencerB: m.fencerB,
      scoreA: null,
      scoreB: null,
      maxScore: tableMaxScore === 0 ? 999 : tableMaxScore,
      status: m.winner || m.isBye ? MatchStatus.FINISHED : MatchStatus.NOT_STARTED,
      referee: m.referee ? referees.find(r => r.id === m.referee!.id) : undefined,
      tableId,
      round: m.round,
      position: m.position,
      createdAt: now,
      updatedAt: now,
    });
    return [
      ...pools.flatMap(poolMatchesWithReferee),
      ...tableauMatches.map(m => toMatch(m, competition.id)),
      ...consolationBrackets.flatMap(b => b.matches.map(m => toMatch(m, b.id))),
    ];
  }, [pools, tableauMatches, consolationBrackets, referees, tableMaxScore, competition.id]);

  const isTeamEvent = !!competition.isTeamEvent;
  const phaseOrder = useMemo<Phase[]>(() => {
    if (isTeamEvent) return ['checkin', 'teams', 'teampool', 'teamtableau', 'teamranking'];
    if (!questEnabled) return ['checkin', 'poolprep', 'pools', 'ranking', 'tableau', 'results'];
    if (questConfig?.hasPreliminaryPools)
      return ['checkin', 'poolprep', 'pools', 'quest', 'ranking', 'tableau', 'results'];
    return ['checkin', 'quest', 'ranking', 'tableau', 'results'];
  }, [isTeamEvent, questEnabled, questConfig?.hasPreliminaryPools]);

  // Réinitialiser currentPhase si elle n'existe plus dans le nouveau phaseOrder
  useEffect(() => {
    if (!phaseOrder.includes(currentPhase)) {
      setCurrentPhase('checkin');
    }
  }, [phaseOrder]);

  // Synchroniser l'état d'inscription distante avec la phase courante
  useEffect(() => {
    if (!isRemoteActive || !window.electronAPI?.remote?.setRegistrationEnabled) return;
    const enabled = currentPhase === 'checkin';
    window.electronAPI.remote.setRegistrationEnabled(competition.id, enabled).catch(() => {});
    // remoteServerUrl : re-synchronise une fois le serveur réellement démarré (#986)
  }, [currentPhase, isRemoteActive, competition.id, remoteServerUrl]);

  // Appel distant (/appel) : actif dès que la saisie distante tourne, quelle que soit
  // la vue affichée (pointage tardif des arbitres pendant les poules, #1016)
  useEffect(() => {
    if (!isRemoteActive || !window.electronAPI?.remote?.setCheckinEnabled) return;
    window.electronAPI.remote.setCheckinEnabled(competition.id, true).catch(() => {});
  }, [isRemoteActive, competition.id, remoteServerUrl]);

  // Pointage reçu depuis la page d'appel distante : recharger depuis la DB
  useEffect(() => {
    const off = window.electronAPI?.onRemoteCheckinUpdated?.(({ kind }) => {
      if (kind === 'fencer') {
        loadFencers();
      } else {
        window.electronAPI.db
          .getRefereesByCompetition(competition.id)
          .then((rows: Referee[]) => setReferees(rows))
          .catch(() => {});
      }
    });
    return () => off?.();
  }, [loadFencers, competition.id]);

  const handleGoBack = () => {
    if (skipPoolPhase && currentPhase === 'ranking') {
      setCurrentPhase('poolprep');
      return;
    }
    const currentIndex = phaseOrder.indexOf(currentPhase);
    if (currentIndex > 0) {
      setCurrentPhase(phaseOrder[currentIndex - 1]);
    }
  };

  // Phases dynamiques
  const canAdvanceFromPools =
    skipPoolPhase ||
    (pools.length > 0 && (areAllPoolsComplete() || (isRapieres && rapieres.wavesEnded)));
  const isLastPoolRound = currentPoolRound >= poolRounds;
  const isResultsLocked = hasDirectElimination && finalResults.length === 0;
  // En mode quest-sans-poules, le tableau se débloque par la complétion de la quête (rankingValidated)
  // Le tableau reste accessible en lecture seule si les résultats finaux existent déjà
  // ou si des matchs de tableau ont déjà été générés (session restaurée même sans poules chargées)
  const isTableauUnlocked =
    finalResults.length > 0 ||
    tableauMatches.length > 0 ||
    (questNoPool ? rankingValidated : canAdvanceFromPools && rankingValidated);

  // Réinitialiser la validation du classement si les poules ne sont plus toutes terminées
  // (sauf en mode quest-sans-poules ou si on est déjà en phase tableau/résultats)
  useEffect(() => {
    const postPoolPhase = ['tableau', 'results', 'remote'].includes(currentPhase);
    if (!canAdvanceFromPools && !questNoPool && !postPoolPhase) {
      setRankingValidated(false);
    }
  }, [canAdvanceFromPools, questNoPool, currentPhase]);

  const teamPhases = (Object.keys(TEAM_PHASE_VIEWS) as TeamPhase[]).map((id, i) => ({
    id,
    label: t(`phases.${id}`),
    icon: ['👥', '🎯', '🏆', '🏁'][i],
    disabled: false,
    title: undefined as string | undefined,
  }));

  const phases = [
    {
      id: 'checkin',
      label: t('phases.checkin'),
      icon: '📋',
      disabled: false,
      title: undefined as string | undefined,
    },
    ...(isTeamEvent ? teamPhases : []),
    // Phases de poules : masquées en mode Quest sans poules préliminaires
    ...(!questEnabled || questConfig?.hasPreliminaryPools
      ? [
          {
            id: 'poolprep',
            label: t('phases.poolprep'),
            icon: '⚙️',
            disabled: false,
            title: undefined as string | undefined,
          },
          {
            id: 'pools',
            label: skipPoolPhase
              ? t('phases.pools_skip')
              : poolRounds > 1
                ? t('phases.pools_round', { current: currentPoolRound, total: poolRounds })
                : t('phases.pools'),
            icon: skipPoolPhase ? '⏭' : '🎯',
            disabled: skipPoolPhase || (pools.length === 0 && poolHistory.length === 0),
            title: skipPoolPhase
              ? t('phases.pools_skip_tooltip')
              : pools.length === 0 && poolHistory.length === 0
                ? t('phases.pools_locked_tooltip')
                : (undefined as string | undefined),
          },
        ]
      : []),
    ...(questEnabled
      ? [
          {
            id: 'quest',
            label: 'Tour Quest',
            icon: '⚔️',
            disabled: false,
            title: undefined as string | undefined,
          },
        ]
      : []),
    // Classement : toujours présent (désactivé en mode quest-sans-poules jusqu'à fin de quête)
    {
      id: 'ranking',
      label: t('phases.ranking'),
      icon: '📊',
      disabled: questNoPool && !rankingValidated,
      title:
        questNoPool && !rankingValidated
          ? t('phases.tableau_locked_tooltip')
          : (undefined as string | undefined),
    },
    ...(hasDirectElimination
      ? [
          {
            id: 'tableau',
            label: t('phases.tableau'),
            icon: '🏆',
            disabled: !isTableauUnlocked && finalResults.length === 0,
            title:
              !isTableauUnlocked && finalResults.length === 0
                ? t('phases.tableau_locked_tooltip')
                : (undefined as string | undefined),
          },
        ]
      : []),
    {
      id: 'results',
      label: t('phases.results'),
      icon: '🏁',
      disabled: isResultsLocked,
      title: undefined as string | undefined,
    },
    {
      id: 'remote',
      label: t('phases.remote'),
      icon: '📡',
      disabled: false,
      title: undefined as string | undefined,
    },
    ...(auditLogEnabled
      ? [
          {
            id: 'logs',
            label: t('phases.logs'),
            icon: '📜',
            disabled: false,
            title: undefined as string | undefined,
          },
        ]
      : []),
    ...(competition.settings?.refereeFeatureEnabled
      ? [
          {
            id: 'referees',
            label: t('phases.referees') || 'Arbitres',
            icon: '🧑‍⚖️',
            disabled: false,
            title: undefined as string | undefined,
          },
        ]
      : []),
  ].filter(
    // Équipes : les phases individuelles (poules, tableau…) laissent place aux phases équipes
    p =>
      !isTeamEvent || isTeamPhase(p.id) || ['checkin', 'remote', 'logs', 'referees'].includes(p.id)
  );

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
  const [showConfetti, setShowConfetti] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const prevAllPoolsComplete = useRef(false);
  const prevChampion = useRef<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  // Détecter complétion des poules → confetti
  useEffect(() => {
    const allDone = canAdvanceFromPools && pools.length > 0;
    if (allDone && !prevAllPoolsComplete.current) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3200);
    }
    prevAllPoolsComplete.current = allDone;
  }, [canAdvanceFromPools, pools.length]);

  // Fermer le menu actions au clic extérieur
  useEffect(() => {
    if (!showActionsMenu) return;
    const handler = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showActionsMenu]);

  // Groupes disponibles pour la séparation (pour les onglets du tableau)
  const splitGroups = useMemo((): string[] => {
    if (postPoolSplitCriteria !== 'gender') return [];
    const genders = new Set<string>();
    for (const r of overallRanking) {
      const g = r.fencer.gender as string;
      if (g !== Gender.MIXED && !splitOffCompetitionIds?.[g]) genders.add(g);
    }
    return Array.from(genders).sort();
  }, [postPoolSplitCriteria, overallRanking, splitOffCompetitionIds]);

  // Classement effectif pour le tableau (filtré par vainqueurs de poule et/ou groupe actif)
  const effectiveTableauRanking = useMemo(() => {
    let ranking = overallRanking;
    if (isRapieres && pools.length > 0) {
      // Rapières : 1ers de poule, et 2es si 3 poules ou moins
      ranking = filterRapieresQualifiers(pools, ranking);
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
  // Pools affichées en consultation : tour sélectionné, ou dernier tour terminé
  // pendant l'appel / la préparation du tour suivant (#1051)
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

  const renderPoolCard = (pool: (typeof pools)[number], poolIndex: number) => (
    <div key={pool.id} style={{ minWidth: 0, overflow: 'auto' }}>
      <PoolView
        pool={pool}
        weapon={competition.weapon}
        competitionName={competition.title}
        maxScore={poolMaxScore}
        competitionId={competition.id}
        maxRefereesPerPool={maxRefereesPerPool}
        onScoreUpdate={(matchIndex, scoreA, scoreB, winner, specialStatus) => {
          updateScore(poolIndex, matchIndex, scoreA, scoreB, winner, specialStatus);
          if (winner) {
            const m = pool.matches[matchIndex];
            const nameA = m?.fencerA ? `${m.fencerA.lastName}` : 'A';
            const nameB = m?.fencerB ? `${m.fencerB.lastName}` : 'B';
            fireWebhookNotif(
              `✅ Match terminé — ${competition.title}`,
              `${nameA} ${scoreA} – ${scoreB} ${nameB} (Poule ${pool.number})`
            );
          }
          if (isRemoteActive && competition?.id) {
            const match = pool.matches[matchIndex];
            if (match) {
              window.electronAPI.remote
                .finishPoolMatch(competition.id, match.id, scoreA, scoreB)
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
        onFencerStatusChange={(fencerId, status) => {
          if (status === 'abandon' || status === 'forfait' || status === 'exclusion') {
            handleFencerForfeit(fencerId, status);
            // Liste d'appel : statut aligné avec la saisie manuelle du score
            updateFencer(fencerId, {
              status:
                status === 'abandon'
                  ? FencerStatus.ABANDONED
                  : status === 'forfait'
                    ? FencerStatus.FORFAIT
                    : FencerStatus.EXCLUDED,
            });
          }
        }}
        assignedFencerIds={assignedPoolFencerIds}
        onFencerAdded={updatedPool => {
          updatedPool.ranking = computePoolRanking(updatedPool);
          setPools(prev => prev.map(p => (p.id === updatedPool.id ? updatedPool : p)));
        }}
        arenaCount={remoteArenaCount}
        arenas={arenaStates}
        isRemoteActive={isRemoteActive}
        remoteServerUrl={remoteServerUrl ?? undefined}
        cardScale={presetScale(poolCardSize)}
        stripQr={(() => {
          if (!poolsRemoteInfo) return undefined;
          const strip = computePoolStrips(pools, poolsRemoteInfo.arenaCount).get(pool.id);
          return strip
            ? { strip, url: `${poolsRemoteInfo.serverUrl}/arene${strip}/arbitre` }
            : undefined;
        })()}
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
        showConfetti={showConfetti}
        showActionsMenu={showActionsMenu}
        setShowActionsMenu={setShowActionsMenu}
        actionsMenuRef={actionsMenuRef}
        currentPhase={currentPhase}
        pools={pools}
        tableauMatches={tableauMatches}
        fencersCount={fencers.length}
        checkedInCount={getCheckedInFencers().length}
        setShowFencerComparison={setShowFencerComparison}
        setShowAnalytics={setShowAnalytics}
        setShowSeasonRanking={setShowSeasonRanking}
        setShowQRCode={setShowQRCode}
        setShowPresentation={setShowPresentation}
        setShowKiosk={setShowKiosk}
        setShowKioskDisplay={setShowKioskDisplay}
        setShowPropertiesModal={setShowPropertiesModal}
        setShowExportCenter={setShowExportCenter}
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
        onOpenPlanningAssistant={() => setShowPlanningAssistant(true)}
        isTeamEvent={isTeamEvent}
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
              isRapieres ? setRapieresTeamModal({}) : setShowAddFencerModal(true)
            }
            {...(isRapieres
              ? {
                  columnLabels: {
                    lastName: t('rapieres.team'),
                    firstName: t('rapieres.fencers'),
                    club: t('rapieres.level'),
                  },
                  hiddenColumns: ['birthDate', 'ranking'],
                  onEditRequest: (fencer: Fencer) => setRapieresTeamModal({ fencer }),
                }
              : {})}
            registerUrl={
              isRemoteActive && remoteServerUrl ? `${remoteServerUrl}/register` : undefined
            }
            onFencersChanged={loadFencers}
            onEditFencer={updateFencer}
            onDeleteFencer={deleteFencer}
            onDeleteAllFencers={deleteAllFencers}
            onCheckInAll={checkInAll}
            onUncheckAll={uncheckAll}
            onImport={isRapieres ? undefined : type => handleOpenImportDialog(type)}
            onImportFFEConnect={isRapieres ? undefined : () => setShowFFEConnect(true)}
            onFencersImported={loadFencers}
            onAppelStateChange={handleAppelStateChange}
            onSetFencerStatus={(id, status) => {
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
                if (wasInSpecialStatus) {
                  handleUndoAbandon(id);
                }
              }
              updateFencer(id, { status });
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
            {...(isRapieres
              ? {
                  customDistribution: (list: Fencer[], count: number) =>
                    distributeByLevel(list, count, id => rapieres.teams[id]?.level),
                  customMatchOrder: waveMatchOrder,
                }
              : {})}
            expertMode={expertMode}
            arenaCount={remoteArenaCount}
            onStripChange={(poolId, strip) => {
              // Poule déjà lancée : piste appliquée immédiatement (saisie distante, liens, QR) (#1037)
              const target = pools.find(p => p.id === poolId);
              if (!target) return;
              const updated = { ...target, strip };
              setPools(prev => prev.map(p => (p.id === poolId ? updated : p)));
              window.electronAPI?.db?.updatePool(updated);
            }}
            onPoolsConfirm={async confirmedPools => {
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
              <div className="empty-state">
                <div className="empty-state-icon">🎯</div>
                <h2 className="empty-state-title">Pas de poules</h2>
                <p className="empty-state-description">
                  Retournez à l'appel pour générer les poules
                </p>
                <button className="btn btn-primary" onClick={() => setCurrentPhase('checkin')}>
                  Retour à l'appel
                </button>
              </div>
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
                  />
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    marginBottom: '2rem',
                  }}
                >
                  <GlobalPoolColumnsMenu isLaserSabre={isLaserSabre} />
                  <WindowSizePresets value={poolCardSize} onChange={setPoolCardSize} />
                  <select
                    className="form-input"
                    style={{ width: 'auto', fontWeight: 600 }}
                    value={poolsViewMode}
                    onChange={e => setPoolsViewMode(e.target.value as 'grid' | 'single')}
                    title="Mode d'affichage des poules"
                    aria-label="Mode d'affichage des poules"
                  >
                    <option value="grid">🗂️ Vue globale</option>
                    <option value="single">🎯 Vue poule unique</option>
                  </select>
                  <button
                    className="btn btn-primary"
                    onClick={handlePrintAllPoolsPDF}
                    title="Imprimer les feuilles de poule (Ctrl+P)"
                  >
                    🖨️ Imprimer les feuilles de poule
                  </button>
                  {pools.length > 1 && (
                    <button className="btn btn-success" onClick={handleExportAllPoolsPDF}>
                      📄 Exporter toutes les poules en PDF
                    </button>
                  )}
                </div>
                {poolsViewMode === 'single' ? (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: '1.5rem',
                      }}
                    >
                      <button
                        className="btn btn-secondary"
                        onClick={() =>
                          setSinglePoolIndex(i => (i - 1 + pools.length) % pools.length)
                        }
                        disabled={pools.length <= 1}
                        title="Poule précédente"
                        aria-label="Poule précédente"
                      >
                        ◀
                      </button>
                      <select
                        className="form-input"
                        style={{ width: 'auto', fontWeight: 600, textAlign: 'center' }}
                        value={singlePoolIndex}
                        onChange={e => setSinglePoolIndex(Number(e.target.value))}
                        aria-label="Sélectionner une poule"
                      >
                        {pools.map((pool, i) => (
                          <option key={pool.id} value={i}>
                            Poule {pool.number}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setSinglePoolIndex(i => (i + 1) % pools.length)}
                        disabled={pools.length <= 1}
                        title="Poule suivante"
                        aria-label="Poule suivante"
                      >
                        ▶
                      </button>
                    </div>
                    {/* Largeur ajustée au contenu ; la taille de carte agit comme un zoom (#1124) */}
                    <div style={{ width: '100%', overflowX: 'auto' }}>
                      <div
                        style={{
                          width: 'max-content',
                          minWidth: 'min(100%, 480px)',
                          margin: '0 auto',
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
                    <Suspense fallback={null}>
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
          />
        )}
        {currentPhase === 'ranking' && !viewedRoundPools && (
          <PoolRankingView
            pools={pools}
            ranking={overallRanking}
            weapon={competition.weapon}
            hasDirectElimination={hasDirectElimination}
            isInitialRanking={skipPoolPhase}
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
            title={t('rapieres.ranking_intermediate')}
            ranked={overallRanking.map(r => ({ teamId: r.fencer.id, rank: r.rank }))}
            fencers={fencers}
            teams={rapieres.teams}
            stats={rapieresStats}
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
          <Suspense
            fallback={
              <div
                style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-light)' }}
              >
                Chargement tableau…
              </div>
            }
          >
            {/* Sélecteur de groupe pour compétition couplée */}
            {postPoolSplitCriteria && activeSplitGroup && splitGroups.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid var(--color-border)',
                  background: 'var(--color-surface-2)',
                }}
              >
                {splitGroups.map(g => (
                  <button
                    key={g}
                    onClick={() => handleSwitchSplitGroup(g)}
                    style={{
                      padding: '0.375rem 0.875rem',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: g === activeSplitGroup ? '700' : '400',
                      background:
                        g === activeSplitGroup ? 'var(--color-primary)' : 'var(--color-border)',
                      color: g === activeSplitGroup ? 'white' : 'var(--color-text)',
                      fontSize: '0.875rem',
                    }}
                  >
                    {g === Gender.MALE ? '♂ Hommes' : g === Gender.FEMALE ? '♀ Femmes' : g}
                  </button>
                ))}
              </div>
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
                <span>🔒 Tableau en lecture seule — résultats finaux générés.</span>
                <button
                  onClick={async () => {
                    if (
                      await confirm(
                        'Modifier le tableau effacera les résultats finaux. Continuer ?'
                      )
                    ) {
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
                  ✏️ Modifier le tableau
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
              readOnly={finalResults.length > 0}
              competitionId={competition.id}
              maxRefereesPerMatch={maxRefereesPerMatch}
              autoFillReferees={autoFillReferees}
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
            title={
              finalResults.length > 0
                ? t('rapieres.ranking_final')
                : t('rapieres.ranking_intermediate')
            }
            ranked={mergeFinalRanking(finalResults, overallRanking)}
            fencers={fencers}
            teams={rapieres.teams}
            stats={rapieresStats}
          />
        )}

        <Suspense fallback={null}>
          <RemoteScoreManager
            competition={competition}
            pools={pools}
            tableauMatches={tableauMatches}
            consolationBrackets={consolationBrackets}
            initialStripCount={remoteArenaCount}
            onArenaCountChange={setRemoteArenaCount}
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
      {showPlanningAssistant && (
        <Suspense fallback={null}>
          <PlanningAssistant
            competition={competition}
            pools={pools}
            tableauBrackets={
              currentPhase === 'tableau'
                ? [tableauMatches, ...consolationBrackets.map(b => b.matches)]
                : undefined
            }
            suggestedArenaCount={arenaStates.length || Math.min(pools.length, 4) || 1}
            onClose={() => setShowPlanningAssistant(false)}
          />
        </Suspense>
      )}

      {showExportCenter && (
        <Suspense fallback={null}>
          <ExportCenterModal
            fencers={fencers}
            pools={pools}
            currentPoolRound={currentPoolRound}
            overallRanking={overallRanking}
            finalResults={finalResults}
            tableauMatchesCount={tableauMatches.length}
            isLaserSabre={isLaserSabre}
            onClose={() => setShowExportCenter(false)}
            exportFencersList={exportFencersList}
            exportPoolsPDF={(p, round) => exportPoolsPDF(p, round, poolsRemoteInfo)}
            printPoolsPDF={(p, round) => printPoolsPDF(p, round, poolsRemoteInfo)}
            exportRanking={exportRanking}
            exportRankingExcelCSV={exportRankingExcelCSV}
            exportResults={exportResults}
            exportResultsHTML={exportResultsHTML}
            exportResultsXML={exportResultsXML}
            exportDetailedStats={exportDetailedStats}
            onGoToTableau={() => {
              setCurrentPhase('tableau');
              setShowExportCenter(false);
            }}
            onGoToResults={() => {
              setCurrentPhase('results');
              setShowExportCenter(false);
            }}
            onExportCompetition={
              window.electronAPI?.file?.exportCompetition
                ? () => {
                    void window.electronAPI.file
                      .exportCompetition(competition.id)
                      .then(res => {
                        if (res?.success) showToast('Compétition exportée', 'success');
                      })
                      .catch(() => showToast("Échec de l'export de la compétition", 'error'));
                  }
                : undefined
            }
            onExportFFE={() => {
              setShowFFEExport(true);
              setShowExportCenter(false);
            }}
          />
        </Suspense>
      )}

      {showFFEExport && (
        <Suspense fallback={null}>
          <FFEExportModal ranking={overallRanking} onClose={() => setShowFFEExport(false)} />
        </Suspense>
      )}

      {rapieresTeamModal && (
        <RapieresTeamModal
          initial={
            rapieresTeamModal.fencer
              ? {
                  name: rapieresTeamModal.fencer.lastName,
                  info: rapieres.teams[rapieresTeamModal.fencer.id] ?? {
                    level: 'beginner',
                    fencers: [
                      { lastName: '', firstName: '', category: 'SENIOR' },
                      { lastName: '', firstName: '', category: 'SENIOR' },
                    ],
                  },
                }
              : undefined
          }
          onSave={team => handleSaveRapieresTeam(team, rapieresTeamModal.fencer)}
          onClose={() => setRapieresTeamModal(null)}
        />
      )}

      {showAddFencerModal && (
        <AddFencerModal
          onClose={() => setShowAddFencerModal(false)}
          onAdd={fencer => addFencer(fencer as any)}
          competitionGender={competition.gender}
        />
      )}

      {pendingSplitOffGroup && (
        <SplitCompetitionModal
          groupLabel={
            pendingSplitOffGroup === Gender.FEMALE
              ? '♀ Femmes'
              : pendingSplitOffGroup === Gender.MALE
                ? '♂ Hommes'
                : pendingSplitOffGroup
          }
          fencerCount={extractSplitGroupRanking(overallRanking, pendingSplitOffGroup).length}
          defaultTitle={defaultSplitCompetitionTitle(competition.title, pendingSplitOffGroup)}
          onConfirm={title => createSplitOffCompetition(pendingSplitOffGroup, title)}
          onCancel={() => setPendingSplitOffGroup(null)}
        />
      )}

      {showPropertiesModal && (
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
          onClose={() => setShowPropertiesModal(false)}
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

      {showThirdPlaceDialog && (
        <div className="modal-overlay" style={CV_STYLES.thirdPlaceOverlay}>
          <div style={CV_STYLES.thirdPlaceModal}>
            <h3 style={CV_STYLES.thirdPlaceTitle}>{t('competition.third_place_match_dialog')}</h3>
            <div style={CV_STYLES.thirdPlaceBtnRow}>
              <button className="btn btn-secondary" onClick={() => handleThirdPlaceDecision(false)}>
                Non
              </button>
              <button className="btn btn-primary" onClick={() => handleThirdPlaceDecision(true)}>
                Oui
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nouveaux modals */}
      {showFencerComparison && (
        <Suspense fallback={null}>
          <FencerComparison
            fencers={fencers}
            pools={pools}
            tableauMatches={tableauMatches}
            onClose={() => setShowFencerComparison(false)}
          />
        </Suspense>
      )}

      {showAnalytics && (
        <Suspense fallback={null}>
          <AnalyticsDashboard
            competition={competition}
            pools={pools}
            matches={pools.flatMap(p => p.matches ?? [])}
            fencers={fencers}
            onClose={() => setShowAnalytics(false)}
          />
        </Suspense>
      )}

      {showQRCode && <QRCodeShare competition={competition} onClose={() => setShowQRCode(false)} />}

      {showSeasonRanking && (
        <Suspense fallback={null}>
          <SeasonRankingView
            onClose={() => setShowSeasonRanking(false)}
            availableCompetitions={[competition]}
            availablePoolsByComp={{ [competition.id]: pools }}
          />
        </Suspense>
      )}

      {showFFEConnect && (
        <Suspense fallback={null}>
          <FFEConnectModal
            onImport={async imported => {
              await handleImportFencers(imported);
              setShowFFEConnect(false);
            }}
            onClose={() => setShowFFEConnect(false)}
          />
        </Suspense>
      )}

      {/* Mode Présentation */}
      {showPresentation && (
        <Suspense fallback={null}>
          <PresentationMode
            competition={competition}
            pools={pools}
            onClose={() => setShowPresentation(false)}
          />
        </Suspense>
      )}

      {/* Mode Kiosk Public - Affichage grand écran */}
      {showKioskDisplay && (
        <Suspense fallback={null}>
          <KioskDisplay
            competition={competition}
            pools={pools}
            weapon={competition.weapon}
            tableauMatches={tableauMatches}
            onClose={() => setShowKioskDisplay(false)}
          />
        </Suspense>
      )}

      {/* Mode Kiosk - Interface tablette arbitre */}
      {showKiosk && pools.length > 0 && (
        <KioskScoreEntry
          pools={pools}
          poolMaxScore={poolMaxScore}
          allPoolsComplete={areAllPoolsComplete()}
          updateScore={updateScore}
          onClose={() => setShowKiosk(false)}
          onFinish={() => {
            setShowKiosk(false);
            handleGoToRanking();
          }}
        />
      )}
    </div>
  );
};

export default React.memo(CompetitionView);
