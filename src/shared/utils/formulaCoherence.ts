/**
 * BellePoule Modern - Relevé de cohérence formule ↔ catégorie (#2013, étape A)
 * Compare les réglages de chaque phase au référentiel arme + catégorie.
 * Simple relevé : n'empêche jamais d'enregistrer.
 * Référentiel limité aux touches des armes olympiques (defaultMaxScores, #1826) ;
 * pas de relevé sans référentiel (laser, « À la carte »).
 * Licensed under GPL-3.0
 */

import { Category, Weapon } from '../types';
import { getDefaultMaxScores, isOlympicWeapon } from './defaultMaxScores';

/** Phase et réglage concernés par l'écart */
export type CoherenceField = 'poolMaxScore' | 'tableMaxScore';

export interface CoherenceIssue {
  /** Phase de la frise : tours de poules ou tableau */
  phase: 'pools' | 'tableau';
  field: CoherenceField;
  /** Valeur saisie */
  actual: number;
  /** Valeur attendue par le référentiel */
  expected: number;
}

export interface CoherenceInput {
  poolMaxScore: number;
  tableMaxScore: number;
  /** Aucun tour de poules : pas de relevé sur les poules */
  hasPools: boolean;
  hasDirectElimination: boolean;
}

/** Le relevé existe-t-il pour cette arme ? */
export function hasCoherenceReference(weapon: Weapon | string | undefined): boolean {
  return isOlympicWeapon(weapon);
}

/** Écarts entre les réglages et le référentiel de la catégorie (liste vide = conforme) */
export function getCoherenceIssues(
  weapon: Weapon | string | undefined,
  category: Category | string | undefined,
  input: CoherenceInput
): CoherenceIssue[] {
  if (!hasCoherenceReference(weapon)) return [];
  const expected = getDefaultMaxScores(weapon, category);
  const issues: CoherenceIssue[] = [];
  if (input.hasPools && input.poolMaxScore !== expected.pool) {
    issues.push({
      phase: 'pools',
      field: 'poolMaxScore',
      actual: input.poolMaxScore,
      expected: expected.pool,
    });
  }
  if (input.hasDirectElimination && input.tableMaxScore !== expected.table) {
    issues.push({
      phase: 'tableau',
      field: 'tableMaxScore',
      actual: input.tableMaxScore,
      expected: expected.table,
    });
  }
  return issues;
}
