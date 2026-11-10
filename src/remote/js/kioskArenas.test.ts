/**
 * Module kiosque /js/kioskArenas.js (#1401) : changements de score des pistes et gabarit des cartes.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const K = req('./kioskArenas.js');

const esc = (v: unknown) =>
  v == null
    ? ''
    : String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
const tk = (k: string) => `[${k}]`;
const ctx = { tk, escHtml: esc, arenaLabel: 'Piste' };
const arena = (id: string, scoreA: unknown, scoreB: unknown, extra = {}) => ({
  id,
  status: 'in_progress',
  currentMatch: {
    scoreA,
    scoreB,
    fencerA: { lastName: 'Dupont', firstName: 'Ann', club: 'CE' },
    fencerB: { lastName: 'Martin', firstName: 'Bob', club: 'CF' },
  },
  ...extra,
});

describe('kioskArenas.js scores', () => {
  it('detectScoreChanges : changement, slash à +3, rien sans historique', () => {
    const prev = { p1: { scoreA: 1, scoreB: 2 }, p2: { scoreA: 0, scoreB: 0 } };
    const r = K.detectScoreChanges([arena('p1', 4, 2), arena('p2', 0, 1), arena('p3', 5, 5)], prev);
    expect(r.changed).toEqual(['sa-p1', 'sb-p2']);
    expect(r.slash).toEqual(['sa-p1']);
  });

  it('detectScoreChanges : scores non numériques, piste sans match ou sans id', () => {
    const prev = { p1: { scoreA: null, scoreB: null } };
    const r = K.detectScoreChanges(
      [arena('p1', 3, null), { id: 'p1', currentMatch: null }, { currentMatch: {} }],
      prev
    );
    expect(r.changed).toEqual(['sa-p1']);
    expect(r.slash).toEqual([]);
  });

  it('snapshotScores : null sans match, pistes sans id ignorées', () => {
    const s = K.snapshotScores([
      arena('p1', 3, undefined),
      { arenaId: 'p2', currentMatch: null },
      { currentMatch: {} },
    ]);
    expect(s).toEqual({ p1: { scoreA: 3, scoreB: null }, p2: { scoreA: null, scoreB: null } });
  });
});

describe('kioskArenas.js gabarit', () => {
  it('piste libre : en attente, aucun match', () => {
    const html = K.renderArenasHtml([{ id: '2', currentMatch: null }], ctx);
    expect(html).toContain('Piste 2');
    expect(html).toContain('[kiosk.status_waiting]');
    expect(html).toContain('[kiosk.no_assigned]');
  });

  it('match en cours : B rouge à gauche, A vert à droite', () => {
    const html = K.renderArenasHtml([arena('1', 7, 3)], ctx);
    expect(html).toContain('arena-card match-active');
    expect(html).toContain('[kiosk.status_ongoing]');
    expect(html.indexOf('Martin Bob')).toBeLessThan(html.indexOf('Dupont Ann'));
    expect(html).toContain('score-red" id="sb-1">3');
    expect(html).toContain('score-green" id="sa-1">7');
  });

  it('inversion : permutation des côtés et des couleurs', () => {
    const html = K.renderArenasHtml([arena('1', 7, 3, { swapped: true })], ctx);
    expect(html.indexOf('Dupont Ann')).toBeLessThan(html.indexOf('Martin Bob'));
    expect(html).toContain('score-green" id="sa-1">7');
    expect(html.indexOf('id="sa-1"')).toBeLessThan(html.indexOf('id="sb-1"'));
  });

  it('assigné (pas en cours) et score absent', () => {
    const html = K.renderArenasHtml([arena('1', undefined, undefined, { status: 'ready' })], ctx);
    expect(html).toContain('[kiosk.status_assigned]');
    expect(html).not.toContain('match-active');
    expect(html).toContain('—');
  });

  it('XSS : noms, clubs et identifiants échappés', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const html = K.renderArenasHtml(
      [
        {
          id: evil,
          status: 'in_progress',
          currentMatch: {
            scoreA: evil,
            scoreB: 0,
            fencerA: { lastName: evil, club: evil },
            fencerB: evil,
          },
        },
      ],
      ctx
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('kiosk.html charge le module et délègue', () => {
    const html =
      fs.readFileSync(path.join(__dirname, '..', 'kiosk.html'), 'utf8') +
      fs.readFileSync(path.join(__dirname, 'kioskApp.js'), 'utf8'); // page + script extrait (#1600)
    expect(html).toContain('<script src="/js/kioskArenas.js"></script>');
    expect(html).toContain('KioskArenas.renderArenasHtml(');
    expect(html).not.toContain('class="arena-matchup"');
  });
});
