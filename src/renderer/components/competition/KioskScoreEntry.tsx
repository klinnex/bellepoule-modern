/**
 * BellePoule Modern - KioskScoreEntry
 * Mode kiosk plein écran de saisie des scores de poules
 * Licensed under GPL-3.0
 */

import React from 'react';
import { Pool } from '../../../shared/types';
import { FencerPhoto } from '../FencerPhoto';

interface KioskScoreEntryProps {
  pools: Pool[];
  poolMaxScore: number;
  allPoolsComplete: boolean;
  updateScore: (poolIndex: number, matchIndex: number, scoreA: number, scoreB: number) => void;
  onClose: () => void;
  onFinish: () => void;
}

// ─── Static style constants ───────────────────────────────────────────────────

const KIOSK_STYLES = {
  kioskOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    background: '#f3f4f6',
    overflow: 'auto' as const,
  } satisfies React.CSSProperties,
  kioskCloseWrapper: {
    position: 'sticky' as const,
    top: '1rem',
    right: '1rem',
    float: 'right' as const,
    zIndex: 10000,
    margin: '1rem',
  } satisfies React.CSSProperties,
  kioskCloseBtn: {
    background: '#ef4444',
    color: 'white',
    border: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 'bold' as const,
  } satisfies React.CSSProperties,
  kioskContent: { padding: '2rem' } satisfies React.CSSProperties,
  kioskHeading: { marginBottom: '2rem', color: '#1f2937' } satisfies React.CSSProperties,
  kioskPoolCard: {
    marginBottom: '3rem',
    background: 'white',
    borderRadius: '12px',
    padding: '1.5rem',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
  } satisfies React.CSSProperties,
  kioskPoolTitle: {
    marginBottom: '1rem',
    color: '#374151',
    borderBottom: '2px solid #e5e7eb',
    paddingBottom: '0.5rem',
  } satisfies React.CSSProperties,
  kioskMatchGrid: { display: 'grid', gap: '1rem' } satisfies React.CSSProperties,
  kioskMatchFencerA: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    flex: 1,
  } satisfies React.CSSProperties,
  kioskMatchScores: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  } satisfies React.CSSProperties,
  kioskMatchScoreInput: {
    width: '60px',
    padding: '0.5rem',
    fontSize: '1.25rem',
    textAlign: 'center' as const,
    border: '2px solid #d1d5db',
    borderRadius: '6px',
  } satisfies React.CSSProperties,
  kioskMatchSep: {
    fontSize: '1.5rem',
    fontWeight: 'bold' as const,
    color: '#6b7280',
  } satisfies React.CSSProperties,
  kioskMatchFencerB: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    flex: 1,
    justifyContent: 'flex-end' as const,
  } satisfies React.CSSProperties,
  kioskMatchName: { fontWeight: 'bold' as const } satisfies React.CSSProperties,
  kioskFinishRow: { textAlign: 'center' as const, marginTop: '2rem' } satisfies React.CSSProperties,
  kioskFinishBtn: {
    background: '#10b981',
    color: 'white',
    border: 'none',
    padding: '1rem 2rem',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1.25rem',
    fontWeight: 'bold' as const,
  } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;

const KioskScoreEntry: React.FC<KioskScoreEntryProps> = ({
  pools,
  poolMaxScore,
  allPoolsComplete,
  updateScore,
  onClose,
  onFinish,
}) => {
  return (
    <div style={KIOSK_STYLES.kioskOverlay}>
      <div style={KIOSK_STYLES.kioskCloseWrapper}>
        <button onClick={onClose} style={KIOSK_STYLES.kioskCloseBtn}>
          ✕ Quitter Mode Kiosk
        </button>
      </div>
      <div style={KIOSK_STYLES.kioskContent}>
        <h2 style={KIOSK_STYLES.kioskHeading}>Mode Kiosk - Saisie des scores</h2>
        {pools.map((pool, poolIndex) => (
          <div key={pool.id} style={KIOSK_STYLES.kioskPoolCard}>
            <h3 style={KIOSK_STYLES.kioskPoolTitle}>Poule {pool.number}</h3>
            <div style={KIOSK_STYLES.kioskMatchGrid}>
              {pool.matches.map(
                (match, matchIndex) =>
                  match.status !== 'finished' && (
                    <div
                      key={match.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '1rem',
                        background: match.status === 'in_progress' ? '#fef3c7' : '#f9fafb',
                        borderRadius: '8px',
                        border:
                          match.status === 'in_progress'
                            ? '2px solid #f59e0b'
                            : '1px solid #e5e7eb',
                      }}
                    >
                      <div style={KIOSK_STYLES.kioskMatchFencerA}>
                        <FencerPhoto
                          photo={match.fencerA?.photo}
                          firstName={match.fencerA?.firstName || ''}
                          lastName={match.fencerA?.lastName || ''}
                          size="medium"
                          editable={false}
                        />
                        <span style={KIOSK_STYLES.kioskMatchName}>
                          {match.fencerA?.firstName} {match.fencerA?.lastName}
                        </span>
                      </div>
                      <div style={KIOSK_STYLES.kioskMatchScores}>
                        <input
                          type="number"
                          min="0"
                          max={poolMaxScore}
                          defaultValue={match.scoreA?.value || 0}
                          style={KIOSK_STYLES.kioskMatchScoreInput}
                          onChange={e => {
                            const scoreA = parseInt(e.target.value) || 0;
                            const scoreB = match.scoreB?.value || 0;
                            if (scoreA >= 0 && scoreA <= poolMaxScore) {
                              updateScore(poolIndex, matchIndex, scoreA, scoreB);
                            }
                          }}
                        />
                        <span style={KIOSK_STYLES.kioskMatchSep}>-</span>
                        <input
                          type="number"
                          min="0"
                          max={poolMaxScore}
                          defaultValue={match.scoreB?.value || 0}
                          style={KIOSK_STYLES.kioskMatchScoreInput}
                          onChange={e => {
                            const scoreB = parseInt(e.target.value) || 0;
                            const scoreA = match.scoreA?.value || 0;
                            if (scoreB >= 0 && scoreB <= poolMaxScore) {
                              updateScore(poolIndex, matchIndex, scoreA, scoreB);
                            }
                          }}
                        />
                      </div>
                      <div style={KIOSK_STYLES.kioskMatchFencerB}>
                        <span style={KIOSK_STYLES.kioskMatchName}>
                          {match.fencerB?.firstName} {match.fencerB?.lastName}
                        </span>
                        <FencerPhoto
                          photo={match.fencerB?.photo}
                          firstName={match.fencerB?.firstName || ''}
                          lastName={match.fencerB?.lastName || ''}
                          size="medium"
                          editable={false}
                        />
                      </div>
                    </div>
                  )
              )}
            </div>
          </div>
        ))}
        {allPoolsComplete && (
          <div style={KIOSK_STYLES.kioskFinishRow}>
            <button onClick={onFinish} style={KIOSK_STYLES.kioskFinishBtn}>
              ✓ Tous les matchs sont terminés - Voir le classement
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(KioskScoreEntry);
