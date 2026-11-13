/**
 * BellePoule Modern - Pool View Component
 * With classic grid view and match list view
 * Licensed under GPL-3.0
 */

import { TipButton } from './Tooltip';
import React from 'react';
import {
  ChartColumn,
  ClipboardList,
  Dices,
  Funnel,
  Gavel,
  PenLine,
  Play,
  Plus,
  Printer,
  Redo2,
  Swords,
  Undo2,
} from 'lucide-react';
import { Icon } from './common/Icon';
import { FencerStatus } from '../../shared/types';
import { POOL_COLUMNS } from '../hooks/useColumnVisibility';
import PoolScoreMatrix from './pool/PoolScoreMatrix';
import PoolMatchList from './pool/PoolMatchList';
import Confetti from './Confetti';
import AddFencerToPoolModal from './AddFencerToPoolModal';
import { PoolStripButton } from './pool/PoolStripButton';
import { PoolRefereeModal } from './pool/PoolRefereeModal';
import { MatchAuditLog } from './MatchAuditLog';
import type { PoolViewProps } from './pool/poolViewTypes';
import { usePoolScoreModal } from '../hooks/poolView/usePoolScoreModal';
import { usePoolViewActions } from '../hooks/poolView/usePoolViewActions';
import { usePoolViewInput } from '../hooks/poolView/usePoolViewInput';
import { usePoolViewState } from '../hooks/poolView/usePoolViewState';
import {
  ROW_BETWEEN,
  MATCH_LABEL,
  MATCH_CENTER,
  FENCER_NAME,
  NEXT_MATCH_BOX,
  LOG_TOGGLE,
  LOG_WRAP,
  LOG_ITEM,
  LOCKED_BANNER,
  RELATIVE,
  VS,
  COL_MENU,
  COL_MENU_HEADER,
  NEXT_MATCH_SUBMIT,
  abandonName,
} from './poolView.styles';

