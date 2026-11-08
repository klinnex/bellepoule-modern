/**
 * BellePoule Modern - Choix de la compétition à exporter en .bpm depuis l'accueil
 * Licensed under GPL-3.0
 */

import React from 'react';
import { Competition } from '../../shared/types';
import { useTranslation } from '../hooks/useTranslation';
import Modal from './common/Modal';

interface CompetitionExportPickerProps {
  competitions: Competition[];
  onPick: (competitionId: string) => void;
  onClose: () => void;
}

export const CompetitionExportPicker: React.FC<CompetitionExportPickerProps> = ({
  competitions,
  onPick,
  onClose,
}) => {
  const { t } = useTranslation();
  return (
    <Modal title={t('competitionList.export_pick_title')} onClose={onClose} size="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {competitions.map(competition => (
          <button
            key={competition.id}
            type="button"
            className="btn btn-secondary"
            style={{ justifyContent: 'flex-start', textAlign: 'left' }}
            onClick={() => onPick(competition.id)}
          >
            {competition.title}
          </button>
        ))}
      </div>
    </Modal>
  );
};

export default CompetitionExportPicker;
