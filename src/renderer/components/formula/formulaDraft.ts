/**
 * BellePoule Modern - Brouillon de formule de la fenêtre de propriétés (#2013, étape A)
 * Réglages de structure et de match regroupés par phase : tours de poules, Tour Quest, tableau.
 * Lecture depuis les réglages enregistrés (repli unifié) et réécriture en réglages plats,
 * lus par le moteur.
 * Licensed under GPL-3.0
 */

import {
  Category,
  CompetitionSettings,
  PostPoolSplitCriteria,
  QuestPhaseConfig,
  Weapon,
} from '../../../shared/types';
import { getFallbackCompetitionSettings } from '../../../shared/utils/defaultCompetitionSettings';
import { getCoherenceIssues, CoherenceIssue } from '../../../shared/utils/formulaCoherence';

/** Plafond de tours de poules, aligné sur la validation base (database/validation.ts) */
export const MAX_POOL_ROUNDS = 5;
/** Au-delà : avertissement non bloquant */
export const POOL_ROUNDS_WARNING = 3;
export const DEFAULT_POOL_SIZE_MIN = 5;
export const DEFAULT_POOL_SIZE_MAX = 7;

export interface FormulaDraft {
  poolRounds: number;
  /** Qualifiés pour le tour i+2 (0 = tous) */
  poolRoundQualifiers: number[];
  hasDirectElimination: boolean;
  poolMaxScore: number;
  tableMaxScore: number;
  poolTimerSeconds: number;
  tableTimerSeconds: number;
  restTimeSeconds: number;
  thirdPlaceMatch: boolean;
  playAllPositions: boolean;
  poolWinnersOnly: boolean;
  postPoolSplitCriteria: PostPoolSplitCriteria | '';
  poolBoutOrder: 'fie' | 'free';
  poolSizeMin: number;
  poolSizeMax: number;
  questEnabled: boolean;
  questHasPools: boolean;
  questQualifiers: number;
}

/** Phase sélectionnable dans la frise */
export type FormulaPhaseId =
  { kind: 'pool'; round: number } | { kind: 'quest' } | { kind: 'tableau' };

export function draftFromSettings(
  weapon: Weapon,
  category: Category,
  settings: CompetitionSettings | undefined
): FormulaDraft {
  const fallback = getFallbackCompetitionSettings(weapon, category);
  const s = { ...fallback, ...(settings ?? {}) };
  const quest = settings?.questConfig;
  return {
    poolRounds: s.poolRounds ?? 1,
    poolRoundQualifiers: s.poolRoundQualifiers ?? [],
    hasDirectElimination: s.hasDirectElimination ?? true,
    poolMaxScore: s.defaultPoolMaxScore,
    tableMaxScore: s.defaultTableMaxScore,
    poolTimerSeconds: s.defaultPoolTimerSeconds,
    tableTimerSeconds: s.defaultTableTimerSeconds,
    restTimeSeconds: s.restTimeSeconds ?? 60,
    thirdPlaceMatch: s.thirdPlaceMatch ?? false,
    playAllPositions: s.playAllPositions ?? false,
    poolWinnersOnly: s.poolWinnersOnly ?? false,
    postPoolSplitCriteria: s.postPoolSplitCriteria ?? '',
    poolBoutOrder: s.poolBoutOrder ?? 'fie',
    poolSizeMin: s.poolSizeMin ?? DEFAULT_POOL_SIZE_MIN,
    poolSizeMax: s.poolSizeMax ?? DEFAULT_POOL_SIZE_MAX,
    questEnabled: quest?.enabled ?? false,
    questHasPools: quest?.hasPreliminaryPools ?? false,
    questQualifiers: quest?.qualifiersCount ?? 8,
  };
}

/** Nombre de tours de poules effectivement joués (Tour Quest : 0 ou 1) */
export function effectivePoolRounds(d: FormulaDraft, weapon: Weapon): number {
  if (weapon === Weapon.LASER && d.questEnabled) return d.questHasPools ? 1 : 0;
  return d.poolRounds;
}

export function canAddPoolRound(d: FormulaDraft, weapon: Weapon): boolean {
  if (weapon === Weapon.LASER && d.questEnabled) return !d.questHasPools;
  return d.poolRounds < MAX_POOL_ROUNDS;
}

