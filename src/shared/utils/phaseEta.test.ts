import { describe, it, expect } from 'vitest';
import { estimatePhaseEta, median, sequentialWaves } from './phaseEta';

const MIN = 60_000;

describe('median', () => {
  it('impair, pair, vide', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('estimatePhaseEta', () => {
  it('utilise la médiane des durées mesurées + changement de piste', () => {
    const eta = estimatePhaseEta({
      durationsMs: [3 * MIN, 4 * MIN, 30 * MIN, 5 * MIN, 4 * MIN],
      remainingMatches: 8,
      activeArenas: 4,
      now: 0,
    });
    expect(eta.basis).toBe('measured');
    expect(eta.perMatchMs).toBe(5 * MIN); // médiane 4 min + 1 min
    expect(eta.finishAt).toBe(2 * 5 * MIN); // 2 vagues de 4 pistes
  });

  it('valeur par défaut tant que moins de 3 matchs sont mesurés', () => {
    const eta = estimatePhaseEta({
      durationsMs: [10 * MIN],
      remainingMatches: 3,
      activeArenas: 2,
      now: 1000,
    });
    expect(eta.basis).toBe('default');
    expect(eta.finishAt).toBe(1000 + 2 * 5 * MIN);
  });

  it('arrondit les vagues au supérieur et borne les pistes à 1', () => {
    const base = { durationsMs: [MIN, MIN, MIN], now: 0, changeoverMs: 0 };
    expect(estimatePhaseEta({ ...base, remainingMatches: 5, activeArenas: 2 }).finishAt).toBe(
      3 * MIN
    );
    expect(estimatePhaseEta({ ...base, remainingMatches: 2, activeArenas: 0 }).finishAt).toBe(
      2 * MIN
    );
  });

  it('rien à jouer → fin = maintenant', () => {
    const eta = estimatePhaseEta({
      durationsMs: [],
      remainingMatches: 0,
      activeArenas: 3,
      now: 42,
    });
    expect(eta.finishAt).toBe(42);
    expect(eta.remainingMatches).toBe(0);
  });

  it('ne garde que les durées récentes et valides', () => {
    const old = Array(50).fill(60 * MIN);
    const recent = Array(20).fill(2 * MIN);
    const eta = estimatePhaseEta({
      durationsMs: [...old, NaN, -5, ...recent],
      remainingMatches: 1,
      activeArenas: 1,
      now: 0,
      changeoverMs: 0,
    });
    expect(eta.perMatchMs).toBe(2 * MIN);
  });
});

describe('sequentialWaves (poules sur pistes)', () => {
  it('une poule par piste : la plus longue poule fixe la fin', () => {
    expect(sequentialWaves([10, 6, 3], 4)).toBe(10);
  });

  it('plus de poules que de pistes : répartition sur la piste la moins chargée', () => {
    // LPT sur 2 pistes : 10 | 6 → 10 | 6+5 → 10+3 | 11 → 13
    expect(sequentialWaves([10, 6, 5, 3], 2)).toBe(13);
    expect(sequentialWaves([4, 4, 4, 4], 1)).toBe(16);
  });

  it('aucun groupe → 0 vague', () => {
    expect(sequentialWaves([], 3)).toBe(0);
  });

  it('estimatePhaseEta tient compte des pistes pour les poules', () => {
    const base = { durationsMs: [3 * MIN, 3 * MIN, 3 * MIN], remainingMatches: 12, now: 0 };
    const one = estimatePhaseEta({ ...base, sequentialGroups: [6, 6], activeArenas: 1 });
    const two = estimatePhaseEta({ ...base, sequentialGroups: [6, 6], activeArenas: 2 });
    expect(one.finishAt).toBe(12 * 4 * MIN);
    expect(two.finishAt).toBe(6 * 4 * MIN);
  });
});
