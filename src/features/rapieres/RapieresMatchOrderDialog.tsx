/**
 * BellePoule Modern - Tournoi des rapières : ordre des combats au lancement des poules (#1816)
 * « Ordre standard » (vagues calculées) ou « Ordre classique » (tables des poules de 10 à 15).
 * Licensed under GPL-3.0
 */

import React from 'react';
import { useFocusTrap } from '../../renderer/hooks/useFocusTrap';
import { useTranslation } from '../../renderer/hooks/useTranslation';
import type { RapieresMatchOrder } from './rapieresClassicOrder';
import { Button } from '../../renderer/components/common/Button';

interface RapieresMatchOrderDialogProps {
  onChoose: (order: RapieresMatchOrder) => void;
  onClose: () => void;
}

const RapieresMatchOrderDialog: React.FC<RapieresMatchOrderDialogProps> = ({
  onChoose,
  onClose,
}) => {
  const { t } = useTranslation();
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2 className="modal-title">{t('rapieres.match_order_title')}</h2>
        </div>
        <div className="modal-body u-stack-2">
          <Button type="button" onClick={() => onChoose('standard')}>
            {t('rapieres.match_order_standard')}
          </Button>
          <Button type="button" variant="primary" onClick={() => onChoose('classic')}>
            {t('rapieres.match_order_classic')}
          </Button>
          <p className="u-hint">{t('rapieres.match_order_hint')}</p>
        </div>
        <div className="modal-footer">
          <Button type="button" onClick={onClose}>
            {t('rapieres.cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RapieresMatchOrderDialog;