const PoolViewComponent: React.FC<PoolViewProps> = (props: PoolViewProps) => {
  const poolViewState = usePoolViewState({ ...props });
  const poolViewInput = usePoolViewInput({ ...props, ...poolViewState });
  const poolViewActions = usePoolViewActions({ ...props, ...poolViewState, ...poolViewInput });
  const poolScoreModal = usePoolScoreModal({
    ...props,
    ...poolViewState,
    ...poolViewInput,
    ...poolViewActions,
  });
  const {
    showPoolConfetti,
    isLocked,
    t,
    pool,
    finishedCount,
    totalMatches,
    signedFencerIds,
    openRefereeModal,
    assignedReferees,
    isMultiReferee,
    assignedReferee,
    stripRange,
    onStripChange,
    undo,
    canUndo,
    redo,
    canRedo,
    handleAutoFillScores,
    handlePrintPool,
    isRemoteActive,
    remoteServerUrl,
    defaultArena,
    competitionId,
    setShowAddFencerModal,
    columnMenuRef,
    setShowColumnMenu,
    showColumnMenu,
    columnFilterEdited,
    isLaserSabre,
    isVisible,
    toggleColumn,
    pdfHideStatColumns,
    togglePdfHideStatColumns,
    pdfLandscape,
    togglePdfLandscape,
    viewMode,
    setViewMode,
    orderedMatches,
    openScoreModal,
    onMatchReset,
    handleMatchDelete,
    setAuditMatchId,
    arenas,
    matchArenaOverrides,
    cardScale,
    waveMatchIds,
    handleMatchArenaChange,
    renderScoreModal,
    showAddFencerModal,
    maxScore,
    assignedFencerIds,
    onFencerAdded,
    auditMatchId,
    showRefereeModal,
    maxRefereesPerPool,
    competitionReferees,
    isLoadingReferees,
    pendingRefereeIds,
    closeRefereeModal,
    handleAssignReferee,
    togglePendingReferee,
    confirmPendingReferees,
    handleCellClick,
    onFencerChangePool,
    getMatchIndex,
    quickMouseScoring,
    hoveredFencerIds,
    waveHighlightPairs,
    simplifiedInputMode,
    handleHoverCell,
    handleHoverLeave,
    handleWheelScore,
    inlineEditCell,
    inlineSingleScore,
    cellScoreBuffer,
    setInlineSingleScore,
    handleInlineSubmit,
    handleInlineCancel,
    setShowFinishedLog,
    showFinishedLog,
  } = { ...props, ...poolViewState, ...poolViewInput, ...poolViewActions, ...poolScoreModal };

  // Modale de désignation du combattant pour abandon / forfait / exclusion.
  // Un bouton par combattant + un bouton Annuler (les erreurs, ça arrive).
  // Render Grid View
  const renderGridView = () => (
    <>
      <div className="pool-matrix-scroll">
        <PoolScoreMatrix
          pool={pool}
          isLaserSabre={isLaserSabre}
          isVisible={isVisible}
          toggleColumn={(context, columnId) => toggleColumn(context, columnId, pool.id)}
          onCellClick={handleCellClick}
          onFencerChangePool={onFencerChangePool}
          isLocked={isLocked}
          onMatchReset={
            !isLocked && onMatchReset
              ? (rowFencer, colFencer) => {
                  const matchIndex = getMatchIndex(rowFencer, colFencer);
                  if (matchIndex !== -1) handleMatchDelete(matchIndex);
                }
              : undefined
          }
          quickMouseScoring={quickMouseScoring}
          highlightedFencerIds={hoveredFencerIds}
          waveHighlightPairs={waveHighlightPairs}
          onHoverCell={quickMouseScoring || simplifiedInputMode ? handleHoverCell : undefined}
          onHoverLeave={quickMouseScoring || simplifiedInputMode ? handleHoverLeave : undefined}
          onWheelScore={quickMouseScoring ? handleWheelScore : undefined}
          simplifiedInputMode={simplifiedInputMode}
          inlineEditKey={inlineEditCell?.key ?? null}
          inlineSingleScore={inlineSingleScore}
          cellScoreBuffer={cellScoreBuffer}
          onInlineSingleScoreChange={setInlineSingleScore}
          onInlineSubmit={handleInlineSubmit}
          onInlineCancel={handleInlineCancel}
        />
      </div>
      {orderedMatches.finished.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowFinishedLog(v => !v)}
            aria-expanded={showFinishedLog}
            style={LOG_TOGGLE}
          >
            <span
              style={{
                transition: 'transform 0.15s',
                transform: showFinishedLog ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            >
              <Icon icon={Play} />
            </span>
            {t('poolView.finished_log', { count: orderedMatches.finished.length })}
          </button>
          {showFinishedLog && (
            <div style={LOG_WRAP}>
              {orderedMatches.finished.map(({ match }) => (
                <button
                  key={match.id}
                  onClick={() => setAuditMatchId(match.id)}
                  style={LOG_ITEM}
                  title={t('poolView.view_match_log')}
                >
                  <Icon icon={ClipboardList} /> {match.fencerA?.lastName} {t('poolView.vs')}{' '}
                  {match.fencerB?.lastName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  // Composant Prochain Match réutilisable
  const renderNextMatch = () => {
    if (orderedMatches.pending.length === 0) return null;

    const nextMatch = orderedMatches.pending[0];

    // Vérifier si l'un des tireurs a abandonné
    const fencerAAbandoned =
      nextMatch.match.fencerA?.status === FencerStatus.ABANDONED ||
      nextMatch.match.fencerA?.status === FencerStatus.FORFAIT ||
      nextMatch.match.fencerA?.status === FencerStatus.EXCLUDED;
    const fencerBAbandoned =
      nextMatch.match.fencerB?.status === FencerStatus.ABANDONED ||
      nextMatch.match.fencerB?.status === FencerStatus.FORFAIT ||
      nextMatch.match.fencerB?.status === FencerStatus.EXCLUDED;
    const isAbandonMatch = fencerAAbandoned || fencerBAbandoned;

    if (isAbandonMatch) {
      return (
        <div style={{ ...NEXT_MATCH_BOX, background: '#6b7280', opacity: 0.7 }}>
          <div style={ROW_BETWEEN}>
            <div style={MATCH_LABEL}>{t('poolView.not_fenced')}</div>
            <div style={MATCH_CENTER}>
              <span style={abandonName(fencerAAbandoned)}>
                {nextMatch.match.fencerA?.lastName} {nextMatch.match.fencerA?.firstName?.charAt(0)}.
                {fencerAAbandoned && ' ✕'}
              </span>
              <span style={VS}>{t('poolView.vs')}</span>
              <span style={abandonName(fencerBAbandoned)}>
                {nextMatch.match.fencerB?.lastName} {nextMatch.match.fencerB?.firstName?.charAt(0)}.
                {fencerBAbandoned && ' ✕'}
              </span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          ...NEXT_MATCH_BOX,
          background:
            'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)',
        }}
      >
        <div style={ROW_BETWEEN}>
          <div style={MATCH_LABEL}>{t('poolView.next_match')}</div>
          <div style={MATCH_CENTER}>
            <span style={FENCER_NAME}>
              {nextMatch.match.fencerA?.lastName} {nextMatch.match.fencerA?.firstName?.charAt(0)}.
              {nextMatch.match.fencerA?.ranking && ` #${nextMatch.match.fencerA.ranking}`}
            </span>
            <span style={VS}>{t('poolView.vs')}</span>
            <span style={FENCER_NAME}>
              {nextMatch.match.fencerB?.lastName} {nextMatch.match.fencerB?.firstName?.charAt(0)}.
              {nextMatch.match.fencerB?.ranking && ` #${nextMatch.match.fencerB.ranking}`}
            </span>
          </div>
          <button onClick={() => openScoreModal(nextMatch.index)} style={NEXT_MATCH_SUBMIT}>
            {t('poolView.enter')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="card">
        <Confetti active={showPoolConfetti} particleCount={100} origin={{ x: 0.5, y: 0.5 }} />
        {isLocked && <div style={LOCKED_BANNER}>{t('poolView.locked')}</div>}
        <div className={`card-header pv-header${(cardScale ?? 1) >= 1.3 ? ' is-nowrap' : ''}`}>
          <div className="pv-header-left">
            <span>{t('poolView.pool_n', { n: pool.number })}</span>
            <span className={`badge ${pool.isComplete ? 'badge-success' : 'badge-warning'}`}>
              {pool.isComplete ? t('poolView.finished') : `${finishedCount}/${totalMatches}`}
            </span>
            {!pool.isComplete && totalMatches > 0 && (
              <div className="pv-progress">
                <div className="pv-progress-track">
                  <div
                    className={`pv-progress-bar${finishedCount / totalMatches >= 0.7 ? ' is-high' : ''}`}
                    style={{ width: `${(finishedCount / totalMatches) * 100}%` }}
                  />
                </div>
                <span className="pv-progress-label">
                  {finishedCount}/{totalMatches}
                </span>
              </div>
            )}
            {(() => {
              const total = pool.fencers.length;
              const signed = signedFencerIds.filter(id =>
                pool.fencers.some(f => f.id === id)
              ).length;
              const allSigned = signed === total && total > 0;
              const noneSigned = signed === 0;
              return (
                <span
                  title={
                    allSigned
                      ? t('poolView.all_signed')
                      : t('plural.signatures', { signed, count: total })
                  }
                  className={`pv-pill${allSigned ? ' is-done' : noneSigned ? '' : ' is-partial'}`}
                >
                  <Icon icon={PenLine} /> {signed}/{total}
                </span>
              );
            })()}
            <button
              onClick={openRefereeModal}
              title={
                assignedReferees.length > 0
                  ? t('poolView.referees_title', {
                      count: assignedReferees.length,
                      list: assignedReferees.map(r => `${r.lastName} ${r.firstName}`).join(', '),
                    })
                  : isMultiReferee
                    ? t('poolView.assign_referees')
                    : t('poolView.assign_referee')
              }
              className={`pv-pill${assignedReferee ? ' is-assigned' : ''}`}
            >
              <Icon icon={Gavel} />{' '}
              {assignedReferees.length > 0
                ? assignedReferees.map(r => r.lastName).join(' / ')
                : t('poolView.add_referee')}
            </button>
            {stripRange && onStripChange && (
              <PoolStripButton
                poolNumber={pool.number}
                strip={pool.strip}
                stripRange={stripRange}
                onChange={strip => onStripChange(pool.id, strip)}
              />
            )}
          </div>
          <div className="pv-toolbar">
            <TipButton
              onClick={undo}
              disabled={!canUndo}
              className="pv-icon-btn is-gray"
              tip={t('poolView.undo_title')}
              aria-label={t('poolView.undo_aria')}
            >
              <Icon icon={Undo2} />
            </TipButton>
            <TipButton
              onClick={redo}
              disabled={!canRedo}
              className="pv-icon-btn is-gray"
              tip={t('poolView.redo_title')}
              aria-label={t('poolView.redo_aria')}
            >
              <Icon icon={Redo2} />
            </TipButton>
            <TipButton
              onClick={handleAutoFillScores}
              className="pv-icon-btn is-amber"
              tip={t('poolView.autofill')}
            >
              <Icon icon={Dices} />
            </TipButton>
            <TipButton
              onClick={handlePrintPool}
              className="pv-icon-btn is-primary"
              tip={t('poolView.print_title')}
              aria-label={t('poolView.print_aria')}
            >
              <Icon icon={Printer} />
            </TipButton>
            {pool.isComplete && isRemoteActive && remoteServerUrl && (
              <TipButton
                onClick={() => {
                  const url = `${remoteServerUrl}/arene${defaultArena}/poule`;
                  if (window.electronAPI?.openExternal) {
                    window.electronAPI.openExternal(url);
                  } else {
                    window.open(url, '_blank');
                  }
                }}
                className="pv-icon-btn is-indigo"
                tip={t('poolView.signatures_title', { arena: defaultArena })}
                aria-label={t('poolView.signatures')}
              >
                <Icon icon={PenLine} />
              </TipButton>
            )}
            {competitionId && (
              <TipButton
                onClick={() => setShowAddFencerModal(true)}
                className="pv-icon-btn"
                tip={t('poolView.add_fencer')}
                aria-label={t('poolView.add_fencer')}
              >
                <Icon icon={Plus} />
              </TipButton>
            )}
            <div style={RELATIVE} ref={columnMenuRef}>
              <TipButton
                onClick={() => setShowColumnMenu(!showColumnMenu)}
                className={`pv-icon-btn${showColumnMenu ? ' is-open' : ''}${columnFilterEdited ? ' is-edited' : ''}`}
                tip={columnFilterEdited ? t('poolView.columns_edited') : t('poolView.columns')}
                aria-label={t('poolView.columns')}
              >
                <Funnel size={14} />
              </TipButton>
              {showColumnMenu && (
                <div style={COL_MENU}>
                  <div style={COL_MENU_HEADER}>{t('poolView.columns_shown')}</div>
                  {POOL_COLUMNS.filter(col => col.id !== 'quest' || isLaserSabre).map(col => (
                    <label key={col.id} className="pv-col-menu-label">
                      <input
                        type="checkbox"
                        checked={isVisible(col.id)}
                        onChange={() => toggleColumn('pool', col.id, pool.id)}
                        className="cursor-pointer"
                      />
                      {t(`poolColumns.col_${col.id}`)}
                    </label>
                  ))}
                  <div className="pv-col-menu-section" style={COL_MENU_HEADER}>
                    {t('poolView.pdf_print')}
                  </div>
                  <label className="pv-col-menu-label">
                    <input
                      type="checkbox"
                      checked={pdfHideStatColumns}
                      onChange={togglePdfHideStatColumns}
                      className="cursor-pointer"
                    />
                    {t('poolView.hide_stats')}
                  </label>
                  <label className="pv-col-menu-label">
                    <input
                      type="checkbox"
                      checked={pdfLandscape}
                      onChange={togglePdfLandscape}
                      className="cursor-pointer"
                    />
                    {t('poolView.landscape')}
                  </label>
                </div>
              )}
            </div>
            <TipButton
              type="button"
              role="switch"
              aria-checked={viewMode === 'matches'}
              aria-label={t('poolView.matches_view')}
              onClick={() => setViewMode(viewMode === 'grid' ? 'matches' : 'grid')}
              className={`pv-view-switch${viewMode === 'matches' ? ' is-matches' : ''}`}
              tip={viewMode === 'grid' ? t('poolView.matches_view') : t('poolView.grid_view')}
            >
              <span className="pv-view-switch-icon" aria-hidden="true">
                <Icon icon={ChartColumn} />
              </span>
              <span className="pv-view-switch-icon" aria-hidden="true">
                <Icon icon={Swords} />
              </span>
              <span className="pv-view-switch-thumb" aria-hidden="true" />
            </TipButton>
          </div>
        </div>
        <div className="card-body pv-body">
          {viewMode === 'grid' ? (
            <>
              {renderGridView()}
              {renderNextMatch()}
            </>
          ) : (
            <PoolMatchList
              orderedMatches={orderedMatches}
              isLaserSabre={isLaserSabre}
              isLocked={isLocked}
              openScoreModal={openScoreModal}
              onMatchReset={onMatchReset ? handleMatchDelete : undefined}
              onShowMatchAudit={setAuditMatchId}
              defaultArena={defaultArena}
              stripRange={stripRange}
              arenas={arenas}
              isRemoteActive={isRemoteActive}
              matchArenaOverrides={matchArenaOverrides}
              cardScale={cardScale}
              waveMatchIds={waveMatchIds}
              onMatchArenaChange={handleMatchArenaChange}
            />
          )}
          {renderScoreModal()}
        </div>
      </div>
      {showAddFencerModal && competitionId && (
        <AddFencerToPoolModal
          pool={pool}
          competitionId={competitionId}
          maxScore={maxScore}
          assignedFencerIds={assignedFencerIds}
          onConfirm={updatedPool => {
            setShowAddFencerModal(false);
            onFencerAdded?.(updatedPool);
          }}
          onClose={() => setShowAddFencerModal(false)}
        />
      )}
      {auditMatchId && (
        <React.Suspense fallback={null}>
          <MatchAuditLog matchId={auditMatchId} onClose={() => setAuditMatchId(null)} />
        </React.Suspense>
      )}
      {showRefereeModal && (
        <PoolRefereeModal
          poolNumber={pool.number}
          isMultiReferee={isMultiReferee}
          maxRefereesPerPool={maxRefereesPerPool}
          assignedReferee={assignedReferee}
          competitionReferees={competitionReferees}
          isLoadingReferees={isLoadingReferees}
          pendingRefereeIds={pendingRefereeIds}
          onClose={closeRefereeModal}
          onAssign={handleAssignReferee}
          onToggle={togglePendingReferee}
          onConfirm={confirmPendingReferees}
        />
      )}
    </>
  );
};

const PoolView = React.memo(PoolViewComponent);
export default PoolView;
