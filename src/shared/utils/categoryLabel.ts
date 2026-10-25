/**
 * BellePoule Modern - Libellé traduit d'une catégorie (#931)
 * Licensed under GPL-3.0
 */

const CATEGORY_KEYS: Record<string, string> = {
  U9: 'U9',
  U11: 'U11',
  U13: 'U13',
  U15: 'U15',
  U17: 'U17',
  U20: 'U20',
  SEN: 'senior',
  SENIOR: 'senior',
  V1: 'V1',
  V2: 'V2',
  V3: 'V3',
  V4: 'V4',
};

/** Code catégorie (U11, SEN, V1…) → libellé officiel traduit (M11, Seniors, Vétérans 1…) */
export function categoryLabel(
  category: string | undefined | null,
  t: (key: string) => string
): string {
  if (!category) return '';
  const key = CATEGORY_KEYS[category];
  return key ? t(`categories.${key}`) : category;
}

const WEAPON_KEYS: Record<string, string> = {
  E: 'epee',
  F: 'foil',
  S: 'sabre',
  L: 'laser',
  C: 'custom',
};

const GENDER_KEYS: Record<string, string> = {
  M: 'male',
  F: 'female',
  X: 'mixed',
};

/** Code arme (E, F, S, L, C) → libellé traduit (Épée, Sabre Laser…) */
export function weaponLabel(weapon: string | undefined | null, t: (key: string) => string): string {
  if (!weapon) return '';
  const key = WEAPON_KEYS[weapon];
  return key ? t(`weapons.${key}`) : weapon;
}

/** Code genre (M, F, X) → libellé traduit (Masculin, Féminin, Mixte) */
export function genderLabel(gender: string | undefined | null, t: (key: string) => string): string {
  if (!gender) return '';
  const key = GENDER_KEYS[gender];
  return key ? t(`genders.${key}`) : gender;
}
