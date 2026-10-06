/**
 * BellePoule Modern - Pavé numérique tactile réutilisable
 * Conçu pour la saisie de score sur tablette (grandes cibles tactiles).
 * Licensed under GPL-3.0
 */

import React from 'react';

interface NumericKeypadProps {
  /** Valeur courante (chaîne de chiffres, '' si vide). */
  value: string;
  /** Appelé avec la nouvelle valeur après chaque appui. */
  onChange: (value: string) => void;
  /** Valeur maximale autorisée ; les saisies au-delà sont ignorées. */
  maxValue?: number;
  /** Nombre maximal de chiffres (défaut 2). */
  maxDigits?: number;
  /** Appelé sur la touche de validation (✓), si fournie. */
  onConfirm?: () => void;
  /** Désactive la touche de validation. */
  confirmDisabled?: boolean;
}

const KEY_STYLE: React.CSSProperties = {
  minHeight: '56px',
  fontSize: '1.5rem',
  fontWeight: 600,
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  background: '#f9fafb',
  cursor: 'pointer',
  touchAction: 'manipulation',
  userSelect: 'none',
};

const NumericKeypad: React.FC<NumericKeypadProps> = ({
  value,
  onChange,
  maxValue,
  maxDigits = 2,
  onConfirm,
  confirmDisabled = false,
}) => {
  const appendDigit = (d: string) => {
    if (value.length >= maxDigits) return;
    // Évite les zéros de tête non significatifs ('0' + '5' -> '5')
    const next = value === '0' ? d : value + d;
    if (maxValue !== undefined && parseInt(next, 10) > maxValue) return;
    onChange(next);
  };

  const backspace = () => onChange(value.slice(0, -1));
  const clear = () => onChange('');

  const digitKey = (d: string) => (
    <button key={d} type="button" onClick={() => appendDigit(d)} aria-label={d} style={KEY_STYLE}>
      {d}
    </button>
  );

  return (
    <div
      role="group"
      aria-label="Pavé numérique"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.5rem',
      }}
    >
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digitKey)}
      <button
        type="button"
        onClick={clear}
        aria-label="Effacer"
        style={{ ...KEY_STYLE, fontSize: '1rem', color: '#dc2626' }}
      >
        C
      </button>
      {digitKey('0')}
      <button
        type="button"
        onClick={backspace}
        aria-label="Retour arrière"
        style={{ ...KEY_STYLE, fontSize: '1.25rem' }}
      >
        ⌫
      </button>
      {onConfirm && (
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          aria-label="Valider"
          style={{
            ...KEY_STYLE,
            gridColumn: '1 / -1',
            background: confirmDisabled ? '#e5e7eb' : '#10b981',
            color: confirmDisabled ? '#9ca3af' : 'white',
            cursor: confirmDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          ✓
        </button>
      )}
    </div>
  );
};

export default NumericKeypad;
