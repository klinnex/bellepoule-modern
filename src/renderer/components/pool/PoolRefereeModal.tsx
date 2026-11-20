/**
 * BellePoule Modern - Modale de désignation des arbitres d'une poule (#1532)
 * Extraite de PoolView (plafond de longueur #1155).
 * Licensed under GPL-3.0
 */
import React from 'react';
import { Gavel, Square, SquareCheck } from 'lucide-react';
import type { Referee } from '../../../shared/types';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import Modal from '../common/Modal';
import { COL_GAP, REF_EMPTY, REF_BTN, REF_PICK_BTN } from '../poolView.styles';

interface PoolRefereeModalProps {
  poolNumber: number;
  isMultiReferee: boolean;
  maxRefereesPerPool: number;
  assignedReferee: Referee | null;
  competitionReferees: Referee[];
  isLoadingReferees: boolean;
  pendingRefereeIds: string[];
  onClose: () => void;
  onAssign: (referee: Referee | null) => void;
  onToggle: (refereeId: string) => void;
  onConfirm: () => void;
}

export const PoolRefereeModal: React.FC<PoolRefereeModalProps> = ({
  poolNumber,
  isMultiReferee,
  maxRefereesPerPool,
  assignedReferee,
  competitionReferees,
  isLoadingReferees,
  pendingRefereeIds,
  onClose,
  onAssign,
  onToggle,
  onConfirm,
}) => {
  const { t } = useTranslation();
  return (
    <Modal
      title={isMultiReferee ? t('poolView.assign_referees') : t('poolView.assign_referee')}
      onClose={onClose}
      size="sm"
    >
      <p className="u-hint mb-4">
        {isMultiReferee
          ? t('poolView.select_referees', { max: maxRefereesPerPool, n: poolNumber })
          : t('poolView.select_referee', { n: poolNumber })}
      </p>
      <div style={COL_GAP}>
        <Button
          variant={!assignedReferee ? 'primary' : 'secondary'}
          onClick={() => onAssign(null)}
          style={REF_BTN}
        >
          {t('poolView.no_referee')}
        </Button>
        {isLoadingReferees && <p style={REF_EMPTY}>{t('poolView.loading_referees')}</p>}
        {!isLoadingReferees && competitionReferees.length === 0 && (
          <p style={REF_EMPTY}>{t('poolView.no_checked_referee')}</p>
        )}
        {!isLoadingReferees &&
          isMultiReferee &&
          competitionReferees.map(ref => {
            const order = pendingRefereeIds.indexOf(ref.id);
            const selected = order >= 0;
            const disabled = !selected && pendingRefereeIds.length >= maxRefereesPerPool;
            return (
              <Button
                key={ref.id}
                onClick={() => onToggle(ref.id)}
                disabled={disabled}
                aria-pressed={selected}
                variant={selected ? 'primary' : 'secondary'}
                {...REF_PICK_BTN}
              >
                <Icon icon={selected ? SquareCheck : Square} /> {selected && `${order + 1}.`}{' '}
                <Icon icon={Gavel} /> {ref.lastName} {ref.firstName}
                {ref.club && <span className="pv-ref-club">({ref.club})</span>}
              </Button>
            );
          })}
        {!isLoadingReferees && isMultiReferee && competitionReferees.length > 0 && (
          <Button variant="primary" onClick={onConfirm} style={REF_BTN}>
            {t('poolView.validate_n', {
              n: pendingRefereeIds.length,
              max: maxRefereesPerPool,
            })}
          </Button>
        )}
        {!isLoadingReferees &&
          !isMultiReferee &&
          competitionReferees.map(ref => (
            <Button
              key={ref.id}
              onClick={() => onAssign(ref)}
              variant={assignedReferee?.id === ref.id ? 'primary' : 'secondary'}
              {...REF_PICK_BTN}
            >
              <Icon icon={Gavel} /> {ref.lastName} {ref.firstName}
              {ref.club && <span className="pv-ref-club">({ref.club})</span>}
            </Button>
          ))}
      </div>
    </Modal>
  );
};

export default PoolRefereeModal;
