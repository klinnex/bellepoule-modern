/**
 * BellePoule Modern - Session, synchronisation distante, menu natif et rapières de la compétition
 * Licensed under GPL-3.0
 */

import { usePrintShortcut } from '../usePrintShortcut';
import { useState, useCallback } from 'react';
import { FencerStatus, type Fencer, type Pool } from '../../../shared/types';
import {
  poolsHaveScores,
  poolsMatchFencers,
  scoredMatchesLost,
} from '../../components/poolLaunchState';
import { persistPools } from '../../components/poolPersistence';
import type { PoolPrepDraft } from '../../components/PoolPrepView';
import { useSplitGroups } from '../useSplitGroups';
import { useCompetitionNavigation } from '../useCompetitionNavigation';
import { useCompetitionMenu } from '../useCompetitionMenu';
import { useCompetitionBootstrap } from '../useCompetitionBootstrap';
import { useCompetitionRestore } from '../useCompetitionRestore';
import { useRemoteScoreSync } from '../useRemoteScoreSync';
import { useRecordScore } from '../useRecordScore';
import { useFencerWithdrawal, type WithdrawInput } from '../useFencerWithdrawal';
import { usePoolFencerAdd, usePoolsLaunch, useTableauGenerate } from '../usePoolsLaunch';
import { checkInStatusUpdate } from '../../../shared/utils/forfeit';
import { isWithdrawn } from '../../../shared/domain/fencers/fencerStatus';
import {
  WITHDRAWAL_STATUS,
  type WithdrawalReason,
} from '../../../shared/domain/fencers/withdrawal';
import { useCompetitionReferees } from '../useCompetitionReferees';
import { useRapieresCompetition } from '../../../features/rapieres/useRapieresCompetition';
import { useMatchDbSync } from '../useMatchDbSync';
import { useRapieresTeams } from '../../../features/rapieres/useRapieresTeams';
import { useRapieresViewProps } from '../../../features/rapieres/useRapieresViewProps';
import type { CompetitionViewProps } from '../../components/competition/competitionViewTypes';
import { useCompetitionCore } from './useCompetitionCore';

type Ctx = CompetitionViewProps & ReturnType<typeof useCompetitionCore>;

