/**
 * BellePoule Modern - Database Validation Utilities
 * Input validation for database operations
 * Licensed under GPL-3.0
 */

import {
  Competition,
  Fencer,
  Match,
  Pool,
  CompetitionSettings,
  FencerStatus,
  Gender,
  Weapon,
  Category,
  MatchStatus
} from '../shared/types';

// ============================================================================
// Validation Error Class
// ============================================================================

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ============================================================================
// Validation Utilities
// ============================================================================

export const validateId = (id: string, fieldName: string = 'ID'): void => {
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    throw new ValidationError(`${fieldName} is required and must be a non-empty string`, fieldName);
  }
  if (id.length > 255) {
    throw new ValidationError(`${fieldName} cannot exceed 255 characters`, fieldName);
  }
};

export const validateRequiredString = (value: string, fieldName: string, maxLength: number = 255): void => {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} is required and must be a non-empty string`, fieldName);
  }
  if (value.length > maxLength) {
    throw new ValidationError(`${fieldName} cannot exceed ${maxLength} characters`, fieldName);
  }
};

export const validateOptionalString = (value: string | undefined, fieldName: string, maxLength: number = 255): void => {
  if (value !== undefined && value !== null) {
    if (typeof value !== 'string') {
      throw new ValidationError(`${fieldName} must be a string`, fieldName);
    }
    if (value.length > maxLength) {
      throw new ValidationError(`${fieldName} cannot exceed ${maxLength} characters`, fieldName);
    }
  }
};

export const validateNumber = (value: number, fieldName: string, min: number = 0, max?: number): void => {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new ValidationError(`${fieldName} must be a valid number`, fieldName);
  }
  if (value < min) {
    throw new ValidationError(`${fieldName} must be at least ${min}`, fieldName);
  }
  if (max !== undefined && value > max) {
    throw new ValidationError(`${fieldName} cannot exceed ${max}`, fieldName);
  }
};

export const validateOptionalNumber = (value: number | undefined, fieldName: string, min: number = 0, max?: number): void => {
  if (value !== undefined && value !== null) {
    validateNumber(value, fieldName, min, max);
  }
};

export const validateDate = (value: Date, fieldName: string): void => {
  if (!(value instanceof Date) || isNaN(value.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid Date`, fieldName);
  }
};

export const validateOptionalDate = (value: Date | undefined, fieldName: string): void => {
  if (value !== undefined && value !== null) {
    validateDate(value, fieldName);
  }
};

export const validateEnum = (value: string, fieldName: string, validValues: string[]): void => {
  if (!validValues.includes(value)) {
    throw new ValidationError(`${fieldName} must be one of: ${validValues.join(', ')}`, fieldName);
  }
};

export const validateOptionalEnum = (value: string | undefined, fieldName: string, validValues: string[]): void => {
  if (value !== undefined && value !== null) {
    validateEnum(value, fieldName, validValues);
  }
};

