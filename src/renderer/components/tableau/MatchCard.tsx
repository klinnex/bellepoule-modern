import React from 'react';
import { TableauMatch } from './tableauTypes';
import { translateStatic } from '../../contexts/TranslationContext';

interface MatchCardProps {
  match: TableauMatch;
  verticalPosition?: number;
  viewMode: 'full' | 'pending';
  baseMatchHeight: number;
  onMatchClick?: (match: TableauMatch) => void;
  onArenaClick?: (matchId: string) => void;
  onRefereeClick?: (matchId: string) => void;
  onSignaturesClick?: (match: TableauMatch) => void;
  readOnly?: boolean;
  /** Rang de sortie de poules par tireur (#1119) ; sinon classement d'entrée */
  seedRanks?: Map<string, number>;
}

const BASE_MATCH_HEIGHT = 100;

const MatchCard: React.FC<MatchCardProps> = ({
  match,
  verticalPosition,
  viewMode,
  baseMatchHeight,
  onMatchClick,
  onArenaClick,
  onRefereeClick,
  onSignaturesClick,
  readOnly = false,
  seedRanks,
}) => {
  const canEdit = !readOnly && !!(match.fencerA && match.fencerB && !match.isBye) && !!onMatchClick;
  const hasScore = match.scoreA !== null && match.scoreB !== null;

  let winner = match.winner;
  if (!winner && hasScore) {
    if (match.scoreA! > match.scoreB!) winner = match.fencerA;
    else if (match.scoreB! > match.scoreA!) winner = match.fencerB;
  }

  const isMatchComplete = winner !== null;
  const hasBothFencers = !!(match.fencerA && match.fencerB && !match.isBye);
  const isInProgress = hasBothFencers && !isMatchComplete;

  const winnerA = !!winner && winner.id === match.fencerA?.id;
  const winnerB = !!winner && winner.id === match.fencerB?.id;

  const handleArenaClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onArenaClick?.(match.id);
  };

  const handleRefereeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRefereeClick?.(match.id);
  };

  const handleSignaturesClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSignaturesClick?.(match);
  };

  const matchReferees = match.referees?.length
    ? match.referees
    : match.referee
      ? [match.referee]
      : [];

  const seedOf = (f: typeof match.fencerA) => (f ? (seedRanks?.get(f.id) ?? f.ranking) : undefined);
  const seedA = seedOf(match.fencerA);
  const seedB = seedOf(match.fencerB);

  const fencerName = (f: typeof match.fencerA) =>
    f ? `${f.lastName} ${f.firstName.charAt(0)}.` : '—';

  // Status dot color
  const statusColor = isMatchComplete ? '#10b981' : isInProgress ? '#f59e0b' : '#d1d5db';

  const posStyle: React.CSSProperties =
    verticalPosition !== undefined
      ? {
          position: 'absolute' as const,
          top: `${verticalPosition}px`,
          left: 0,
          right: 0,
          height: `${BASE_MATCH_HEIGHT}px`,
          overflow: 'hidden',
        }
      : { position: 'relative' as const, marginBottom: '0.375rem' };

  return (
    <div
      className={`match-card ${canEdit ? 'match-card-clickable' : ''} ${isMatchComplete ? 'match-card-done' : ''}`}
      style={posStyle}
      onClick={() => canEdit && onMatchClick && onMatchClick(match)}
    >
      {/* Status dot */}
      <span
        className="match-status-dot"
        style={{ background: statusColor }}
        title={translateStatic(
          isMatchComplete
            ? 'matchCard.status_done'
            : isInProgress
              ? 'matchCard.status_ready'
              : 'matchCard.status_waiting'
        )}
      />

      {/* Arena + Referee badges */}
      {canEdit && !isMatchComplete && (onArenaClick || onRefereeClick) && (
        <div className="match-badges">
          {onArenaClick && (
            <button
              className={`match-badge-btn ${match.arena ? 'match-badge-btn--active' : ''}`}
              onClick={handleArenaClick}
              title={
                match.arena
                  ? translateStatic('matchCard.strip_n', { n: match.arena })
                  : translateStatic('matchCard.assign_strip')
              }
            >
              {match.arena ? `P${match.arena}` : '+P'}
            </button>
          )}
          {onRefereeClick && (
            <button
              className={`match-badge-btn ${matchReferees.length > 0 ? 'match-badge-btn--active' : ''}`}
              onClick={handleRefereeClick}
              title={
                matchReferees.length > 0
                  ? translateStatic(
                      matchReferees.length > 1 ? 'matchCard.referees' : 'matchCard.referee',
                      { list: matchReferees.map(r => `${r.lastName} ${r.firstName}`).join(', ') }
                    )
                  : translateStatic('poolView.assign_referee')
              }
            >
              {matchReferees.length > 0
                ? matchReferees
                    .map(r => `${r.lastName.charAt(0)}${r.firstName.charAt(0)}`)
                    .join('/')
                : '+A'}
            </button>
          )}
        </div>
      )}

      {/* Consultation des signatures (match terminé) */}
      {hasBothFencers && isMatchComplete && onSignaturesClick && (
        <div className="match-badges">
          <button
            className="match-badge-btn"
            onClick={handleSignaturesClick}
            title={translateStatic('matchCard.signatures')}
            aria-label={translateStatic('matchCard.signatures')}
          >
            ✍
          </button>
        </div>
      )}

      {/* Fencer A */}
      <div
        className={`match-fencer ${winnerA ? 'match-fencer-winner' : ''} ${isMatchComplete && !winnerA && match.fencerA ? 'match-fencer-loser' : ''} ${!match.fencerA ? 'match-fencer-empty' : ''}`}
      >
        <div className="match-fencer-info">
          {winnerA && <span className="match-winner-mark">✓</span>}
          <div className="match-fencer-details">
            <span className="match-fencer-name">{fencerName(match.fencerA)}</span>
            {match.fencerA?.club && <span className="match-fencer-club">{match.fencerA.club}</span>}
          </div>
          {seedA && <span className="match-fencer-seed">#{seedA}</span>}
        </div>
        {hasScore && (
          <span className={`match-score ${winnerA ? 'match-score-winner' : 'match-score-loser'}`}>
            {match.scoreA}
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="match-divider" />

      {/* Fencer B */}
      <div
        className={`match-fencer ${winnerB ? 'match-fencer-winner' : ''} ${isMatchComplete && !winnerB && match.fencerB ? 'match-fencer-loser' : ''} ${!match.fencerB ? 'match-fencer-empty' : ''}`}
      >
        <div className="match-fencer-info">
          {winnerB && <span className="match-winner-mark">✓</span>}
          <div className="match-fencer-details">
            <span className="match-fencer-name">{fencerName(match.fencerB)}</span>
            {match.fencerB?.club && <span className="match-fencer-club">{match.fencerB.club}</span>}
          </div>
          {seedB && <span className="match-fencer-seed">#{seedB}</span>}
        </div>
        {hasScore && (
          <span className={`match-score ${winnerB ? 'match-score-winner' : 'match-score-loser'}`}>
            {match.scoreB}
          </span>
        )}
      </div>

      {/* Bye */}
      {match.isBye && <div className="match-bye">{translateStatic('matchCard.bye')}</div>}

      {/* CTA bar — mode liste seulement */}
      {canEdit && viewMode !== 'full' && (
        <div className={`match-cta ${hasScore ? 'match-cta-edit' : 'match-cta-enter'}`}>
          {hasScore
            ? `✏️ ${translateStatic('poolRanking.edit')}`
            : `➕ ${translateStatic('matchCard.enter_score')}`}
        </div>
      )}
    </div>
  );
};

export default React.memo(MatchCard);
