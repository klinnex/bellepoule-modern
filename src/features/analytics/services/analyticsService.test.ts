// @vitest-environment jsdom
/**
 * Tests unitaires - AnalyticsService (agrégation via electronAPI.db mocké)
 * BellePoule Modern
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AnalyticsService } from './analyticsService';

const svc = new AnalyticsService();

function mockDb(db: Record<string, unknown>) {
  (window as any).electronAPI = { db };
}

afterEach(() => {
  delete (window as any).electronAPI;
});

describe('getPoolStats', () => {
  it('retourne des zéros sans electronAPI', async () => {
    expect(await svc.getPoolStats('p1')).toEqual({
      totalMatches: 0,
      completedMatches: 0,
      averageDuration: 0,
    });
  });

  it('agrège matchs, terminés et durée moyenne', async () => {
    mockDb({
      getMatchesByPool: async () => [
        { status: 'finished', duration: 100 },
        { status: 'finished', duration: 200 },
        { status: 'in_progress', duration: 0 },
      ],
    });
    expect(await svc.getPoolStats('p1')).toEqual({
      totalMatches: 3,
      completedMatches: 2,
      averageDuration: 150,
    });
  });

  it('durée moyenne 0 si aucun match terminé', async () => {
    mockDb({ getMatchesByPool: async () => [{ status: 'in_progress' }] });
    expect((await svc.getPoolStats('p1')).averageDuration).toBe(0);
  });
});

describe('getCompetitionStats', () => {
  it('retourne une structure vide sans electronAPI', async () => {
    expect(await svc.getCompetitionStats('c1')).toEqual({
      totalFencers: 0,
      totalMatches: 0,
      completedMatches: 0,
      averageMatchDuration: 0,
      topFencers: [],
    });
  });

  it('agrège matchs sur phases/poules et calcule la durée moyenne', async () => {
    mockDb({
      getFencersByCompetition: async () => [],
      getPhasesByCompetition: async () => [{ id: 'ph1' }],
      getPoolsByPhase: async () => [{ id: 'po1' }, { id: 'po2' }],
      getMatchesByPool: async (poolId: string) =>
        poolId === 'po1'
          ? [
              { status: 'finished', duration: 60 },
              { status: 'finished', duration: 120 },
            ]
          : [{ status: 'in_progress' }],
    });
    const stats = await svc.getCompetitionStats('c1');
    expect(stats.totalFencers).toBe(0);
    expect(stats.totalMatches).toBe(3);
    expect(stats.completedMatches).toBe(2);
    expect(stats.averageMatchDuration).toBe(90);
    expect(stats.topFencers).toEqual([]);
  });
});

describe('getCompetitionMetrics', () => {
  it('dérive totalFencers et completedMatches de getCompetitionStats', async () => {
    mockDb({
      getFencersByCompetition: async () => [{ id: 'f1' }, { id: 'f2' }],
      getPhasesByCompetition: async () => [{ id: 'ph1' }],
      getPoolsByPhase: async () => [{ id: 'po1' }],
      getMatchesByPool: async () => [{ status: 'finished' }, { status: 'not_started' }],
    });
    expect(await svc.getCompetitionMetrics('c1')).toEqual({
      totalFencers: 2,
      completedMatches: 1,
    });
  });
});

describe('getCompetitionFencerStats / getFencerCompetitionStats', () => {
  it('retournent des valeurs vides sans electronAPI', async () => {
    expect(await svc.getCompetitionFencerStats('c1')).toEqual([]);
    expect(await svc.getFencerCompetitionStats('f1')).toBeNull();
  });

  it('délèguent à electronAPI.db', async () => {
    mockDb({
      getCompetitionFencerStats: async () => [{ fencerId: 'f1' }],
      getFencerCompetitionStats: async () => ({ fencerId: 'f1' }),
    });
    expect(await svc.getCompetitionFencerStats('c1')).toHaveLength(1);
    expect(await svc.getFencerCompetitionStats('f1')).toEqual({ fencerId: 'f1' });
  });
});
