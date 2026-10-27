/**
 * BellePoule Modern - Choix du tireur pour un statut spécial en poule (médical / forfait / exclusion)
 * Extrait de PoolView (#1241).
 * Licensed under GPL-3.0
 */

import React from 'react';
import { Fencer } from '../../../shared/types';
import Modal from '../common/Modal';
import { useTranslation } from '../../hooks/useTranslation';
import { COL_GAP, MUTED_HINT, STATUS_BTN } from '../poolView.styles';

export type PoolSpecialStatus = 'abandon' | 'forfait' | 'exclusion';

interface PoolSpecialStatusModalProps {
  status: PoolSpecialStatus;
  fencerLeft?: Fencer | null;
  fencerRight?: Fencer | null;
  onPick: (side: 'left' | 'right') => void;
  onCancel: () => void;
}

const STATUS_LABEL_KEYS: Record<PoolSpecialStatus, string> = {
  abandon: 'poolView.st_abandon',
  forfait: 'poolView.st_forfeit',
  exclusion: 'poolView.st_excluded',
};

const fencerName = (f?: Fencer | null) => (f ? `${f.lastName} ${f.firstName ?? ''}`.trim() : '—');

const PoolSpecialStatusModal: React.FC<PoolSpecialStatusModalProps> = ({
  status,
  fencerLeft,
  fencerRight,
  onPick,
  onCancel,
}) => {
  const { t } = useTranslation();
  const statusHint =
    status === 'exclusion' ? t('poolView.hint_excluded') : t('poolView.hint_loses');

  return (
    <Modal
      title={t('poolView.which_fencer', { status: t(STATUS_LABEL_KEYS[status]) })}
      onClose={onCancel}
      size="sm"
      elevated
      footer={
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {t('actions.cancel')}
        </button>
      }
    >
      <p style={MUTED_HINT}>{statusHint}</p>
      <div style={COL_GAP}>
        <button
          type="button"
          className="btn btn-warning"
          onClick={() => onPick('left')}
          style={STATUS_BTN}
        >
          {fencerName(fencerLeft)}
        </button>
        <button
          type="button"
          className="btn btn-warning"
          onClick={() => onPick('right')}
          style={STATUS_BTN}
        >
          {fencerName(fencerRight)}
        </button>
      </div>
    </Modal>
  );
};

export default React.memo(PoolSpecialStatusModal);
