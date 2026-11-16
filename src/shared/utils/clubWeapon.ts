/**
 * BellePoule Modern - Mode Club (#1872) : arme valide (fleuret, épée, sabre, sabre laser).
 * Licensed under GPL-3.0
 */
import { Weapon } from '../types';

const CODES = new Set<string>([Weapon.FOIL, Weapon.EPEE, Weapon.SABRE, Weapon.LASER]);

export const oneWeaponCode = (v: unknown): Weapon | undefined =>
  typeof v === 'string' && CODES.has(v.toUpperCase()) ? (v.toUpperCase() as Weapon) : undefined;
