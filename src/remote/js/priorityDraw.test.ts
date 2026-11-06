/**
 * Module /js/priorityDraw.js (#1442) : animation du cadre doré avant la minute prioritaire.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const req = createRequire(import.meta.url);
const { animatePriorityDraw, drawSchedule, installReferee } = req('./priorityDraw.js');

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

  it('arbitre : tirage sans vainqueur, chrono remis à 1:00 prêt à lancer', () => {
    vi.useFakeTimers();
    try {
      const emitted: Array<Record<string, unknown>> = [];
      const frames: Array<string | null> = [];
      const proto: Record<string, unknown> = {};
      installReferee(proto);
      const app = Object.assign(Object.create(proto), {
        arenaId: 'a1',
        priorityDrawPhase: true,
        currentMatch: { fencerA: { id: 'fa' }, fencerB: { id: 'fb' } },
        socket: { emit: (_e: string, d: Record<string, unknown>) => emitted.push(d) },
        showNotification: () => {},
        updateControlButtons: () => {},
        updateTimerDisplay: () => {},
        applyPriorityFrame: (s: string | null) => frames.push(s),
        overtimeSeconds: () => 60,
        overtimeLabel: () => '1 min',
        timerSeconds: 0,
      });
      app.startPriorityDraw('B');
      expect(app._priorityAnimating).toBe(true);
      expect(app._prioFencerId).toBe('fb');
      expect(emitted[0]).toMatchObject({ action: 'coin_flip', winner: 'B', priority: true });
      vi.advanceTimersByTime(3000);
      expect(app._priorityAnimating).toBe(false);
      expect(frames[frames.length - 1]).toBe('B');
      expect(app.timerSeconds).toBe(60);
      expect(app.waitingOvertimeStart).toBe(true);
      expect(emitted[1]).toMatchObject({ action: 'waiting_overtime', time: 60 });
      expect(app.coinFlipWinner).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
