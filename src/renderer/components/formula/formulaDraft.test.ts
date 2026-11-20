/**
 * Brouillon de formule des propriétés (#2013, étape A)
 */
import { describe, it, expect } from 'vitest';
import { Category, Weapon, type CompetitionSettings } from '../../../shared/types';
import {
  MAX_POOL_ROUNDS,
  addPoolRound,
  canAddPoolRound,
  draftFromSettings,
  draftToSettings,
  removePoolRound,
  setQuest,
} from './formulaDraft';

const draft = (s?: Partial<CompetitionSettings>, weapon = Weapon.EPEE) =>
  draftFromSettings(weapon, Category.SENIOR, s as CompetitionSettings);

describe('formulaDraft', () => {
  it('sans réglages : repli unifié (5 / 15, poules 5 à 7, pas de 3e place)', () => {
    expect(draft()).toMatchObject({
      poolRounds: 1,
      poolMaxScore: 5,
      tableMaxScore: 15,
      poolSizeMin: 5,
      poolSizeMax: 7,
      thirdPlaceMatch: false,
    });
  });

  it('aller-retour réglages → brouillon → réglages', () => {
    const s = {
      poolRounds: 3,
      poolRoundQualifiers: [32, 16],
      hasDirectElimination: true,
      defaultPoolMaxScore: 4,
      defaultTableMaxScore: 10,
      thirdPlaceMatch: true,
      poolSizeMin: 6,
      poolSizeMax: 7,
      postPoolSplitCriteria: 'gender' as const,
    };
    expect(draftToSettings(draft(s), Weapon.EPEE, undefined)).toMatchObject(s);
  });

  it(`plafond de ${MAX_POOL_ROUNDS} tours, aligné sur la validation`, () => {
    const d = draft({ poolRounds: MAX_POOL_ROUNDS });
    expect(canAddPoolRound(d, Weapon.EPEE)).toBe(false);
    expect(addPoolRound(d, Weapon.EPEE)).toEqual({});
  });

  it('retirer le tour 2 sur 3 : les qualifiés du tour 3 remontent', () => {
    const d = draft({ poolRounds: 3, poolRoundQualifiers: [32, 16] });
    expect(removePoolRound(d, Weapon.EPEE, 1)).toEqual({
      poolRounds: 2,
      poolRoundQualifiers: [16],
    });
  });

  it('dernier tour non retirable', () => {
    expect(removePoolRound(draft(), Weapon.EPEE, 0)).toEqual({});
  });

  it('laser : Tour Quest sans poules → 0 tour, poules ajoutées → 1 tour', () => {
    const d = {
      ...draft(undefined, Weapon.LASER),
      ...setQuest(draft(undefined, Weapon.LASER), true),
    };
    expect(draftToSettings(d, Weapon.LASER, undefined)).toMatchObject({
      poolRounds: 0,
      questConfig: { enabled: true, hasPreliminaryPools: false },
    });
    const withPools = { ...d, ...addPoolRound(d, Weapon.LASER) };
    expect(draftToSettings(withPools, Weapon.LASER, undefined).poolRounds).toBe(1);
    expect(canAddPoolRound(withPools, Weapon.LASER)).toBe(false);
  });

  it('scission vide : clé retirée', () => {
    expect(draftToSettings(draft(), Weapon.EPEE, undefined).postPoolSplitCriteria).toBeUndefined();
  });
});