export const validateArray = (value: any[], fieldName: string, maxLength?: number): void => {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`, fieldName);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new ValidationError(`${fieldName} cannot exceed ${maxLength} items`, fieldName);
  }
};

// ============================================================================
// Competition Validation
// ============================================================================

export const validateCompetitionData = (data: Partial<Competition>): void => {
  // Required fields
  validateRequiredString(data.title!, 'title', 200);
  validateDate(data.date!, 'date');
  validateEnum(data.weapon!, 'weapon', Object.values(Weapon));
  validateEnum(data.gender!, 'gender', Object.values(Gender));
  validateEnum(data.category!, 'category', Object.values(Category));

  // Optional fields
  validateOptionalString(data.shortTitle, 'shortTitle', 100);
  validateOptionalString(data.location, 'location', 200);
  validateOptionalString(data.organizer, 'organizer', 200);
  validateOptionalString(data.organizerUrl, 'organizerUrl', 500);
  validateOptionalString(data.color, 'color', 7); // Hex color

  // Validate URL format if provided
  if (data.organizerUrl) {
    try {
      new URL(data.organizerUrl);
    } catch {
      throw new ValidationError('organizerUrl must be a valid URL', 'organizerUrl');
    }
  }

  // Validate color format if provided
  if (data.color && !/^#[0-9A-Fa-f]{6}$/.test(data.color)) {
    throw new ValidationError('color must be a valid hex color (e.g., #FF0000)', 'color');
  }

  // Validate settings if provided
  if (data.settings) {
    validateCompetitionSettings(data.settings);
  }
};

export const validateCompetitionSettings = (settings: CompetitionSettings): void => {
  validateNumber(settings.defaultPoolMaxScore, 'defaultPoolMaxScore', 1, 50);
  validateNumber(settings.defaultTableMaxScore, 'defaultTableMaxScore', 1, 50);
  validateNumber(settings.poolRounds, 'poolRounds', 1, 5);
  validateNumber(settings.defaultRanking, 'defaultRanking', 0);
  validateNumber(settings.minTeamSize, 'minTeamSize', 1);

  if (settings.defaultPoolMaxScore > 15) {
    throw new ValidationError('defaultPoolMaxScore should not exceed 15 for practical fencing', 'defaultPoolMaxScore');
  }
};

// ============================================================================
// Fencer Validation
// ============================================================================

export const validateFencerData = (data: Partial<Fencer>): void => {
  // Required fields
  validateNumber(data.ref!, 'ref', 1, 9999);
  validateRequiredString(data.lastName!, 'lastName', 100);
  validateRequiredString(data.firstName!, 'firstName', 100);
  validateEnum(data.gender!, 'gender', Object.values(Gender));
  validateEnum(data.status!, 'status', Object.values(FencerStatus));
  validateRequiredString(data.nationality!, 'nationality', 3); // ISO country code

  // Optional fields
  validateOptionalDate(data.birthDate, 'birthDate');
  validateOptionalString(data.league, 'league', 100);
  validateOptionalString(data.club, 'club', 100);
  validateOptionalString(data.license, 'license', 50);
  validateOptionalNumber(data.ranking, 'ranking', 1);
  validateOptionalNumber(data.seedNumber, 'seedNumber', 1);
  validateOptionalNumber(data.initialRanking, 'initialRanking', 1);
  validateOptionalNumber(data.finalRanking, 'finalRanking', 1);

  // Validate nationality format (ISO country code)
  if (data.nationality && !/^[A-Z]{2,3}$/.test(data.nationality)) {
    throw new ValidationError('nationality must be a valid ISO country code (2-3 letters)', 'nationality');
  }

  // Validate birth date if provided (not in future)
  if (data.birthDate && data.birthDate > new Date()) {
    throw new ValidationError('birthDate cannot be in the future', 'birthDate');
  }
};

// ============================================================================
// Match Validation
// ============================================================================

export const validateMatchData = (data: Partial<Match>): void => {
  // Required fields
  validateNumber(data.number!, 'number', 1);
  validateEnum(data.status!, 'status', Object.values(MatchStatus));
  validateNumber(data.maxScore!, 'maxScore', 1, 50);

  // Optional fields
  validateOptionalNumber(data.strip, 'strip', 1, 99);
  validateOptionalNumber(data.duration, 'duration', 0);
  validateOptionalNumber(data.round, 'round', 1);
  validateOptionalNumber(data.position, 'position', 1);

  // Validate date fields
  validateOptionalDate(data.startTime, 'startTime');
  validateOptionalDate(data.endTime, 'endTime');

  // Validate time consistency
  if (data.startTime && data.endTime && data.endTime <= data.startTime) {
    throw new ValidationError('endTime must be after startTime', 'endTime');
  }

  // Validate duration consistency with start/end times
  if (data.duration && data.startTime && data.endTime) {
    const expectedDuration = Math.floor((data.endTime.getTime() - data.startTime.getTime()) / 1000);
    if (Math.abs(data.duration - expectedDuration) > 60) { // Allow 1 minute tolerance
      throw new ValidationError('duration does not match start/end time difference', 'duration');
    }
  }
};

// ============================================================================
// Pool Validation
// ============================================================================

export const validatePoolData = (data: Partial<Pool>): void => {
  // Required fields
  validateNumber(data.number!, 'number', 1);
  validateId(data.phaseId!, 'phaseId');

  // Optional fields
  validateOptionalNumber(data.strip, 'strip', 1, 99);
  validateOptionalDate(data.startTime, 'startTime');

  // Validate fencers array if provided
  if (data.fencers !== undefined) {
    validateArray(data.fencers, 'fencers', 20); // Max 20 fencers per pool for practical reasons
    data.fencers.forEach((fencer, index) => {
      if (!fencer || !fencer.id) {
        throw new ValidationError(`Fencer at index ${index} is invalid`, 'fencers');
      }
    });
  }

  // Validate matches array if provided
  if (data.matches !== undefined) {
    validateArray(data.matches, 'matches');
    data.matches.forEach((match, index) => {
      if (!match || !match.id) {
        throw new ValidationError(`Match at index ${index} is invalid`, 'matches');
      }
    });
  }
};

// ============================================================================
// Session State Validation
// ============================================================================

export const validateSessionState = (state: any): void => {
  if (!state || typeof state !== 'object') {
    throw new ValidationError('Session state must be an object');
  }

  // Validate specific fields if present
  if (state.currentPhase !== undefined) {
    validateNumber(state.currentPhase, 'currentPhase', 0);
  }

  if (state.selectedPool !== undefined) {
    validateId(state.selectedPool, 'selectedPool');
  }

  if (state.selectedTable !== undefined) {
    validateId(state.selectedTable, 'selectedTable');
  }

  if (state.lastSaveTime !== undefined) {
    validateDate(state.lastSaveTime, 'lastSaveTime');
  }

  // Validate uiState if present
  if (state.uiState !== undefined && typeof state.uiState !== 'object') {
    throw new ValidationError('uiState must be an object');
  }
};

// ============================================================================
// Input Sanitization
// ============================================================================

export const sanitizeString = (value: string): string => {
  return value.trim().replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return entities[char] || char;
  });
};

export const sanitizeId = (value: string): string => {
  return sanitizeString(value).replace(/[^a-zA-Z0-9_-]/g, ''); // Keep only safe characters
};