/**
 * BellePoule Modern - Enchaînement des phases : navigation, arbitres, groupes, valeurs dérivées et carte de poule
 * Licensed under GPL-3.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import type { Fencer } from '../../../shared/types';
import {
  rapieresCategoryAbbr,
  rapieresTeamCategory,
} from '../../../shared/domain/rapieres/rapieresAge';
import type { PoolPrepLaunchAction } from '../../components/PoolPrepView';
import { buildStripQrs } from '../useExport';
import { usePoolStripChange } from '../usePoolStripChange';
import { useCompetitionPhases } from '../useCompetitionPhases';
import { useRemoteCheckinSync } from '../useRemoteCheckinSync';
import { buildMatchAuditOptions } from '../../components/competition/matchAuditOptions';
import CompetitionPoolCard from '../../components/competition/CompetitionPoolCard';
import PoolRoundSelector from '../../components/competition/PoolRoundSelector';
import {
  computeEffectiveTableauRanking,
  computeMatchProgress,
} from '../../../shared/domain/ranking/tableauRanking';
import type { CompetitionViewProps } from '../../components/competition/competitionViewTypes';
import { useCompetitionSessionSync } from './useCompetitionSessionSync';
import { useCompetitionCore } from './useCompetitionCore';
import { usePoolCorrection } from './usePoolCorrection';
import { useToast } from '../../components/Toast';

type Ctx = CompetitionViewProps &
  ReturnType<typeof useCompetitionCore> &
  ReturnType<typeof useCompetitionSessionSync>;

/** Enchaînement des phases : navigation, arbitres, groupes, valeurs dérivées et carte de poule (extrait de CompetitionView, #1599) */
export function useCompetitionPhaseFlow(ctx: Ctx) {
  const {
    competition,
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
    rapieres,
    currentPoolRound,
    poolRounds,
    hasDirectElimination,
    finalResults,
    tableauMatches,
    questEnabled,
    questNoPool,
    questConfig,
    auditLogEnabled,
    isRemoteActive,
    remoteServerUrl,
    loadFencers,
    setReferees,
    t,
    handleGoToRanking,
    setShowConfetti,
    modals,
    setShowActionsMenu,
    overallRanking,
    poolWinnersOnly,
    customFormula,
    postPoolSplitCriteria,
    activeSplitGroup,
    splitOffCompetitionIds,
    consolationBrackets,
    viewedRoundPools,
    viewedPoolRound,
    setViewedPoolRound,
    setPools,
    poolsRemoteInfo,
    tieBreakByVictory,
    poolMaxScore,
    maxRefereesPerPool,
    updateScore,
    resetMatch,
    cancelMatch,
    computePoolRanking,
    fireWebhookNotif,
    remoteStripStart,
    remoteArenaCount,
    arenaStates,
    poolCardSize,
    autoFillReferees,
    handlePoolAutoFillReferees,
    handlePoolRefereeAssigned,
    currentWaveMatchIds,
    setTableauMatches,
    setConsolationBrackets,
    setFinalResults,
    splitTableauStates,
    isLaserSabre,
  } = ctx;
  const { showToast } = useToast();

  // Tableau tiré : poules figées, correction vérifiée (#1996)
  const {
    poolsFrozen,
    freezeFor,
    requestScore,
    poolCorrectionDialog,
    tableauDrift,
    requestRebuild,
  } = usePoolCorrection({
    pools,
    poolHistory,
    overallRanking,
    tableauMatches,
    consolationBrackets,
    splitTableauStates,
    isLaserSabre,
    setTableauMatches,
    setConsolationBrackets,
    setFinalResults,
    setCurrentPhase,
    showToast,
    t,
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
  const effectiveTableauRanking = useMemo(
    () =>
      computeEffectiveTableauRanking(overallRanking, pools, {
        isRapieres,
        rapieresTableauMode: rapieres.tableauMode,
        poolWinnersOnly,
        customFormula,
        postPoolSplitCriteria,
        activeSplitGroup,
        splitOffCompetitionIds,
      }),
    [
      overallRanking,
      pools,
      isRapieres,
      rapieres.tableauMode,
      poolWinnersOnly,
      customFormula,
      postPoolSplitCriteria,
      activeSplitGroup,
      splitOffCompetitionIds,
    ]
  );

  // Calcul progression matchs
  const matchProgress = useMemo(
    () => computeMatchProgress(pools, tableauMatches),
    [pools, tableauMatches]
  );

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
      <PoolRoundSelector
        currentPoolRound={currentPoolRound}
        viewedPoolRound={viewedPoolRound}
        onViewRound={setViewedPoolRound}
      />
    ) : null;

  const handlePoolStripChange = usePoolStripChange(competition.id, pools, setPools);

  const stripQrs = buildStripQrs(pools, poolsRemoteInfo);
  // Tournoi des rapières : colonne « Cat. » des poules (#1864)
  const rapieresTeams = rapieres.teams;
  const poolCategoryOf = useMemo(
    () =>
      isRapieres
        ? (f: Fencer) => {
            const info = rapieresTeams[f.id];
            return info ? rapieresCategoryAbbr(rapieresTeamCategory(info, new Date())) : '';
          }
        : undefined,
    [isRapieres, rapieresTeams]
  );
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
      computePoolRanking={computePoolRanking}
      setPools={setPools}
      addPoolFencer={ctx.addPoolFencer}
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
      categoryOf={poolCategoryOf}
      tableauFreeze={freezeFor(pool.id)}
      requestScore={requestScore}
    />
  );

  return {
    isTeamEvent,
    phases,
    handleGoBack,
    canAdvanceFromPools,
    isLastPoolRound,
    poolsNextAction,
    poolPrepLaunch,
    setPoolPrepLaunch,
    actionsMenuRef,
    effectiveTableauRanking,
    matchProgress,
    matchAuditOptions,
    historyPoolsToShow,
    poolRoundSelector,
    handlePoolStripChange,
    renderPoolCard,
    poolsFrozen,
    poolCorrectionDialog,
    tableauDrift,
    requestRebuild,
  };
}
