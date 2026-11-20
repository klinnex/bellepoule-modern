/**
 * BellePoule Modern - Démo autonome : choix de l'arme avant lancement
 * Licensed under GPL-3.0
 */
import React from 'react';
import { PlayCircle } from 'lucide-react';
import { Weapon } from '../../../shared/types';
import { useTranslation } from '../../hooks/useTranslation';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

/** Armes proposées par la démo (l'arbitre virtuel sait les jouer) */
export const DEMO_WEAPONS: { weapon: Weapon; labelKey: string }[] = [
  { weapon: Weapon.EPEE, labelKey: 'weapons.epee' },
  { weapon: Weapon.FOIL, labelKey: 'weapons.foil' },
  { weapon: Weapon.SABRE, labelKey: 'weapons.sabre' },
  { weapon: Weapon.LASER, labelKey: 'weapons.laser' },
];

interface Props {
  onClose: () => void;
  onLaunch: (weapon: Weapon) => void;
  isLoading: boolean;
}

const DemoLauncherModal: React.FC<Props> = ({ onClose, onLaunch, isLoading }) => {
  const { t } = useTranslation();
  return (
    <Modal title={t('demo.button')} onClose={onClose}>
      <p>{t('demo.hint')}</p>
      <p>
        <strong>{t('demo.choose_weapon')}</strong>
      </p>
      <div className="u-grid-2">
        {DEMO_WEAPONS.map(({ weapon, labelKey }) => (
          <Button
            key={weapon}
            type="button"
            variant="primary"
            className="btn-icon-label"
            disabled={isLoading}
            onClick={() => onLaunch(weapon)}
          >
            <PlayCircle size={16} />
            {t(labelKey)}
          </Button>
        ))}
      </div>
    </Modal>
  );
};

export default DemoLauncherModal;
