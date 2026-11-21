/**
 * BellePoule Modern - Competition View Component (Refactored)
 * Licensed under GPL-3.0
 */

import GregAutoPublishToggle from './remote/GregAutoPublishToggle';
import { useGregAutoPublish } from '../hooks/useGregAutoPublish';
import React, { Suspense } from 'react';
import { Fencer, Gender } from '../../shared/types';
import FencerList from './FencerList';
import ResultsView from './ResultsView';
import AddFencerModal from './AddFencerModal';
import CompetitionPropertiesModal from './CompetitionPropertiesModal';
import SplitCompetitionModal from './SplitCompetitionModal';
import {
  defaultSplitCompetitionTitle,
  extractSplitGroupRanking,
} from '../../shared/utils/splitCompetition';
import ImportModal from './ImportModal';
import PoolPrepView from './PoolPrepView';
import { TEAM_PHASE_VIEWS, isTeamPhase } from './competition/teamPhases';
import type { TeamPhase } from './competition/teamPhases';
import { CV_STYLES } from './competition/competitionViewStyles';
import { emptyRapieresTeamInfo } from '../../shared/domain/rapieres/rapieres.types';
import {
  rapieresSemifinalists,
  mergeFinalRanking,
  RAPIERES_MAX_POOL_SIZE,
  applyClassicOrder,
} from '../../shared/domain/rapieres/rapieresCalculations';
import RapieresTeamModal from '../../features/rapieres/RapieresTeamModal';
import RapieresTableauModeDialog from '../../features/rapieres/RapieresTableauModeDialog';
import RapieresMatchOrderDialog from '../../features/rapieres/RapieresMatchOrderDialog';
import {
  hasClassicOrder,
  type RapieresMatchOrder,
} from '../../shared/domain/rapieres/rapieresClassicOrder';
import RapieresImportModal from '../../features/rapieres/RapieresImportModal';
import RapieresRankingPanel from '../../features/rapieres/RapieresRankingPanel';
import { ScoreAuditLog } from './ScoreAuditLog';
import CompetitionHeader from './competition/CompetitionHeader';
import CompetitionNav from './competition/CompetitionNav';
import CompetitionExportModals from './competition/CompetitionExportModals';
import CompetitionSecondaryModals from './competition/CompetitionSecondaryModals';
import RefereesPhase from './competition/RefereesPhase';
import TableauPhase from './competition/TableauPhase';
import type { CompetitionViewProps } from './competition/competitionViewTypes';
import { useCompetitionPhaseFlow } from '../hooks/competitionView/useCompetitionPhaseFlow';
import { useCompetitionSessionSync } from '../hooks/competitionView/useCompetitionSessionSync';
import { useCompetitionCore } from '../hooks/competitionView/useCompetitionCore';
import QuestSection from './competition/QuestSection';
import PoolsPhase from './competition/PoolsPhase';
import RankingPhase from './competition/RankingPhase';
import { rankingTableauNavAction } from './competition/competitionDerived';

const RemoteScoreManager = React.lazy(() => import('./RemoteScoreManager'));
const MatchAuditLog = React.lazy(() =>
  import('./MatchAuditLog').then(m => ({ default: m.MatchAuditLog }))
);

const TeamManagerView = React.lazy(() =>
  import('./TeamManagerView').then(m => ({ default: m.TeamManagerView }))
);

// ─── Static style constants ───────────────────────────────────────────────────

