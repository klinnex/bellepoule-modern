/**
 * BellePoule Modern - Mode Club (#1872) : arme valide (fleuret, épée, sabre, sabre laser).
 * Licensed under GPL-3.0
 */
import { Weapon } from '../types';

const CODES = new Set<string>([Weapon.FOIL, Weapon.EPEE, Weapon.SABRE, Weapon.LASER]);

export const oneWeaponCode = (v: unknown): Weapon | undefined =>
  typeof v === 'string' && CODES.has(v.toUpperCase()) ? (v.toUpperCase() as Weapon) : undefined;

/** Armes d'un exercice : E épée, F fleuret, S sabre, L sabre laser, A escrime artistique */
export const EXERCISE_WEAPONS = ['F', 'E', 'S', 'L', 'A'] as const;
export type ExerciseWeapon = (typeof EXERCISE_WEAPONS)[number];

/** Liste d'armes d'exercice valide, dans l'ordre canonique ; vide = toutes armes */
export function normalizeExerciseWeapons(v: unknown): ExerciseWeapon[] {
  if (!Array.isArray(v)) return [];
  const set = new Set(
    v
      .map(x => (typeof x === 'string' ? x.toUpperCase() : ''))
      .filter((x): x is ExerciseWeapon => (EXERCISE_WEAPONS as readonly string[]).includes(x))
  );
  return EXERCISE_WEAPONS.filter(w => set.has(w));
}
