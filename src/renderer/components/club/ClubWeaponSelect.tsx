/**
 * BellePoule Modern - Mode Club (#1872) : choix de l'arme (club, séance, maître d'armes).
 * L'arme de la séance fixe les règles de la saisie distante (score, durée, cartons) ;
 * l'escrime artistique (« A ») n'a pas de saisie distante.
 * Licensed under GPL-3.0
 */
import React from 'react';
import { Weapon } from '../../../shared/types';
import { weaponLabel } from '../../../shared/utils/categoryLabel';
import { ARTISTIC_CODE, type ClubWeaponCode } from '../../../shared/utils/clubWeapon';
import { useTranslation } from '../../hooks/useTranslation';

/** Armes de compétition (saisie distante possible) */
export const CLUB_WEAPONS: Weapon[] = [Weapon.FOIL, Weapon.EPEE, Weapon.SABRE, Weapon.LASER];

/** Choix proposés pour une séance, un club ou un maître d'armes : compétition + escrime artistique */
export const CLUB_WEAPON_CHOICES: ClubWeaponCode[] = [...CLUB_WEAPONS, ARTISTIC_CODE];

/** Armes enseignées par un maître d'armes */
export const COACH_WEAPONS = CLUB_WEAPON_CHOICES;

/** Libellé d'une arme de club (« A » = escrime artistique) */
export const clubWeaponLabel = (w: ClubWeaponCode, t: (key: string) => string): string =>
  w === ARTISTIC_CODE ? t('clubExercises.weapon_artistic') : weaponLabel(w, t);

interface ClubWeaponSelectProps {
  value: ClubWeaponCode | undefined;
  onChange: (w: ClubWeaponCode) => void;
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
  const labelOf = (w: ClubWeaponCode): string => clubWeaponLabel(w, t);
  return (
    <label className={`form-label ${className ?? ''}`.trim()}>
      {label ?? t('clubWeapon.label')}
      <select
        className="form-input"
        value={value ?? ''}
        onChange={e => onChange(e.target.value as ClubWeaponCode)}
      >
        {!value && <option value="">{t('clubWeapon.choose')}</option>}
        {CLUB_WEAPON_CHOICES.map(w => (
          <option key={w} value={w}>
            {labelOf(w)}
          </option>
        ))}
      </select>
    </label>
  );
};
