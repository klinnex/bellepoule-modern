/**
 * BellePoule Modern - Modale standard (#1157)
 * Overlay + boîte de dialogue + en-tête (titre, bouton fermer) + corps + pied optionnel.
 * Focus piégé, Échap et clic sur l'overlay ferment. Styles : classes .modal* (design.css).
 * Licensed under GPL-3.0
 */

import React, { ReactNode, useId } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useTranslation } from '../../hooks/useTranslation';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Boutons d'action, alignés à droite */
  footer?: ReactNode;
  /** Largeur max : sm 450 px, md 600 px, lg 800 px, xl 1000 px (défaut 500 px) */
  size?: ModalSize;
  /** Classes supplémentaires sur la boîte (.modal) */
  className?: string;
  /** Classes supplémentaires sur le corps (.modal-body) */
  bodyClassName?: string;
  /** Ferme au clic sur l'overlay (défaut : oui) */
  closeOnOverlay?: boolean;
  /** Hauteur bornée (85 vh), corps défilant entre en-tête et pied fixes */
  scroll?: boolean;
  /** Au-dessus des vues plein écran (z-index 11000) */
  elevated?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  title,
  onClose,
  children,
  footer,
  size,
  className,
  bodyClassName,
  closeOnOverlay = true,
  scroll = false,
  elevated = false,
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  const classes = ['modal', size && `modal--${size}`, scroll && 'modal--scroll', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={elevated ? 'modal-overlay modal-overlay--top' : 'modal-overlay'}
      onClick={closeOnOverlay ? onClose : undefined}
    >
      <div
        ref={ref}
        className={classes}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-header">
          <h2 className="modal-title" id={titleId}>
            {title}
          </h2>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            aria-label={t('actions.close')}
          >
            ×
          </button>
        </div>
        <div className={['modal-body', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
