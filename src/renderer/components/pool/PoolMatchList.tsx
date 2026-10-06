/**
 * BellePoule Modern - Pool Match List Sub-component
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { Match, Fencer, FencerStatus } from '../../../shared/types';
import { Arena } from '../../../shared/types/remote';
import {
  ROW_BETWEEN,
  CELL_CENTER,
  SUB_TEXT,
  VS_SEP,
  NAME_BIG,
  COL_GAP,
  NUM_BADGE,
  SECTION_TITLE,
} from './poolMatchList.styles';

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
  onClick: (e: React.MouseEvent) => void;
}

const ArenaBadge: React.FC<ArenaBadgeProps> = ({
  match,
  defaultArena,
  matchArenaOverrides,
  isRemoteActive,
  arenaCount,
  dark = false,
  onClick,
}) => {
  if (arenaCount <= 0) return null;
  const assignedArena = matchArenaOverrides?.get(match.id) ?? defaultArena;
  const isOverridden = matchArenaOverrides?.has(match.id) ?? false;

  const baseStyle: React.CSSProperties = {
    padding: '0.15rem 0.45rem',
    fontSize: '0.7rem',
    fontWeight: '600',
    borderRadius: '4px',
    flexShrink: 0,
    cursor: isRemoteActive ? 'pointer' : 'not-allowed',
  };

  const activeStyle: React.CSSProperties = dark
    ? {
        border: isOverridden ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.4)',
        background: isOverridden ? '#fef3c7' : 'rgba(255,255,255,0.2)',
        color: isOverridden ? '#92400e' : 'white',
      }
    : {
        border: isOverridden ? '1px solid #f59e0b' : '1px solid #d1d5db',
        background: isOverridden ? '#fef3c7' : '#f3f4f6',
        color: isOverridden ? '#92400e' : '#374151',
      };

  const inactiveStyle: React.CSSProperties = {
    border: '1px solid #e5e7eb',
    background: '#f9fafb',
    color: '#9ca3af',
  };

  return (
    <button
      onClick={isRemoteActive ? onClick : undefined}
      title={
        isRemoteActive
          ? `Piste ${assignedArena} — Cliquer pour réassigner`
          : 'Serveur distant non démarré'
      }
      disabled={!isRemoteActive}
      style={{ ...baseStyle, ...(isRemoteActive ? activeStyle : inactiveStyle) }}
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
  onMatchArenaChange,
}) => {
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

  return (
    <div>
      {/* Prochain match — carte sombre impactante */}
      {orderedMatches.pending.length > 0 &&
        (() => {
          const nextMatch = orderedMatches.pending[0];
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
              <div
                style={{
                  background: '#374151',
                  borderRadius: '10px',
                  padding: '1.25rem 1.5rem',
                  marginBottom: '1rem',
                  color: 'white',
                  opacity: 0.75,
                  borderLeft: '4px solid #9ca3af',
                }}
              >
                <div
                  style={{
                    fontSize: '0.65rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: '#9ca3af',
                    marginBottom: '0.75rem',
                  }}
                >
                  ✕ Match non disputé
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                  }}
                >
                  <div style={{ flex: 1, textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: '1.5rem',
                        fontWeight: 800,
                        textDecoration: fencerAAbandoned ? 'line-through' : 'none',
                        lineHeight: 1.1,
                      }}
                    >
                      {nextMatch.match.fencerA?.lastName}
                      {fencerAAbandoned && ' ✕'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.2rem' }}>
                      {nextMatch.match.fencerA?.firstName}
                    </div>
                  </div>
                  <div style={{ fontSize: '1.25rem', color: '#6b7280', flexShrink: 0 }}>vs</div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div
                      style={{
                        fontSize: '1.5rem',
                        fontWeight: 800,
                        textDecoration: fencerBAbandoned ? 'line-through' : 'none',
                        lineHeight: 1.1,
                      }}
                    >
                      {nextMatch.match.fencerB?.lastName}
                      {fencerBAbandoned && ' ✕'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.2rem' }}>
                      {nextMatch.match.fencerB?.firstName}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              style={{
                background: '#0f172a',
                borderRadius: '10px',
                padding: '1.25rem 1.5rem',
                marginBottom: '1rem',
                borderLeft: '4px solid #f97316',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                }}
              >
                <span
                  style={{
                    fontSize: '0.65rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: '#64748b',
                    fontWeight: 600,
                  }}
                >
                  ⚔ Prochain match
                </span>
                <ArenaBadge
                  match={nextMatch.match}
                  defaultArena={defaultArena}
                  matchArenaOverrides={matchArenaOverrides}
                  isRemoteActive={isRemoteActive}
                  arenaCount={arenaCount}
                  dark
                  onClick={e => openArenaModal(nextMatch.match, e)}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: '1.75rem',
                      fontWeight: 800,
                      color: 'white',
                      lineHeight: 1.1,
                    }}
                  >
                    {orderedMatches.pending[0].match.fencerA?.lastName}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                    {orderedMatches.pending[0].match.fencerA?.firstName}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: '1.75rem',
                    color: '#f97316',
                    flexShrink: 0,
                    fontWeight: 900,
                    lineHeight: 1,
                  }}
                >
                  ⚔
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div
                    style={{
                      fontSize: '1.75rem',
                      fontWeight: 800,
                      color: 'white',
                      lineHeight: 1.1,
                    }}
                  >
                    {orderedMatches.pending[0].match.fencerB?.lastName}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                    {orderedMatches.pending[0].match.fencerB?.firstName}
                  </div>
                </div>
              </div>
              <button
                onClick={() => openScoreModal(orderedMatches.pending[0].index)}
                className="pool-cta-pulse"
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  background: '#f97316',
                  border: 'none',
                  borderRadius: '7px',
                  color: 'white',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  letterSpacing: '0.02em',
                }}
              >
                Saisir le score
              </button>
            </div>
          );
        })()}

      {/* Matches restants — strip horizontal scrollable */}
      {orderedMatches.pending.length > 1 && (
        <div style={{ marginBottom: '1rem' }}>
          <div
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: '#9ca3af',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '0.5rem',
            }}
          >
            À venir ({orderedMatches.pending.length - 1})
          </div>
          <div
            style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}
          >
            {orderedMatches.pending.slice(1).map(({ match, index }, i) => {
              const fencerAAbandoned =
                match.fencerA?.status === FencerStatus.ABANDONED ||
                match.fencerA?.status === FencerStatus.FORFAIT ||
                match.fencerA?.status === FencerStatus.EXCLUDED;
              const fencerBAbandoned =
                match.fencerB?.status === FencerStatus.ABANDONED ||
                match.fencerB?.status === FencerStatus.FORFAIT ||
                match.fencerB?.status === FencerStatus.EXCLUDED;
              const isAbandonMatch = fencerAAbandoned || fencerBAbandoned;

              return (
                <div
                  key={index}
                  onClick={() => !isAbandonMatch && openScoreModal(index)}
                  title={isAbandonMatch ? 'Match non disputé' : undefined}
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.375rem 0.75rem',
                    background: isAbandonMatch ? '#f3f4f6' : '#f1f5f9',
                    border: `1px solid ${isAbandonMatch ? '#d1d5db' : '#e2e8f0'}`,
                    borderRadius: '20px',
                    cursor: isAbandonMatch ? 'not-allowed' : 'pointer',
                    opacity: isAbandonMatch ? 0.5 : 1,
                    transition: 'background 0.1s, border-color 0.1s',
                  }}
                  onMouseEnter={e => {
                    if (!isAbandonMatch) {
                      (e.currentTarget as HTMLElement).style.background = '#e2e8f0';
                      (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1';
                    }
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = isAbandonMatch
                      ? '#f3f4f6'
                      : '#f1f5f9';
                    (e.currentTarget as HTMLElement).style.borderColor = isAbandonMatch
                      ? '#d1d5db'
                      : '#e2e8f0';
                  }}
                >
                  <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>
                    #{i + 2}
                  </span>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#334155',
                      textDecoration: fencerAAbandoned ? 'line-through' : 'none',
                    }}
                  >
                    {match.fencerA?.lastName}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>vs</span>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#334155',
                      textDecoration: fencerBAbandoned ? 'line-through' : 'none',
                    }}
                  >
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
          <div
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: '#9ca3af',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '0.5rem',
            }}
          >
            Terminés ({orderedMatches.finished.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {orderedMatches.finished.map(({ match, index }) => {
              const fencerAAbandoned =
                match.fencerA?.status === FencerStatus.ABANDONED ||
                match.fencerA?.status === FencerStatus.FORFAIT ||
                match.fencerA?.status === FencerStatus.EXCLUDED;
              const fencerBAbandoned =
                match.fencerB?.status === FencerStatus.ABANDONED ||
                match.fencerB?.status === FencerStatus.FORFAIT ||
                match.fencerB?.status === FencerStatus.EXCLUDED;
              const isAbandonMatch = fencerAAbandoned || fencerBAbandoned;
              const winnerA = !!match.scoreA?.isVictory;
              const isHighlighted = highlightedMatchId === match.id;

              return (
                <div
                  key={index}
                  onClick={() => !isAbandonMatch && !isLocked && openScoreModal(index)}
                  onMouseEnter={() => setHighlightedMatchId(match.id)}
                  onMouseLeave={() =>
                    setHighlightedMatchId(prev => (prev === match.id ? null : prev))
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.5rem 0.75rem 0.5rem 0.875rem',
                    background: isHighlighted ? '#f8fafc' : 'white',
                    borderRadius: '7px',
                    border: isHighlighted ? '1px solid #94a3b8' : '1px solid #e5e7eb',
                    borderLeft: isAbandonMatch
                      ? '3px solid #9ca3af'
                      : winnerA
                        ? '3px solid #059669'
                        : '3px solid #dc2626',
                    cursor: isAbandonMatch || isLocked ? 'default' : 'pointer',
                    opacity: isAbandonMatch ? 0.55 : 1,
                    gap: '0.5rem',
                    transition: 'background 0.1s, border-color 0.1s',
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontWeight: winnerA && !isAbandonMatch ? 700 : 400,
                      color: isAbandonMatch ? '#9ca3af' : winnerA ? '#065f46' : '#6b7280',
                      textDecoration: fencerAAbandoned ? 'line-through' : 'none',
                      fontSize: '0.875rem',
                    }}
                  >
                    {match.fencerA?.lastName}
                    {fencerAAbandoned && ' ✕'}
                  </span>
                  <span
                    style={{
                      padding: '0.2rem 0.625rem',
                      background: isAbandonMatch ? '#f3f4f6' : '#f8fafc',
                      border: '1px solid #e5e7eb',
                      borderRadius: '5px',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      color: isAbandonMatch ? '#9ca3af' : '#374151',
                      flexShrink: 0,
                      letterSpacing: '0.03em',
                    }}
                  >
                    {isAbandonMatch
                      ? '–'
                      : `${match.scoreA?.isVictory ? 'V' : ''}${match.scoreA?.value ?? 0} : ${match.scoreB?.isVictory ? 'V' : ''}${match.scoreB?.value ?? 0}`}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      textAlign: 'right',
                      fontWeight: !winnerA && !isAbandonMatch ? 700 : 400,
                      color: isAbandonMatch ? '#9ca3af' : !winnerA ? '#065f46' : '#6b7280',
                      textDecoration: fencerBAbandoned ? 'line-through' : 'none',
                      fontSize: '0.875rem',
                    }}
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
                      title="Journal du match"
                      style={{
                        padding: '0.2rem 0.4rem',
                        fontSize: '0.7rem',
                        background: 'rgba(139,92,246,0.1)',
                        border: '1px solid rgba(139,92,246,0.3)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        color: '#7c3aed',
                        flexShrink: 0,
                      }}
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
                      title="Supprimer ce résultat (Ctrl+Z pour annuler la suppression)"
                      style={{
                        padding: '0.2rem 0.4rem',
                        fontSize: '0.7rem',
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        color: '#dc2626',
                        flexShrink: 0,
                        opacity: isHighlighted ? 1 : 0,
                        transition: 'opacity 0.1s',
                      }}
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
        <div style={{ marginBottom: '1.5rem', marginTop: '0.75rem' }}>
          <div
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: '#9ca3af',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '0.5rem',
            }}
          >
            Annulés ({orderedMatches.cancelled.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {orderedMatches.cancelled.map(({ match, index }) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.875rem',
                  background: '#f9fafb',
                  borderRadius: '7px',
                  border: '1px dashed #d1d5db',
                  opacity: 0.8,
                  gap: '0.5rem',
                }}
              >
                <span style={{ color: '#9ca3af', fontSize: '0.8rem', minWidth: '24px' }}>⏸</span>
                <span
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    color: '#6b7280',
                    fontSize: '0.875rem',
                    textDecoration: 'line-through',
                  }}
                >
                  {match.fencerA?.lastName} vs {match.fencerB?.lastName}
                </span>
                {!isLocked && onMatchReset && (
                  <button
                    onClick={() => onMatchReset(index)}
                    title="Relancer ce match"
                    style={{
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.75rem',
                      background: 'rgba(59,130,246,0.1)',
                      border: '1px solid rgba(59,130,246,0.3)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: '#2563eb',
                      flexShrink: 0,
                    }}
                  >
                    ▶ Relancer
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Poule terminée */}
      {orderedMatches.pending.length === 0 && orderedMatches.cancelled.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2.5rem 2rem', color: '#6b7280' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏁</div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#374151' }}>Poule terminée</div>
          <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
            Tous les matches ont été joués
          </div>
        </div>
      )}

      {/* Modal d'assignation de piste */}
      {showArenaModal && selectedMatch && (
        <div className="modal-overlay" onClick={closeArenaModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Assigner à une piste</h3>
              <button className="btn-close" onClick={closeArenaModal}>
                &times;
              </button>
            </div>
            <div className="modal-body" style={{ padding: '1.5rem' }}>
              <p style={{ marginBottom: '1rem', color: '#6b7280', fontSize: '0.875rem' }}>
                Sélectionnez la piste pour ce match :
              </p>
              <div
                style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}
              >
                <button
                  className={`btn ${!matchArenaOverrides?.has(selectedMatch.id) ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleAssignArena(null)}
                  style={{ padding: '0.75rem', gridColumn: '1 / -1', fontSize: '0.875rem' }}
                >
                  ↩ Piste par défaut (Piste {defaultArena})
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
                      style={{ padding: '0.75rem', fontSize: '0.875rem' }}
                    >
                      Piste {arenaNum}
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
