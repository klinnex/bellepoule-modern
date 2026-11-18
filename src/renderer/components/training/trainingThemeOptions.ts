/**
 * BellePoule Modern - Thèmes intégrés des écrans d'entraînement (piste, kiosk, arbitre,
 * lobby), proposés par le mode entraînement et la saisie distante du Mode Club.
 * Licensed under GPL-3.0
 */
import type { TrainingTheme } from '../../../shared/utils/trainingThemes';

export const TRAINING_THEME_OPTIONS: { value: TrainingTheme; labelKey?: string; label?: string }[] =
  [
    { value: 'dark', labelKey: 'rsm.theme_dark' },
    { value: 'light', labelKey: 'rsm.theme_light' },
    { value: 'neon', labelKey: 'rsm.theme_neon' },
    { value: 'unicorn', label: 'Unicorn' },
    { value: 'musketeers', labelKey: 'rsm.theme_musketeers' },
  ];
