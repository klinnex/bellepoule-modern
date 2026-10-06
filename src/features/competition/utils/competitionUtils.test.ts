/**
 * Tests unitaires - competitionUtils
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import {
  validateCompetition,
  generateCompetitionId,
  formatCompetitionDate,
  generateCompetitionTitle,
} from './competitionUtils';
import { CreateCompetitionDTO } from '../types/competition.types';

const base = (): CreateCompetitionDTO =>
  ({
    title: 'Open de Paris',
    date: new Date('2026-05-01'),
    weapon: 'E',
    gender: 'M',
    category: 'SENIOR',
  }) as unknown as CreateCompetitionDTO;

describe('validateCompetition', () => {
  it('retourne null pour des données valides', () => {
    expect(validateCompetition(base())).toBeNull();
  });

  it('exige un titre non vide', () => {
    expect(validateCompetition({ ...base(), title: '   ' } as any)).toBe(
      'Le titre est obligatoire'
    );
  });

  it('exige date, arme, genre, catégorie', () => {
    expect(validateCompetition({ ...base(), date: undefined } as any)).toMatch(/date/i);
    expect(validateCompetition({ ...base(), weapon: undefined } as any)).toMatch(/arme/i);
    expect(validateCompetition({ ...base(), gender: undefined } as any)).toMatch(/genre/i);
    expect(validateCompetition({ ...base(), category: undefined } as any)).toMatch(/cat/i);
  });
});

describe('generateCompetitionId', () => {
  it('génère des UUID distincts', () => {
    const a = generateCompetitionId();
    const b = generateCompetitionId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

describe('formatCompetitionDate', () => {
  it('formate en français lisible', () => {
    const out = formatCompetitionDate(new Date('2026-05-01'));
    expect(out).toContain('2026');
    expect(out).toContain('mai');
  });
});

describe('generateCompetitionTitle', () => {
  it('assemble arme/genre/catégorie/date', () => {
    const out = generateCompetitionTitle('Épée', 'Hommes', 'Senior', new Date('2026-05-01'));
    expect(out).toBe('Épée Hommes Senior - 01/05/2026');
  });
});
