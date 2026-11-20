import { describe, expect, it } from 'vitest';
import { DEFAULT_REFEREEING, mergeRefereeing, resolveRefereeing } from './refereeingSettings';

describe('réglages d’affectation des arbitres (ADR-0014)', () => {
  it('sans réglage : neutralité de club seule, charge équilibrée', () => {
    expect(resolveRefereeing(undefined)).toEqual(DEFAULT_REFEREEING);
    expect(DEFAULT_REFEREEING.neutrality).toEqual({
      club: true,
      nationality: false,
      region: false,
    });
  });

  it('réglage partiel : complété par les défauts', () => {
    const r = resolveRefereeing({ neutrality: { nationality: true }, balance: false });
    expect(r.neutrality).toEqual({ club: true, nationality: true, region: false });
    expect(r.balance).toBe(false);
    expect(r.maxConsecutiveMatches).toBe(3);
  });

  it('fusion : la neutralité se modifie champ par champ, le reste est conservé', () => {
    const merged = mergeRefereeing(
      { neutrality: { club: false, region: true }, minRestTimeMinutes: 20 },
      { neutrality: { nationality: true } }
    );
    expect(merged).toEqual({
      neutrality: { club: false, region: true, nationality: true },
      minRestTimeMinutes: 20,
    });
  });
});
