/**
 * Tests unitaires — validation.ts (BellePoule Modern)
 */

import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  validateId,
  validateRequiredString,
  validateOptionalString,
  validateNumber,
  validateOptionalNumber,
  validateDate,
  validateOptionalDate,
  validateEnum,
  validateOptionalEnum,
  validateArray,
  validateCompetitionData,
  validateCompetitionSettings,
  validateFencerData,
  validateMatchData,
  validatePoolData,
  validateSessionState,
  sanitizeString,
  sanitizeId,
} from './validation';
import { Weapon, Gender, Category, FencerStatus, MatchStatus } from '../shared/types';

// ─── ValidationError ────────────────────────────────────────────────────────

describe('ValidationError', () => {
  it('est une instance de Error', () => {
    const err = new ValidationError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ValidationError');
    expect(err.message).toBe('test');
  });

  it('expose le champ optionnel', () => {
    const err = new ValidationError('bad', 'myField');
    expect(err.field).toBe('myField');
  });

  it('fonctionne sans champ', () => {
    const err = new ValidationError('oops');
    expect(err.field).toBeUndefined();
  });
});

// ─── validateId ─────────────────────────────────────────────────────────────

describe('validateId', () => {
  it('accepte un ID valide', () => {
    expect(() => validateId('abc-123')).not.toThrow();
  });

  it('rejette une chaîne vide', () => {
    expect(() => validateId('')).toThrow(ValidationError);
  });

  it('rejette une chaîne blanche', () => {
    expect(() => validateId('   ')).toThrow(ValidationError);
  });

  it('rejette un ID > 255 caractères', () => {
    expect(() => validateId('a'.repeat(256))).toThrow(ValidationError);
  });

  it('accepte exactement 255 caractères', () => {
    expect(() => validateId('a'.repeat(255))).not.toThrow();
  });

  it('utilise le nom de champ par défaut "ID"', () => {
    expect(() => validateId('')).toThrow('ID');
  });

  it('inclut le fieldName fourni dans le message', () => {
    expect(() => validateId('', 'competitionId')).toThrow('competitionId');
  });
});

// ─── validateRequiredString ──────────────────────────────────────────────────

describe('validateRequiredString', () => {
  it('accepte une chaîne valide', () => {
    expect(() => validateRequiredString('hello', 'name')).not.toThrow();
  });

  it('rejette une chaîne vide', () => {
    expect(() => validateRequiredString('', 'name')).toThrow(ValidationError);
  });

  it('rejette une chaîne uniquement blanche', () => {
    expect(() => validateRequiredString('  ', 'name')).toThrow(ValidationError);
  });

  it('rejette une chaîne dépassant maxLength', () => {
    expect(() => validateRequiredString('a'.repeat(101), 'name', 100)).toThrow(ValidationError);
  });

  it('accepte une chaîne égale à maxLength', () => {
    expect(() => validateRequiredString('a'.repeat(100), 'name', 100)).not.toThrow();
  });

  it('utilise maxLength=255 par défaut', () => {
    expect(() => validateRequiredString('a'.repeat(256), 'name')).toThrow();
    expect(() => validateRequiredString('a'.repeat(255), 'name')).not.toThrow();
  });
});

// ─── validateOptionalString ──────────────────────────────────────────────────

describe('validateOptionalString', () => {
  it('accepte undefined', () => {
    expect(() => validateOptionalString(undefined, 'field')).not.toThrow();
  });

  it('accepte une chaîne valide', () => {
    expect(() => validateOptionalString('ok', 'field')).not.toThrow();
  });

  it('rejette une chaîne trop longue', () => {
    expect(() => validateOptionalString('a'.repeat(300), 'field', 100)).toThrow(ValidationError);
  });

  it('accepte null (traité comme undefined)', () => {
    expect(() => validateOptionalString(null as any, 'field')).not.toThrow();
  });
});

// ─── validateNumber ──────────────────────────────────────────────────────────

