/**
 * BellePoule Modern - Mode Club (#1872) : fichiers de partage entre utilisateurs.
 * Exercices de la bibliothèque et plans de séance, en JSON versionné et validé à l'import.
 * Licensed under GPL-3.0
 */
import type { ClubExercise, ClubExerciseInput, ClubSession, ClubSessionInput } from '../types/club';
import { oneWeaponCode } from './clubWeapon';
import { cleanLongText, normalizeExerciseInput, normalizePlan } from './clubPlan';

export const EXERCISES_FORMAT = 'bellepoule-club-exercises';
export const PLAN_FORMAT = 'bellepoule-club-plan';
export const SHARE_VERSION = 1;
export const SHARE_EXTENSION = 'json';

/** Fichier illisible, d'un autre type, ou vide */
export class ClubShareError extends Error {
  constructor(public readonly code: 'invalid_json' | 'wrong_format' | 'empty') {
    super(code);
  }
}

function parse(text: string, format: string): Record<string, unknown> {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new ClubShareError('invalid_json');
  }
  if (!data || typeof data !== 'object' || (data as Record<string, unknown>).format !== format) {
    throw new ClubShareError('wrong_format');
  }
  return data as Record<string, unknown>;
}

export function buildExercisesFile(list: readonly ClubExercise[]): string {
  return JSON.stringify(
    {
      format: EXERCISES_FORMAT,
      version: SHARE_VERSION,
      exportedAt: new Date().toISOString(),
      exercises: list.map(e => ({
        title: e.title,
        category: e.category,
        minutes: e.minutes,
        details: e.details,
        images: e.images,
      })),
    },
    null,
    2
  );
}

export function parseExercisesFile(text: string): ClubExerciseInput[] {
  const data = parse(text, EXERCISES_FORMAT);
  const raw = Array.isArray(data.exercises) ? data.exercises.slice(0, 1000) : [];
  const list: ClubExerciseInput[] = [];
  for (const r of raw) {
    const e = normalizeExerciseInput(r);
    if (e) list.push(e);
  }
  if (list.length === 0) throw new ClubShareError('empty');
  return list;
}

/** Plan de séance partageable : sans date, présents, bilan ni cases cochées */
export function buildPlanFile(s: ClubSession): string {
  return JSON.stringify(
    {
      format: PLAN_FORMAT,
      version: SHARE_VERSION,
      exportedAt: new Date().toISOString(),
      plan: {
        label: s.label,
        weapon: s.weapon,
        objectives: s.objectives,
        notes: s.notes,
        items: s.plan.map(({ done: _done, ...it }) => it),
      },
    },
    null,
    2
  );
}

/** Plan importé (à dater dans l'éditeur) */
export function parsePlanFile(text: string): Omit<ClubSessionInput, 'date'> {
  const data = parse(text, PLAN_FORMAT);
  const p = (data.plan ?? {}) as Record<string, unknown>;
  const items = normalizePlan(p.items).map(({ done: _done, ...it }) => it);
  const label = cleanLongText(p.label, 100);
  const objectives = cleanLongText(p.objectives);
  if (items.length === 0 && !label && !objectives) throw new ClubShareError('empty');
  return {
    label: label?.replace(/\n/g, ' '),
    weapon: oneWeaponCode(p.weapon),
    objectives,
    notes: cleanLongText(p.notes),
    plan: items,
  };
}

/** Nom de fichier proposé à l'export */
export function shareFileName(kind: 'exercises' | 'plan', label?: string): string {
  const slug = (label ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40);
  const base = kind === 'exercises' ? 'exercices-club' : 'plan-seance';
  return `${base}${slug ? `-${slug}` : ''}.${SHARE_EXTENSION}`;
}
