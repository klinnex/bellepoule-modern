// @vitest-environment jsdom
/**
 * Tests unitaires - useKeyboardShortcuts
 * BellePoule Modern
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts, KeyboardShortcut } from './useKeyboardShortcuts';

const fireKey = (init: KeyboardEventInit & { target?: EventTarget }) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  if (init.target) Object.defineProperty(event, 'target', { value: init.target });
  window.dispatchEvent(event);
  return event;
};

afterEach(() => vi.restoreAllMocks());

describe('useKeyboardShortcuts', () => {
  it('déclenche l’action sur la bonne touche + modificateur', () => {
    const action = vi.fn();
    const shortcuts: KeyboardShortcut[] = [{ key: 's', ctrl: true, description: 'Save', action }];
    renderHook(() => useKeyboardShortcuts({ shortcuts }));
    fireKey({ key: 's', ctrlKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('ne déclenche pas si les modificateurs ne correspondent pas', () => {
    const action = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({ shortcuts: [{ key: 's', ctrl: true, description: 'Save', action }] })
    );
    fireKey({ key: 's' }); // sans ctrl
    expect(action).not.toHaveBeenCalled();
  });

  it('respecte enabled=false', () => {
    const action = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({ shortcuts: [{ key: 'a', description: 'A', action }], enabled: false })
    );
    fireKey({ key: 'a' });
    expect(action).not.toHaveBeenCalled();
  });

  it('ignore les raccourcis dans un input (sauf Escape)', () => {
    const action = vi.fn();
    const esc = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts({
        shortcuts: [
          { key: 'a', description: 'A', action },
          { key: 'Escape', description: 'Esc', action: esc },
        ],
      })
    );
    const input = document.createElement('input');
    fireKey({ key: 'a', target: input });
    expect(action).not.toHaveBeenCalled();
    fireKey({ key: 'Escape', target: input });
    expect(esc).toHaveBeenCalledTimes(1);
  });

  it('appelle preventDefault par défaut', () => {
    renderHook(() =>
      useKeyboardShortcuts({ shortcuts: [{ key: 'x', description: 'X', action: () => {} }] })
    );
    const evt = fireKey({ key: 'x' });
    expect(evt.defaultPrevented).toBe(true);
  });

  it('respecte preventDefault=false', () => {
    renderHook(() =>
      useKeyboardShortcuts({
        shortcuts: [{ key: 'y', description: 'Y', action: () => {}, preventDefault: false }],
      })
    );
    const evt = fireKey({ key: 'y' });
    expect(evt.defaultPrevented).toBe(false);
  });

  it('capture les erreurs de l’action sans planter', () => {
    const action = vi.fn(() => {
      throw new Error('boom');
    });
    renderHook(() => useKeyboardShortcuts({ shortcuts: [{ key: 'z', description: 'Z', action }] }));
    expect(() => fireKey({ key: 'z' })).not.toThrow();
    expect(action).toHaveBeenCalled();
  });
});
