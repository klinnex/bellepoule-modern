import { describe, it, expect } from 'vitest';
import {
  applyTableauAdvancement,
  deriveSettingsFromFormula,
  getAdvancementCount,
  getPoolRoundAdvancement,
  getTableauAdvancement,
  resolveCompetitionSettings,
  usesModernRules,
} from './customFormulaSettings';
import { createDefaultCustomFormula } from './tournamentTemplates';
import {
  CompetitionSettings,
  CustomDEConfig,
  CustomPoolRoundConfig,
  FencerStatus,
  PoolRanking,
  Weapon,
} from '../types';

const formula = () => {
  const f = createDefaultCustomFormula();
  const pool = f.phases[0].config as CustomPoolRoundConfig;
  pool.maxScore = 7;
  pool.timerSeconds = 240;
  pool.advancementRule = { mode: 'percentage', percentage: 50 };
  const de = f.phases[1].config as CustomDEConfig;
  de.maxScore = 12;
  de.timerSeconds = 300;
  de.thirdPlaceMatch = false;
  return f;
};

const ranking = (n: number): PoolRanking[] =>
  Array.from({ length: n }, (_, i) => ({
    rank: i + 1,
    fencer: { id: `f${i}`, status: FencerStatus.QUALIFIED },
  })) as unknown as PoolRanking[];

describe('customFormulaSettings (#1125)', () => {
  it('dérive score max, chrono, tours et 3e place de la formule', () => {
    expect(deriveSettingsFromFormula(formula())).toEqual({
      poolRounds: 1,
      hasDirectElimination: true,
      defaultPoolMaxScore: 7,
      defaultPoolTimerSeconds: 240,
      defaultTableMaxScore: 12,
      defaultTableTimerSeconds: 300,
      thirdPlaceMatch: false,
      poolWinnersOnly: false,
    });
  });

  it('la formule prime sur les réglages par défaut (arme CUSTOM seulement)', () => {
    const settings = {
      defaultPoolMaxScore: 5,
      defaultTableMaxScore: 15,
      customFormula: formula(),
    } as CompetitionSettings;
    expect(resolveCompetitionSettings(Weapon.CUSTOM, settings).defaultPoolMaxScore).toBe(7);
    expect(resolveCompetitionSettings(Weapon.CUSTOM, settings).defaultTableMaxScore).toBe(12);
    expect(resolveCompetitionSettings(Weapon.EPEE, settings).defaultPoolMaxScore).toBe(5);
  });

  it('vainqueurs de poule → poolWinnersOnly', () => {
    const f = formula();
    (f.phases[0].config as CustomPoolRoundConfig).advancementRule = { mode: 'pool_winner' };
    expect(deriveSettingsFromFormula(f).poolWinnersOnly).toBe(true);
  });

  it('règles de qualification par tour et vers le tableau', () => {
    const f = formula();
    expect(getPoolRoundAdvancement(f, 0)).toEqual({ mode: 'percentage', percentage: 50 });
    expect(getTableauAdvancement(f)).toEqual({ mode: 'percentage', percentage: 50 });
    f.phases = f.phases.filter(p => p.type !== 'direct_elimination');
    expect(getTableauAdvancement(f)).toBeUndefined();
  });

  it('nombre de qualifiés', () => {
    expect(getAdvancementCount(10, { mode: 'percentage', percentage: 80 })).toBe(8);
    expect(getAdvancementCount(10, { mode: 'percentage', percentage: 100 })).toBeUndefined();
    expect(getAdvancementCount(10, { mode: 'fixed_count', count: 6 })).toBe(6);
    expect(getAdvancementCount(20, { mode: 'fixed_bracket', count: 12 })).toBe(8);
    expect(getAdvancementCount(10, { mode: 'all' })).toBeUndefined();
  });

  it('applique la coupure au classement du tableau, égalités retenues', () => {
    expect(
      applyTableauAdvancement(ranking(10), { mode: 'percentage', percentage: 50 })
    ).toHaveLength(5);
    const tied = ranking(6);
    tied[3].rank = 3;
    expect(applyTableauAdvancement(tied, { mode: 'fixed_count', count: 3 })).toHaveLength(4);
    const all = ranking(4);
    expect(applyTableauAdvancement(all, { mode: 'all' })).toBe(all);
  });

  it('règles armes modernes choisies dans la formule : repos dérivé (défaut 60 s)', () => {
    const f = formula();
    expect(deriveSettingsFromFormula(f).restTimeSeconds).toBeUndefined();
    f.ruleSet = 'modern';
    expect(deriveSettingsFromFormula(f).restTimeSeconds).toBe(60);
    f.restTimeSeconds = 0;
    expect(deriveSettingsFromFormula(f).restTimeSeconds).toBe(0);
  });

  it('usesModernRules : E/F/S toujours, CUSTOM selon la formule, Laser jamais', () => {
    const f = formula();
    const settings = { customFormula: f } as CompetitionSettings;
    expect(usesModernRules(Weapon.EPEE, undefined)).toBe(true);
    expect(usesModernRules(Weapon.LASER, undefined)).toBe(false);
    expect(usesModernRules(Weapon.CUSTOM, settings)).toBe(false);
    f.ruleSet = 'modern';
    expect(usesModernRules(Weapon.CUSTOM, settings)).toBe(true);
    expect(usesModernRules(Weapon.LASER, settings)).toBe(false);
  });
});
