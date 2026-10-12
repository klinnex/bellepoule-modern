// @vitest-environment jsdom
/**
 * Tests unitaires - useElectronDB
 * BellePoule Modern
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useElectronDB } from './useElectronDB';

afterEach(() => {
  delete (window as any).electronAPI;
});

const db = () => renderHook(() => useElectronDB()).result.current;

describe('useElectronDB - délégation', () => {
  it('getAllCompetitions relaie l’appel DB', async () => {
    const getAllCompetitions = vi.fn(async () => [{ id: 'c1' }]);
    (window as any).electronAPI = { db: { getAllCompetitions } };
    expect(await db().getAllCompetitions()).toEqual([{ id: 'c1' }]);
    expect(getAllCompetitions).toHaveBeenCalledTimes(1);
  });

  it('getCompetition transmet l’identifiant', async () => {
    const getCompetition = vi.fn(async (_id: string) => ({ id: 'c1' }));
    (window as any).electronAPI = { db: { getCompetition } };
    await db().getCompetition('c1');
    expect(getCompetition).toHaveBeenCalledWith('c1');
  });

  it('createCompetition transmet les données', async () => {
    const createCompetition = vi.fn(async (d: any) => ({ id: 'new', ...d }));
    (window as any).electronAPI = { db: { createCompetition } };
    const res = await db().createCompetition({ title: 'T' } as any);
    expect(createCompetition).toHaveBeenCalledWith({ title: 'T' });
    expect(res.id).toBe('new');
  });
});

describe('useElectronDB - API indisponible', () => {
  it('lève ElectronAPIUnavailableError si la méthode manque', async () => {
    // pas de window.electronAPI
    await expect(db().getAllCompetitions()).rejects.toThrow(/getAllCompetitions/);
  });

  it('lève aussi si db existe mais pas la méthode', async () => {
    (window as any).electronAPI = { db: {} };
    await expect(db().getCompetition('x')).rejects.toThrow(/getCompetition/);
  });
});

describe('useElectronDB - propagation d’erreur', () => {
  it('relaie l’erreur du backend', async () => {
    const getAllCompetitions = vi.fn(async () => {
      throw new Error('db down');
    });
    (window as any).electronAPI = { db: { getAllCompetitions } };
    await expect(db().getAllCompetitions()).rejects.toThrow('db down');
  });
});
