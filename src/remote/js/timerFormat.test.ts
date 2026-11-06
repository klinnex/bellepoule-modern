// @vitest-environment jsdom
/**
 * Module /js/timerFormat.js (#1416) : formatage du chrono au dixième de seconde.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const req = createRequire(import.meta.url);
const { formatTimer, renderTimer } = req('./timerFormat.js');

describe('timerFormat.js', () => {
  it('arbitre : dixième toujours affiché', () => {
    expect(formatTimer(180, { alwaysTenths: true })).toEqual({ main: '03:00', tenth: '0' });
    expect(formatTimer(62.4, { alwaysTenths: true })).toEqual({ main: '01:02', tenth: '4' });
  });

  it("pause : le dixième n'est pas arrondi à la seconde", () => {
    expect(formatTimer(7.3, { alwaysTenths: true })).toEqual({ main: '00:07', tenth: '3' });
  });

  it('écrans : dixièmes seulement dans les 10 dernières secondes', () => {
    expect(formatTimer(10)).toEqual({ main: '00:10', tenth: '0' });
    expect(formatTimer(9.9)).toEqual({ main: '00:09', tenth: '9' });
    expect(formatTimer(0.1)).toEqual({ main: '00:00', tenth: '1' });
    expect(formatTimer(0)).toEqual({ main: '00:00', tenth: '0' });
    expect(formatTimer(10.1)).toEqual({ main: '00:11', tenth: '' });
    expect(formatTimer(65)).toEqual({ main: '01:05', tenth: '' });
  });

  it('valeurs invalides ou négatives : 00:00', () => {
    expect(formatTimer(-3, { alwaysTenths: true })).toEqual({ main: '00:00', tenth: '0' });
    expect(formatTimer(NaN)).toEqual({ main: '00:00', tenth: '0' });
  });

  it('renderTimer : texte + span dixième', () => {
    const el = document.createElement('div');
    renderTimer(el, 4.7);
    expect(el.textContent).toBe('00:04.7');
    expect(el.querySelector('.timer-tenths')?.textContent).toBe('.7');
    renderTimer(el, 30);
    expect(el.textContent).toBe('00:30');
    expect(el.querySelector('.timer-tenths')).toBeNull();
  });
});
