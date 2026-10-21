/**
 * BellePoule Modern - Pool Match List Sub-component
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { Match, Fencer, FencerStatus } from '../../../shared/types';
import { Arena } from '../../../shared/types/remote';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { isMatchVoidedByForfeit } from '../../../shared/utils/poolCalculations';

interface OrderedMatchEntry {
  match: Match;
  index: number;
}

interface OrderedMatches {
  pending: OrderedMatchEntry[];
  finished: OrderedMatchEntry[];
  cancelled: OrderedMatchEntry[];
}

interface PoolMatchListProps {
  orderedMatches: OrderedMatches;
  isLaserSabre: boolean;
  isLocked: boolean;
  openScoreModal: (index: number) => void;
  onMatchReset?: (index: number) => void;
  onShowMatchAudit?: (matchId: string) => void;
  defaultArena?: number;
  arenaCount?: number;
  arenas?: Arena[];
  isRemoteActive?: boolean;
  matchArenaOverrides?: Map<string, number>;
  /** Facteur de taille des cartes (préréglage) : agrandit proportionnellement le badge de piste du prochain match */
  cardScale?: number;
  /** Tournoi des rapières : matchs de la vague en cours, bordés de violet */
  waveMatchIds?: ReadonlySet<string>;
  onMatchArenaChange?: (
    matchId: string,
    oldArena: number,
    newArena: number | null,
    fencerA?: Fencer | null,
    fencerB?: Fencer | null
  ) => void;
}

interface ArenaBadgeProps {
  match: Match;
  defaultArena: number;
  matchArenaOverrides?: Map<string, number>;
  isRemoteActive: boolean;
  arenaCount: number;
  dark?: boolean;
  scale?: number;
  onClick: (e: React.MouseEvent) => void;
}

const ArenaBadge: React.FC<ArenaBadgeProps> = ({
  match,
  defaultArena,
  matchArenaOverrides,
  isRemoteActive,
  arenaCount,
  dark = false,
  scale = 1,
  onClick,
}) => {
  if (arenaCount <= 0) return null;
  const assignedArena = matchArenaOverrides?.get(match.id) ?? defaultArena;
  const isOverridden = matchArenaOverrides?.has(match.id) ?? false;

  const className = [
    'pml-arena-badge',
    dark && 'is-dark',
    isRemoteActive && isOverridden && 'is-overridden',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      onClick={isRemoteActive ? onClick : undefined}
      title={
        isRemoteActive
          ? `Piste ${assignedArena} — Cliquer pour réassigner`
          : 'Serveur distant non démarré'
      }
      disabled={!isRemoteActive}
      className={className}
      style={scale !== 1 ? ({ '--badge-scale': scale } as React.CSSProperties) : undefined}
    >
      🏟 {assignedArena}
    </button>
  );
};

