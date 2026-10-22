import { describe, it, expect, afterEach } from 'vitest';
import { EventLoopMonitor } from './eventLoopMonitor';

const busy = (ms: number) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* blocage volontaire */
  }
};
const tick = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

describe('EventLoopMonitor (#1154)', () => {
  let monitor: EventLoopMonitor;
  afterEach(() => monitor?.stop());

  it('snapshot vide avant toute mesure', () => {
    monitor = new EventLoopMonitor();
    expect(monitor.snapshot()).toEqual({ samples: 0, meanMs: 0, p50Ms: 0, p99Ms: 0, maxMs: 0 });
  });

  it('détecte un blocage synchrone et se remet à zéro', async () => {
    monitor = new EventLoopMonitor(5);
    monitor.start();
    await tick(30);
    busy(150);
    await tick(30);
    const snap = monitor.snapshot(true);
    expect(snap.samples).toBeGreaterThan(0);
    expect(snap.maxMs).toBeGreaterThanOrEqual(100);
    expect(snap.p99Ms).toBeGreaterThanOrEqual(snap.p50Ms);
    expect(monitor.snapshot().samples).toBe(0);
  });

  it('start/stop idempotents', () => {
    monitor = new EventLoopMonitor();
    monitor.start();
    monitor.start();
    monitor.stop();
    monitor.stop();
  });
});
