/**
 * BellePoule Modern - Mode Club (#1872) : armes visées par un exercice (épée, fleuret,
 * sabre, sabre laser, escrime artistique) — cartes activables (édition) et filtre (recherche).
 * Licensed under GPL-3.0
 */
import React from 'react';
import { EXERCISE_WEAPONS, type ExerciseWeapon } from '../../../shared/utils/clubWeapon';
import { weaponLabel } from '../../../shared/utils/categoryLabel';
import { useTranslation } from '../../hooks/useTranslation';
import { ToggleChip, ToggleChipGroup } from '../common/ToggleChip';

type TFn = (key: string) => string;

/** Libellé d'une arme d'exercice (E, F, S, L ou A = escrime artistique) */
export function exerciseWeaponLabel(code: string, t: TFn): string {
  return code === 'A' ? t('clubExercises.weapon_artistic') : weaponLabel(code, t);
}

/** Vrai si l'exercice est visé par le filtre (« » = toutes armes ; exercice sans arme = commun) */
export function exerciseMatchesWeapon(weapons: string[] | undefined, filter: string): boolean {
  return !filter || !weapons?.length || weapons.includes(filter);
}

export const ExerciseWeaponChecks: React.FC<{
  value: string[];
  onChange: (next: string[]) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const toggle = (w: ExerciseWeapon) =>
    onChange(value.includes(w) ? value.filter(x => x !== w) : [...value, w]);
  return (
    <ToggleChipGroup legend={t('clubExercises.weapons_label')} className="club-weapon-checks">
      {EXERCISE_WEAPONS.map(w => (
        <ToggleChip key={w} pressed={value.includes(w)} onToggle={() => toggle(w)}>
          {exerciseWeaponLabel(w, t)}
        </ToggleChip>
      ))}
      <p className="text-sm club-chip-hint">{t('clubExercises.weapons_hint')}</p>
    </ToggleChipGroup>
  );
};

export const ExerciseWeaponFilter: React.FC<{
  value: string;
  onChange: (next: string) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation();
  return (
    <label className="form-label">
      {t('clubExercises.weapons_label')}
      <select
        className="form-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={t('clubExercises.weapons_label')}
      >
        <option value="">{t('clubExercises.weapon_any')}</option>
        {EXERCISE_WEAPONS.map(w => (
          <option key={w} value={w}>
            {exerciseWeaponLabel(w, t)}
          </option>
        ))}
      </select>
    </label>
  );
};
