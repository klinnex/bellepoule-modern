/**
 * Module /js/priorityDraw.js (#1442) : animation du cadre doré avant la minute prioritaire.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const req = createRequire(import.meta.url);
const { animatePriorityDraw, drawSchedule } = req('./priorityDraw.js');

function run(winner: 'A' | 'B') {
  const sides: Array<string | null> = [];
  const timers: Array<{ cb: () => void; ms: number }> = [];
  let done = false;
  animatePriorityDraw((s: string | null) => sides.push(s), winner, {
    setTimeout: (cb: () => void, ms: number) => timers.push({ cb, ms }),
    onDone: () => (done = true),
  });
  let elapsed = 0;
  while (timers.length) {
    const t = timers.shift()!;
    elapsed += t.ms;
    t.cb();
  }
  return { sides, elapsed, done };
}

describe('priorityDraw.js', () => {
  it('ralentit puis totalise ~3 s', () => {
    const d: number[] = drawSchedule(3000);
    expect(d.reduce((a, b) => a + b, 0)).toBe(3000);
    expect(d[1]).toBeGreaterThan(d[0]);
  });

  it.each(['A', 'B'] as const)('alterne puis se fixe sur le tiré (%s)', w => {
    const { sides, elapsed, done } = run(w);
    expect(done).toBe(true);
    expect(elapsed).toBe(3000);
    expect(sides[sides.length - 1]).toBe(w);
    expect(new Set(sides).size).toBe(2);
    for (let i = 1; i < sides.length - 1; i++) expect(sides[i]).not.toBe(sides[i - 1]);
  });
});
