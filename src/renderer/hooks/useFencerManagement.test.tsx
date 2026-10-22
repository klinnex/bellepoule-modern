// @vitest-environment jsdom
/**
 * Tests unitaires - useFencerManagement
 * BellePoule Modern
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFencerManagement } from './useFencerManagement';
import { Competition, Fencer, Gender, FencerStatus } from '../../shared/types';

vi.mock('./useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const fencer = (id: string): Fencer => ({
  id,
  ref: Number(id),
  lastName: 'L' + id,
  firstName: 'F',
  gender: Gender.MALE,
  nationality: 'FRA',
  status: FencerStatus.NOT_CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const competition = { id: 'c1', title: 'Open', fencers: [fencer('1')] } as unknown as Competition;

let onUpdate: ReturnType<typeof vi.fn>;
let db: Record<string, any>;

beforeEach(() => {
  onUpdate = vi.fn();
  db = {
    addFencer: vi.fn(async (_cid: string, data: any) => ({ ...fencer('2'), ...data, id: '2' })),
    updateFencer: vi.fn(async () => {}),
    deleteFencer: vi.fn(async () => {}),
    deleteAllFencers: vi.fn(async () => {}),
  };
  (window as any).electronAPI = { db };
});

afterEach(() => {
  delete (window as any).electronAPI;
});

const setup = () =>
  renderHook(() =>
    useFencerManagement({ competition, onUpdate: onUpdate as unknown as (c: Competition) => void })
  ).result;

describe('addFencer', () => {
  it('ajoute le tireur et notifie le parent', async () => {
    const r = setup();
    let created: any;
    await act(async () => {
      created = await r.current.addFencer({ lastName: 'X' } as any);
    });
    expect(db.addFencer).toHaveBeenCalledWith('c1', expect.objectContaining({ lastName: 'X' }));
    expect(created.id).toBe('2');
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].fencers).toHaveLength(2);
  });

  it('lève une erreur si l’API est absente', async () => {
    delete (window as any).electronAPI;
    const r = setup();
    await expect(r.current.addFencer({ lastName: 'X' } as any)).rejects.toThrow(
      'API non disponible'
    );
  });
});

describe('updateFencer', () => {
  it('met à jour le tireur et notifie', async () => {
    const r = setup();
    await act(async () => {
      await r.current.updateFencer('1', { lastName: 'Neuf' });
    });
    expect(db.updateFencer).toHaveBeenCalledWith('1', { lastName: 'Neuf' });
    expect(onUpdate.mock.calls[0][0].fencers[0].lastName).toBe('Neuf');
  });
});

describe('setFencersStatus', () => {
  it('met à jour plusieurs tireurs en un seul état (#1051)', async () => {
    const comp = { ...competition, fencers: [fencer('1'), fencer('2'), fencer('3')] };
    const r = renderHook(() =>
      useFencerManagement({
        competition: comp,
        onUpdate: onUpdate as unknown as (c: Competition) => void,
      })
    ).result;
    await act(async () => {
      await r.current.setFencersStatus(['1', '3'], FencerStatus.ELIMINATED);
    });
    expect(db.updateFencer).toHaveBeenCalledTimes(2);
    expect(r.current.fencers.map(f => f.status)).toEqual([
      FencerStatus.ELIMINATED,
      FencerStatus.NOT_CHECKED_IN,
      FencerStatus.ELIMINATED,
    ]);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('updateFencers', () => {
  it('applique des MAJ différentes par tireur en un seul état (#1051)', async () => {
    const comp = { ...competition, fencers: [fencer('1'), fencer('2')] };
    const r = renderHook(() =>
      useFencerManagement({
        competition: comp,
        onUpdate: onUpdate as unknown as (c: Competition) => void,
      })
    ).result;
    await act(async () => {
      await r.current.updateFencers({
        '1': { status: FencerStatus.ELIMINATED },
        '2': { ranking: 1 },
      });
    });
    expect(db.updateFencer).toHaveBeenCalledWith('1', { status: FencerStatus.ELIMINATED });
    expect(db.updateFencer).toHaveBeenCalledWith('2', { ranking: 1 });
    expect(r.current.fencers[0].status).toBe(FencerStatus.ELIMINATED);
    expect(r.current.fencers[1].ranking).toBe(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('deleteFencer', () => {
  it('supprime le tireur et notifie', async () => {
    const r = setup();
    await act(async () => {
      await r.current.deleteFencer('1');
    });
    expect(db.deleteFencer).toHaveBeenCalledWith('1');
    expect(onUpdate.mock.calls[0][0].fencers).toHaveLength(0);
  });
});

describe('deleteAllFencers', () => {
  it('vide la liste et notifie', async () => {
    const r = setup();
    await act(async () => {
      await r.current.deleteAllFencers();
    });
    expect(db.deleteAllFencers).toHaveBeenCalledWith('c1');
    expect(onUpdate.mock.calls[0][0].fencers).toHaveLength(0);
  });
});
