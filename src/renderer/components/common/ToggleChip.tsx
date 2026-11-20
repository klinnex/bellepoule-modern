/**
 * BellePoule Modern - Carte / bouton activable (remplace les cases à cocher, #1872).
 * Bouton à bascule (aria-pressed) : bleu quand sélectionné.
 * Licensed under GPL-3.0
 */
import React from 'react';

interface ToggleChipProps {
  pressed: boolean;
  onToggle: (next: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
  className?: string;
  'aria-label'?: string;
  'data-tour'?: string;
}

export const ToggleChip: React.FC<ToggleChipProps> = ({
  pressed,
  onToggle,
  children,
  disabled,
  title,
  className,
  'aria-label': ariaLabel,
  'data-tour': dataTour,
}) => (
  <button
    type="button"
    className={`toggle-chip${pressed ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
    aria-pressed={pressed}
    aria-label={ariaLabel}
    disabled={disabled}
    title={title}
    data-tour={dataTour}
    onClick={() => onToggle(!pressed)}
  >
    {children}
  </button>
);

/** Groupe de cartes activables (cadre + légende) */
export const ToggleChipGroup: React.FC<{
  legend?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ legend, children, className }) => (
  <fieldset className={`toggle-chip-group${className ? ` ${className}` : ''}`}>
    {legend ? <legend className="form-label">{legend}</legend> : null}
    {children}
  </fieldset>
);
