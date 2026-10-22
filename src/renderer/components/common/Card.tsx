/**
 * BellePoule Modern - Carte standard (#1157)
 * En-tête (titre + actions), corps, pied : classes .card* (design.css).
 * Licensed under GPL-3.0
 */

import React, { ReactNode } from 'react';

interface CardProps {
  title?: ReactNode;
  /** Éléments alignés à droite de l'en-tête */
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export const Card: React.FC<CardProps> = ({
  title,
  actions,
  footer,
  className,
  bodyClassName,
  children,
}) => (
  <div className={['card', className].filter(Boolean).join(' ')}>
    {(title || actions) && (
      <div className="card-header u-row-between">
        {title && <h3 className="card-title">{title}</h3>}
        {actions && <div className="u-row">{actions}</div>}
      </div>
    )}
    <div className={['card-body', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
    {footer && <div className="card-footer">{footer}</div>}
  </div>
);

export default Card;
