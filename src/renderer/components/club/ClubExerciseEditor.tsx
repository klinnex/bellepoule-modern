/**
 * BellePoule Modern - Mode Club (#1872) : création / modification d'un exercice
 * de la bibliothèque (titre, famille, durée, consignes, images).
 * Licensed under GPL-3.0
 */
import React, { useState } from 'react';
import type {
  ClubExercise,
  ClubExerciseCategory,
  ClubExerciseInput,
} from '../../../shared/types/club';
import { EXERCISE_CATEGORIES } from '../../../shared/utils/clubPlan';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { ClubImagesField } from './ClubImagesField';
import { AgeCategoryChecks } from './ClubAgeRange';
import { ExerciseWeaponChecks } from './ClubExerciseWeapons';

interface ClubExerciseEditorProps {
  exercise?: ClubExercise | null;
  /** Famille proposée pour un nouvel exercice */
  defaultCategory?: ClubExerciseCategory;
  onSave: (data: ClubExerciseInput) => void;
  onClose: () => void;
}

export const CategorySelect: React.FC<{
  value: ClubExerciseCategory;
  onChange: (c: ClubExerciseCategory) => void;
  label?: string;
}> = ({ value, onChange, label }) => {
  const { t } = useTranslation();
  return (
    <label className="form-label">
      {label ?? t('clubExercises.category')}
      <select
        className="form-input"
        value={value}
        onChange={e => onChange(e.target.value as ClubExerciseCategory)}
      >
        {EXERCISE_CATEGORIES.map(c => (
          <option key={c} value={c}>
            {t(`clubExercises.cat_${c}`)}
          </option>
        ))}
      </select>
    </label>
  );
};

export const ClubExerciseEditor: React.FC<ClubExerciseEditorProps> = ({
  exercise,
  defaultCategory = 'warmup',
  onSave,
  onClose,
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState(exercise?.title ?? '');
  const [category, setCategory] = useState<ClubExerciseCategory>(
    exercise?.category ?? defaultCategory
  );
  const [minutes, setMinutes] = useState(exercise?.minutes ?? 10);
  const [details, setDetails] = useState(exercise?.details ?? '');
  const [images, setImages] = useState<string[]>(exercise?.images ?? []);
  const [ageCategories, setAgeCategories] = useState<string[]>(exercise?.ageCategories ?? []);
  const [weapons, setWeapons] = useState<string[]>(exercise?.weapons ?? []);

  return (
    <Modal
      title={exercise ? t('clubExercises.edit_title') : t('clubExercises.new_title')}
      onClose={onClose}
      size="lg"
      scroll
      footer={
        <>
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!title.trim()}
            onClick={() =>
              onSave({ title, category, minutes, details, images, ageCategories, weapons })
            }
          >
            {t('actions.save')}
          </Button>
        </>
      }
    >
      <div className="club-row">
        <label className="form-label club-grow">
          {t('clubExercises.title_label')}
          <input
            className="form-input"
            value={title}
            maxLength={120}
            placeholder={t('clubPlan.exercise_ph')}
            onChange={e => setTitle(e.target.value)}
          />
        </label>
        <CategorySelect value={category} onChange={setCategory} />
        <label className="form-label">
          {t('clubPlan.minutes')}
          <input
            className="form-input club-score-input"
            type="number"
            min={0}
            max={600}
            value={minutes}
            onChange={e => setMinutes(Number(e.target.value))}
          />
        </label>
      </div>
      <label className="form-label">
        {t('clubExercises.details')}
        <textarea
          className="form-input club-textarea"
          rows={4}
          value={details}
          placeholder={t('clubPlan.details_ph')}
          onChange={e => setDetails(e.target.value)}
        />
      </label>
      <ExerciseWeaponChecks value={weapons} onChange={setWeapons} />
      <AgeCategoryChecks value={ageCategories} onChange={setAgeCategories} />
      <ClubImagesField images={images} onChange={setImages} label={t('clubImages.label')} />
    </Modal>
  );
};
