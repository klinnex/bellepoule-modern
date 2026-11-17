// @vitest-environment jsdom
/**
 * Nombre de pistes du serveur distant (#1880) : saisie mémorisée > valeur du parent > pistes de
 * la salle > nombre de poules.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../components/remote/useArenaThemes', () => ({
  useArenaThemes: () => ({ arenaThemes: {}, savedThemes: [] }),
}));
vi.mock('../../components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../useRemoteNetworkSettings', () => ({
  useRemoteNetworkSettings: () => ({
    useHttps: true,
    remotePort: 8066,
    networkInterfaces: [],
    selectedInterface: '0.0.0.0',
    setUseHttps: vi.fn(),
    setCertFingerprint: vi.fn(),
    setRemotePort: vi.fn(),
    setSelectedInterface: vi.fn(),
  }),
}));
vi.mock('../useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('../useStripAvailability', () => ({
  useStripAvailability: (sel: (s: { unavailable: Set<number> }) => unknown) =>
    sel({ unavailable: new Set() }),
}));
vi.mock('../../components/remote/remoteViewMode', () => ({
  useRemoteViewMode: () => ['simple', vi.fn()],
}));
vi.mock('../useKioskTheme', () => ({
  useKioskTheme: () => ({ kioskTheme: null, kioskPreset: 'default' }),
}));

import { useRemoteServerState } from './useRemoteServerState';
import { fetchVenueStripCount } from './venueStripCount';

const makeCtx = (over: Record<string, unknown> = {}, poolCount = 3) =>
  ({
    competition: { id: 'c1' },
    pools: Array.from({ length: poolCount }, (_, i) => ({ id: `p${i}`, number: i + 1 })),
    tableauMatches: [],
    consolationBrackets: [],
    ...over,
  }) as never;

let resolve: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  resolve = vi.fn(async () => 6);
  (window as unknown as { electronAPI: unknown }).electronAPI = { settings: { resolve } };
});

describe('fetchVenueStripCount', () => {
  it('interroge la résolution des pistes de l’épreuve', async () => {
    expect(await fetchVenueStripCount('c1')).toBe(6);
    expect(resolve).toHaveBeenCalledWith('stripCount', { competitionId: 'c1' });
  });

  it('renvoie 0 si inconnu, invalide ou en erreur', async () => {
    resolve.mockResolvedValue(0);
    expect(await fetchVenueStripCount('c1')).toBe(0);
    resolve.mockResolvedValue('x');
    expect(await fetchVenueStripCount('c1')).toBe(0);
    resolve.mockRejectedValue(new Error('boom'));
    expect(await fetchVenueStripCount('c1')).toBe(0);
    (window as unknown as { electronAPI: unknown }).electronAPI = {};
    expect(await fetchVenueStripCount('c1')).toBe(0);
  });
});

describe('useRemoteServerState : nombre de pistes initial', () => {
  it('poules tirées : une arène par poule, sans interroger la salle', async () => {
    const { result } = renderHook(() => useRemoteServerState(makeCtx()));
    await waitFor(() => expect(result.current.effectiveCommitted).toBe(3));
    expect(resolve).not.toHaveBeenCalled();
  });

  it('pas encore de poules : pistes de la journée ou de la salle', async () => {
    const { result } = renderHook(() => useRemoteServerState(makeCtx({}, 0)));
    await waitFor(() => expect(result.current.effectiveCommitted).toBe(6));
    expect(result.current.effectivePending).toBe(6);
  });

  it('pas de poules ni de salle : une arène', async () => {
    resolve.mockResolvedValue(0);
    const { result } = renderHook(() => useRemoteServerState(makeCtx({}, 0)));
    await waitFor(() => expect(resolve).toHaveBeenCalled());
    await waitFor(() => expect(result.current.effectiveCommitted).toBe(1));
  });

  it('garde la valeur mémorisée sans interroger la salle', async () => {
    localStorage.setItem('bellepoule-remote-strips-c1', '2');
    const { result } = renderHook(() => useRemoteServerState(makeCtx()));
    await waitFor(() => expect(result.current.effectiveCommitted).toBe(2));
    expect(resolve).not.toHaveBeenCalled();
  });

  it('garde la valeur du parent sans interroger la salle', async () => {
    const { result } = renderHook(() => useRemoteServerState(makeCtx({ initialStripCount: 4 })));
    await waitFor(() => expect(result.current.effectiveCommitted).toBe(4));
    expect(resolve).not.toHaveBeenCalled();
  });
});
