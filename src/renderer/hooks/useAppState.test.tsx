// @vitest-environment jsdom
/**
 * Tests unitaires - useAppState
 * BellePoule Modern
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAppState } from './useAppState';
import { Competition } from '../../shared/types';

const noopToast = (_m: string, _t?: 'info' | 'success' | 'warning' | 'error') => {};
const comp = (id: string): Competition => ({ id, title: 'C' + id }) as unknown as Competition;

afterEach(() => {
  delete (window as any).electronAPI;
});

describe('useAppState - état initial', () => {
  it('démarre sur la vue home, en chargement', () => {
    const { result } = renderHook(() => useAppState(noopToast));
    expect(result.current.view).toBe('home');
    expect(result.current.competitions).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });
});

describe('handleBack / setView', () => {
  it('handleBack ramène à home', () => {
    const { result } = renderHook(() => useAppState(noopToast));
    act(() => result.current.setView('competition'));
    act(() => result.current.handleBack());
    expect(result.current.view).toBe('home');
  });
});

describe('handleUpdateCompetition', () => {
  it('met à jour la compétition courante, la liste et les onglets', () => {
    const { result } = renderHook(() => useAppState(noopToast));
    act(() => {
      result.current.setCompetitions([comp('1')]);
      result.current.setCurrentCompetition(comp('1'));
      result.current.setOpenCompetitions([{ competition: comp('1'), isDirty: false } as any]);
    });
    const updated = { ...comp('1'), title: 'Nouveau' } as Competition;
    act(() => result.current.handleUpdateCompetition(updated));
    expect(result.current.currentCompetition?.title).toBe('Nouveau');
    expect(result.current.competitions[0].title).toBe('Nouveau');
    expect(result.current.openCompetitions[0].competition.title).toBe('Nouveau');
    expect(result.current.openCompetitions[0].isDirty).toBe(true);
  });
});

describe('handleTabSwitch', () => {
  it('bascule sur l’onglet ouvert correspondant', () => {
    const { result } = renderHook(() => useAppState(noopToast));
    act(() =>
      result.current.setOpenCompetitions([
        { competition: comp('A'), isDirty: false } as any,
        { competition: comp('B'), isDirty: false } as any,
      ])
    );
    act(() => result.current.handleTabSwitch('B'));
    expect(result.current.activeTabId).toBe('B');
    expect(result.current.currentCompetition?.id).toBe('B');
    expect(result.current.view).toBe('competition');
  });

  it('ne fait rien pour un onglet inexistant', () => {
    const { result } = renderHook(() => useAppState(noopToast));
    act(() => result.current.handleTabSwitch('inconnu'));
    expect(result.current.activeTabId).toBeNull();
  });
});

describe('loadCompetitions', () => {
  it('charge depuis electronAPI et termine le chargement', async () => {
    (window as any).electronAPI = {
      db: { getAllCompetitions: vi.fn(async () => [comp('1'), comp('2')]) },
    };
    const { result } = renderHook(() => useAppState(noopToast));
    await act(async () => {
      await result.current.loadCompetitions();
    });
    await waitFor(() => expect(result.current.competitions).toHaveLength(2));
    expect(result.current.isLoading).toBe(false);
  });
});

describe('setters de modals', () => {
  it('basculent les drapeaux d’affichage', () => {
    const { result } = renderHook(() => useAppState(noopToast));
    act(() => result.current.setShowSettingsModal(true));
    expect(result.current.showSettingsModal).toBe(true);
    act(() => result.current.setShowNewCompetitionModal(true));
    expect(result.current.showNewCompetitionModal).toBe(true);
  });
});
