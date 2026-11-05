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

/** Saisie rapide d'un score à égalité : « V4-4 », « 4-V4 », « 4 - 4 » (#1442) */
export interface VictoryScoreInput {
  /** Score de gauche (affiché) et de droite */
  left: number;
  right: number;
  victoryLeft: boolean;
  victoryRight: boolean;
}

export function parseVictoryScoreInput(text: string): VictoryScoreInput | null {
  const m = /^\s*(V?)\s*(\d{1,2})\s*[-–:/]\s*(V?)\s*(\d{1,2})\s*$/i.exec(text);
  if (!m) return null;
  const victoryLeft = m[1] !== '';
  const victoryRight = m[3] !== '';
  // Un seul V possible : deux V ou aucun V avec score inégal n'ont pas de sens ici
  if (victoryLeft && victoryRight) return null;
  return {
    left: Number(m[2]),
    right: Number(m[4]),
    victoryLeft,
    victoryRight,
  };
}
