/**
 * BellePoule Modern - État vide unique (#1535)
 * Icône, titre, texte, action principale optionnelle : classes .empty-state* (design.css).
 * Licensed under GPL-3.0
 */

import React, { ReactNode } from 'react';
import Button from './Button';

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Action principale (ex. « Ajouter un tireur ») */
  actionLabel?: string;
  onAction?: () => void;
  /** Actions supplémentaires (ex. boutons d'import) */
  children?: ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  children,
  className,
}) => (
  <div
    className={['empty-state', 'text-center', className].filter(Boolean).join(' ')}
    role="status"
  >
    {icon && (
      <div className="empty-state-icon" aria-hidden="true">
        {icon}
      </div>
    )}
    <h3 className="empty-state-title">{title}</h3>
    {description && <p className="empty-state-description">{description}</p>}
    {actionLabel && onAction && (
      <Button variant="primary" onClick={onAction}>
        {actionLabel}
      </Button>
    )}
    {children}
  </div>
);

export default EmptyState;
