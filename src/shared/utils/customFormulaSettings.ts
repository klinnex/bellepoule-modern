/**
 * BellePoule Modern - Réglages effectifs d'une formule personnalisée (arme CUSTOM) (#1125)
 * La formule (score max, chrono, tours, qualifiés, 3e place) prime sur les réglages par défaut.
 * Licensed under GPL-3.0
 */

import {
  AdvancementRule,
  CompetitionSettings,
  CustomDEConfig,
  CustomFormulaConfig,
  CustomPoolRoundConfig,
  FencerStatus,
  PoolRanking,
  Weapon,
} from '../types';

const poolRoundConfigs = (formula: CustomFormulaConfig): CustomPoolRoundConfig[] =>
  formula.phases.filter(p => p.type === 'pool_round').map(p => p.config as CustomPoolRoundConfig);

const deConfig = (formula: CustomFormulaConfig): CustomDEConfig | undefined =>
  formula.phases.find(p => p.type === 'direct_elimination')?.config as CustomDEConfig | undefined;

const positive = (n: unknown): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;

/** Formule personnalisée active (arme CUSTOM uniquement) */
export function getActiveFormula(
  weapon: Weapon | string | undefined,
  settings: Partial<CompetitionSettings> | undefined
): CustomFormulaConfig | undefined {
  return weapon === Weapon.CUSTOM && settings?.customFormula?.phases?.length
    ? settings.customFormula
    : undefined;
}

/** Réglages dérivés de la formule (champs absents = réglage par défaut conservé) */
export function deriveSettingsFromFormula(
  formula: CustomFormulaConfig
): Partial<CompetitionSettings> {
  const pools = poolRoundConfigs(formula);
  const de = deConfig(formula);
  const derived: Partial<CompetitionSettings> = {
    poolRounds: Math.max(1, pools.length),
    hasDirectElimination: !!de,
  };
  const pool = pools[0];
  const poolMax = positive(pool?.maxScore) ?? positive(pool?.scoring?.maxScore);
  if (poolMax) derived.defaultPoolMaxScore = poolMax;
  const poolTimer = positive(pool?.timerSeconds);
  if (poolTimer) derived.defaultPoolTimerSeconds = poolTimer;
  if (de) {
    const deMax = positive(de.maxScore) ?? positive(de.scoring?.maxScore);
    if (deMax) derived.defaultTableMaxScore = deMax;
    const deTimer = positive(de.timerSeconds);
    if (deTimer) derived.defaultTableTimerSeconds = deTimer;
    derived.thirdPlaceMatch = !!de.thirdPlaceMatch;
  }
  const last = pools[pools.length - 1];
  if (de && last) derived.poolWinnersOnly = last.advancementRule?.mode === 'pool_winner';
  if (formula.ruleSet === 'modern') {
    const rest = formula.restTimeSeconds;
    derived.restTimeSeconds =
      typeof rest === 'number' && Number.isFinite(rest) ? Math.max(0, rest) : 60;
  }
  return derived;
}

/** Règles des armes modernes en match : épée, fleuret, sabre, ou formule personnalisée qui les choisit */
export function usesModernRules(
  weapon: Weapon | string | undefined | null,
  settings: Partial<CompetitionSettings> | undefined
): boolean {
  if (weapon === Weapon.EPEE || weapon === Weapon.FOIL || weapon === Weapon.SABRE) return true;
  return getActiveFormula(weapon ?? undefined, settings)?.ruleSet === 'modern';
}

/** Réglages effectifs : formule personnalisée appliquée par-dessus les réglages enregistrés */
export function resolveCompetitionSettings<T extends Partial<CompetitionSettings>>(
  weapon: Weapon | string | undefined,
  settings: T | undefined
): T {
  const formula = getActiveFormula(weapon, settings);
  const base = (settings ?? {}) as T;
  return formula ? { ...base, ...deriveSettingsFromFormula(formula) } : base;
}

/** Règle de qualification du tour de poules `roundIndex` (0 = 1er tour) */
export function getPoolRoundAdvancement(
  formula: CustomFormulaConfig | undefined,
  roundIndex: number
): AdvancementRule | undefined {
  return formula ? poolRoundConfigs(formula)[roundIndex]?.advancementRule : undefined;
}

/** Règle de qualification du dernier tour de poules vers le tableau */
export function getTableauAdvancement(
  formula: CustomFormulaConfig | undefined
): AdvancementRule | undefined {
  if (!formula || !deConfig(formula)) return undefined;
  const pools = poolRoundConfigs(formula);
  return pools[pools.length - 1]?.advancementRule;
}

/**
 * Nombre de qualifiés selon la règle (undefined = tous).
 * `pool_winner` est géré à part (vainqueurs de poule) : undefined ici.
 */
export function getAdvancementCount(
  activeCount: number,
  rule: AdvancementRule | undefined
): number | undefined {
  if (!rule) return undefined;
  switch (rule.mode) {
    case 'percentage': {
      const pct = rule.percentage ?? 100;
      if (pct >= 100) return undefined;
      return Math.max(1, Math.round((activeCount * pct) / 100));
    }
    case 'fixed_count':
      return positive(rule.count);
    case 'fixed_bracket': {
      const target = positive(rule.count);
      if (!target) return undefined;
      return [2, 4, 8, 16, 32, 64, 128, 256].filter(s => s <= target).pop() ?? 2;
    }
    default:
      return undefined;
  }
}

const INACTIVE = new Set<FencerStatus>([
  FencerStatus.ABANDONED,
  FencerStatus.FORFAIT,
  FencerStatus.EXCLUDED,
]);

/**
 * Classement réduit aux qualifiés pour le tableau (percentage / fixed_count / fixed_bracket).
 * Égalités à la coupure : toutes retenues. Classement inchangé si la règle prend tout le monde.
 */
export function applyTableauAdvancement(
  ranking: PoolRanking[],
  rule: AdvancementRule | undefined
): PoolRanking[] {
  const active = [...ranking]
    .filter(r => !INACTIVE.has(r.fencer.status))
    .sort((a, b) => a.rank - b.rank);
  const count = getAdvancementCount(active.length, rule);
  if (count === undefined || count >= active.length) return ranking;
  const cutoffRank = active[count - 1].rank;
  let cut = count;
  while (cut < active.length && active[cut].rank === cutoffRank) cut++;
  return active.slice(0, cut);
}
