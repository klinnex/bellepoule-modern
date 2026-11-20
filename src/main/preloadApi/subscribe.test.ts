import { describe, it, expect, vi, beforeEach } from 'vitest';

const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

vi.mock('electron', () => ({
  ipcRenderer: {
    on: vi.fn((channel: string, fn: (...args: unknown[]) => void) => {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel)!.add(fn);
    }),
    removeListener: vi.fn((channel: string, fn: (...args: unknown[]) => void) => {
      listeners.get(channel)?.delete(fn);
    }),
  },
}));

import { subscribe } from './subscribe';

const emit = (channel: string, ...args: unknown[]): void => {
  for (const fn of listeners.get(channel) ?? []) fn({ sender: 'secret' }, ...args);
};

describe('subscribe (préload)', () => {
  beforeEach(() => listeners.clear());

  it("transmet les arguments sans l'événement Electron", () => {
    const cb = vi.fn();
    subscribe('menu:export', cb);
    emit('menu:export', 'pdf');
    expect(cb).toHaveBeenCalledExactlyOnceWith('pdf');
  });

  it('pas de double écouteur après deux abonnements suivis de deux désabonnements', () => {
    const cb = vi.fn();
    const off1 = subscribe('menu:save', cb);
    const off2 = subscribe('menu:save', cb);
    off1();
    emit('menu:save');
    expect(cb).toHaveBeenCalledTimes(1);
    off2();
    emit('menu:save');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(listeners.get('menu:save')?.size).toBe(0);
  });

  it('le désabonnement ne retire que son propre écouteur', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribe('file:opened', a);
    subscribe('file:opened', b);
    offA();
    emit('file:opened', '/x.bpm', ['c1']);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledExactlyOnceWith('/x.bpm', ['c1']);
  });
});
