/**
 * BellePoule Modern - Mode Club (#1872) : choix de l'arme (club, séance).
 * L'arme de la séance fixe les règles de la saisie distante (score, durée, cartons).
 * Licensed under GPL-3.0
 */
import React from 'react';
import { Weapon } from '../../../shared/types';
import { weaponLabel } from '../../../shared/utils/categoryLabel';
import { useTranslation } from '../../hooks/useTranslation';

export const CLUB_WEAPONS: Weapon[] = [Weapon.FOIL, Weapon.EPEE, Weapon.SABRE, Weapon.LASER];

interface ClubWeaponSelectProps {
  value: Weapon | undefined;
  onChange: (w: Weapon) => void;
  label?: string;
  className?: string;
}

export const ClubWeaponSelect: React.FC<ClubWeaponSelectProps> = ({
  value,
  onChange,
  label,
  className,
}) => {
  const { t } = useTranslation();
  return (
    <label className={`form-label ${className ?? ''}`.trim()}>
      {label ?? t('clubWeapon.label')}
      <select
        className="form-input"
        value={value ?? ''}
        onChange={e => onChange(e.target.value as Weapon)}
      >
        {!value && <option value="">{t('clubWeapon.choose')}</option>}
        {CLUB_WEAPONS.map(w => (
          <option key={w} value={w}>
            {weaponLabel(w, t)}
          </option>
        ))}
      </select>
    </label>
  );
};
