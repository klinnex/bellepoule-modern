/**
 * BellePoule Modern - Validation des données IPC reçues du renderer (#1774)
 * Sans dépendance Electron : importée par preload.ts, testable unitairement.
 * Licensed under GPL-3.0
 */
import type {
  CompetitionCreateData,
  FencerCreateData,
  MatchCreateData,
} from '../../shared/types/preload';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validateUUID = (id: string, label: string): void => {
  if (!id || !UUID_RE.test(id)) throw new Error(`Invalid ${label} format`);
};

export const validateCompetitionData = (data: CompetitionCreateData): void => {
  if (!data.title || typeof data.title !== 'string') {
    throw new Error('Competition title is required and must be a string');
  }
  if (!data.date || !(data.date instanceof Date)) {
    throw new Error('Competition date is required and must be a Date');
  }
  if (!data.weapon || typeof data.weapon !== 'string') {
    throw new Error('Weapon is required and must be a string');
  }
};

export const validateFencerData = (fencer: FencerCreateData): void => {
  if (!fencer.lastName || typeof fencer.lastName !== 'string') {
    throw new Error('Fencer last name is required and must be a string');
  }
  if (!fencer.firstName || typeof fencer.firstName !== 'string') {
    throw new Error('Fencer first name is required and must be a string');
  }
  // ref est optionnel - il sera généré automatiquement par la base de données
  if (fencer.ref !== undefined && (typeof fencer.ref !== 'number' || fencer.ref < 0)) {
    throw new Error('Fencer reference number must be positive');
  }
};

export const validateMatchData = (match: MatchCreateData): void => {
  if (typeof match.number !== 'number' || match.number < 0) {
    throw new Error('Match number is required and must be positive');
  }
  if (typeof match.maxScore !== 'number' || match.maxScore < 0) {
    throw new Error('Match max score is required and must be positive');
  }
};
