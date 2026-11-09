// @vitest-environment jsdom
/**
 * Module /js/arenaScreen.js (#1540) : transition de score discrète, écran noir.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const S = req('./arenaScreen.js');

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.className = '';
  document.body.innerHTML = '<div id="score-a">0</div><div id="score-b">0</div>';
});

describe('arenaScreen.js', () => {
  it('pulseScore : classe seulement si le score change', () => {
    const el = document.getElementById('score-a')!;
    const timers: Array<() => void> = [];
    el.textContent = '1';
    expect(S.pulseScore(el, '0', (f: () => void) => timers.push(f))).toBe(true);
    expect(el.classList.contains('score-changed')).toBe(true);
    timers[0]();
    expect(el.classList.contains('score-changed')).toBe(false);
    expect(S.pulseScore(el, '1')).toBe(false);
    expect(S.pulseScore(el, '')).toBe(false);
  });

  it('watchScores : un changement de texte déclenche la classe', async () => {
    S.watchScores(document, window);
    const el = document.getElementById('score-b')!;
    el.textContent = '3';
    await new Promise(r => setTimeout(r, 10));
    expect(el.classList.contains('score-changed')).toBe(true);
  });

  it('touche B : écran noir, toute touche le quitte', () => {
    S.init(window);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    expect(S.isBlackout(document)).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    expect(S.isBlackout(document)).toBe(false);
  });

  it('touche B ignorée dans un champ de saisie', () => {
    document.body.innerHTML += '<input id="i">';
    const i = document.getElementById('i')!;
    S.onKey(document, { key: 'b', target: i });
    expect(S.isBlackout(document)).toBe(false);
  });

  it("arena.html charge le module et la feuille n'a pas de couleur en dur", () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'arena.html'), 'utf8');
    expect(html).toMatch(/<script src="\/js\/arenaScreen\.js" data-bp-init><\/script>/);
    const src = fs
      .readFileSync(path.join(__dirname, 'arenaScreen.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
