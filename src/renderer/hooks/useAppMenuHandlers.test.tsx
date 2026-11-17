// @vitest-environment jsdom
/**
 * useAppMenuHandlers (#1897) : abonnement unique, handlers à jour, désabonnement ciblé.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppMenuHandlers, type AppMenuHandlers } from './useAppMenuHandlers';

type Cb = (...args: unknown[]) => unknown;
const listeners = new Map<string, Cb>();
const offs: string[] = [];
const on = (name: string) =>
  vi.fn((cb: Cb) => {
    listeners.set(name, cb);
    return () => offs.push(name);
  });

const NAMES = [
  'onMenuNewCompetition',
  'onMenuReportIssue',
  'onShowAbout',
  'onFileOpened',
  'onFileSaved',
  'onMenuSave',
  'onMenuOpenSettings',
  'onAutosaveCompleted',
  'onAutosaveFailed',
];

const handlers = (over: Partial<AppMenuHandlers> = {}): AppMenuHandlers => ({
  onNewCompetition: vi.fn(),
  onReportIssue: vi.fn(),
  onAbout: vi.fn(),
  onOpenSettings: vi.fn(),
  reloadCompetitions: vi.fn(),
  openImportedCompetition: vi.fn(),
  showToast: vi.fn(),
  ...over,
});

describe('useAppMenuHandlers', () => {
  beforeEach(() => {
    listeners.clear();
    offs.length = 0;
    (window as unknown as { electronAPI: unknown }).electronAPI = Object.fromEntries(
      NAMES.map(n => [n, on(n)])
    );
  });

  it('relaie les événements vers les derniers handlers, sans réabonnement', () => {
    const first = handlers();
    const { rerender } = renderHook(h => useAppMenuHandlers(h), { initialProps: first });
    const second = handlers();
    rerender(second);
    listeners.get('onMenuNewCompetition')!();
    listeners.get('onMenuOpenSettings')!();
    listeners.get('onMenuSave')!();
    expect(first.onNewCompetition).not.toHaveBeenCalled();
    expect(second.onNewCompetition).toHaveBeenCalledOnce();
    expect(second.onOpenSettings).toHaveBeenCalledOnce();
    expect(second.showToast).toHaveBeenCalledWith('Sauvegarde effectuée', 'success');
    const api = window.electronAPI as unknown as Record<string, ReturnType<typeof vi.fn>>;
    expect(api.onMenuNewCompetition).toHaveBeenCalledOnce();
  });

  it('.bpm ouvert : recharge, toast, ouvre la compétition unique', async () => {
    const h = handlers();
    renderHook(() => useAppMenuHandlers(h));
    await act(async () => {
      await listeners.get('onFileOpened')!('/x.bpm', ['c1']);
    });
    expect(h.reloadCompetitions).toHaveBeenCalled();
    expect(h.showToast).toHaveBeenCalledWith('Compétition importée', 'success');
    expect(h.openImportedCompetition).toHaveBeenCalledWith('c1');
  });

  it('démontage : tous les désabonnements appelés', () => {
    const { unmount } = renderHook(() => useAppMenuHandlers(handlers()));
    unmount();
    expect(offs.sort()).toEqual([...NAMES].sort());
  });
});
