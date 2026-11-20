import { describe, expect, it } from 'vitest';
import {
  adjustedDuration,
  aggregateDurations,
  percentile,
  referenceDuration,
  weaponCode,
  widenKey,
  type DurationKey,
} from './matchDurations';
import { estimatePhaseEta } from './phaseEta';
import { simulateFormula } from './customRankingCalculator';

const MIN = 60_000;
const epeePool: DurationKey = { weapon: 'E', phase: 'pool', maxScore: 5 };

describe('matchDurations (#1965)', () => {
  it('valeurs par défaut : poule d’épée 3 min 30, tableau de sabre 8 min', () => {
    const e = referenceDuration(epeePool);
    expect(e.medianMs).toBe(3.5 * MIN);
    expect(e.basis).toBe('default');
    expect(e.changeoverMs).toBe(MIN);
    expect(e.p80Ms).toBeGreaterThan(e.medianMs);
    expect(referenceDuration({ weapon: 'S', phase: 'tableau', maxScore: 15 }).medianMs).toBe(
      8 * MIN
    );
    expect(referenceDuration({ weapon: 'F', phase: 'tableau', maxScore: 15 }).medianMs).toBe(
      11 * MIN
    );
  });

  it('score différent : durée proportionnelle (relais 45 touches)', () => {
    expect(referenceDuration({ weapon: 'S', phase: 'team_relay', maxScore: 45 }).medianMs).toBe(
      24 * MIN
    );
  });

  it('arme L / C : depuis le chrono et le score, jamais 0', () => {
    expect(referenceDuration({ weapon: 'C', phase: 'pool', maxScore: 5 }).medianMs).toBe(4 * MIN);
    expect(
      referenceDuration({ weapon: 'L', phase: 'pool', maxScore: 5 }, { timerSeconds: 180 }).medianMs
    ).toBe(3 * MIN);
    expect(referenceDuration({ weapon: 'X', phase: 'tableau', maxScore: 0 }).medianMs).toBe(
      12 * MIN
    );
  });

  it('priorité : réglage > historique (≥ 30 matchs) > défaut', () => {
    const history = [{ key: epeePool, medianMs: 4 * MIN, samples: 412 }];
    expect(referenceDuration(epeePool, { history }).basis).toBe('history');
    expect(referenceDuration(epeePool, { history }).medianMs).toBe(4 * MIN);
    expect(
      referenceDuration(epeePool, { history: [{ key: epeePool, medianMs: 9 * MIN, samples: 12 }] })
        .basis
    ).toBe('default');
    const settings = [{ key: epeePool, medianMs: 5 * MIN }];
    const s = referenceDuration(epeePool, { history, settings });
    expect(s.basis).toBe('setting');
    expect(s.medianMs).toBe(5 * MIN);
  });

  it('clé précise sans valeur : remonte à la clé plus large', () => {
    const key = { ...epeePool, gender: 'F', category: 'U17' };
    expect(widenKey(key)).toHaveLength(3);
    const history = [{ key: { ...epeePool, gender: 'F' }, medianMs: 4 * MIN, samples: 50 }];
    expect(referenceDuration(key, { history }).medianMs).toBe(4 * MIN);
    expect(referenceDuration(key).medianMs).toBe(3.5 * MIN);
  });

  it('mélange : suit la formule avec 0, 3, 5, 10 et 20 matchs mesurés', () => {
    const ref = referenceDuration(epeePool);
    const real = 4.5 * MIN;
    const expected = [3.5, 3.875, 4, 4 + 1 / 6, 4.3];
    [0, 3, 5, 10, 20].forEach((n, i) => {
      const e = adjustedDuration(ref, new Array(n).fill(real));
      expect(e.medianMs / MIN).toBeCloseTo(expected[i], 6);
      expect(e.samples).toBe(n);
      expect(e.basis).toBe(n ? 'live' : 'default');
    });
  });

  it('fenêtre glissante de 20 matchs', () => {
    const ref = referenceDuration(epeePool);
    const e = adjustedDuration(ref, [
      ...new Array(30).fill(10 * MIN),
      ...new Array(20).fill(4 * MIN),
    ]);
    expect(e.samples).toBe(20);
    expect(e.medianMs).toBeCloseTo((5 * 3.5 * MIN + 20 * 4 * MIN) / 25);
  });

  it('match de 25 min (blessure) ou de 10 s : sans effet', () => {
    const ref = referenceDuration(epeePool);
    const base = new Array(5).fill(4 * MIN);
    const e = adjustedDuration(ref, base);
    expect(adjustedDuration(ref, [...base, 25 * MIN]).medianMs).toBe(e.medianMs);
    expect(adjustedDuration(ref, [...base, 10_000]).medianMs).toBe(e.medianMs);
    expect(adjustedDuration(ref, [25 * MIN])).toEqual(ref);
  });

  it('fourchette : 80ᵉ centile ≥ médiane', () => {
    const ref = referenceDuration(epeePool);
    const e = adjustedDuration(
      ref,
      [3, 4, 5, 6, 7].map(m => m * MIN)
    );
    expect(e.p80Ms).toBeGreaterThanOrEqual(e.medianMs);
    expect(percentile([1, 2, 3, 4, 5], 80)).toBeCloseTo(4.2);
    expect(percentile([], 80)).toBe(0);
  });

  it('agrégats : médiane, 80ᵉ centile et nombre par clé, sans donnée personnelle', () => {
    const tab: DurationKey = { weapon: 'E', phase: 'tableau', maxScore: 15 };
    const agg = aggregateDurations([
      { key: epeePool, durationMs: 3 * MIN },
      { key: epeePool, durationMs: 5 * MIN },
      { key: epeePool, durationMs: 4 * MIN },
      { key: tab, durationMs: 12 * MIN },
      { key: tab, durationMs: 1000 },
    ]);
    expect(agg).toHaveLength(2);
    expect(agg[0]).toEqual({ key: epeePool, medianMs: 4 * MIN, p80Ms: 4.6 * MIN, samples: 3 });
    expect(agg[1].samples).toBe(1);
    expect(Object.keys(agg[0]).sort()).toEqual(['key', 'medianMs', 'p80Ms', 'samples']);
  });

  it('code arme depuis un libellé', () => {
    expect(weaponCode('E')).toBe('E');
    expect(weaponCode('épée')).toBe('E');
    expect(weaponCode('foil')).toBe('F');
    expect(weaponCode('sabre')).toBe('S');
    expect(weaponCode('sabre laser')).toBe('L');
    expect(weaponCode(undefined)).toBe('C');
  });

  it('fin de phase et simulation : même durée pour la même clé', () => {
    const ref = referenceDuration(epeePool);
    const eta = estimatePhaseEta({
      durationsMs: [],
      remainingMatches: 0,
      activeArenas: 1,
      now: 0,
      reference: ref,
    });
    expect(eta.perMatchMs).toBe(ref.medianMs + ref.changeoverMs);
    expect(eta.basis).toBe('default');
    const sim = simulateFormula(
      6,
      {
        version: 1,
        phases: [
          {
            type: 'pool_round',
            config: {
              minPoolSize: 6,
              maxPoolSize: 6,
              maxScore: 5,
              timerSeconds: 180,
              advancementRule: { mode: 'percentage', percentage: 80 },
            },
          },
        ],
      } as never,
      'E'
    );
    expect(sim.estimatedDurationMinutes).toBe(Math.round((15 * ref.medianMs) / MIN));
  });

  it('fin de phase avec référence : mesuré dès 3 matchs, aberrants exclus', () => {
    const ref = referenceDuration(epeePool);
    const eta = estimatePhaseEta({
      durationsMs: [4.5 * MIN, 4.5 * MIN, 4.5 * MIN, 25 * MIN],
      remainingMatches: 1,
      activeArenas: 1,
      now: 0,
      reference: ref,
    });
    expect(eta.basis).toBe('measured');
    expect(eta.perMatchMs).toBeCloseTo(3.875 * MIN + MIN);
  });
});