describe('validateNumber', () => {
  it('accepte un nombre dans la plage', () => {
    expect(() => validateNumber(5, 'score', 0, 10)).not.toThrow();
  });

  it('rejette NaN', () => {
    expect(() => validateNumber(NaN, 'score')).toThrow(ValidationError);
  });

  it('rejette un nombre inférieur au min', () => {
    expect(() => validateNumber(-1, 'score', 0)).toThrow(ValidationError);
  });

  it('rejette un nombre supérieur au max', () => {
    expect(() => validateNumber(51, 'score', 0, 50)).toThrow(ValidationError);
  });

  it('accepte la valeur min', () => {
    expect(() => validateNumber(0, 'score', 0)).not.toThrow();
  });

  it('accepte la valeur max', () => {
    expect(() => validateNumber(50, 'score', 0, 50)).not.toThrow();
  });

  it('fonctionne sans max', () => {
    expect(() => validateNumber(9999, 'bigNumber', 0)).not.toThrow();
  });
});

// ─── validateOptionalNumber ──────────────────────────────────────────────────

describe('validateOptionalNumber', () => {
  it('accepte undefined', () => {
    expect(() => validateOptionalNumber(undefined, 'field')).not.toThrow();
  });

  it('accepte null (traité comme undefined)', () => {
    expect(() => validateOptionalNumber(null as any, 'field')).not.toThrow();
  });

  it('valide si présent', () => {
    expect(() => validateOptionalNumber(-5, 'field', 0)).toThrow(ValidationError);
  });
});

// ─── validateDate ────────────────────────────────────────────────────────────

describe('validateDate', () => {
  it('accepte une Date valide', () => {
    expect(() => validateDate(new Date(), 'date')).not.toThrow();
  });

  it('rejette une Date invalide', () => {
    expect(() => validateDate(new Date('invalid'), 'date')).toThrow(ValidationError);
  });

  it('rejette une chaîne', () => {
    expect(() => validateDate('2026-01-01' as any, 'date')).toThrow(ValidationError);
  });
});

// ─── validateOptionalDate ────────────────────────────────────────────────────

describe('validateOptionalDate', () => {
  it('accepte undefined', () => {
    expect(() => validateOptionalDate(undefined, 'date')).not.toThrow();
  });

  it('valide si présent', () => {
    expect(() => validateOptionalDate(new Date('invalid'), 'date')).toThrow(ValidationError);
  });
});

// ─── validateEnum ────────────────────────────────────────────────────────────

describe('validateEnum', () => {
  const values = ['A', 'B', 'C'];

  it('accepte une valeur valide', () => {
    expect(() => validateEnum('A', 'field', values)).not.toThrow();
  });

  it('rejette une valeur hors de la liste', () => {
    expect(() => validateEnum('D', 'field', values)).toThrow(ValidationError);
  });

  it('inclut les valeurs valides dans le message', () => {
    expect(() => validateEnum('X', 'field', values)).toThrow('A, B, C');
  });
});

// ─── validateOptionalEnum ────────────────────────────────────────────────────

describe('validateOptionalEnum', () => {
  it('accepte undefined', () => {
    expect(() => validateOptionalEnum(undefined, 'field', ['A', 'B'])).not.toThrow();
  });

  it('valide si présent', () => {
    expect(() => validateOptionalEnum('Z', 'field', ['A', 'B'])).toThrow(ValidationError);
  });
});

// ─── validateArray ───────────────────────────────────────────────────────────

describe('validateArray', () => {
  it('accepte un tableau valide', () => {
    expect(() => validateArray([1, 2, 3], 'items')).not.toThrow();
  });

  it('accepte un tableau vide', () => {
    expect(() => validateArray([], 'items')).not.toThrow();
  });

  it('rejette un non-tableau', () => {
    expect(() => validateArray('not-array' as any, 'items')).toThrow(ValidationError);
  });

  it('rejette un tableau dépassant maxLength', () => {
    expect(() => validateArray([1, 2, 3], 'items', 2)).toThrow(ValidationError);
  });

  it('accepte un tableau égal à maxLength', () => {
    expect(() => validateArray([1, 2], 'items', 2)).not.toThrow();
  });
});

