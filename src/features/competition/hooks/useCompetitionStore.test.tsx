// @vitest-environment jsdom
/**
 * Tests unitaires - useCompetitionStore
 * BellePoule Modern
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCompetitionStore } from './useCompetitionStore';

const get = () => useCompetitionStore.getState();

beforeEach(() => {
  useCompetitionStore.setState({
    competitions: [],
    currentCompetition: null,
    isLoading: false,
    error: null,
  });
});
afterEach(() => {
  delete (window as any).electronAPI;
});

describe('loadCompetitions', () => {
  it('charge les compétitions via le service', async () => {
    (window as any).electronAPI = { db: { getAllCompetitions: vi.fn(async () => [{ id: 'c1' }]) } };
    await get().loadCompetitions();
    expect(get().competitions).toEqual([{ id: 'c1' }]);
    expect(get().isLoading).toBe(false);
    expect(get().error).toBeNull();
  });

  it('positionne une erreur si la DB est indisponible', async () => {
    await get().loadCompetitions();
    expect(get().error).toBe('Database not available');
    expect(get().isLoading).toBe(false);
  });
});

describe('createCompetition', () => {
  it('ajoute en tête et définit la compétition courante', async () => {
    (window as any).electronAPI = {
      db: { createCompetition: vi.fn(async (d: any) => ({ id: 'new', ...d })) },
    };
    const created = await get().createCompetition({ title: 'T' } as any);
    expect(created.id).toBe('new');
    expect(get().competitions[0].id).toBe('new');
    expect(get().currentCompetition?.id).toBe('new');
  });

  it('propage l’erreur et la stocke', async () => {
    await expect(get().createCompetition({ title: 'T' } as any)).rejects.toThrow();
    expect(get().error).toBe('Database not available');
  });
});

describe('selectCompetition / deleteCompetition', () => {
  it('selectCompetition met à jour la compétition courante', async () => {
    (window as any).electronAPI = { db: { getCompetition: vi.fn(async () => ({ id: 'c1' })) } };
    await get().selectCompetition('c1');
    expect(get().currentCompetition?.id).toBe('c1');
  });

  it('deleteCompetition retire de la liste', async () => {
    useCompetitionStore.setState({ competitions: [{ id: 'c1' }, { id: 'c2' }] as any });
    (window as any).electronAPI = { db: { deleteCompetition: vi.fn(async () => {}) } };
    await get().deleteCompetition('c1');
    expect(get().competitions.map((c: any) => c.id)).toEqual(['c2']);
  });
});

describe('setCurrentCompetition / clearError', () => {
  it('définit la compétition courante', () => {
    get().setCurrentCompetition({ id: 'x' } as any);
    expect(get().currentCompetition?.id).toBe('x');
  });

  it('efface l’erreur', () => {
    useCompetitionStore.setState({ error: 'boom' });
    get().clearError();
    expect(get().error).toBeNull();
  });
});