/** Statut de la liste d'appel → motif de retrait (docs/adr/0016) */
const REASON_BY_STATUS: Partial<Record<FencerStatus, WithdrawalReason>> = {
  [FencerStatus.ABANDONED]: 'abandon',
  [FencerStatus.FORFAIT]: 'forfait',
  [FencerStatus.EXCLUDED]: 'exclusion',
};

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
  // « Repréparer » après lancement : onglet Poules verrouillé jusqu'à « Relancer » (#1649)
  const [relaunchPending, setRelaunchPending] = useState(false);
  // Modifications de préparation gardées au retour vers l'appel (#1649)
  const [poolPrepDraft, setPoolPrepDraft] = useState<PoolPrepDraft | null>(null);

  const { isLoaded, flushPendingSave } = useCompetitionRestore({
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

  // Saisie locale historique : format que le moteur ne pilote pas, ou hors Electron
  const { handleFencerForfeit: localForfeit } = ctx;
  const localWithdraw = useCallback(
    (fencerId: string, reason: WithdrawalReason, blackCard = false) => {
      void localForfeit(fencerId, reason);
      updateFencer(fencerId, {
        ...checkInStatusUpdate(pools, fencerId, WITHDRAWAL_STATUS[reason]),
        ...(reason === 'exclusion' ? { exclusionReason: blackCard ? 'black_card' : null } : {}),
      });
    },
    [localForfeit, updateFencer, pools]
  );
  const localReinstate = (fencerId: string) => {
    void ctx.handleUndoAbandon(fencerId);
    updateFencer(fencerId, { status: FencerStatus.CHECKED_IN, exclusionReason: null });
  };

  // Un fait, un chemin (#1980, ADR-0005) : scores saisis à l'écran par recordScore
  const recordScreenScore = useRecordScore(competition.id, flushPendingSave);
  const fencerWithdrawal = useFencerWithdrawal(competition.id, flushPendingSave);
  const launchPools = usePoolsLaunch(competition.id, flushPendingSave);
  const addPoolFencer = usePoolFencerAdd(competition.id, flushPendingSave);
  const generateTableau = useTableauGenerate(competition.id, flushPendingSave);
  const localUpdateScore = ctx.updateScore;
  const updateScore = useCallback(
    (...args: Parameters<typeof localUpdateScore>) => {
      const [
        poolIndex,
        matchIndex,
        scoreA,
        scoreB,
        winner,
        specialStatus,
        priority,
        correction,
        blackCard,
      ] = args;
      const match = pools[poolIndex]?.matches[matchIndex];
      // Correction après tirage du tableau (#1996) : saisie locale historique ; un statut
      // spécial passe par recordScore (retrait du perdant par le moteur, docs/adr/0016)
      if (!match || correction) {
        localUpdateScore(...args);
        return;
      }
      void recordScreenScore({
        matchId: match.id,
        scoreA,
        scoreB,
        ...(winner ? { winner } : {}),
        ...(priority ? { priority } : {}),
        ...(specialStatus ? { specialStatus } : {}),
        ...(specialStatus === 'exclusion' && blackCard ? { blackCard: true } : {}),
      }).then(outcome => {
        if (outcome !== 'local') return;
        localUpdateScore(...args);
        // Repli local : retrait du perdant à l'écran, comme avant le moteur
        const loser = winner === 'A' ? match.fencerB : winner === 'B' ? match.fencerA : null;
        if (specialStatus && loser) localWithdraw(loser.id, specialStatus, blackCard);
      });
    },
    [pools, localUpdateScore, recordScreenScore, localWithdraw]
  );

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
    withdraw: fencerWithdrawal.withdraw,
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
  // Pointage : commande checkIn du contrat, seul chemin d'écriture (#1980, ADR-0005)
  const handleCheckInFencer = (id: string) => {
    void ctx.toggleCheckIn(id);
  };

  // ─── Retrait et réintégration d'un tireur (docs/adr/0016) ─────────────────
  /** Retrait (appel, poule, tableau) par withdrawFencer ; repli local si le moteur ne pilote pas */
  const handleWithdrawFencer = useCallback(
    async (input: WithdrawInput) => {
      const outcome = await fencerWithdrawal.withdraw(input);
      if (outcome === 'local') localWithdraw(input.fencerId, input.reason, input.blackCard);
      return outcome;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fencerWithdrawal, pools]
  );

  const handleReinstateFencer = useCallback(
    async (fencerId: string) => {
      const outcome = await fencerWithdrawal.reinstate(fencerId);
      if (outcome === 'local') localReinstate(fencerId);
      return outcome;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fencerWithdrawal]
  );

  /** Statut posé depuis la liste d'appel : abandon, forfait, ou réactivation d'un tireur retiré */
  const handleSetFencerStatus = async (
    id: string,
    status: FencerStatus
  ): Promise<'recorded' | 'local' | 'refused'> => {
    const reason = REASON_BY_STATUS[status];
    if (reason) return handleWithdrawFencer({ fencerId: id, reason });
    const current = fencers.find(f => f.id === id);
    if (isWithdrawn(current)) {
      const outcome = await handleReinstateFencer(id);
      if (outcome === 'recorded' && status === FencerStatus.NOT_CHECKED_IN) {
        await ctx.toggleCheckIn(id);
      }
      return outcome;
    }
    if (current && current.status !== status) await ctx.toggleCheckIn(id);
    return 'recorded';
  };

  /**
   * Fiche du tireur : les champs descriptifs s'enregistrent tels quels ; un changement de
   * statut passe par la commande qui porte sa règle (ADR-0008 : pas de patch sur le statut)
   */
  const handleEditFencer = async (id: string, updates: Partial<Fencer>) => {
    const current = fencers.find(f => f.id === id);
    const { status, exclusionReason: _reason, ...details } = updates;
    const statusChange = status !== undefined && !!current && status !== current.status;
    if (!statusChange) return updateFencer(id, updates);
    if (Object.keys(details).length > 0) await updateFencer(id, details);
    await handleSetFencerStatus(id, status);
  };

  /**
   * Alerte « scores perdus » avant de régénérer des poules déjà saisies (#1499).
   * `next` : poules qui remplaceront les actuelles ; alerte seulement si des matchs saisis disparaissent (#1992)
   */
  const confirmScoresLoss = async (next?: Pool[]): Promise<boolean> =>
    !(next ? scoredMatchesLost(pools, next) : poolsHaveScores(pools)) ||
    (await confirm(t('pools.relaunch_confirm')));

  /** Appel inchangé (mêmes tireurs pointés que dans les poules) : préparation sans régénérer (#1992) */
  const checkinUnchanged = poolsMatchFencers(pools, getSeededCheckedInFencers());

  const handleGeneratePools = async () => {
    if (checkinUnchanged) {
      setCurrentPhase('poolprep');
      return;
    }
    if (!(await confirmScoresLoss())) return;
    const newPools = generatePoolsHook(getSeededCheckedInFencers(), currentPoolRound);
    if (newPools) {
      resetRapieresWaves(newPools);
      setPoolPrepDraft(null);
      if (poolsLaunched) {
        setPoolsLaunched(false);
        setRelaunchPending(true);
      }
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
    notify: ctx.showToast,
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
    notify: ctx.showToast,
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
    flushSession: flushPendingSave,
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
    updateScore,
    recordScreenScore,
    handleWithdrawFencer,
    launchPools,
    addPoolFencer,
    generateTableau,
    handleReinstateFencer,
    handleSetFencerStatus,
    handleEditFencer,
    poolsLaunched,
    setPoolsLaunched,
    relaunchPending,
    setRelaunchPending,
    poolPrepDraft,
    setPoolPrepDraft,
    isLoaded,
    fireWebhookNotif,
    persistPoolsToDB,
    handleCheckInFencer,
    confirmScoresLoss,
    checkinUnchanged,
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