// ─── validateCompetitionSettings ────────────────────────────────────────────

describe('validateCompetitionSettings', () => {
  const validSettings = {
    defaultPoolMaxScore: 5,
    defaultTableMaxScore: 15,
    poolRounds: 1,
    defaultRanking: 0,
    minTeamSize: 3,
  } as any;

  it('accepte des settings valides', () => {
    expect(() => validateCompetitionSettings(validSettings)).not.toThrow();
  });

  it('rejette un defaultPoolMaxScore > 15', () => {
    expect(() =>
      validateCompetitionSettings({ ...validSettings, defaultPoolMaxScore: 16 })
    ).toThrow(ValidationError);
  });

  it('rejette un poolRounds hors plage', () => {
    expect(() => validateCompetitionSettings({ ...validSettings, poolRounds: 6 })).toThrow(
      ValidationError
    );
  });

  it('rejette un minTeamSize < 1', () => {
    expect(() => validateCompetitionSettings({ ...validSettings, minTeamSize: 0 })).toThrow(
      ValidationError
    );
  });
});

// ─── validateCompetitionData ─────────────────────────────────────────────────

describe('validateCompetitionData', () => {
  const valid = {
    title: 'Championnat de France',
    date: new Date('2026-06-15'),
    weapon: Weapon.EPEE,
    gender: Gender.MALE,
    category: Category.SENIOR,
  } as any;

  it('accepte des données valides', () => {
    expect(() => validateCompetitionData(valid)).not.toThrow();
  });

  it('rejette un titre vide', () => {
    expect(() => validateCompetitionData({ ...valid, title: '' })).toThrow(ValidationError);
  });

  it('rejette une date invalide', () => {
    expect(() => validateCompetitionData({ ...valid, date: new Date('invalid') })).toThrow(
      ValidationError
    );
  });

  it('rejette une arme inconnue', () => {
    expect(() => validateCompetitionData({ ...valid, weapon: 'X' })).toThrow(ValidationError);
  });

  it('rejette une URL invalide', () => {
    expect(() => validateCompetitionData({ ...valid, organizerUrl: 'not-a-url' })).toThrow(
      ValidationError
    );
  });

  it('accepte une URL valide', () => {
    expect(() =>
      validateCompetitionData({ ...valid, organizerUrl: 'https://example.com' })
    ).not.toThrow();
  });

  it('rejette une couleur invalide', () => {
    expect(() => validateCompetitionData({ ...valid, color: 'rouge' })).toThrow(ValidationError);
  });

  it('accepte une couleur hex valide', () => {
    expect(() => validateCompetitionData({ ...valid, color: '#FF3B82' })).not.toThrow();
  });
});

// ─── validateFencerData ──────────────────────────────────────────────────────

describe('validateFencerData', () => {
  const valid = {
    ref: 42,
    lastName: 'Dupont',
    firstName: 'Jean',
    gender: Gender.MALE,
    status: FencerStatus.QUALIFIED,
    nationality: 'FRA',
  } as any;

  it('accepte des données valides', () => {
    expect(() => validateFencerData(valid)).not.toThrow();
  });

  it('rejette un ref à 0', () => {
    expect(() => validateFencerData({ ...valid, ref: 0 })).toThrow(ValidationError);
  });

  it('rejette un lastName vide', () => {
    expect(() => validateFencerData({ ...valid, lastName: '' })).toThrow(ValidationError);
  });

  it('rejette une nationalité invalide', () => {
    expect(() => validateFencerData({ ...valid, nationality: '12' })).toThrow(ValidationError);
  });

  it('accepte une nationalité 2 lettres', () => {
    expect(() => validateFencerData({ ...valid, nationality: 'FR' })).not.toThrow();
  });

  it('rejette une date de naissance dans le futur', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(() => validateFencerData({ ...valid, birthDate: future })).toThrow(ValidationError);
  });
});

