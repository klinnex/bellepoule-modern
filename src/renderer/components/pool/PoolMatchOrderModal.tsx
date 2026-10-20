/**
 * BellePoule Modern - Modal de référence : ordre officiel FIE/FFE des matchs en poule
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { generatePoolMatchOrder } from '../../../shared/utils/poolCalculations';

interface PoolMatchOrderModalProps {
  onClose: () => void;
}

const PoolMatchOrderModal: React.FC<PoolMatchOrderModalProps> = ({ onClose }) => {
  const [poolSize, setPoolSize] = useState(6);

  const matches = generatePoolMatchOrder(poolSize);
  const matchCount = (poolSize * (poolSize - 1)) / 2;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 12000,
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          borderRadius: '12px',
          padding: '1.5rem',
          width: '420px',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>Ordre officiel des matchs</div>
            <span
              style={{
                fontSize: '0.7rem',
                padding: '2px 7px',
                borderRadius: '4px',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-muted)',
                fontFamily: 'monospace',
                marginTop: '0.25rem',
                display: 'inline-block',
              }}
            >
              Référence FIE / FFE
            </span>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        {/* Sélecteur */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <label
            htmlFor="pool-order-size"
            style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}
          >
            Taille de poule :
          </label>
          <select
            id="pool-order-size"
            value={poolSize}
            onChange={e => setPoolSize(Number(e.target.value))}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              fontSize: '0.9rem',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
            }}
          >
            {[3, 4, 5, 6, 7, 8, 9].map(n => (
              <option key={n} value={n}>
                {n} tireurs — {(n * (n - 1)) / 2} matchs{n >= 9 ? ' (Berger)' : ''}
              </option>
            ))}
          </select>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            {matchCount} matchs
          </span>
        </div>

        {/* Liste des matchs — même format que "Matches à venir" dans PoolMatchList */}
        <div className="u-stack-2">
          {matches.map(([a, b], i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                background: 'var(--color-surface-2)',
                borderRadius: '6px',
                border: '1px solid var(--color-border)',
                gap: '0.5rem',
              }}
            >
              <span
                style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', minWidth: '30px' }}
              >
                #{i + 1}
              </span>
              <span style={{ flex: 1, fontWeight: 500 }}>Tireur {a}</span>
              <span style={{ color: 'var(--color-text-muted)', padding: '0 0.5rem' }}>vs</span>
              <span style={{ flex: 1, textAlign: 'right', fontWeight: 500 }}>Tireur {b}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PoolMatchOrderModal;
