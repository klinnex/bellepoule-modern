// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStateGroup } from './useStateGroup';

const INIT = { name: 'a', count: 0, rounds: new Set<number>(), sel: null as string | null };

describe('useStateGroup', () => {
  it('expose les valeurs initiales et accepte valeur ou fonction', () => {
    const { result } = renderHook(() => useStateGroup(INIT));
    expect(result.current.name).toBe('a');
    act(() => result.current.setCount(3));
    act(() => result.current.setCount(c => c + 1));
    expect(result.current.count).toBe(4);
    act(() => result.current.setSel('x'));
    expect(result.current.sel).toBe('x');
    expect(result.current.name).toBe('a');
  });

  it('garde des setters stables', () => {
    const { result } = renderHook(() => useStateGroup(INIT));
    const first = result.current.setName;
    act(() => result.current.setName('b'));
    expect(result.current.setName).toBe(first);
    act(() => result.current.setName('b'));
    expect(result.current.name).toBe('b');
  });

  it('gère les Set immuables', () => {
    const { result } = renderHook(() => useStateGroup(INIT));
    act(() => result.current.setRounds(new Set([1, 2])));
    expect([...result.current.rounds]).toEqual([1, 2]);
  });
});
