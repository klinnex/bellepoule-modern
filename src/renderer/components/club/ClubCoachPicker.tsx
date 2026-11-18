/**
 * BellePoule Modern - Mode Club : choix des maîtres d'armes qui encadrent une séance.
 * Licensed under GPL-3.0
 */
import React from 'react';
import type { ClubCoach } from '../../../shared/types/club';
import { useTranslation } from '../../hooks/useTranslation';
import { ToggleChip, ToggleChipGroup } from '../common/ToggleChip';

/** Nom affiché d'un maître d'armes */
export const coachName = (c: Pick<ClubCoach, 'firstName' | 'lastName'>): string =>
  `${c.firstName} ${c.lastName}`.trim();

/** Noms des maîtres d'armes d'une séance, dans l'ordre de la séance */
export const coachNames = (ids: readonly string[], coaches: readonly ClubCoach[]): string => {
  const byId = new Map(coaches.map(c => [c.id, c]));
  return ids
    .map(id => byId.get(id))
    .filter((c): c is ClubCoach => !!c)
    .map(coachName)
    .join(', ');
};

interface ClubCoachPickerProps {
  /** Maîtres d'armes du club (archivés : proposés seulement s'ils sont déjà choisis) */
  coaches: readonly ClubCoach[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
}

export const ClubCoachPicker: React.FC<ClubCoachPickerProps> = ({ coaches, value, onChange }) => {
  const { t } = useTranslation();
  const selected = new Set(value);
  const shown = coaches.filter(c => c.active || selected.has(c.id));
  return (
    <ToggleChipGroup legend={t('clubCoach.session_label')} className="club-coach-picker">
      {shown.length === 0 ? (
        <span className="club-muted">{t('clubCoach.none_available')}</span>
      ) : (
        shown.map(c => (
          <ToggleChip
            key={c.id}
            pressed={selected.has(c.id)}
            title={c.title || undefined}
            onToggle={on => onChange(on ? [...value, c.id] : value.filter(id => id !== c.id))}
          >
            {coachName(c)}
            {c.title ? <span className="toggle-chip-sub"> · {c.title}</span> : null}
          </ToggleChip>
        ))
      )}
    </ToggleChipGroup>
  );
};
