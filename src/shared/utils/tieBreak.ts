/**
 * BellePoule Modern - Égalité tranchée par un vainqueur désigné (V) (#1442)
 * Sabre laser (existant), armes olympiques (épée, fleuret, sabre : « minute prioritaire »)
 * et tournoi des rapières : une égalité en fin de temps se tranche par le vainqueur saisi
 * (tirage au sort avant la minute supplémentaire, ou V manuel).
 * Licensed under GPL-3.0
 */

import { Weapon } from '../types';

export function allowsVictoryTieBreak(
  weapon: Weapon | string | undefined,
  isRapieres = false
): boolean {
  return (
    isRapieres ||
    weapon === Weapon.LASER ||
    weapon === Weapon.EPEE ||
    weapon === Weapon.FOIL ||
    weapon === Weapon.SABRE
  );
}