// ─── validateMatchData ───────────────────────────────────────────────────────

describe('validateMatchData', () => {
  const now = new Date();
  const later = new Date(now.getTime() + 3600_000);

  const valid = {
    number: 1,
    status: MatchStatus.NOT_STARTED,
    maxScore: 15,
  } as any;

  it('accepte des données valides', () => {
    expect(() => validateMatchData(valid)).not.toThrow();
  });

  it('rejette un maxScore de 0', () => {
    expect(() => validateMatchData({ ...valid, maxScore: 0 })).toThrow(ValidationError);
  });

  it('rejette endTime <= startTime', () => {
    expect(() => validateMatchData({ ...valid, startTime: later, endTime: now })).toThrow(
      ValidationError
    );
  });

  it('accepte startTime < endTime', () => {
    expect(() => validateMatchData({ ...valid, startTime: now, endTime: later })).not.toThrow();
  });

  it('rejette un statut inconnu', () => {
    expect(() => validateMatchData({ ...valid, status: 'UNKNOWN' })).toThrow(ValidationError);
  });
});

// ─── validatePoolData ────────────────────────────────────────────────────────

describe('validatePoolData', () => {
  const valid = {
    number: 1,
    phaseId: 'phase-uuid-123',
  } as any;

  it('accepte des données valides', () => {
    expect(() => validatePoolData(valid)).not.toThrow();
  });

  it('rejette un numéro de poule à 0', () => {
    expect(() => validatePoolData({ ...valid, number: 0 })).toThrow(ValidationError);
  });

  it('rejette un phaseId vide', () => {
    expect(() => validatePoolData({ ...valid, phaseId: '' })).toThrow(ValidationError);
  });

  it('rejette un tableau de tireurs > 20', () => {
    const fencers = Array.from({ length: 21 }, (_, i) => ({ id: `f${i}` }));
    expect(() => validatePoolData({ ...valid, fencers })).toThrow(ValidationError);
  });

  it('rejette un tireur sans id dans le tableau', () => {
    expect(() => validatePoolData({ ...valid, fencers: [{}] })).toThrow(ValidationError);
  });
});

// ─── validateSessionState ────────────────────────────────────────────────────

describe('validateSessionState', () => {
  it('accepte un objet valide vide', () => {
    expect(() => validateSessionState({})).not.toThrow();
  });

  it('rejette null', () => {
    expect(() => validateSessionState(null)).toThrow(ValidationError);
  });

  it('rejette une chaîne', () => {
    expect(() => validateSessionState('bad')).toThrow(ValidationError);
  });

  it('valide currentPhase si présent', () => {
    expect(() => validateSessionState({ currentPhase: -1 })).toThrow(ValidationError);
    expect(() => validateSessionState({ currentPhase: 0 })).not.toThrow();
  });

  it('rejette uiState non-objet', () => {
    expect(() => validateSessionState({ uiState: 'bad' })).toThrow(ValidationError);
  });
});

// ─── sanitizeString / sanitizeId ────────────────────────────────────────────

describe('sanitizeString', () => {
  it('supprime les espaces en début et fin', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('supprime les balises < et >', () => {
    expect(sanitizeString('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
  });

  it('conserve les caractères normaux', () => {
    expect(sanitizeString('Dupont-Jean')).toBe('Dupont-Jean');
  });
});

describe('sanitizeId', () => {
  it('conserve lettres, chiffres, tirets et underscores', () => {
    expect(sanitizeId('abc-123_XYZ')).toBe('abc-123_XYZ');
  });

  it('supprime les caractères spéciaux', () => {
    expect(sanitizeId('id<>!@#$%')).toBe('id');
  });

  it('trim avant de filtrer', () => {
    expect(sanitizeId('  id-1  ')).toBe('id-1');
  });
});
