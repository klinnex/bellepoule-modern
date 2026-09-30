/**
 * BellePoule Modern - Libellé traduit d'une catégorie (#931)
 * Licensed under GPL-3.0
 */

const CATEGORY_KEYS: Record<string, string> = {
  U11: 'U11', U13: 'U13', U15: 'U15', U17: 'U17', U20: 'U20',
  SEN: 'senior', SENIOR: 'senior',
  V1: 'V1', V2: 'V2', V3: 'V3', V4: 'V4',
};

/** Code catégorie (U11, SEN, V1…) → libellé officiel traduit (M11, Seniors, Vétérans 1…) */
export function categoryLabel(category: string | undefined | null, t: (key: string) => string): string {
  if (!category) return '';
  const key = CATEGORY_KEYS[category];
  return key ? t(`categories.${key}`) : category;
}
