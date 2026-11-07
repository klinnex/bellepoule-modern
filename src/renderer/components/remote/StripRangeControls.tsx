/**
 * BellePoule Modern - Intervalle de pistes (piste de départ / piste de fin)
 * Deux champs éditables, chacun avec ses boutons − et + (#1501).
 * Licensed under GPL-3.0
 */
import React from 'react';
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
}> = ({ label, value, min, max, disabled, onChange }) => (
  <span style={STYLES.row}>
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
      type="number"
      aria-label={label}
      style={STYLES.input}
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      onChange={e => {
        const v = parseInt(e.target.value, 10);
        if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
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

export const StripRangeControls: React.FC<StripRangeControlsProps> = ({
  start,
  end,
  disabled,
  onChange,
}) => {
  const { t } = useTranslation();
  return (
    <div style={STYLES.row}>
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
