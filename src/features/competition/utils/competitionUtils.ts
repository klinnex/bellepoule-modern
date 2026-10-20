/**
 * BellePoule Modern - Competition Utils
 * Helper functions for competition management
 * Licensed under GPL-3.0
 */

import { CreateCompetitionDTO } from '../types/competition.types';
import { v4 as uuidv4 } from 'uuid';
import { getActiveLocale } from '../../../shared/utils/localeFormat';

export function validateCompetition(data: CreateCompetitionDTO): string | null {
  if (!data.title?.trim()) {
    return 'Le titre est obligatoire';
  }

  if (!data.date) {
    return 'La date est obligatoire';
  }

  if (!data.weapon) {
    return "L'arme est obligatoire";
  }

  if (!data.gender) {
    return 'Le genre est obligatoire';
  }

  if (!data.category) {
    return 'La catégorie est obligatoire';
  }

  return null;
}

export function generateCompetitionId(): string {
  return uuidv4();
}

export function formatCompetitionDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString(getActiveLocale(), {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function generateCompetitionTitle(
  weapon: string,
  gender: string,
  category: string,
  date: Date
): string {
  const formattedDate = new Date(date).toLocaleDateString(getActiveLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return `${weapon} ${gender} ${category} - ${formattedDate}`;
}
