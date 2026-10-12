// @vitest-environment jsdom
/**
 * Tests unitaires - useMatchAuditStore
 * BellePoule Modern
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useMatchAuditStore } from './useMatchAuditStore';

const get = () => useMatchAuditStore.getState();

beforeEach(() => {
  get().reset();
});
afterEach(() => {
  delete (window as any).electronAPI;
});

describe('loadMatchTimeline', () => {
  it('charge les entrées et positionne activeMatchId', async () => {
    (window as any).electronAPI = { db: { getMatchTimeline: vi.fn(async () => [{ id: 'e1' }]) } };
    await get().loadMatchTimeline('m1');
    expect(get().entries).toEqual([{ id: 'e1' }]);
    expect(get().isLoading).toBe(false);
    expect(get().activeMatchId).toBe('m1');
    expect(get().activeCompetitionId).toBeNull();
  });

  it('positionne une erreur en cas d’échec', async () => {
    (window as any).electronAPI = {
      db: {
        getMatchTimeline: vi.fn(async () => {
          throw new Error('boom');
        }),
      },
    };
    await get().loadMatchTimeline('m1');
    expect(get().error).toBe('boom');
    expect(get().isLoading).toBe(false);
  });
});

describe('loadCompetitionTimeline', () => {
  it('charge les entrées et positionne activeCompetitionId', async () => {
    (window as any).electronAPI = {
      db: { getCompetitionTimeline: vi.fn(async () => [{ id: 'c-e' }]) },
    };
    await get().loadCompetitionTimeline('c1');
    expect(get().entries).toEqual([{ id: 'c-e' }]);
    expect(get().activeCompetitionId).toBe('c1');
    expect(get().activeMatchId).toBeNull();
  });
});

describe('loadCompetitionTimeline - erreur', () => {
  it('positionne une erreur en cas d’échec', async () => {
    (window as any).electronAPI = {
      db: {
        getCompetitionTimeline: vi.fn(async () => {
          throw new Error('boom-c');
        }),
      },
    };
    await get().loadCompetitionTimeline('c1');
    expect(get().error).toBe('boom-c');
    expect(get().isLoading).toBe(false);
  });

  it('positionne un message générique si l’erreur n’est pas une Error', async () => {
    (window as any).electronAPI = {
      db: {
        getCompetitionTimeline: vi.fn(async () => {
          throw 'oops';
        }),
      },
    };
    await get().loadCompetitionTimeline('c1');
    expect(get().error).toBe('Erreur chargement');
  });
});

describe('setFilterTypes / clearError / reset', () => {
  it('met à jour les filtres', () => {
    get().setFilterTypes(['SCORE' as any]);
    expect(get().filterTypes).toEqual(['SCORE']);
  });

  it('clearError remet l’erreur à null', () => {
    useMatchAuditStore.setState({ error: 'x' });
    get().clearError();
    expect(get().error).toBeNull();
  });

  it('reset réinitialise tout', () => {
    useMatchAuditStore.setState({
      entries: [{ id: 'e' } as any],
      activeMatchId: 'm',
      isLoading: true,
    });
    get().reset();
    expect(get().entries).toEqual([]);
    expect(get().activeMatchId).toBeNull();
    expect(get().isLoading).toBe(false);
  });

  it('reset ne touche pas aux filtres actifs', () => {
    get().setFilterTypes(['SCORE' as any]);
    get().reset();
    expect(get().filterTypes).toEqual(['SCORE']);
  });
});
