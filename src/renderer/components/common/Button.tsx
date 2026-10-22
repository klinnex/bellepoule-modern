/**
 * BellePoule Modern - Bouton standard (#1157)
 * Variantes et tailles des classes .btn-* (design.css) ; type="button" par défaut.
 * Licensed under GPL-3.0
 */

import React, { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'lg';
  /** Icône placée avant le libellé */
  icon?: ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size,
  icon,
  className,
  type = 'button',
  children,
  ...rest
}) => {
  const classes = [
    'btn',
    `btn-${variant}`,
    size && `btn-${size}`,
    icon && children && 'btn-icon-label',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {icon}
      {children}
    </button>
  );
};

export default Button;
