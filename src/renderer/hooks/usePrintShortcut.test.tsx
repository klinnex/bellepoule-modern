// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePrintShortcut } from './usePrintShortcut';

const press = (init: KeyboardEventInit) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, ...init }));

describe('usePrintShortcut', () => {
  it('déclenche onPrint sur Ctrl+P quand activé', () => {
    const onPrint = vi.fn();
    renderHook(() => usePrintShortcut(true, onPrint));
    press({ key: 'p', ctrlKey: true });
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it('ignore le raccourci quand désactivé', () => {
    const onPrint = vi.fn();
    renderHook(() => usePrintShortcut(false, onPrint));
    press({ key: 'p', metaKey: true });
    expect(onPrint).not.toHaveBeenCalled();
  });

  it('se désabonne au démontage', () => {
    const onPrint = vi.fn();
    const { unmount } = renderHook(() => usePrintShortcut(true, onPrint));
    unmount();
    press({ key: 'p', ctrlKey: true });
    expect(onPrint).not.toHaveBeenCalled();
  });
});