/** Ajoute un tour de poules en fin de suite de poules */
export function addPoolRound(d: FormulaDraft, weapon: Weapon): Partial<FormulaDraft> {
  if (!canAddPoolRound(d, weapon)) return {};
  if (weapon === Weapon.LASER && d.questEnabled) return { questHasPools: true, poolRounds: 1 };
  return { poolRounds: d.poolRounds + 1 };
}

export function canRemovePoolRound(d: FormulaDraft, weapon: Weapon): boolean {
  if (weapon === Weapon.LASER && d.questEnabled) return d.questHasPools;
  return d.poolRounds > 1;
}

/** Retire le tour `round` (0 = 1er tour) ; les qualifiés des tours suivants remontent */
export function removePoolRound(
  d: FormulaDraft,
  weapon: Weapon,
  round: number
): Partial<FormulaDraft> {
  if (!canRemovePoolRound(d, weapon)) return {};
  if (weapon === Weapon.LASER && d.questEnabled) return { questHasPools: false, poolRounds: 0 };
  const q = [...d.poolRoundQualifiers];
  // Qualifiés pour le tour retiré (index round-1) supprimés ; 1er tour : qualifiés vers le tour 2
  q.splice(Math.max(0, round - 1), 1);
  return { poolRounds: d.poolRounds - 1, poolRoundQualifiers: q };
}

/** Active / retire le Tour Quest (Sabre Laser) */
export function setQuest(d: FormulaDraft, enabled: boolean): Partial<FormulaDraft> {
  if (enabled) return { questEnabled: true, poolRounds: d.questHasPools ? 1 : 0 };
  return { questEnabled: false, poolRounds: Math.max(1, d.poolRounds) };
}

export function draftCoherenceIssues(
  d: FormulaDraft,
  weapon: Weapon,
  category: Category
): CoherenceIssue[] {
  return getCoherenceIssues(weapon, category, {
    poolMaxScore: d.poolMaxScore,
    tableMaxScore: d.tableMaxScore,
    hasPools: effectivePoolRounds(d, weapon) > 0,
    hasDirectElimination: d.hasDirectElimination,
  });
}

/** Valeurs attendues pour corriger les écarts */
export function applyCoherence(issues: CoherenceIssue[]): Partial<FormulaDraft> {
  const patch: Partial<FormulaDraft> = {};
  for (const issue of issues) patch[issue.field] = issue.expected;
  return patch;
}

/** Réglages plats lus par le moteur (hors arme « À la carte », dont la formule prime) */
export function draftToSettings(
  d: FormulaDraft,
  weapon: Weapon,
  existingQuest: QuestPhaseConfig | undefined
): Partial<CompetitionSettings> {
  const poolRounds = effectivePoolRounds(d, weapon);
  const questConfig: QuestPhaseConfig | undefined =
    weapon === Weapon.LASER && d.questEnabled
      ? {
          enabled: true,
          hasPreliminaryPools: d.questHasPools,
          qualifiersCount: d.questHasPools ? d.questQualifiers : undefined,
          opponentConstraint: existingQuest?.opponentConstraint ?? 'none',
          availableTimeMinutes: existingQuest?.availableTimeMinutes,
          numberOfArenas: existingQuest?.numberOfArenas,
          fightsPerFencer: existingQuest?.fightsPerFencer,
        }
      : weapon === Weapon.LASER
        ? { enabled: false, hasPreliminaryPools: false, opponentConstraint: 'none' }
        : undefined;
  return {
    poolRounds,
    poolRoundQualifiers: Array.from(
      { length: Math.max(0, poolRounds - 1) },
      (_, i) => d.poolRoundQualifiers[i] ?? 0
    ),
    hasDirectElimination: d.hasDirectElimination,
    thirdPlaceMatch: d.thirdPlaceMatch,
    playAllPositions: d.playAllPositions,
    poolBoutOrder: d.poolBoutOrder,
    defaultPoolMaxScore: d.poolMaxScore,
    defaultTableMaxScore: d.tableMaxScore,
    defaultPoolTimerSeconds: d.poolTimerSeconds,
    defaultTableTimerSeconds: d.tableTimerSeconds,
    restTimeSeconds: d.restTimeSeconds,
    poolSizeMin: d.poolSizeMin,
    poolSizeMax: d.poolSizeMax,
    poolWinnersOnly: d.poolWinnersOnly,
    postPoolSplitCriteria: d.postPoolSplitCriteria || undefined,
    questConfig,
  };
}
