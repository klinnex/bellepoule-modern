/**
 * Module kiosque /js/kioskTiming.js (#1401) : rotation des vues, backoff réseau, défilement automatique.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const K = req('./kioskTiming.js');

describe('kioskTiming.js', () => {
  it('retryDelay : exponentiel plafonné à 30 s, jitter ±25 %', () => {
    expect(K.retryDelay(0, 0.5)).toBe(1000);
    expect(K.retryDelay(2, 0.5)).toBe(4000);
    expect(K.retryDelay(5, 0.5)).toBe(30000);
    expect(K.retryDelay(10, 0.5)).toBe(30000);
    expect(K.retryDelay(0, 0)).toBe(750);
    expect(K.retryDelay(0, 1)).toBe(1250);
  });

  it('nextView : circulaire, première vue si inconnue', () => {
    const v = ['poules', 'tableau', 'final'];
    expect(K.nextView(v, 'poules')).toBe('tableau');
    expect(K.nextView(v, 'final')).toBe('poules');
    expect(K.nextView(v, 'zzz')).toBe('poules');
  });

  it('progressPct : plafonné à 100', () => {
    expect(K.progressPct(500, 1000)).toBe(50);
    expect(K.progressPct(5000, 1000)).toBe(100);
  });

  it('createAutoScroller : délai 2 s, défilement 20 s, retour début après 3 s', () => {
    const now = 0;
    const timers: { at: number; cb: () => void }[] = [];
    let rafCb: ((t: number) => void) | null = null;
    const sc = K.createAutoScroller({
      raf: (cb: (t: number) => void) => ((rafCb = cb), 1),
      caf: () => {
        rafCb = null;
      },
      setTimeout: (cb: () => void, ms: number) => timers.push({ at: now + ms, cb }),
      clearTimeout: (id: number) => {
        if (id) timers[id - 1] && (timers[id - 1].cb = () => {});
      },
    });
    const wrapper = { scrollHeight: 300, clientHeight: 100, scrollTop: 0 };
    sc.start(wrapper);
    expect(timers[0].at).toBe(2000);
    timers[0].cb();
    rafCb!(0);
    expect(wrapper.scrollTop).toBe(0);
    rafCb!(10000);
    expect(wrapper.scrollTop).toBe(100);
    rafCb!(20000);
    expect(wrapper.scrollTop).toBe(200);
    expect(timers[1].at).toBe(3000);
    timers[1].cb();
    expect(wrapper.scrollTop).toBe(0);
    expect(timers.length).toBe(3); // redémarre un cycle
  });

  it('createAutoScroller : rien à défiler -> pas de nouvelle image', () => {
    let rafCb: ((t: number) => void) | null = null;
    let rafCalls = 0;
    const timers: (() => void)[] = [];
    const sc = K.createAutoScroller({
      raf: (cb: (t: number) => void) => ((rafCb = cb), ++rafCalls),
      caf: () => {},
      setTimeout: (cb: () => void) => timers.push(cb),
      clearTimeout: () => {},
    });
    sc.start({ scrollHeight: 100, clientHeight: 100, scrollTop: 0 });
    timers[0]();
    rafCb!(0);
    expect(rafCalls).toBe(1);
  });

  it('kiosk.html charge le module et n’a plus la logique inline', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'kiosk.html'), 'utf8');
    expect(html).toContain('<script src="/js/kioskTiming.js"></script>');
    expect(html).not.toContain('let scrollAnimFrame');
    expect(html).not.toContain('2 ** retryAttempt');
  });
});
