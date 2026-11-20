// @vitest-environment jsdom
/**
 * Module /js/refereeFeedback.js (#1539) : son optionnel, menu téléphone (#1808),
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

describe('« Annuler la touche » retiré (#1808)', () => {
  it('afterScore ne crée plus de bouton temporaire (doublon du bouton Annuler)', () => {
    expect(() => F.afterScore({ undoLastAction: vi.fn() }, 1)).not.toThrow();
    expect(document.getElementById('undo-toast')).toBeNull();
    expect(F.showUndoToast).toBeUndefined();
  });
});

describe('menu d options sur téléphone (#1808)', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<button id="btn-header-menu" aria-expanded="false"></button>' +
      '<div id="header-tools"><button id="btn-sound"></button></div><p id="out"></p>';
  });

  it('ouvre/ferme le menu, ferme au clic extérieur et sur Échap', () => {
    expect(F.initHeaderMenu(document)).toBe(true);
    const btn = document.getElementById('btn-header-menu')!;
    const tools = document.getElementById('header-tools')!;
    btn.click();
    expect(tools.classList.contains('open')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    (document.getElementById('btn-sound') as HTMLButtonElement).click();
    expect(tools.classList.contains('open')).toBe(true); // clic dans le menu : reste ouvert
    document.getElementById('out')!.click();
    expect(tools.classList.contains('open')).toBe(false);
    btn.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('sans les éléments : aucun effet', () => {
    document.body.innerHTML = '';
    expect(F.initHeaderMenu(document)).toBe(false);
  });

  it('referee.html : options regroupées, menu visible uniquement sur téléphone', () => {
    expect(html).toMatch(
      /<div class="header-tools" id="header-tools">\s*<button[^>]*id="btn-swap"[\s\S]*id="btn-colorblind"[\s\S]*id="btn-sound"[\s\S]*?<\/div>/
    );
    expect(html).toContain('<link rel="stylesheet" href="/refereePhone.css" />');
    const css = fs.readFileSync(path.join(__dirname, '..', 'refereePhone.css'), 'utf8');
    const block = css.slice(css.indexOf('@media (max-width: 480px)'));
    expect(block).toContain('.header-menu-btn {');
    expect(block).toContain('.header-tools.open {');
    expect(block).toMatch(/\.vs-divider \{\s*grid-column: 1 \/ -1;/);
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
        'display_options',
        'sound_toggle',
      ]) {
        expect(src, `${f} ${k}`).toContain(`'referee.${k}'`);
      }
    }
  });
});
