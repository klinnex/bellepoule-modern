/**
 * BellePoule Modern - Tournoi des rapières : mode de tableau au passage au tableau (#1441)
 * « Tableau normal », « Tableau avec 3è place » ou « Demi-finales » (4 équipes, 3e place tirée).
 * Licensed under GPL-3.0
 */

import React from 'react';
import { useFocusTrap } from '../../renderer/hooks/useFocusTrap';
import { useTranslation } from '../../renderer/hooks/useTranslation';
import type { RapieresTableauMode } from './rapieres.types';

interface RapieresTableauModeDialogProps {
  /** Demi-finales possibles avec le nombre de poules (1 à 4) */
  semisAvailable: boolean;
  onChoose: (mode: RapieresTableauMode) => void;
  onClose: () => void;
}

const RapieresTableauModeDialog: React.FC<RapieresTableauModeDialogProps> = ({
  semisAvailable,
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
          <h2 className="modal-title">{t('rapieres.tableau_mode_title')}</h2>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: '0.75rem' }}>
          <button type="button" className="btn btn-secondary" onClick={() => onChoose('normal')}>
            {t('rapieres.tableau_mode_normal')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onChoose('third')}>
            {t('rapieres.tableau_mode_third')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!semisAvailable}
            onClick={() => onChoose('semis')}
          >
            {t('rapieres.tableau_mode_semis')}
          </button>
          {!semisAvailable && (
            <p className="text-muted" style={{ margin: 0 }}>
              {t('rapieres.semis_unavailable')}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('rapieres.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RapieresTableauModeDialog;
