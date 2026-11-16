/**
 * BellePoule Modern - Mode Club (#1872) : choix des catégories d'âge (M9 … V4).
 * Plage de début / fin (séance, pointage, statistiques), catégorie seule (filtre de liste),
 * ou cases à cocher (public visé par un exercice ; aucune case = commun à tous).
 * Licensed under GPL-3.0
 */
import React from 'react';
import { AGE_CATEGORIES, type AgeRange } from '../../../shared/utils/clubAge';
import { categoryLabel } from '../../../shared/utils/categoryLabel';
import { useTranslation } from '../../hooks/useTranslation';

interface AgeRangeSelectProps {
  value: AgeRange;
  onChange: (r: AgeRange) => void;
  className?: string;
}

/** Catégories de début et de fin (bornes incluses), « toutes » par défaut */
export const AgeRangeSelect: React.FC<AgeRangeSelectProps> = ({ value, onChange, className }) => {
  const { t } = useTranslation();
  const select = (key: keyof AgeRange, label: string, emptyLabel: string) => (
    <label className="form-label">
      {label}
      <select
        className="form-input"
        value={value[key] ?? ''}
        onChange={e => onChange({ ...value, [key]: e.target.value || undefined })}
      >
        <option value="">{emptyLabel}</option>
        {AGE_CATEGORIES.map(c => (
          <option key={c} value={c}>
            {categoryLabel(c, t)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className={`club-age-range ${className ?? ''}`.trim()}>
      {select('ageFrom', t('clubAge.from'), t('clubAge.youngest'))}
      {select('ageTo', t('clubAge.to'), t('clubAge.oldest'))}
    </div>
  );
};

interface AgeCategoryFilterProps {
  value: string;
  onChange: (cat: string) => void;
  label?: string;
}

/** Une catégorie (filtre de liste) ; '' = toutes */
export const AgeCategoryFilter: React.FC<AgeCategoryFilterProps> = ({ value, onChange, label }) => {
  const { t } = useTranslation();
  return (
    <label className="form-label">
      {label ?? t('clubAge.category')}
      <select className="form-input" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{t('clubAge.all')}</option>
        {AGE_CATEGORIES.map(c => (
          <option key={c} value={c}>
            {categoryLabel(c, t)}
          </option>
        ))}
      </select>
    </label>
  );
};

interface AgeCategoryChecksProps {
  value: readonly string[];
  onChange: (cats: string[]) => void;
}

/** Public visé : aucune case cochée = commun à toutes les catégories */
export const AgeCategoryChecks: React.FC<AgeCategoryChecksProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const toggle = (c: string, on: boolean) =>
    onChange(AGE_CATEGORIES.filter(x => (x === c ? on : value.includes(x))));
  return (
    <fieldset className="club-age-checks">
      <legend className="form-label">
        {t('clubAge.audience')}{' '}
        <span className="club-muted">
          {value.length === 0
            ? t('clubAge.common')
            : t('clubAge.selected', { count: value.length })}
        </span>
      </legend>
      {AGE_CATEGORIES.map(c => (
        <label key={c} className="club-nowrap">
          <input
            type="checkbox"
            checked={value.includes(c)}
            onChange={e => toggle(c, e.target.checked)}
          />{' '}
          {categoryLabel(c, t)}
        </label>
      ))}
    </fieldset>
  );
};

/** « M11 → M15 », « M13 », ou '' (toutes) */
export function ageRangeText(r: AgeRange, t: (key: string) => string): string {
  const from = r.ageFrom ? categoryLabel(r.ageFrom, t) : '';
  const to = r.ageTo ? categoryLabel(r.ageTo, t) : '';
  if (!from && !to) return '';
  if (from && to) return from === to ? from : `${from} → ${to}`;
  return from ? `${from} →` : `→ ${to}`;
}
