/**
 * BellePoule Modern - Démo autonome : choix de l'arme avant lancement
 * Licensed under GPL-3.0
 */
import React from 'react';
import { PlayCircle } from 'lucide-react';
import { Weapon } from '../../../shared/types';
import { useTranslation } from '../../hooks/useTranslation';
import { useFocusTrap } from '../../hooks/useFocusTrap';

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
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-launcher-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="demo-launcher-title">
            {t('demo.button')}
          </h2>
          <button className="btn-close" onClick={onClose} aria-label={t('actions.close')}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>{t('demo.hint')}</p>
          <p>
            <strong>{t('demo.choose_weapon')}</strong>
          </p>
          <div className="u-grid-2">
            {DEMO_WEAPONS.map(({ weapon, labelKey }) => (
              <button
                key={weapon}
                type="button"
                className="btn btn-primary btn-icon-label"
                disabled={isLoading}
                onClick={() => onLaunch(weapon)}
              >
                <PlayCircle size={16} />
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DemoLauncherModal;
