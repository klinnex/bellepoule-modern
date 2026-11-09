/**
 * Module arbitre /js/refereeLists.js (#1401) : liste des prochains matchs (filtre, fusion, gabarit).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const L = req('./refereeLists.js');

const esc = (v: unknown) =>
  v == null
    ? ''
    : String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
const T = (k: string) => `[${k}]`;
const m = (id: string, a: string, b: string, status = 'not_started', clubs: string[] = []) => ({
  id,
  status,
  fencerA: { lastName: a, firstName: 'Zoe', club: clubs[0] },
  fencerB: { lastName: b, firstName: 'Max', club: clubs[1] },
});

describe('refereeLists.js données', () => {
  it('pendingMatches : à jouer ou en cours seulement, réponse vide tolérée', () => {
    const data = {
      matches: [m('1', 'A', 'B'), m('2', 'C', 'D', 'in_progress'), m('3', 'E', 'F', 'finished')],
    };
    expect(L.pendingMatches(data).map((x: { id: string }) => x.id)).toEqual(['1', '2']);
    expect(L.pendingMatches({})).toEqual([]);
    expect(L.pendingMatches(null)).toEqual([]);
  });

  it('mergeMatches : ajoute les absents sans doublon', () => {
    const all = [m('1', 'A', 'B')];
    L.mergeMatches(all, [m('1', 'A', 'B'), m('2', 'C', 'D')]);
    expect(all.map(x => x.id)).toEqual(['1', '2']);
  });

  it('filterMatches : nom ou prénom, insensible à la casse, vide = tout', () => {
    const list = [m('1', 'Dupont', 'Martin'), m('2', 'Durand', 'Petit')];
    expect(L.filterMatches(list, '  ')).toBe(list);
    expect(L.filterMatches(list, 'DUR').map((x: { id: string }) => x.id)).toEqual(['2']);
    expect(L.filterMatches(list, 'max').length).toBe(2);
    expect(L.filterMatches(list, 'zzz')).toEqual([]);
  });
});

describe('refereeLists.js gabarit', () => {
  const ctx = { T, escHtml: esc, arenaNum: '3' };

  it('liste vide : message de fin et liens signature / journal de l’arène', () => {
    const html = L.renderNextMatchesHtml([], ctx);
    expect(html).toContain('[referee.all_done]');
    expect(html).toContain('href="/arene3/poule"');
    expect(html).toContain('href="/arene3/journal"');
  });

  it('numéro d’arène échappé', () => {
    const html = L.renderNextMatchesHtml([], { ...ctx, arenaNum: '"><script>' });
    expect(html).not.toContain('<script>');
  });

  it('cartes : noms, clubs, badge selon le statut, id en data-args', () => {
    const html = L.renderNextMatchesHtml(
      [m('m1', 'Dupont', 'Martin', 'in_progress', ['CE', 'CF']), m('m2', 'X', 'Y')],
      ctx
    );
    expect(html).toContain('Dupont');
    expect(html).toContain('CE · CF');
    expect(html).toContain('[referee.status_in_progress]');
    expect(html).toContain('background:var(--tw-amber-500)');
    expect(html).toContain('[referee.status_to_play]');
    expect(html).toContain('background:var(--blue-500)');
    expect(html).toContain('data-click="refereeApp.selectMatchFromNextScreen"');
    expect(html).toContain('data-args="[&quot;m1&quot;]"');
  });

  it('tireur inconnu : « ? » ; XSS échappé (noms, clubs, id)', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const html = L.renderNextMatchesHtml(
      [{ id: evil, status: 'not_started', fencerA: { lastName: evil, club: evil } }],
      ctx
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('?');
    expect(html).toContain('&lt;img');
  });

  it('referee.html charge le module et délègue', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'referee.html'), 'utf8');
    expect(html).toContain('<script src="/js/refereeLists.js"></script>');
    expect(html).toContain('BPRefereeLists.renderNextMatchesHtml(');
    expect(html).not.toContain('<div class="next-match-card-arrow">');
  });
});
