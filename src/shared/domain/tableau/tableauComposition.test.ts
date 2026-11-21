/**
 * Tableau généré par l'écran, contrôlé par le moteur (docs/adr/0017) : placement conservé.
 */
import { describe, it, expect } from 'vitest';
import type { Fencer, PoolRanking } from '../../types';
import { composeTableau, tableauComposition } from './tableauComposition';
import { planTableau } from './tableauCalculations';

const fencers = Array.from(
  { length: 10 },
  (_, i) => ({ id: `f${i}`, lastName: `N${i}` }) as Fencer
);
const byId = new Map(fencers.map(f => [f.id, f]));
const ranking = fencers.map((fencer, i) => ({ fencer, rank: i + 1 }) as PoolRanking);

describe('composeTableau', () => {
  it('aller-retour avec planTableau : barrages, exemptions et rangs conservés', () => {
    const { matches } = planTableau(ranking, { playAllPositions: true, thirdPlaceMatch: true });
    const res = composeTableau(tableauComposition(matches), byId);
    if (!res.ok) throw new Error(res.code);
    expect(
      res.matches.map(m => [
        m.id,
        m.round,
        m.position,
        m.fencerA?.id ?? null,
        m.fencerB?.id ?? null,
        m.isBye,
      ])
    ).toEqual(
      matches.map(m => [
        m.id,
        m.round,
        m.position,
        m.fencerA?.id ?? null,
        m.fencerB?.id ?? null,
        m.isBye,
      ])
    );
    expect(res.matches.map(m => m.seedA ?? null)).toEqual(matches.map(m => m.seedA ?? null));
    expect(res.matches.filter(m => m.isBye).every(m => m.winner)).toBe(true);
  });

  it('refus : tireur inconnu, tireur deux fois dans un tour, case répétée, tour invalide', () => {
    const base = { round: 8, isBye: false, fencerBId: 'f1' };
    expect(
      composeTableau([{ ...base, matchId: 'a', position: 0, fencerAId: 'x' }], byId)
    ).toMatchObject({ code: 'unknown_fencer' });
    expect(
      composeTableau(
        [
          { ...base, matchId: 'a', position: 0, fencerAId: 'f0' },
          { ...base, matchId: 'b', position: 1, fencerAId: 'f2' },
        ],
        byId
      )
    ).toMatchObject({ code: 'duplicate_fencer' });
    expect(
      composeTableau(
        [
          { ...base, matchId: 'a', position: 0, fencerAId: 'f0' },
          { ...base, matchId: 'b', position: 0, fencerAId: 'f2', fencerBId: 'f3' },
        ],
        byId
      )
    ).toMatchObject({ code: 'duplicate_slot' });
    expect(
      composeTableau([{ ...base, matchId: 'a', round: 6, position: 0, fencerAId: 'f0' }], byId)
    ).toMatchObject({ code: 'invalid_round' });
  });
});
