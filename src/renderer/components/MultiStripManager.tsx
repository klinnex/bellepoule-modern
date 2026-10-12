/**
 * BellePoule Modern - Multi Strip Manager
 * Orchestration de plusieurs pistes simultanées
 * Licensed under GPL-3.0
 */

import React, { useState, useMemo } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Pool, Match, MatchStatus } from '../../shared/types';

interface StripState {
  id: number;
  currentMatchId: string | null;
  assignedPoolIndex: number | null;
  assignedMatchIndex: number | null;
}

interface MultiStripManagerProps {
  pools: Pool[];
  stripCount: number;
  onMatchAssigned: (matchId: string, arenaId: string) => void;
  onClose: () => void;
}

export const MultiStripManager: React.FC<MultiStripManagerProps> = ({
  pools,
  stripCount,
  onMatchAssigned,
  onClose,
}) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [strips, setStrips] = useState<StripState[]>(() =>
    Array.from({ length: stripCount }, (_, i) => ({
      id: i + 1,
      currentMatchId: null,
      assignedPoolIndex: null,
      assignedMatchIndex: null,
    }))
  );

  const pendingMatches = useMemo(() => {
    const result: { match: Match; poolIndex: number; matchIndex: number; poolNumber: number }[] =
      [];
    for (let pi = 0; pi < pools.length; pi++) {
      const pool = pools[pi];
      pool.matches.forEach((m, mi) => {
        if (m.status === MatchStatus.NOT_STARTED || m.status === ('not_started' as MatchStatus)) {
          const assignedToStrip = strips.some(
            s => s.assignedPoolIndex === pi && s.assignedMatchIndex === mi
          );
          if (!assignedToStrip) {
            result.push({ match: m, poolIndex: pi, matchIndex: mi, poolNumber: pool.number });
          }
        }
      });
    }
    return result;
  }, [pools, strips]);

  const assignNextMatch = (stripId: number) => {
    if (pendingMatches.length === 0) return;

    const { match, poolIndex, matchIndex } = pendingMatches[0];
    const arenaId = `strip-${stripId}`;

    setStrips(prev =>
      prev.map(s =>
        s.id === stripId
          ? {
              ...s,
              currentMatchId: match.id,
              assignedPoolIndex: poolIndex,
              assignedMatchIndex: matchIndex,
            }
          : s
      )
    );

    onMatchAssigned(match.id, arenaId);
  };

  const releaseStrip = (stripId: number) => {
    setStrips(prev =>
      prev.map(s =>
        s.id === stripId
          ? { ...s, currentMatchId: null, assignedPoolIndex: null, assignedMatchIndex: null }
          : s
      )
    );
  };

  const getStripMatch = (strip: StripState): Match | null => {
    if (strip.assignedPoolIndex === null || strip.assignedMatchIndex === null) return null;
    return pools[strip.assignedPoolIndex]?.matches[strip.assignedMatchIndex] ?? null;
  };

  const totalMatches = pools.reduce((s, p) => s + p.matches.length, 0);
  const finishedMatches = pools.reduce(
    (s, p) =>
      s +
      p.matches.filter(
        m => m.status === MatchStatus.FINISHED || m.status === ('finished' as MatchStatus)
      ).length,
    0
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h2 style={{ margin: 0 }}>Gestion multi-pistes ({stripCount} pistes)</h2>
          <button className="btn-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div
          style={{
            padding: '1rem 1.5rem',
            background: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: '2rem' }}>
            <span style={{ fontSize: '0.875rem' }}>
              <strong>{finishedMatches}</strong>/{totalMatches} matchs terminés
            </span>
            <span style={{ fontSize: '0.875rem', color: '#16a34a' }}>
              <strong>{pendingMatches.length}</strong> matchs en attente
            </span>
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '1rem 1.5rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            {strips.map(strip => {
              const match = getStripMatch(strip);
              const isOccupied = strip.currentMatchId !== null;

              return (
                <div
                  key={strip.id}
                  style={{
                    border: `2px solid ${isOccupied ? '#3b82f6' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    padding: '1rem',
                    background: isOccupied ? '#eff6ff' : '#fff',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>Piste {strip.id}</span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '9999px',
                        background: isOccupied ? '#3b82f6' : '#e5e7eb',
                        color: isOccupied ? '#fff' : '#6b7280',
                      }}
                    >
                      {isOccupied ? 'Occupée' : 'Libre'}
                    </span>
                  </div>

                  {match ? (
                    <div>
                      <div
                        style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: '#6b7280' }}
                      >
                        Poule {pools[strip.assignedPoolIndex!]?.number}
                      </div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                        {match.fencerA?.lastName ?? '?'} vs {match.fencerB?.lastName ?? '?'}
                      </div>
                      <button
                        className="btn btn-secondary"
                        style={{
                          marginTop: '0.75rem',
                          width: '100%',
                          fontSize: '0.75rem',
                          padding: '0.375rem',
                        }}
                        onClick={() => releaseStrip(strip.id)}
                      >
                        Libérer la piste
                      </button>
                    </div>
                  ) : (
                    <div>
                      {pendingMatches.length > 0 ? (
                        <>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: '#9ca3af',
                              marginBottom: '0.5rem',
                            }}
                          >
                            Prochain : Poule {pendingMatches[0].poolNumber} —{' '}
                            {pendingMatches[0].match.fencerA?.lastName ?? '?'} vs{' '}
                            {pendingMatches[0].match.fencerB?.lastName ?? '?'}
                          </div>
                          <button
                            className="btn btn-primary"
                            style={{ width: '100%', fontSize: '0.75rem', padding: '0.375rem' }}
                            onClick={() => assignNextMatch(strip.id)}
                          >
                            Assigner match suivant
                          </button>
                        </>
                      ) : (
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                          Aucun match en attente
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(MultiStripManager);
