// @vitest-environment jsdom
/**
 * Module écran d'arène /js/arenaRender.js (#1401) : rendu du match, cartons, chrono, mort subite.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const R = req('./arenaRender.js');
const T = (k: string) => `T(${k})`;
const esc = (s: string) => s.replace(/"/g, '&quot;');
const $ = (id: string) => document.getElementById(id)!;

beforeEach(() => {
  document.body.innerHTML = `
    <div id="match-status"></div>
    <div id="fencer-a-display"></div><div id="fencer-b-display"></div>
    <span id="color-badge-a"></span><span id="color-badge-b"></span>
    <span id="fencer-a-name"></span><span id="fencer-a-club"></span>
    <span id="fencer-b-name"></span><span id="fencer-b-club"></span>
    <span id="score-a" class="score green"></span><span id="score-b" class="score red"></span>
    <div id="fencer-a-cards"></div><div id="fencer-b-cards"></div>
    <div id="timer-display"></div>
    <div id="sudden-death-banner"></div><div id="mort-subite-banner"></div>`;
});

describe('arenaRender.js', () => {
  it('updateStatusBadge : libellé + classe, statut inconnu = badge vide', () => {
    R.updateStatusBadge(document, T, 'in_progress');
    expect($('match-status').textContent).toBe('T(arena.status_in_progress)');
    expect($('match-status').className).toBe('match-status-badge status-progress');
    R.updateStatusBadge(document, T, 'ready');
    expect($('match-status').className).toContain('status-waiting');
    R.updateStatusBadge(document, T, 'zzz');
    expect($('match-status').className).toBe('match-status-badge');
  });

  it('scoreValue : nombre, objet, nul', () => {
    expect(R.scoreValue(5)).toBe(5);
    expect(R.scoreValue({ value: 3 })).toBe(3);
    expect(R.scoreValue(null)).toBe(0);
    expect(R.scoreValue({})).toBe(0);
  });

  it('updateMatchDisplay : sans inversion B à gauche ; avec, A à gauche', () => {
    const m = {
      fencerA: { lastName: 'Aa', firstName: 'Ann', club: 'CA' },
      fencerB: { lastName: 'Bb', firstName: '', club: 'CB' },
      scoreA: 4,
      scoreB: { value: 2 },
    };
    R.updateMatchDisplay(document, m, false);
    expect($('fencer-a-name').textContent).toBe('Bb');
    expect($('fencer-a-club').textContent).toBe('CB');
    expect($('score-a').textContent).toBe('2');
    expect($('fencer-a-display').className).toBe('fencer-display red-side');
    R.updateMatchDisplay(document, m, true);
    expect($('fencer-a-name').textContent).toBe('Aa Ann');
    expect($('score-a').textContent).toBe('4');
    expect($('score-a').className).toBe('score green');
    expect($('color-badge-b').className).toBe('color-badge red');
    R.updateMatchDisplay(document, { fencerA: {}, fencerB: {} }, true);
    expect($('fencer-a-name').textContent).toBe('-');
    expect(() => R.updateMatchDisplay(document, null, true)).not.toThrow();
  });

  it('cardsHtml : valeurs inconnues ignorées, lettres, échappement', () => {
    const esc2 = (s: string) => `[${s}]`;
    expect(R.cardsHtml(['white', 'yellow', 'red', 'black', 'p-red', 'bogus'], esc2)).toBe(
      '<div class="card card-[white]">B</div><div class="card card-[yellow]">J</div>' +
        '<div class="card card-[red]">R</div><div class="card card-[black]">N</div>' +
        '<div class="card card-[p-red]">P</div>'
    );
    expect(R.cardsHtml(['<x>'], esc)).toBe('');
  });

  it('updateCardsDisplay : inversion échange les côtés', () => {
    R.updateCardsDisplay(document, esc, ['yellow'], ['red'], false);
    expect($('fencer-a-cards').textContent).toBe('R');
    R.updateCardsDisplay(document, esc, ['yellow'], ['red'], true);
    expect($('fencer-a-cards').textContent).toBe('J');
  });

  it('timerClasses : statut + alerte', () => {
    expect(R.timerClasses(120, 'idle')).toEqual(['timer-display']);
    expect(R.timerClasses(25, 'running')).toEqual(['timer-display', 'running', 'warning']);
    expect(R.timerClasses(10, 'paused')).toEqual(['timer-display', 'paused', 'danger']);
  });

  it('updateTimerDisplay : délègue le rendu puis pose les classes', () => {
    const calls: number[] = [];
    R.updateTimerDisplay(
      document,
      { renderTimer: (_e: unknown, s: number) => calls.push(s) },
      8,
      'running'
    );
    expect(calls).toEqual([8]);
    expect($('timer-display').className).toBe('timer-display running danger');
  });

  it('suddenDeathFlags + bannières', () => {
    expect(R.suddenDeathFlags(false, 'supplementary')).toEqual({
      supplementary: false,
      challenger: false,
    });
    expect(R.suddenDeathFlags(true, 'challenger_supplementary')).toEqual({
      supplementary: true,
      challenger: true,
    });
    R.updateSuddenDeathBanner(document, true, 'challenger');
    expect($('sudden-death-banner').classList.contains('active')).toBe(false);
    expect($('mort-subite-banner').classList.contains('active')).toBe(true);
    R.updateSuddenDeathBanner(document, false, null);
    expect($('mort-subite-banner').classList.contains('active')).toBe(false);
  });

  it('arena.html charge le module', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'arena.html'), 'utf8');
    expect(html).toContain('<script src="/js/arenaRender.js"></script>');
    expect(html).not.toContain("getElementById('match-status')");
  });
});
