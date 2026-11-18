/**
 * Tests unitaires - fin planifiée et écart final (onglet Organisation, #1817)
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getFinalDeviation,
  getPlannedEnd,
  getProjectedEnd,
  hasPlannedEnd,
  setFinalDeviation,
  setPlannedEnd,
  setProjectedEnd,
} from './scheduleBaseline';

describe('scheduleBaseline', () => {
  beforeEach(() => localStorage.clear());

  it('fin planifiée par phase, repli sur la 1re estimation', () => {
    expect(getPlannedEnd('c1', 'pools')).toBeNull();
    localStorage.setItem('bp-org-baseline-c1', '1000');
    expect(getPlannedEnd('c1', 'pools')).toBe(1000);
    expect(hasPlannedEnd('c1', 'pools')).toBe(false);
    setPlannedEnd('c1', 'pools', 5000);
    setPlannedEnd('c1', 'tableau', 9000);
    expect(getPlannedEnd('c1', 'pools')).toBe(5000);
    expect(getPlannedEnd('c1', 'tableau')).toBe(9000);
    expect(hasPlannedEnd('c1', 'tableau')).toBe(true);
    expect(getPlannedEnd('c2', 'pools')).toBeNull();
  });

  it('écart final mémorisé puis effacé', () => {
    setPlannedEnd('c1', 'pools', 5000);
    setFinalDeviation('c1', { deviationMin: 12, endAt: 7000, plannedAt: 5000 });
    expect(getFinalDeviation('c1')).toEqual({ deviationMin: 12, endAt: 7000, plannedAt: 5000 });
    expect(getPlannedEnd('c1', 'pools')).toBe(5000);
    setFinalDeviation('c1', null);
    expect(getFinalDeviation('c1')).toBeNull();
  });

  it('JSON corrompu : valeurs vides', () => {
    localStorage.setItem('bp-org-schedule-c1', '{oops');
    expect(getFinalDeviation('c1')).toBeNull();
    expect(getPlannedEnd('c1', 'pools')).toBeNull();
  });

  it('fin de compétition projetée conservée après génération du tableau (#1817)', () => {
    expect(getProjectedEnd('c3')).toBeNull();
    setProjectedEnd('c3', 5000);
    setPlannedEnd('c3', 'pools', 2000);
    expect(getProjectedEnd('c3')).toBe(5000);
    setProjectedEnd('c3', Number.NaN);
    expect(getProjectedEnd('c3')).toBe(5000);
  });
});
