/**
 * BellePoule Modern - Réglages par défaut d'une nouvelle épreuve (#1880, lot 0)
 * Source unique pour la modale de création et la couche domaine (MCP, --headless).
 * Licensed under GPL-3.0
 */

import {
  Category,
  CompetitionSettings,
  CompetitionSpecialMode,
  CustomFormulaConfig,
  Weapon,
} from '../types';
import { deriveSettingsFromFormula } from './customFormulaSettings';
import { getDefaultMaxScores, isOlympicWeapon } from './defaultMaxScores';

export interface DefaultCompetitionSettingsInput {
  weapon: Weapon;
  category: Category;
  isTeamEvent?: boolean;
  teamSize?: number;
  teamReserveCount?: number;
  /** Sabre Laser équipe uniquement */
  laserTeamMode?: 'touches' | 'points';
  /** Sabre Laser équipe uniquement : relais FIE ou format arène */
  teamFormat?: 'fie-relay' | 'laser-arena';
  /** Arme CUSTOM uniquement */
  customFormula?: CustomFormulaConfig;
  /** Arme CUSTOM uniquement : tournoi des rapières */
  specialMode?: CompetitionSpecialMode;
}

const BASE = {
  defaultPoolTimerSeconds: 180,
  defaultTableTimerSeconds: 180,
  poolRounds: 1,
  hasDirectElimination: true,
  manualRanking: false,
  defaultRanking: 9999,
  randomScore: false,
} as const;

/**
 * Réglages appliqués à la création d'une épreuve.
 * `undefined` : aucun réglage imposé (Sabre Laser individuel), valeurs de la base.
 */
export function buildDefaultCompetitionSettings(
  input: DefaultCompetitionSettingsInput
): CompetitionSettings | undefined {
  const { weapon, category, isTeamEvent = false, customFormula, specialMode } = input;
  const teamSettings = {
    minTeamSize: input.teamSize ?? 3,
    teamReserveCount: input.teamReserveCount ?? 1,
    ...(weapon === Weapon.LASER
      ? {
          laserTeamMode: input.laserTeamMode ?? 'touches',
          teamFormat: input.teamFormat ?? 'fie-relay',
        }
      : {}),
  };

  if (weapon === Weapon.CUSTOM) {
    return {
      ...BASE,
      defaultPoolMaxScore: 5,
      defaultTableMaxScore: 15,
      thirdPlaceMatch: true,
      ...(customFormula ? { customFormula } : {}),
      ...teamSettings,
      // Réglages issus de la formule personnalisée (#1125)
      ...(customFormula ? deriveSettingsFromFormula(customFormula) : {}),
      ...(specialMode ? { specialMode } : {}),
    };
  }

  if (isTeamEvent) {
    return {
      ...BASE,
      defaultPoolMaxScore: 5,
      defaultTableMaxScore: 15,
      thirdPlaceMatch: false,
      ...teamSettings,
    };
  }

  if (isOlympicWeapon(weapon)) {
    // Scores par défaut selon la catégorie (#1826)
    const scores = getDefaultMaxScores(weapon, category);
    return {
      ...BASE,
      defaultPoolMaxScore: scores.pool,
      defaultTableMaxScore: scores.table,
      thirdPlaceMatch: false,
      minTeamSize: 3,
    };
  }

  return undefined;
}
