// @vitest-environment jsdom
/**
 * Module /js/refereeFeedback.js (#1539) : son optionnel, bouton Annuler temporaire,
 * aria-label +1/+3/+5, portrait / paysage.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const F = req('./refereeFeedback.js');
const html =
  fs.readFileSync(path.join(__dirname, '..', 'referee.html'), 'utf8') +
  fs.readFileSync(path.join(__dirname, 'refereeApp.js'), 'utf8') +
  fs.readFileSync(path.join(__dirname, 'refereeAppBase.js'), 'utf8'); // page + script extrait (#1600)

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '<button id="btn-sound"></button>';
});

describe('son optionnel', () => {
  it('désactivé par défaut, bascule mémorisée, stockage cassé toléré', () => {
    const store: Record<string, string> = {};
    const st = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    };
    expect(F.readSound(st)).toBe(false);
    F.writeSound(st, true);
    expect(F.readSound(st)).toBe(true);
    F.writeSound(st, false);
    expect(F.readSound(st)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
    };
    expect(F.readSound(broken)).toBe(false);
    expect(F.writeSound(broken, true)).toBe(true);
  });

  it('beep : false sans WebAudio, true avec', () => {
    expect(F.beep({}, 1)).toBe(false);
    const osc = { frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    const win = {
      AudioContext: function () {
        return {
          createOscillator: () => osc,
          createGain: () => ({ gain: { value: 0 }, connect: vi.fn() }),
          destination: {},
          currentTime: 0,
        };
      },
    };
    expect(F.beep(win, 5)).toBe(true);
    expect(osc.frequency.value).toBe(1100);
    expect(osc.start).toHaveBeenCalled();
  });

  it('le bouton #btn-sound reflète l état (aria-pressed)', () => {
    F.init(window);
    const btn = document.getElementById('btn-sound')!;
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    btn.click();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    btn.click();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('bouton Annuler la touche temporaire', () => {
  it('visible puis masqué après le délai, clic = annulation', () => {
    const timers: Array<{ f: () => void; ms: number }> = [];
    const t = {
      set: (f: () => void, ms: number) => timers.push({ f, ms }),
      clear: () => undefined,
    };
    const undo = vi.fn();
    const box = F.showUndoToast(document, (k: string) => `T:${k}`, undo, 5000, t);
    expect(box.hidden).toBe(false);
    expect(box.textContent).toBe('T:referee.undo_touch');
    expect(timers[0].ms).toBe(5000);
    timers[0].f();
    expect(box.hidden).toBe(true);
    F.showUndoToast(document, (k: string) => k, undo, 5000, t);
    (document.querySelector('#undo-toast button') as HTMLButtonElement).click();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(document.getElementById('undo-toast')!.hidden).toBe(true);
  });
});

describe('referee.html (#1539)', () => {
  it('+1/+3/+5 ont un aria-label traduit (deux côtés)', () => {
    for (const n of [1, 3, 5]) {
      for (const s of ['a', 'b']) {
        const re = new RegExp(
          `id="btn-plus-${n}-${s}"[^>]*aria-label="[^"]+"[^>]*data-i18n-aria-label="referee\\.score_plus_${n}"`
        );
        expect(html).toMatch(re);
      }
    }
  });

  it('charge le module sans script inline et branche afterScore', () => {
    expect(html).toContain('<script src="/js/refereeFeedback.js" data-bp-init></script>');
    expect(html).toContain('BPRefereeFeedback.afterScore(this, points)');
    expect(html).toContain('id="btn-sound"');
  });

  it('portrait et paysage : cibles tactiles >= 44 px dans les deux orientations', () => {
    const base = /\.score-btn \{\s*min-height: (\d+)px/.exec(html);
    expect(Number(base![1])).toBeGreaterThanOrEqual(44);
    const land = html.slice(
      html.indexOf('@media (orientation: landscape) and (max-height: 500px)')
    );
    const m = /\.score-btn \{\s*min-height: (\d+)px/.exec(land);
    expect(Number(m![1])).toBeGreaterThanOrEqual(44);
  });

  it('clés i18n présentes dans les dix langues', () => {
    const dir = path.join(__dirname, '..', 'i18n');
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const k of [
        'score_plus_1',
        'score_plus_3',
        'score_plus_5',
        'undo_touch',
        'sound_toggle',
      ]) {
        expect(src, `${f} ${k}`).toContain(`'referee.${k}'`);
      }
    }
  });
});
