/**
 * BellePoule Modern - Tournoi des rapières : mode de tableau au passage au tableau (#1441)
 * « Tableau normal », « Tableau avec 3è place », « Tableau toutes places tirées »
 * ou « Demi-finales » (4 équipes, 3e place tirée).
 * Licensed under GPL-3.0
 */

import React from 'react';
import { useFocusTrap } from '../../renderer/hooks/useFocusTrap';
import { useTranslation } from '../../renderer/hooks/useTranslation';
import type { RapieresTableauMode } from './rapieres.types';
import { Button } from '../../renderer/components/common/Button';

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
          <Button type="button" onClick={() => onChoose('normal')}>
            {t('rapieres.tableau_mode_normal')}
          </Button>
          <Button type="button" onClick={() => onChoose('third')}>
            {t('rapieres.tableau_mode_third')}
          </Button>
          <Button type="button" onClick={() => onChoose('all')}>
            {t('rapieres.tableau_mode_all')}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!semisAvailable}
            onClick={() => onChoose('semis')}
          >
            {t('rapieres.tableau_mode_semis')}
          </Button>
          {!semisAvailable && (
            <p className="text-muted" style={{ margin: 0 }}>
              {t('rapieres.semis_unavailable')}
            </p>
          )}
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

export default RapieresTableauModeDialog;
