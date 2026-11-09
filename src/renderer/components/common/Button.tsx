/**
 * BellePoule Modern - Bouton standard (#1157, #1529)
 * Variantes et tailles des classes .btn-* (design.css) ; type="button" par défaut.
 * État `loading` : bouton désactivé, aria-busy, libellé conservé (pas de saut de mise en page).
 * Icône seule (sans enfants) : classe .btn-icon-only ; un aria-label est alors requis par le type.
 * Licensed under GPL-3.0
 */

import React, { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonBaseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icône placée avant le libellé */
  icon?: ReactNode;
  /** Action en cours : bouton désactivé, spinner, libellé conservé */
  loading?: boolean;
}

/** Bouton avec libellé : aria-label optionnel */
interface ButtonWithLabelProps extends ButtonBaseProps {
  children: ReactNode;
}

/** Bouton icône seule : aria-label obligatoire (nom accessible) */
interface ButtonIconOnlyProps extends ButtonBaseProps {
  children?: undefined;
  'aria-label': string;
}

export type ButtonProps = ButtonWithLabelProps | ButtonIconOnlyProps;

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size,
  icon,
  loading = false,
  className,
  type = 'button',
  children,
  disabled,
  ...rest
}) => {
  const iconOnly = !children && !!icon;
  const classes = [
    'btn',
    `btn-${variant}`,
    size && `btn-${size}`,
    icon && children && 'btn-icon-label',
    iconOnly && 'btn-icon-only',
    loading && 'btn-loading',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="btn-spinner" aria-hidden="true" />}
      {!loading && icon}
      {children}
    </button>
  );
};

export default Button;
