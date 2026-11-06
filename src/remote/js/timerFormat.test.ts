// @vitest-environment jsdom
/**
 * Module /js/timerFormat.js (#1416) : formatage du chrono au centième de seconde.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const req = createRequire(import.meta.url);
const { formatTimer, renderTimer, withTenths, createSmoothTimer } = req('./timerFormat.js');

describe('timerFormat.js', () => {
  it('arbitre : dixièmes + centièmes toujours affichés', () => {
    expect(formatTimer(180, { alwaysTenths: true })).toEqual({ main: '03:00', tenth: '00' });
    expect(formatTimer(62.47, { alwaysTenths: true })).toEqual({ main: '01:02', tenth: '47' });
  });

  it("pause : la fraction n'est pas arrondie à la seconde", () => {
    expect(formatTimer(7.3, { alwaysTenths: true })).toEqual({ main: '00:07', tenth: '30' });
    expect(formatTimer(7.05, { alwaysTenths: true })).toEqual({ main: '00:07', tenth: '05' });
  });

  it('écrans : fraction seulement dans les 10 dernières secondes', () => {
    expect(formatTimer(10)).toEqual({ main: '00:10', tenth: '00' });
    expect(formatTimer(9.99)).toEqual({ main: '00:09', tenth: '99' });
    expect(formatTimer(0.01)).toEqual({ main: '00:00', tenth: '01' });
    expect(formatTimer(0)).toEqual({ main: '00:00', tenth: '00' });
    expect(formatTimer(10.1)).toEqual({ main: '00:11', tenth: '' });
    expect(formatTimer(65)).toEqual({ main: '01:05', tenth: '' });
  });

  it('valeurs invalides ou négatives : 00:00', () => {
    expect(formatTimer(-3, { alwaysTenths: true })).toEqual({ main: '00:00', tenth: '00' });
    expect(formatTimer(NaN)).toEqual({ main: '00:00', tenth: '00' });
  });

  it('renderTimer : texte + span fraction', () => {
    const el = document.createElement('div');
    renderTimer(el, 4.72);
    expect(el.textContent).toBe('00:04.72');
    expect(el.querySelector('.timer-tenths')?.textContent).toBe('.72');
    renderTimer(el, 30);
    expect(el.textContent).toBe('00:30');
    expect(el.querySelector('.timer-tenths')).toBeNull();
  });

  it('withTenths : timerSeconds arrondi sup. sur un stockage en centièmes', () => {
    const proto = {};
    withTenths(proto);
    const a = Object.create(proto) as { _timerCs: number; timerSeconds: number };
    a.timerSeconds = 180;
    expect(a._timerCs).toBe(18000);
    a._timerCs = 4501;
    expect(a.timerSeconds).toBe(46);
  });

  it('createSmoothTimer : les centièmes s’écoulent entre deux diffusions', () => {
    let t = 1000;
    const seen: number[] = [];
    const queue: Array<() => void> = [];
    const st = createSmoothTimer((v: number) => seen.push(Math.round(v * 100)), {
      now: () => t,
      raf: (cb: () => void) => queue.push(cb),
      caf: () => {},
    });
    st.update(5, 'running');
    expect(seen).toEqual([500]);
    t += 230;
    queue.shift()!();
    expect(seen[1]).toBe(477);
    st.update(4.7, 'paused');
    queue.length = 0;
    expect(seen[2]).toBe(470);
    t += 500;
    expect(st.current()).toBe(4.7);
  });

  it('createSmoothTimer : pas d’animation au-dessus de 10 s', () => {
    const queue: Array<() => void> = [];
    const st = createSmoothTimer(() => {}, {
      now: () => 0,
      raf: (cb: () => void) => queue.push(cb),
      caf: () => {},
    });
    st.update(45, 'running');
    expect(queue.length).toBe(0);
  });
});
