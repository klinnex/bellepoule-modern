// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installResizeGuard, RESIZING_ATTR } from './resizeGuard';

describe('installResizeGuard (#1652)', () => {
  let root: HTMLElement;
  let dispose: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement('html');
    dispose = installResizeGuard(window, root, 200);
  });

  afterEach(() => {
    dispose();
    vi.useRealTimers();
  });

  it('pose data-resizing pendant le geste et le retire après inactivité', () => {
    expect(root.hasAttribute(RESIZING_ATTR)).toBe(false);
    window.dispatchEvent(new Event('resize'));
    expect(root.hasAttribute(RESIZING_ATTR)).toBe(true);
    vi.advanceTimersByTime(150);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(150);
    expect(root.hasAttribute(RESIZING_ATTR)).toBe(true);
    vi.advanceTimersByTime(60);
    expect(root.hasAttribute(RESIZING_ATTR)).toBe(false);
  });

  it('dispose retire l’attribut et l’écouteur', () => {
    window.dispatchEvent(new Event('resize'));
    dispose();
    expect(root.hasAttribute(RESIZING_ATTR)).toBe(false);
    window.dispatchEvent(new Event('resize'));
    expect(root.hasAttribute(RESIZING_ATTR)).toBe(false);
  });
});
