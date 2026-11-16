// @vitest-environment jsdom
/**
 * Cartons des poules pour les feuilles imprimées (#1829)
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadPoolCards } from './poolPrintCards';
import type { Pool } from '../../shared/types';

const win = window as unknown as { electronAPI?: unknown };

const pool = (id: string, matchIds: string[]) =>
  ({ id, matches: matchIds.map(mid => ({ id: mid })) }) as unknown as Pool;

afterEach(() => {
  delete win.electronAPI;
});

describe('loadPoolCards (#1829)', () => {
  it('une seule lecture pour toutes les poules, cartons rangés par poule puis par tireur', async () => {
    const getCardsByMatchIds = vi.fn().mockResolvedValue([
      { matchId: 'm1', fencerId: 'a', cardType: 'yellow' },
      { matchId: 'm2', fencerId: 'a', cardType: 'p-red' },
      { matchId: 'm3', fencerId: 'c', cardType: 'red' },
      { matchId: 'inconnu', fencerId: 'a', cardType: 'black' },
    ]);
    win.electronAPI = { db: { getCardsByMatchIds } };
    expect(await loadPoolCards([pool('p1', ['m1', 'm2']), pool('p2', ['m3'])])).toEqual({
      p1: { a: ['yellow', 'p-red'] },
      p2: { c: ['red'] },
    });
    expect(getCardsByMatchIds).toHaveBeenCalledTimes(1);
    expect(getCardsByMatchIds).toHaveBeenCalledWith(['m1', 'm2', 'm3']);
  });

  it('API absente, erreur ou poule sans match : aucun carton', async () => {
    expect(await loadPoolCards([pool('p1', ['m1'])])).toEqual({});
    expect(await loadPoolCards([pool('p1', [])])).toEqual({});
    win.electronAPI = {
      db: { getCardsByMatchIds: vi.fn().mockRejectedValue(new Error('x')) },
    };
    expect(await loadPoolCards([pool('p1', ['m1'])])).toEqual({});
  });
});
