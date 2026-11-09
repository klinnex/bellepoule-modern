/**
 * BellePoule Modern - Choix de la compétition à exporter en .bpm depuis l'accueil
 * Licensed under GPL-3.0
 */

import React from 'react';
import { Competition } from '../../shared/types';
import { useTranslation } from '../hooks/useTranslation';
import Modal from './common/Modal';
import { Button } from './common/Button';

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
      <div className="competition-export-picker">
        {competitions.map(competition => (
          <Button
            key={competition.id}
            type="button"
            className="competition-export-picker__item"
            onClick={() => onPick(competition.id)}
          >
            {competition.title}
          </Button>
        ))}
      </div>
    </Modal>
  );
};

export default CompetitionExportPicker;
