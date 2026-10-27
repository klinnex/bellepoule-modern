// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKioskTheme } from './useKioskTheme';
import type { CustomTheme } from '../../shared/types/remote';

let updateKioskTheme: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  updateKioskTheme = vi.fn().mockResolvedValue({ success: true });
  (window as any).electronAPI = { remote: { updateKioskTheme } };
});

afterEach(() => {
  delete (window as any).electronAPI;
});

describe('useKioskTheme', () => {
  it('préréglage par défaut, relu par compétition', () => {
    expect(renderHook(() => useKioskTheme('c1')).result.current.kioskPreset).toBe('default');
    localStorage.setItem('bellepoule-kiosk-preset-c2', 'neon');
    expect(renderHook(() => useKioskTheme('c2')).result.current.kioskPreset).toBe('neon');
  });

  it('applyKioskPreset : mémorise, envoie seulement si session active', async () => {
    const { result } = renderHook(() => useKioskTheme('c1'));
    await act(() => result.current.applyKioskPreset('light', false));
    expect(result.current.kioskPreset).toBe('light');
    expect(localStorage.getItem('bellepoule-kiosk-preset-c1')).toBe('light');
    expect(updateKioskTheme).not.toHaveBeenCalled();

    await act(() => result.current.applyKioskPreset('neon', true));
    expect(updateKioskTheme).toHaveBeenCalledWith('c1', { '--k-preset': 'neon' });
  });

  it('applyKioskCustomTheme : thème courant + variables envoyées, préréglage effacé ensuite', async () => {
    const { result } = renderHook(() => useKioskTheme('c1'));
    const theme = { name: 'Bleu', variables: { '--k-bg': '#00f' } } as unknown as CustomTheme;
    await act(() => result.current.applyKioskCustomTheme(theme));
    expect(result.current.kioskTheme).toBe(theme);
    expect(updateKioskTheme).toHaveBeenCalledWith('c1', {
      '--k-preset': 'default',
      '--k-bg': '#00f',
    });

    await act(() => result.current.applyKioskPreset('default', true));
    expect(result.current.kioskTheme).toBeUndefined();
  });

  it("ouverture / fermeture de l'éditeur", () => {
    const { result } = renderHook(() => useKioskTheme('c1'));
    act(() => result.current.setKioskThemeEditorOpen(true));
    expect(result.current.kioskThemeEditorOpen).toBe(true);
  });
});
