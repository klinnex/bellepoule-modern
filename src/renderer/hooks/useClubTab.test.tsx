// @vitest-environment jsdom
/**
 * useClubTab (#1897) : onglet et club mémorisés, club affiché relu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useClubTab, CLUB_TAB_KEY, CLUB_ACTIVE_KEY } from './useClubTab';

describe('useClubTab', () => {
  beforeEach(() => {
    localStorage.clear();
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      club: { getClub: vi.fn(async (id: string) => ({ name: `Club ${id}`, logo: undefined })) },
    };
  });

  it('mémorise l’onglet et le club, relit le club affiché', async () => {
    const { result } = renderHook(() => useClubTab('home'));
    expect(result.current.clubTabOpen).toBe(false);
    act(() => {
      result.current.setClubTabOpen(true);
      result.current.setActiveClubId('c1');
    });
    expect(localStorage.getItem(CLUB_TAB_KEY)).toBe('1');
    expect(localStorage.getItem(CLUB_ACTIVE_KEY)).toBe('c1');
    await waitFor(() =>
      expect(result.current.activeClub).toEqual({ name: 'Club c1', logo: undefined })
    );
    act(() => {
      result.current.setClubTabOpen(false);
      result.current.setActiveClubId(null);
    });
    expect(localStorage.getItem(CLUB_TAB_KEY)).toBeNull();
    expect(result.current.activeClub).toBeNull();
  });

  it('état restauré au montage', () => {
    localStorage.setItem(CLUB_TAB_KEY, '1');
    localStorage.setItem(CLUB_ACTIVE_KEY, 'c9');
    const { result } = renderHook(() => useClubTab('home'));
    expect(result.current.clubTabOpen).toBe(true);
    expect(result.current.activeClubId).toBe('c9');
  });
});