const PoolMatchListComponent: React.FC<PoolMatchListProps> = ({
  orderedMatches,
  isLaserSabre: _isLaserSabre,
  isLocked,
  openScoreModal,
  onMatchReset,
  onShowMatchAudit,
  defaultArena = 1,
  arenaCount = 0,
  arenas = [],
  isRemoteActive = false,
  matchArenaOverrides,
  cardScale = 1,
  waveMatchIds,
  onMatchArenaChange,
}) => {
  const { t } = useTranslation();
  const [showArenaModal, setShowArenaModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [highlightedMatchId, setHighlightedMatchId] = useState<string | null>(null);

  const openArenaModal = (match: Match, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isRemoteActive || arenaCount <= 0) return;
    setSelectedMatch(match);
    setShowArenaModal(true);
  };

  const closeArenaModal = () => {
    setShowArenaModal(false);
    setSelectedMatch(null);
  };

  const handleAssignArena = (arenaNum: number | null) => {
    if (!selectedMatch) return;
    const currentArena = matchArenaOverrides?.get(selectedMatch.id) ?? defaultArena;
    onMatchArenaChange?.(
      selectedMatch.id,
      currentArena,
      arenaNum,
      selectedMatch.fencerA,
      selectedMatch.fencerB
    );
    closeArenaModal();
  };

  const arenaModalRef = useFocusTrap<HTMLDivElement>(
    showArenaModal && !!selectedMatch,
    closeArenaModal
  );

  const isOut = (f?: Fencer | null) =>
    f?.status === FencerStatus.ABANDONED ||
    f?.status === FencerStatus.FORFAIT ||
    f?.status === FencerStatus.EXCLUDED;

  return (
    <div>
      {/* Prochain match — carte sombre impactante */}
      {orderedMatches.pending.length > 0 &&
        (() => {
          const nextMatch = orderedMatches.pending[0];
          const fencerAAbandoned = isOut(nextMatch.match.fencerA);
          const fencerBAbandoned = isOut(nextMatch.match.fencerB);
          const isAbandonMatch = fencerAAbandoned || fencerBAbandoned;

          if (isAbandonMatch) {
            return (
              <div className="pml-next is-void">
                <div className="pml-next-label">{t('poolMatches.not_fenced')}</div>
                <div className="pml-duel">
                  <div className="pml-side">
                    <div className={`pml-name${fencerAAbandoned ? ' is-struck' : ''}`}>
                      {nextMatch.match.fencerA?.lastName}
                      {fencerAAbandoned && ' ✕'}
                    </div>
                    <div className="pml-firstname">{nextMatch.match.fencerA?.firstName}</div>
                  </div>
                  <div className="pml-vs">{t('poolMatches.vs')}</div>
                  <div className="pml-side">
                    <div className={`pml-name${fencerBAbandoned ? ' is-struck' : ''}`}>
                      {nextMatch.match.fencerB?.lastName}
                      {fencerBAbandoned && ' ✕'}
                    </div>
                    <div className="pml-firstname">{nextMatch.match.fencerB?.firstName}</div>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div className="pml-next">
              <div className="pml-next-head">
                <span className="pml-next-label">{t('poolMatches.next')}</span>
                <ArenaBadge
                  match={nextMatch.match}
                  defaultArena={defaultArena}
                  matchArenaOverrides={matchArenaOverrides}
                  isRemoteActive={isRemoteActive}
                  arenaCount={arenaCount}
                  dark
                  scale={1.35 * cardScale}
                  onClick={e => openArenaModal(nextMatch.match, e)}
                />
              </div>
              <div className="pml-duel">
                <div className="pml-side">
                  <div className="pml-name">{nextMatch.match.fencerA?.lastName}</div>
                  <div className="pml-firstname">{nextMatch.match.fencerA?.firstName}</div>
                </div>
                <div className="pml-vs">⚔</div>
                <div className="pml-side">
                  <div className="pml-name">{nextMatch.match.fencerB?.lastName}</div>
                  <div className="pml-firstname">{nextMatch.match.fencerB?.firstName}</div>
                </div>
              </div>
              <button
                onClick={() => openScoreModal(nextMatch.index)}
                className="pml-cta pool-cta-pulse"
              >
                {t('poolMatches.enter_score')}
              </button>
            </div>
          );
        })()}

      {/* Matches restants — strip horizontal scrollable */}
      {orderedMatches.pending.length > 1 && (
        <div className="mb-4">
          <div className="pml-section-title">
            {t('poolMatches.upcoming', { n: orderedMatches.pending.length - 1 })}
          </div>
          <div className="pml-strip">
            {orderedMatches.pending.slice(1).map(({ match, index }, i) => {
              const fencerAAbandoned = isOut(match.fencerA);
              const fencerBAbandoned = isOut(match.fencerB);
              const isAbandonMatch = fencerAAbandoned || fencerBAbandoned;
              const chipClass = [
                'pml-chip',
                isAbandonMatch && 'is-void',
                waveMatchIds?.has(match.id) && 'is-wave',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div
                  key={index}
                  onClick={() => !isAbandonMatch && openScoreModal(index)}
                  title={isAbandonMatch ? 'Match non disputé' : undefined}
                  className={chipClass}
                >
                  <span className="pml-chip-num">#{i + 2}</span>
                  <span className={`pml-chip-name${fencerAAbandoned ? ' is-struck' : ''}`}>
                    {match.fencerA?.lastName}
                  </span>
                  <span className="pml-chip-vs">{t('poolMatches.vs')}</span>
                  <span className={`pml-chip-name${fencerBAbandoned ? ' is-struck' : ''}`}>
                    {match.fencerB?.lastName}
                  </span>
                  {arenaCount > 0 && (
                    <ArenaBadge
                      match={match}
                      defaultArena={defaultArena}
                      matchArenaOverrides={matchArenaOverrides}
                      isRemoteActive={isRemoteActive}
                      arenaCount={arenaCount}
                      onClick={e => openArenaModal(match, e)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Matches terminés */}
      {orderedMatches.finished.length > 0 && (
        <div>
          <div className="pml-section-title">
            {t('poolMatches.finished', { n: orderedMatches.finished.length })}
          </div>
          <div className="pml-list">
            {orderedMatches.finished.map(({ match, index }) => {
              const fencerAAbandoned = isOut(match.fencerA);
              const fencerBAbandoned = isOut(match.fencerB);
              // Match terminé : grisé seulement s'il a été annulé par le forfait/abandon,
              // les matchs disputés avant restent visibles (#1144)
              const isAbandonMatch =
                (fencerAAbandoned || fencerBAbandoned) &&
                (match.fencerA?.status === FencerStatus.EXCLUDED ||
                  match.fencerB?.status === FencerStatus.EXCLUDED ||
                  isMatchVoidedByForfeit(match));
              const winnerA = !!match.scoreA?.isVictory;
              const isHighlighted = highlightedMatchId === match.id;
              const rowClass = [
                'pml-row',
                winnerA && 'is-win-a',
                isHighlighted && 'is-highlighted',
                isLocked && 'is-locked',
                isAbandonMatch && 'is-void',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div
                  key={index}
                  onClick={() => !isAbandonMatch && !isLocked && openScoreModal(index)}
                  onMouseEnter={() => setHighlightedMatchId(match.id)}
                  onMouseLeave={() =>
                    setHighlightedMatchId(prev => (prev === match.id ? null : prev))
                  }
                  className={rowClass}
                >
                  <span
                    className={`pml-row-name${winnerA ? ' is-winner' : ''}${fencerAAbandoned ? ' is-struck' : ''}`}
                  >
                    {match.fencerA?.lastName}
                    {fencerAAbandoned && ' ✕'}
                  </span>
                  <span className="pml-score">
                    {isAbandonMatch
                      ? '–'
                      : `${match.scoreA?.isVictory ? 'V' : ''}${match.scoreA?.value ?? 0} : ${match.scoreB?.isVictory ? 'V' : ''}${match.scoreB?.value ?? 0}`}
                  </span>
                  <span
                    className={`pml-row-name is-right${!winnerA ? ' is-winner' : ''}${fencerBAbandoned ? ' is-struck' : ''}`}
                  >
                    {match.fencerB?.lastName}
                    {fencerBAbandoned && ' ✕'}
                  </span>
                  {onShowMatchAudit && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onShowMatchAudit(match.id);
                      }}
                      title={t('poolMatches.match_log')}
                      className="pml-icon-btn"
                    >
                      📋
                    </button>
                  )}
                  {!isAbandonMatch && !isLocked && onMatchReset && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onMatchReset(index);
                      }}
                      title={t('poolMatches.delete_result')}
                      className="pml-icon-btn is-danger"
                      style={{ opacity: isHighlighted ? 1 : 0 }}
                    >
                      🗑
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Matches annulés */}
      {orderedMatches.cancelled.length > 0 && (
        <div className="pml-cancelled">
          <div className="pml-section-title">
            {t('poolMatches.cancelled', { n: orderedMatches.cancelled.length })}
          </div>
          <div className="pml-list">
            {orderedMatches.cancelled.map(({ match, index }) => (
              <div key={index} className="pml-cancelled-row">
                <span className="pml-cancelled-icon">⏸</span>
                <span className="pml-cancelled-name">
                  {match.fencerA?.lastName} {t('poolMatches.vs')} {match.fencerB?.lastName}
                </span>
                {!isLocked && onMatchReset && (
                  <button
                    onClick={() => onMatchReset(index)}
                    title={t('poolMatches.restart_title')}
                    className="pml-icon-btn is-info"
                  >
                    {t('poolMatches.restart')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Poule terminée */}
      {orderedMatches.pending.length === 0 && orderedMatches.cancelled.length === 0 && (
        <div className="pml-done">
          <div className="pml-done-icon">🏁</div>
          <div className="pml-done-title">{t('poolMatches.done')}</div>
          <div className="pml-done-sub">{t('poolMatches.done_sub')}</div>
        </div>
      )}

      {/* Modal d'assignation de piste */}
      {showArenaModal && selectedMatch && (
        <div className="modal-overlay" onClick={closeArenaModal}>
          <div
            ref={arenaModalRef}
            className="modal pml-arena-modal"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pool-arena-title"
          >
            <div className="modal-header">
              <h3 className="modal-title" id="pool-arena-title">
                {t('poolMatches.assign')}
              </h3>
              <button className="btn-close" onClick={closeArenaModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="u-hint mb-4">{t('poolMatches.select_strip')}</p>
              <div className="pml-arena-grid">
                <button
                  className={`btn is-full ${!matchArenaOverrides?.has(selectedMatch.id) ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleAssignArena(null)}
                >
                  {t('poolMatches.default_strip', { n: defaultArena })}
                </button>
                {Array.from({ length: arenaCount }, (_, i) => i + 1).map(arenaNum => {
                  const arenaObj = arenas.find(a => a.number === arenaNum);
                  const isCurrentArena =
                    (matchArenaOverrides?.get(selectedMatch.id) ?? defaultArena) === arenaNum;
                  const statusIcon = arenaObj
                    ? arenaObj.status === 'in_progress'
                      ? ' ●'
                      : arenaObj.status === 'ready'
                        ? ' ○'
                        : ''
                    : '';
                  return (
                    <button
                      key={arenaNum}
                      className={`btn ${isCurrentArena ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => handleAssignArena(arenaNum)}
                    >
                      {t('poolMatches.strip_n', { n: arenaNum })}
                      {statusIcon}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PoolMatchList = React.memo(PoolMatchListComponent);
export default PoolMatchList;
