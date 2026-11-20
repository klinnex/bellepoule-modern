// @vitest-environment jsdom
/**
 * Tests unitaires - useColumnVisibility
 * BellePoule Modern
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useColumnVisibility } from './useColumnVisibility';

describe('useColumnVisibility', () => {
  beforeEach(() => {
    localStorage.clear();
    const { result } = renderHook(() => useColumnVisibility());
    act(() => result.current.resetToDefaults());
  });

  it('expose les colonnes par défaut visibles', () => {
    const { result } = renderHook(() => useColumnVisibility());
    expect(result.current.isColumnVisible('pool', 'victories')).toBe(true);
    expect(result.current.isColumnVisible('ranking', 'rank')).toBe(true);
  });

  it('colonnes de poule par défaut : Victoires, Ratio V/M, Indice uniquement', () => {
    const { result } = renderHook(() => useColumnVisibility());
    expect(result.current.getVisibleColumns('pool')).toEqual(['victories', 'ratio', 'index']);
    expect(result.current.isColumnVisible('pool', 'td')).toBe(false);
    expect(result.current.isColumnVisible('pool', 'tr')).toBe(false);
  });

  it('toggleColumn masque puis réaffiche une colonne', () => {
    const { result } = renderHook(() => useColumnVisibility());
    act(() => result.current.toggleColumn('pool', 'victories'));
    expect(result.current.isColumnVisible('pool', 'victories')).toBe(false);
    act(() => result.current.toggleColumn('pool', 'victories'));
    expect(result.current.isColumnVisible('pool', 'victories')).toBe(true);
  });

  it('setVisibleColumns remplace la liste', () => {
    const { result } = renderHook(() => useColumnVisibility());
    act(() => result.current.setVisibleColumns('ranking', ['rank', 'lastName']));
    expect(result.current.getVisibleColumns('ranking')).toEqual(['rank', 'lastName']);
    expect(result.current.isColumnVisible('ranking', 'club')).toBe(false);
  });

  it('réglage par poule indépendant du défaut global', () => {
    const { result } = renderHook(() => useColumnVisibility());
    act(() => result.current.toggleColumn('pool', 'ratio', 'poolX'));
    // poolX : ratio masquée ; le défaut global reste inchangé
    expect(result.current.isColumnVisible('pool', 'ratio', 'poolX')).toBe(false);
    expect(result.current.isColumnVisible('pool', 'ratio')).toBe(true);
    expect(result.current.isColumnVisible('pool', 'ratio', 'autrePool')).toBe(true);
  });

  it('setAllPoolColumns applique à tous et efface les réglages propres', () => {
    const { result } = renderHook(() => useColumnVisibility());
    act(() => result.current.toggleColumn('pool', 'td', 'poolX'));
    act(() => result.current.setAllPoolColumns(['victories']));
    expect(result.current.getVisibleColumns('pool', 'poolX')).toEqual(['victories']);
    expect(result.current.getVisibleColumns('pool')).toEqual(['victories']);
  });

  it('persiste dans localStorage', () => {
    const { result } = renderHook(() => useColumnVisibility());
    act(() => result.current.setVisibleColumns('pool', ['rank']));
    const stored = JSON.parse(localStorage.getItem('bellepoule_column_visibility')!);
    expect(stored.pool).toEqual(['rank']);
  });
});
