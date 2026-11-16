/**
 * BellePoule Modern - Mode Club (#1872) : choisir des exercices de la bibliothèque
 * pour le plan de séance (famille, recherche, sélection multiple).
 * Licensed under GPL-3.0
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { ClubExercise, ClubExerciseCategory } from '../../../shared/types/club';
import { EXERCISE_CATEGORIES, formatMinutes } from '../../../shared/utils/clubPlan';
import { exerciseMatchesRange, hasAgeRange, type AgeRange } from '../../../shared/utils/clubAge';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

interface ClubExercisePickerProps {
  /** Famille affichée à l'ouverture (ex. échauffement) */
  initialCategory?: ClubExerciseCategory | 'all';
  /** Catégories d'âge du cours : exercices de ces catégories et communs à tous */
  ageRange?: AgeRange;
  onPick: (exercises: ClubExercise[]) => void;
  onClose: () => void;
}

export const ClubExercisePicker: React.FC<ClubExercisePickerProps> = ({
  initialCategory = 'all',
  ageRange,
  onPick,
  onClose,
}) => {
  const { t } = useTranslation();
  const [all, setAll] = useState<ClubExercise[] | null>(null);
  const [category, setCategory] = useState<ClubExerciseCategory | 'all'>(initialCategory);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [forCourse, setForCourse] = useState(hasAgeRange(ageRange));

  useEffect(() => {
    void window.electronAPI?.club?.listExercises().then(setAll);
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (all ?? []).filter(
      e =>
        (category === 'all' || e.category === category) &&
        (!forCourse || exerciseMatchesRange(e.ageCategories, ageRange)) &&
        (!q || `${e.title} ${e.details ?? ''}`.toLowerCase().includes(q))
    );
  }, [all, category, search, forCourse, ageRange]);

  const toggle = (id: string) =>
    setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  return (
    <Modal
      title={t('clubExercises.pick_title')}
      onClose={onClose}
      size="lg"
      scroll
      footer={
        <>
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button
            variant="primary"
            disabled={picked.length === 0}
            onClick={() => onPick(picked.map(id => all!.find(e => e.id === id)!).filter(Boolean))}
          >
            {t('clubExercises.pick_n', { count: picked.length })}
          </Button>
        </>
      }
    >
      <div className="club-row">
        <label className="form-label">
          {t('clubExercises.category')}
          <select
            className="form-input"
            value={category}
            onChange={e => setCategory(e.target.value as ClubExerciseCategory | 'all')}
          >
            <option value="all">{t('clubExercises.cat_all')}</option>
            {EXERCISE_CATEGORIES.map(c => (
              <option key={c} value={c}>
                {t(`clubExercises.cat_${c}`)}
              </option>
            ))}
          </select>
        </label>
        <input
          className="form-input club-grow"
          type="search"
          value={search}
          placeholder={t('club.search')}
          aria-label={t('club.search')}
          onChange={e => setSearch(e.target.value)}
        />
        {hasAgeRange(ageRange) && (
          <label className="club-nowrap">
            <input
              type="checkbox"
              checked={forCourse}
              onChange={e => setForCourse(e.target.checked)}
            />{' '}
            {t('clubAge.only_course')}
          </label>
        )}
      </div>
      {all !== null && visible.length === 0 ? (
        <p className="club-muted">{t('clubExercises.none_found')}</p>
      ) : (
        <ul className="club-exercise-list">
          {visible.map(e => (
            <li key={e.id}>
              <label className="club-exercise-pick">
                <input
                  type="checkbox"
                  checked={picked.includes(e.id)}
                  onChange={() => toggle(e.id)}
                />
                <span className="club-grow">
                  <span className="font-medium">{e.title}</span>{' '}
                  <span className="club-muted">
                    · {t(`clubExercises.cat_${e.category}`)} · {formatMinutes(e.minutes)}
                  </span>
                  {e.details && <span className="club-plan-details">{e.details}</span>}
                </span>
                {e.images[0] && <img className="club-exercise-thumb" src={e.images[0]} alt="" />}
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