const CompetitionView: React.FC<CompetitionViewProps> = (props: CompetitionViewProps) => {
  const competitionCore = useCompetitionCore({ ...props });
  const competitionSessionSync = useCompetitionSessionSync({ ...props, ...competitionCore });
  const competitionPhaseFlow = useCompetitionPhaseFlow({
    ...props,
    ...competitionCore,
    ...competitionSessionSync,
  });
  // Rapières : choix de l'ordre des combats au lancement des poules (#1816)
  const [matchOrderPrompt, setMatchOrderPrompt] = React.useState<
    ((order: RapieresMatchOrder | null) => void) | null
  >(null);
  const askMatchOrder = () =>
    new Promise<RapieresMatchOrder | null>(resolve => setMatchOrderPrompt(() => resolve));
  const answerMatchOrder = (order: RapieresMatchOrder | null) => {
    matchOrderPrompt?.(order);
    setMatchOrderPrompt(null);
  };
  const {
    competition,
    language,
    t,
    matchProgress,
    modals,
    actionsMenuRef,
    currentPhase,
    pools,
    tableauMatches,
    fencers,
    getCheckedInFencers,
    setCurrentPhase,
    phases,
    handleGoBack,
    handleGeneratePools,
    checkinUnchanged,
    poolsNextAction,
    poolPrepLaunch,
    questEnabled,
    questConfig,
    isTeamEvent,
    isLoaded,
    isRemoteActive,
    poolsLaunched,
    currentPoolRound,
    poolRoundSelector,
    viewedRoundAppel,
    viewedPoolRound,
    currentAppelFencers,
    handleCheckInFencer,
    isRapieres,
    setRapieresTeamModal,
    rapieresViewProps,
    rapieresTeams,
    remoteServerUrl,
    updateFencer,
    deleteFencer,
    deleteAllFencers,
    checkInAll,
    uncheckAll,
    handleOpenImportDialog,
    loadFencers,
    handleAppelStateChange,
    getSeededCheckedInFencers,
    poolMaxScore,
    minFencersPerPool,
    maxFencersPerPool,
    expertMode,
    remoteArenaCount,
    remoteStripStart,
    handlePoolStripChange,
    confirmScoresLoss,
    setPoolsLaunched,
    relaunchPending,
    setRelaunchPending,
    poolPrepDraft,
    setPoolPrepDraft,
    resetRapieresWaves,
    setPools,
    setSkipPoolPhase,
    persistPoolsToDB,
    handleSkipToRanking,
    setPoolPrepLaunch,
    setMinFencersPerPool,
    setMaxFencersPerPool,
    historyPoolsToShow,
    tieBreakByVictory,
    isLaserSabre,
    renderPoolCard,
    poolsFrozen,
    poolCorrectionDialog,
    tableauDrift,
    requestRebuild,
    rapieres,
    updateRapieres,
    confirm,
    setOverallRanking,
    computeOverallRanking,
    handlePrintWaveSheets,
    printWaves,
    poolCardSize,
    setPoolCardSize,
    poolsViewMode,
    setPoolsViewMode,
    singlePoolIndex,
    setSinglePoolIndex,
    handlePrintAllPoolsPDF,
    handleExportAllPoolsPDF,
    viewedRoundPools,
    overallRanking,
    hasDirectElimination,
    skipPoolPhase,
    poolWinnersOnly,
    postPoolSplitCriteria,
    splitOffCompetitionIds,
    handleGoToTableau,
    setRankingChanged,
    handleSplitOff,
    isLastPoolRound,
    canAdvanceFromPools,
    handleNextPoolRound,
    rapieresStats,
    setRankingValidated,
    handleQuestConfigUpdate,
    activeSplitGroup,
    splitGroups,
    handleSwitchSplitGroup,
    effectiveTableauRanking,
    setTableauMatches,
    consolationBrackets,
    setConsolationBrackets,
    finalResults,
    setFinalResults,
    setTableauEditUnlocked,
    tableMaxScore,
    thirdPlaceMatch,
    playAllPositions,
    maxRefereesPerMatch,
    autoFillReferees,
    poolHistory,
    appelFencers,
    appelHistory,
    appelVisibleColumns,
    exportResultsXML,
    setRemoteArenaCount,
    setRemoteStripStart,
    setIsRemoteActive,
    setArenaStates,
    setRemoteServerUrl,
    matchAuditOptions,
    referees,
    setReferees,
    refereeAssignableMatches,
    applyPoolRefereeAssignments,
    arenaStates,
    exports,
    poolsRemoteInfo,
    rapieresTeamModal,
    handleSaveRapieresTeam,
    addFencer,
    pendingSplitOffGroup,
    createSplitOffCompetition,
    setPendingSplitOffGroup,
    onUpdate,
    importData,
    handleImportFencers,
    handleImportRanking,
    handleImportReferees,
    setImportData,
    showRapieresTableauDialog,
    handleRapieresTableauMode,
    setShowRapieresTableauDialog,
    areAllPoolsComplete,
    updateScore,
    recordScreenScore,
    handleWithdrawFencer,
    launchPools,
    handleSetFencerStatus,
    handleEditFencer,
    handleGoToRanking,
  } = { ...props, ...competitionCore, ...competitionSessionSync, ...competitionPhaseFlow };

  const rankingNextRound =
    !isLastPoolRound && pools.length > 0 && canAdvanceFromPools
      ? {
          label: t('pools.next_round_n', { n: currentPoolRound + 1 }),
          onClick: handleNextPoolRound,
        }
      : undefined;
  // « Voir le tableau » dans la barre du haut, entre « Retour » et « Journal » (#2008)
  const rankingTableauAction = rankingTableauNavAction({
    t,
    hasDirectElimination,
    hasNextRound: rankingNextRound != null,
    viewingPastRound: viewedRoundPools != null,
    splitByGender: postPoolSplitCriteria === 'gender',
    frozen: poolsFrozen,
    poolWinnersOnly,
    pools,
    onGoToTableau: () => handleGoToTableau(),
  });

  // Publication GREG auto : minuteur au niveau de la compétition, actif quel que soit
  // l'onglet ouvert ; le bouton ON/OFF reste dans « Saisie distante » (#1328)
  const [gregAutoOn, setGregAutoOn] = useGregAutoPublish(
    () => void exportResultsXML(overallRanking, finalResults, pools, 'greg-auto'),
    competition.id
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
        checkinUnchanged={checkinUnchanged}
        poolsNextAction={poolsNextAction}
        rankingTableauAction={currentPhase === 'ranking' ? rankingTableauAction : null}
        poolPrepLaunch={currentPhase === 'poolprep' ? poolPrepLaunch : null}
        questEnabled={questEnabled}
        questConfig={questConfig}
        fencers={fencers}
        getCheckedInFencers={getCheckedInFencers}
        pools={pools}
        tableauMatches={tableauMatches}
        consolationBrackets={consolationBrackets}
        playAllPositions={playAllPositions}
        onOpenPlanningAssistant={() => modals.setShowPlanningAssistant(true)}
        isTeamEvent={isTeamEvent}
        tourReady={isLoaded}
        remoteActive={isRemoteActive}
        poolsLaunched={poolsLaunched}
      />

      {/* Content — keyed pour animation de transition */}
      <div key={currentPhase} className="phase-content" style={CV_STYLES.phaseContent}>
        {currentPhase === 'checkin' && currentPoolRound > 1 && pools.length === 0 && (
          <div className="alert alert-info competition-view-1" role="status">
            {t('pools.round_checkin_banner', { n: currentPoolRound })}
          </div>
        )}
        {currentPhase === 'checkin' && poolRoundSelector}
        {currentPhase === 'checkin' && viewedRoundAppel && (
          <FencerList
            key={`appel-round-${viewedPoolRound}`}
            fencers={viewedRoundAppel}
            competitionId={competition.id}
            competition={competition}
            onCheckIn={() => {}}
            onAddFencer={() => {}}
            readOnly
          />
        )}
        {currentPhase === 'checkin' && !viewedRoundAppel && (
          <FencerList
            fencers={currentAppelFencers}
            competitionId={competition.id}
            competition={competition}
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
            onEditFencer={handleEditFencer}
            onDeleteFencer={deleteFencer}
            onDeleteAllFencers={deleteAllFencers}
            onCheckInAll={checkInAll}
            onUncheckAll={uncheckAll}
            onImport={isRapieres ? undefined : type => handleOpenImportDialog(type)}
            onImportFFEConnect={isRapieres ? undefined : () => modals.setShowFFEConnect(true)}
            onFencersImported={loadFencers}
            onAppelStateChange={handleAppelStateChange}
            onSetFencerStatus={handleSetFencerStatus}
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
            boutOrderMode={competition.settings?.poolBoutOrder}
            {...(isRapieres ? rapieresViewProps.poolPrep : {})}
            expertMode={expertMode}
            arenaCount={remoteArenaCount}
            stripStart={remoteStripStart}
            onStripChange={handlePoolStripChange}
            poolsLaunched={poolsLaunched || relaunchPending}
            draft={poolPrepDraft}
            onDraftChange={setPoolPrepDraft}
            onGoToPools={
              poolsLaunched && !relaunchPending
                ? () => {
                    setPoolPrepDraft(null);
                    setCurrentPhase('pools');
                  }
                : undefined
            }
            onPoolsConfirm={async preparedPools => {
              if (!(await confirmScoresLoss(preparedPools))) return;
              let confirmedPools = preparedPools;
              if (isRapieres && preparedPools.some(p => hasClassicOrder(p.fencers.length))) {
                const order = await askMatchOrder();
                if (!order) return;
                if (order === 'classic') confirmedPools = preparedPools.map(applyClassicOrder);
              }
              // Lancement par le moteur (generatePools, PoolsGenerated au journal, docs/adr/0017) :
              // poules, vagues des rapières et phase relues dans l'état de l'épreuve
              const outcome = await launchPools(confirmedPools);
              if (outcome === 'refused') return;
              setRelaunchPending(false);
              setPoolPrepDraft(null);
              if (outcome === 'recorded') {
                setCurrentPhase('pools');
                return;
              }
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
          <PoolsPhase
            poolRoundSelector={poolRoundSelector}
            historyPools={historyPoolsToShow}
            pools={pools}
            weapon={competition.weapon}
            competitionId={competition.id}
            competitionTitle={competition.title}
            tieBreakByVictory={tieBreakByVictory}
            poolMaxScore={poolMaxScore}
            isLaserSabre={isLaserSabre}
            onBackToCheckin={() => setCurrentPhase('checkin')}
            renderPoolCard={renderPoolCard}
            isRapieres={isRapieres}
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
            poolCardSize={poolCardSize}
            onPoolCardSizeChange={setPoolCardSize}
            poolsViewMode={poolsViewMode}
            onPoolsViewModeChange={setPoolsViewMode}
            singlePoolIndex={singlePoolIndex}
            setSinglePoolIndex={setSinglePoolIndex}
            onPrintAll={handlePrintAllPoolsPDF}
            onExportAll={handleExportAllPoolsPDF}
          />
        )}

        {currentPhase === 'ranking' && (
          <RankingPhase
            poolRoundSelector={poolRoundSelector}
            viewedPoolRound={viewedPoolRound}
            viewedRoundPools={viewedRoundPools}
            computeOverallRanking={computeOverallRanking}
            pools={pools}
            overallRanking={overallRanking}
            fencers={fencers}
            weapon={competition.weapon}
            competitionTitle={competition.title}
            hasDirectElimination={hasDirectElimination}
            skipPoolPhase={skipPoolPhase}
            poolWinnersOnly={poolWinnersOnly}
            postPoolSplitCriteria={postPoolSplitCriteria}
            splitOffCompetitionIds={splitOffCompetitionIds}
            onGoToTableau={handleGoToTableau}
            onGoToResults={() => setCurrentPhase('results')}
            onPoolsChange={(updatedPools, hasRankingChanged) => {
              setPools(updatedPools);
              if (hasRankingChanged) {
                setRankingChanged(true);
              }
            }}
            onRankingChange={setOverallRanking}
            rankingFrozen={poolsFrozen}
            onSplitOff={handleSplitOff}
            nextRoundAction={rankingNextRound}
            tableauActionInNav={rankingTableauAction != null}
            isRapieres={isRapieres}
            launchedWave={rapieres.launchedWave}
            rapieresTeams={rapieres.teams}
            rapieresStats={rapieresStats}
          />
        )}

        {questEnabled && questConfig && (
          <QuestSection
            isActive={currentPhase === 'quest'}
            questConfig={questConfig}
            weapon={competition.weapon}
            poolMaxScore={poolMaxScore}
            getCheckedInFencers={getCheckedInFencers}
            overallRanking={overallRanking}
            setOverallRanking={setOverallRanking}
            setRankingValidated={setRankingValidated}
            setCurrentPhase={setCurrentPhase}
            handleQuestConfigUpdate={handleQuestConfigUpdate}
          />
        )}

        {currentPhase === 'tableau' && (
          <TableauPhase
            competitionId={competition.id}
            weapon={competition.weapon}
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
            tableauDrift={tableauDrift}
            onRebuildTableau={requestRebuild}
            onRecordScore={recordScreenScore}
            onWithdraw={handleWithdrawFencer}
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
          <GregAutoPublishToggle on={gregAutoOn} onChange={setGregAutoOn} />
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
          onImportReferees={handleImportReferees}
          onClose={() => setImportData(null)}
        />
      )}

      {matchOrderPrompt && (
        <RapieresMatchOrderDialog
          onChoose={answerMatchOrder}
          onClose={() => answerMatchOrder(null)}
        />
      )}

      {showRapieresTableauDialog && (
        <RapieresTableauModeDialog
          semisAvailable={!!rapieresSemifinalists(pools, overallRanking)}
          onChoose={handleRapieresTableauMode}
          onClose={() => setShowRapieresTableauDialog(false)}
        />
      )}

      {poolCorrectionDialog}

      <CompetitionSecondaryModals
        modals={modals}
        competition={competition}
        fencers={fencers}
        pools={pools}
        tableauMatches={tableauMatches}
        consolationBrackets={consolationBrackets}
        overallRanking={overallRanking}
        finalResults={finalResults}
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
