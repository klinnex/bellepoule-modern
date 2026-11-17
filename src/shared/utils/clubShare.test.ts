import { describe, it, expect } from 'vitest';
import type { ClubExercise, ClubSession } from '../types/club';
import {
  ClubShareError,
  buildExercisesFile,
  buildPlanFile,
  parseExercisesFile,
  parsePlanFile,
  shareFileName,
} from './clubShare';
import { normalizePlan } from './clubPlan';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const ex = (title: string, extra: Partial<ClubExercise> = {}): ClubExercise => ({
  id: title,
  title,
  category: 'warmup',
  minutes: 10,
  images: [],
  ageCategories: [],
  createdAt: '',
  updatedAt: '',
  ...extra,
});

describe('partage Mode Club (#1872)', () => {
  it('exercices : aller-retour, images conservées, entrées invalides ignorées', () => {
    const text = buildExercisesFile([
      ex('Footing', { details: 'Lent', images: [PNG] }),
      ex('Fentes', { category: 'physical' }),
    ]);
    expect(parseExercisesFile(text)).toEqual([
      {
        title: 'Footing',
        category: 'warmup',
        minutes: 10,
        details: 'Lent',
        images: [PNG],
        ageCategories: [],
      },
      {
        title: 'Fentes',
        category: 'physical',
        minutes: 10,
        details: undefined,
        images: [],
        ageCategories: [],
      },
    ]);
    const hacked = JSON.stringify({
      format: 'bellepoule-club-exercises',
      exercises: [{ title: '' }, { title: 'X', category: 'zzz', images: ['javascript:1'] }],
    });
    expect(parseExercisesFile(hacked)).toEqual([
      {
        title: 'X',
        category: 'other',
        minutes: 0,
        details: undefined,
        images: [],
        ageCategories: [],
      },
    ]);
  });

  it('erreurs : JSON invalide, mauvais format, vide', () => {
    expect(() => parseExercisesFile('{')).toThrow(ClubShareError);
    try {
      parseExercisesFile(JSON.stringify({ format: 'bellepoule-club-plan' }));
    } catch (e) {
      expect((e as ClubShareError).code).toBe('wrong_format');
    }
    try {
      parseExercisesFile(JSON.stringify({ format: 'bellepoule-club-exercises', exercises: [] }));
    } catch (e) {
      expect((e as ClubShareError).code).toBe('empty');
    }
  });

  it('plan : sans date ni cases cochées, arme et images conservées', () => {
    const session = {
      id: 's',
      clubId: 'c',
      date: '2026-11-20',
      label: 'Parades',
      weapon: 'F',
      stripCount: 2,
      status: 'closed',
      openedAt: '',
      attendeeIds: ['a'],
      coachIds: [],
      objectives: 'Quarte',
      notes: 'Rappel',
      plan: normalizePlan([
        {
          id: 'e1',
          title: 'Échauffement',
          minutes: 15,
          done: true,
          category: 'warmup',
          images: [PNG],
        },
      ]),
      feedback: { rating: 5 },
      memberFeedback: { a: 'x' },
      createdAt: '',
      updatedAt: '',
    } as ClubSession;
    const text = buildPlanFile(session);
    expect(text).not.toContain('2026-11-20');
    expect(text).not.toContain('rating');
    expect(parsePlanFile(text)).toEqual({
      label: 'Parades',
      weapon: 'F',
      objectives: 'Quarte',
      notes: 'Rappel',
      plan: [{ id: 'e1', title: 'Échauffement', minutes: 15, category: 'warmup', images: [PNG] }],
    });
    expect(() => parsePlanFile(buildExercisesFile([ex('a')]))).toThrow(ClubShareError);
  });

  it('noms de fichiers', () => {
    expect(shareFileName('plan', 'Parades & ripostes')).toBe('plan-seance-parades-ripostes.json');
    expect(shareFileName('exercises')).toBe('exercices-club.json');
  });
});
