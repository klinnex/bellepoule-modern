/**
 * BellePoule Modern - Intervalle de pistes (piste de départ / piste de fin)
 * Deux champs éditables, chacun avec ses boutons − et + (#1501).
 * Licensed under GPL-3.0
 */
import React, { useState } from 'react';
import { MAX_STRIP } from '../../../shared/utils/stripRange';
import { useTranslation } from '../../hooks/useTranslation';

interface StripRangeControlsProps {
  start: number;
  end: number;
  disabled?: boolean;
  onChange: (start: number, end: number) => void;
}

const STYLES = {
  row: { display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' as const },
  group: { display: 'flex', alignItems: 'center', gap: '0.4rem' },
  range: { display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' as const },
  btn: { padding: '0.2rem 0.5rem', fontSize: '1rem' },
  input: { width: '3.2rem', textAlign: 'center' as const },
} satisfies Record<string, React.CSSProperties>;

const Stepper: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, disabled, onChange }) => {
  // Brouillon texte : permet d'effacer et de retaper le numéro au clavier
  const [draft, setDraft] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setDraft(String(value));
  }
  const commit = () => {
    const v = parseInt(draft, 10);
    if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
    else setDraft(String(value));
  };
  return (
    <span style={STYLES.group}>
      <span>{label}</span>
      <button
        type="button"
        className="btn btn-secondary"
        style={STYLES.btn}
        aria-label={`${label} −`}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        style={STYLES.input}
        value={draft}
        disabled={disabled}
        onChange={e => setDraft(e.target.value.replace(/\D/g, ''))}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
        }}
      />
      <button
        type="button"
        className="btn btn-secondary"
        style={STYLES.btn}
        aria-label={`${label} +`}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </span>
  );
};

export const StripRangeControls: React.FC<StripRangeControlsProps> = ({
  start,
  end,
  disabled,
  onChange,
}) => {
  const { t } = useTranslation();
  return (
    <div style={STYLES.range}>
      <Stepper
        label={t('rsm.strip_start')}
        value={start}
        min={1}
        max={end}
        disabled={disabled}
        onChange={v => onChange(v, end)}
      />
      <Stepper
        label={t('rsm.strip_end')}
        value={end}
        min={start}
        max={MAX_STRIP}
        disabled={disabled}
        onChange={v => onChange(start, v)}
      />
    </div>
  );
};
