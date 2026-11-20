/**
 * BellePoule Modern - Scores max par défaut selon arme et catégorie (#1826)
 * Escrime olympique (épée, fleuret, sabre) : 5 touches en poule, 15 au tableau,
 * sauf M9 (3/6), M11-M13 (4/8) et vétérans (5/10).
 * Licensed under GPL-3.0
 */

import { Category, Weapon } from '../types';

export interface DefaultMaxScores {
  pool: number;
  table: number;
}

const OLYMPIC_WEAPONS: ReadonlySet<string> = new Set([Weapon.EPEE, Weapon.FOIL, Weapon.SABRE]);

/** Armes olympiques : épée, fleuret, sabre */
export function isOlympicWeapon(weapon: Weapon | string | undefined): boolean {
  return !!weapon && OLYMPIC_WEAPONS.has(weapon);
}

/**
 * Scores max par défaut. Hors armes olympiques : ancien comportement
 * (21 en poule, tableau sans limite = 0).
 */
export function getDefaultMaxScores(
  weapon: Weapon | string | undefined,
  category: Category | string | undefined
): DefaultMaxScores {
  if (!isOlympicWeapon(weapon)) return { pool: 21, table: 0 };
  switch (category) {
    case Category.U9:
      return { pool: 3, table: 6 };
    case Category.U11:
    case Category.U13:
      return { pool: 4, table: 8 };
    case Category.V1:
    case Category.V2:
    case Category.V3:
    case Category.V4:
      return { pool: 5, table: 10 };
    default:
      return { pool: 5, table: 15 };
  }
}
