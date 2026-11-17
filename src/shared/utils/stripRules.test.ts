import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STRIP_RULE,
  isDefaultStripRule,
  normalizeStripRule,
  sortCandidates,
  stripAllows,
} from './stripRules';
import type { StripCandidate } from '../types/eventDay';

const cand = (p: Partial<StripCandidate>): StripCandidate => ({
  key: 'k',
  competitionId: 'c1',
  competitionTitle: 'M15 FH',
  kind: 'match',
  number: 1,
  tableauSize: 16,
  fencers: null,
  fromStrip: 2,
  ...p,
});

describe('stripRules — réservation des pistes (#1878)', () => {
  it('par défaut tout est autorisé', () => {
    expect(isDefaultStripRule(DEFAULT_STRIP_RULE)).toBe(true);
    expect(stripAllows(DEFAULT_STRIP_RULE, cand({ kind: 'pool', tableauSize: null }))).toBe(true);
    expect(stripAllows(DEFAULT_STRIP_RULE, cand({ tableauSize: null }))).toBe(true);
  });

  it('épreuves autorisées', () => {
    const rule = { ...DEFAULT_STRIP_RULE, competitions: ['c2'] };
    expect(stripAllows(rule, cand({ competitionId: 'c1' }))).toBe(false);
    expect(stripAllows(rule, cand({ competitionId: 'c2' }))).toBe(true);
  });

  it('piste de finale : tableau de 8 et moins, pas de poules', () => {
    const rule = { ...DEFAULT_STRIP_RULE, pools: false, tableauMax: 8 };
    expect(stripAllows(rule, cand({ kind: 'pool', tableauSize: null }))).toBe(false);
    expect(stripAllows(rule, cand({ tableauSize: 16 }))).toBe(false);
    expect(stripAllows(rule, cand({ tableauSize: 8 }))).toBe(true);
    expect(stripAllows(rule, cand({ tableauSize: 2 }))).toBe(true);
    expect(stripAllows(rule, cand({ tableauSize: null }))).toBe(false);
  });

  it('poules seulement', () => {
    const rule = { ...DEFAULT_STRIP_RULE, tableau: false };
    expect(stripAllows(rule, cand({}))).toBe(false);
    expect(stripAllows(rule, cand({ kind: 'pool', tableauSize: null }))).toBe(true);
  });

  it('normalisation des entrées invalides', () => {
    expect(normalizeStripRule(null)).toEqual(DEFAULT_STRIP_RULE);
    expect(
      normalizeStripRule({ competitions: ['a', 3, ''], pools: false, tableauMax: 'x' })
    ).toEqual({ competitions: ['a'], pools: false, tableau: true, tableauMax: null });
    expect(normalizeStripRule({ tableauMax: 1 }).tableauMax).toBeNull();
  });

  it('ordre : sans piste d’abord, poules, puis petits tableaux', () => {
    const list = [
      cand({ key: 'a', tableauSize: 32 }),
      cand({ key: 'b', tableauSize: 8 }),
      cand({ key: 'c', kind: 'pool', tableauSize: null }),
      cand({ key: 'd', fromStrip: null, kind: 'pool', tableauSize: null }),
    ];
    expect(sortCandidates(list).map(c => c.key)).toEqual(['d', 'c', 'b', 'a']);
  });
});
