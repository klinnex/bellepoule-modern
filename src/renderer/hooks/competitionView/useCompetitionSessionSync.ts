/**
 * BellePoule Modern - Session, synchronisation distante, menu natif et rapières de la compétition
 * Licensed under GPL-3.0
 */

import { usePrintShortcut } from '../usePrintShortcut';
import { useState, useCallback } from 'react';
import { FencerStatus, Pool } from '../../../shared/types';
import { poolsHaveScores } from '../../components/poolLaunchState';
import { persistPools } from '../../components/poolPersistence';
import { useSplitGroups } from '../useSplitGroups';
import { useCompetitionNavigation } from '../useCompetitionNavigation';
import { useCompetitionMenu } from '../useCompetitionMenu';
import { useCompetitionBootstrap } from '../useCompetitionBootstrap';
import { useCompetitionRestore } from '../useCompetitionRestore';
import { useRemoteScoreSync } from '../useRemoteScoreSync';
import { useCompetitionReferees } from '../useCompetitionReferees';
import { useRapieresCompetition } from '../../../features/rapieres/useRapieresCompetition';
import { useMatchDbSync } from '../useMatchDbSync';
import { useRapieresTeams } from '../../../features/rapieres/useRapieresTeams';
import { useRapieresViewProps } from '../../../features/rapieres/useRapieresViewProps';
import type { CompetitionViewProps } from '../../components/competition/competitionViewTypes';
import { useCompetitionCore } from './useCompetitionCore';
import type { PoolPrepDraft } from '../../components/PoolPrepView';

type Ctx = CompetitionViewProps & ReturnType<typeof useCompetitionCore>;

/** Session, synchronisation distante, menu natif et rapières de la compétition (extrait de CompetitionView, #1599) */
export function useCompetitionSessionSync(ctx: Ctx) {
  const {
    competition,
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
    fencers,
    loadFencers,
    syncFencersToPool,
    setReferees,
    isRemoteActive,
    setIsRemoteActive,
    setRemoteServerUrl,
    tableauMatchesRef,
    consolationBracketsRef,
    poolsRef,
    handleFencerForfeitRef,
    setArenaStates,
    updateMatchFromRemote,
    handleBlackCardCancelled,
    updateFencer,
    effectiveSettings,
    isLaserSabre,
    exports,
    setImportData,
    modals,
    confirm,
    t,
    generatePoolsHook,
    getSeededCheckedInFencers,
    rapieres,
    addFencer,
    bulkAddFencers,
    setRapieresTeam,
    updateRapieres,
    remoteServerUrl,
    exportPoolsPDF,
    printPoolsPDF,
    onUpdate,
    updateFencers,
    getCheckedInFencers,
    computeOverallRanking,
    nextPoolRound,
    currentAppelFencers,
    poolRoundQualifiers,
    customFormula,
    hasDirectElimination,
    thirdPlaceMatch,
    playAllPositions,
    setShowRapieresTableauDialog,
    setViewedPoolRound,
    rankingChanged,
    setRankingChanged,
    activeSplitGroup,
    setActiveSplitGroup,
    splitTableauStates,
    setSplitTableauStates,
    onOpenCompetition,
    setPendingSplitOffGroup,
    splitOffInProgress,
    setSplitOffInProgress,
    referees,
    tableMaxScore,
  } = ctx;

  // Poules lancées au moins une fois (onglet Poules libéré, boutons « Relancer ») (#1499)
  const [poolsLaunched, setPoolsLaunched] = useState(false);
  // Poules lancées puis repréparées : onglet Poules verrouillé, bouton « Relancer » (#1649)
  const [poolsRelaunchPending, setPoolsRelaunchPending] = useState(false);
  // Préparation modifiée, conservée au retour vers l'appel jusqu'à « Repréparer » (#1649)
  const [poolPrepDraft, setPoolPrepDraft] = useState<PoolPrepDraft | null>(null);

  const { isLoaded } = useCompetitionRestore({
    competitionId: competition.id,
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
  });

  useCompetitionBootstrap({
    competitionId: competition.id,
    refereeFeatureEnabled: !!competition.settings?.refereeFeatureEnabled,
    fencers,
    loadFencers,
    syncFencersToPool,
    setReferees,
    isRemoteActive,
    setIsRemoteActive,
    setRemoteServerUrl,
  });

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
      setPoolPrepDraft(null);
      // Poules lancées vidées : onglet Poules verrouillé jusqu'à « Relancer les poules » (#1649)
      if (poolsLaunched) {
        setPoolsLaunched(false);
        setPoolsRelaunchPending(true);
      }
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

  return {
    poolsLaunched,
    setPoolsLaunched,
    poolsRelaunchPending,
    setPoolsRelaunchPending,
    poolPrepDraft,
    setPoolPrepDraft,
    isLoaded,
    fireWebhookNotif,
    persistPoolsToDB,
    handleCheckInFencer,
    confirmScoresLoss,
    handleGeneratePools,
    rapieresViewProps,
    rapieresTeams,
    handleSaveRapieresTeam,
    resetRapieresWaves,
    rapieresStats,
    currentWaveMatchIds,
    printWaves,
    handlePrintWaveSheets,
    poolsRemoteInfo,
    handleExportAllPoolsPDF,
    handlePrintAllPoolsPDF,
    handleQuestConfigUpdate,
    handleGoToRanking,
    handleSkipToRanking,
    handleGoToTableau,
    handleRapieresTableauMode,
    handleThirdPlaceDecision,
    handleNextPoolRound,
    splitGroups,
    handleSwitchSplitGroup,
    handleSplitOff,
    createSplitOffCompetition,
    questConfig,
    questEnabled,
    questNoPool,
    autoFillReferees,
    applyPoolRefereeAssignments,
    handlePoolAutoFillReferees,
    handlePoolRefereeAssigned,
    refereeAssignableMatches,
  };
}
