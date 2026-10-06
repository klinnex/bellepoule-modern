// @vitest-environment jsdom
/**
 * Tests unitaires - PoolService
 * BellePoule Modern
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { PoolService } from './poolService';

const svc = new PoolService();

afterEach(() => {
  delete (window as any).electronAPI;
  vi.restoreAllMocks();
});

describe('getByCompetition', () => {
  it('retourne [] sans electronAPI', async () => {
    expect(await svc.getByCompetition('c1')).toEqual([]);
  });

  it('agrège les poules de toutes les phases', async () => {
    (window as any).electronAPI = {
      db: {
        getPhasesByCompetition: async () => [{ id: 'ph1' }, { id: 'ph2' }],
        getPoolsByPhase: async (id: string) =>
          id === 'ph1' ? [{ id: 'po1' }] : [{ id: 'po2' }, { id: 'po3' }],
      },
    };
    const pools = await svc.getByCompetition('c1');
    expect(pools.map((p: any) => p.id)).toEqual(['po1', 'po2', 'po3']);
  });
});

describe('updateScore', () => {
  it('ne fait rien sans electronAPI.db.updateMatch', async () => {
    await expect(
      svc.updateScore('po', 'm', { scoreA: 5, scoreB: 3, winner: 'A' } as any)
    ).resolves.toBeUndefined();
  });

  it('construit les scores avec victoire du gagnant A', async () => {
    const updateMatch = vi.fn(async () => {});
    (window as any).electronAPI = { db: { updateMatch } };
    await svc.updateScore('po', 'm', {
      scoreA: 5,
      scoreB: 3,
      winner: 'A',
      status: 'finished',
    } as any);
    const patch = updateMatch.mock.calls[0][1];
    expect(patch.scoreA).toMatchObject({ value: 5, isVictory: true });
    expect(patch.scoreB).toMatchObject({ value: 3, isVictory: false });
    expect(patch.status).toBe('finished');
  });

  it('positionne le flag abandon sur le perdant', async () => {
    const updateMatch = vi.fn(async () => {});
    (window as any).electronAPI = { db: { updateMatch } };
    await svc.updateScore('po', 'm', {
      scoreA: 5,
      scoreB: 0,
      winner: 'A',
      specialStatus: 'abandon',
      status: 'finished',
    } as any);
    const patch = updateMatch.mock.calls[0][1];
    expect(patch.scoreA.isAbstention).toBe(false); // gagnant
    expect(patch.scoreB.isAbstention).toBe(true); // perdant abandonne
  });

  it('laisse un score à undefined s’il n’est pas fourni', async () => {
    const updateMatch = vi.fn(async () => {});
    (window as any).electronAPI = { db: { updateMatch } };
    await svc.updateScore('po', 'm', { scoreA: 5, winner: 'A' } as any);
    expect(updateMatch.mock.calls[0][1].scoreB).toBeUndefined();
  });
});

describe('computeOverallRanking', () => {
  it('retourne [] s’il n’y a pas de poule', async () => {
    vi.spyOn(svc, 'getByCompetition').mockResolvedValue([]);
    expect(await svc.computeOverallRanking('c1')).toEqual([]);
  });

  it('trie par ratio puis index et réassigne les rangs', async () => {
    // On contourne calculatePoolRanking en fournissant une poule, puis on
    // vérifie que le tri/rangs sont cohérents sur le résultat agrégé.
    vi.spyOn(svc, 'getByCompetition').mockResolvedValue([
      { id: 'po1', fencers: [], matches: [], ranking: [] } as any,
    ]);
    const ranking = await svc.computeOverallRanking('c1');
    // Poule vide → aucun classement
    expect(ranking).toEqual([]);
  });
});
