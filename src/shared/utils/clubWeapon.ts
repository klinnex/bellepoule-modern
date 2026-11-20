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

/**
 * Arme d'un club, d'une séance ou d'un maître d'armes : une arme de compétition, ou
 * « A » = escrime artistique (pas de saisie distante ni de règles de score).
 */
export const ARTISTIC_CODE = 'A' as const;
export type ClubWeaponCode = Weapon | typeof ARTISTIC_CODE;

/** Arme de séance dont la saisie distante a des règles (pas l'escrime artistique) */
export const isRemoteScorable = (w: ClubWeaponCode | undefined | null): w is Weapon =>
  w !== undefined && w !== null && w !== ARTISTIC_CODE;

const CLUB_CODES = new Set<string>([Weapon.FOIL, Weapon.EPEE, Weapon.SABRE, Weapon.LASER, 'A']);

/** Code d'arme valide (F, E, S, L, A), casse ignorée ; autre valeur = undefined */
export const oneClubWeapon = (v: unknown): ClubWeaponCode | undefined =>
  typeof v === 'string' && CLUB_CODES.has(v.toUpperCase())
    ? (v.toUpperCase() as ClubWeaponCode)
    : undefined;

/** "F,A" → [FOIL, ARTISTIC] ; codes inconnus et doublons ignorés */
export function parseClubWeapons(raw: string | null | undefined): ClubWeaponCode[] {
  if (!raw) return [];
  const out: ClubWeaponCode[] = [];
  for (const part of raw.split(',')) {
    const w = oneClubWeapon(part.trim());
    if (w && !out.includes(w)) out.push(w);
  }
  return out;
}

export function serializeClubWeapons(weapons: readonly ClubWeaponCode[] | undefined): string {
  return parseClubWeapons((weapons ?? []).join(',')).join(',');
}
