/**
 * BellePoule Modern - État de base de la compétition : réglages, tireurs, poules, vue des poules
 * Licensed under GPL-3.0
 */

import { useStateGroup } from '../useStateGroup';
import {
  CV_REMOTE_INIT,
  CV_PLANNING_INIT,
  CV_SPLIT_INIT,
  CV_DATA_INIT,
} from '../../components/competition/competitionViewState';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getDefaultMaxScores } from '../../../shared/utils/defaultMaxScores';
import { Fencer, FencerStatus, Weapon } from '../../../shared/types';
import { TableauMatch, ConsolationBracket } from '../../components/tableau/tableauTypes';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmDialog';
import { useTranslation } from '../useTranslation';
import { Phase } from '../useCompetitionSession';
import { useFencerManagement } from '../useFencerManagement';
import { usePoolManagement } from '../usePoolManagement';
import { useExport } from '../useExport';
import { useCompetitionImport } from '../useCompetitionImport';
import { usePoolsWindowSize } from '../usePoolsWindowSize';
import { seedFencersFromRanking } from '../../../shared/utils/poolRounds';
import {
  getActiveFormula,
  isRapieresMode,
  resolveCompetitionSettings,
} from '../../../shared/utils/customFormulaSettings';
import { allowsVictoryTieBreak } from '../../../shared/utils/tieBreak';
import { useRapieresSessionState } from '../../../features/rapieres/useRapieresSessionState';
import { useColumnVisibility } from '../useColumnVisibility';
import { useModalFlags } from '../useModalFlags';
import { usePoolsViewSettings } from '../usePoolsViewSettings';
import { MODAL_FLAGS } from '../../components/competition/modalFlags';
import type { CompetitionViewProps } from '../../components/competition/competitionViewTypes';

type Ctx = CompetitionViewProps;

/** État de base de la compétition : réglages, tireurs, poules, vue des poules (extrait de CompetitionView, #1599) */
export function useCompetitionCore(ctx: Ctx) {
  const { competition, requestPhase, onPhaseApplied, onRemoteServerChange, onUpdate } = ctx;

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
  const defaultScores = getDefaultMaxScores(competition.weapon, competition.category);
  const poolMaxScore = effectiveSettings?.defaultPoolMaxScore ?? defaultScores.pool;
  const tableMaxScore = effectiveSettings?.defaultTableMaxScore ?? defaultScores.table;
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
    handleImportReferees,
  } = useCompetitionImport({ competition, onUpdate, bulkAddFencers, referees, setReferees });

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
    referees,
  });
  const { exportPoolsPDF, printPoolsPDF, exportResultsXML } = exports;

  return {
    confirm,
    t,
    language,
    customFormula,
    effectiveSettings,
    poolRounds,
    poolRoundQualifiers,
    hasDirectElimination,
    thirdPlaceMatch,
    playAllPositions,
    poolMaxScore,
    tableMaxScore,
    isLaserSabre,
    expertMode,
    maxRefereesPerPool,
    maxRefereesPerMatch,
    poolWinnersOnly,
    isRapieres,
    tieBreakByVictory,
    postPoolSplitCriteria,
    splitOffCompetitionIds,
    auditLogEnabled,
    currentPhase,
    setCurrentPhase,
    modals,
    setShowConfetti,
    setShowActionsMenu,
    isRemoteActive,
    setIsRemoteActive,
    remoteServerUrl,
    setRemoteServerUrl,
    remoteArenaCount,
    setRemoteArenaCount,
    remoteStripStart,
    setRemoteStripStart,
    arenaStates,
    setArenaStates,
    tableauMatches,
    setTableauMatches,
    consolationBrackets,
    setConsolationBrackets,
    finalResults,
    setFinalResults,
    appelFencers,
    appelVisibleColumns,
    setTableauEditUnlocked,
    referees,
    setReferees,
    tableauMatchesRef,
    consolationBracketsRef,
    handleAppelStateChange,
    rapieresState,
    setRapieresState,
    rapieresTeamModal,
    setRapieresTeamModal,
    rapieres,
    updateRapieres,
    setRapieresTeam,
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
    activeSplitGroup,
    setActiveSplitGroup,
    pendingSplitOffGroup,
    setPendingSplitOffGroup,
    splitOffInProgress,
    setSplitOffInProgress,
    splitTableauStates,
    setSplitTableauStates,
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
    importData,
    setImportData,
    handleImportFencers,
    handleOpenImportDialog,
    handleImportRanking,
    handleImportReferees,
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
    generatePoolsHook,
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
    poolCardSize,
    setPoolCardSize,
    poolsViewMode,
    setPoolsViewMode,
    singlePoolIndex,
    setSinglePoolIndex,
    getSeededCheckedInFencers,
    viewedPoolRound,
    setViewedPoolRound,
    showRapieresTableauDialog,
    setShowRapieresTableauDialog,
    currentAppelFencers,
    viewedRoundAppel,
    viewedRoundPools,
    poolsRef,
    handleFencerForfeitRef,
    exports,
    exportPoolsPDF,
    printPoolsPDF,
    exportResultsXML,
  };
}
