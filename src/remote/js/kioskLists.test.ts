/**
 * Module kiosque /js/kioskLists.js (#1401) : classement final depuis le tableau, matchs suivants.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const K = req('./kioskLists.js');
const tk = (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k);
const esc = (v: unknown) =>
  String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const noSort = (f: unknown[]) => f;
const fe = (id: string) => ({ id, lastName: id.toUpperCase(), firstName: 'x' });
const m = (a: string, b: string, winner?: string) => ({
  fencerA: fe(a),
  fencerB: fe(b),
  winnerId: winner,
});
type R = { rank: number; fencer: { id: string } };
const ids = (r: R[]) => r.map(x => `${x.rank}:${x.fencer.id}`);

describe('kioskLists.js computeFinalRanking', () => {
  it('finalResults de l’application prioritaires, triés par place', () => {
    const r = K.computeFinalRanking(
      { finalResults: [{ rank: 2 }, { rank: 1 }], rounds: [] },
      noSort
    );
    expect(r.ranked.map((x: { rank: number }) => x.rank)).toEqual([1, 2]);
  });

  it('non terminé : pas de tableau ou finale sans vainqueur', () => {
    expect(K.computeFinalRanking(null, noSort).ranked).toBeNull();
    expect(K.computeFinalRanking({ rounds: [] }, noSort).ranked).toBeNull();
    expect(
      K.computeFinalRanking({ rounds: [{ round: 2, matches: [m('a', 'b')] }] }, noSort).ranked
    ).toBeNull();
  });

  it('finale + petite finale + perdants des tours précédents', () => {
    const data = {
      rounds: [
        {
          round: 8,
          matches: [m('a', 'h', 'a'), m('d', 'e', 'd'), m('c', 'f', 'c'), m('b', 'g', 'b')],
        },
        { round: 4, matches: [m('a', 'd', 'a'), m('c', 'b', 'b')] },
        { round: 3, matches: [m('d', 'c', 'c')] },
        { round: 2, matches: [m('a', 'b', 'b')] },
      ],
    };
    const { ranked } = K.computeFinalRanking(data, (f: { id: string }[]) =>
      [...f].sort((x, y) => x.id.localeCompare(y.id))
    );
    expect(ids(ranked)).toEqual(['1:b', '2:a', '3:c', '4:d', '5:e', '6:f', '7:g', '8:h']);
  });

  it('sans petite finale : perdants de demi-finale classés 3e et 4e par tête de série', () => {
    const data = {
      rounds: [
        { round: 4, matches: [m('a', 'd', 'a'), m('c', 'b', 'b')] },
        { round: 2, matches: [m('a', 'b', 'a')] },
      ],
    };
    const { ranked } = K.computeFinalRanking(data, (f: { id: string }[]) =>
      [...f].sort((x, y) => y.id.localeCompare(x.id))
    );
    expect(ids(ranked)).toEqual(['1:a', '2:b', '3:d', '4:c']);
  });

  it('byes ignorés dans les tours principaux', () => {
    const data = {
      rounds: [
        { round: 8, matches: [{ ...m('a', 'h', 'a'), isBye: true }, m('d', 'e', 'd')] },
        { round: 4, matches: [m('a', 'd', 'a'), m('c', 'b', 'b')] },
        { round: 2, matches: [m('a', 'b', 'a')] },
      ],
    };
    const { ranked } = K.computeFinalRanking(data, noSort);
    expect(ids(ranked)).toEqual(['1:a', '2:b', '3:d', '4:c', '5:e']);
  });
});

describe('kioskLists.js HTML', () => {
  it('rankLabel : médailles puis rang', () => {
    expect(K.rankLabel(1)).toBe('🥇');
    expect(K.rankLabel(4)).toBe('4️⃣');
    expect(K.rankLabel(7)).toBe('7e');
  });

  it('finalTableHtml : ligne de tête et échappement', () => {
    const html = K.finalTableHtml(
      [
        { rank: 1, fencer: { lastName: '<b>', firstName: null, club: 'C' } },
        { rank: 2, fencer: { lastName: 'Z' } },
      ],
      tk,
      esc
    );
    expect(html).toContain('class="top-row"');
    expect(html).toContain('&lt;b&gt; ');
    expect(html).not.toContain('<b>');
    expect(html).toContain('—');
  });

  it('notDoneHtml', () => {
    expect(K.notDoneHtml(tk, esc)).toContain('kiosk.not_finished_long');
  });

  it('suivantsHtml : vide, regroupement par poule, en cours, initiales, échappement', () => {
    expect(K.suivantsHtml([], tk, esc)).toContain('kiosk.no_next_done');
    const html = K.suivantsHtml(
      [
        {
          poolNumber: 1,
          number: 4,
          status: 'in_progress',
          arenaName: 'Piste <1>',
          fencerA: { lastName: 'Aa', firstName: 'Zoé', club: 'CA' },
          fencerB: null,
        },
        { poolNumber: 1, number: 5, status: 'scheduled', fencerA: fe('b'), fencerB: fe('c') },
        { poolName: 'Libre', fencerA: fe('d'), fencerB: fe('e') },
        { fencerA: fe('f'), fencerB: fe('g') },
      ],
      tk,
      esc
    );
    expect(html.match(/suivants-pool-header/g)).toHaveLength(3);
    expect(html).toContain('suivants-row ongoing');
    expect(html).toContain('Aa Z.');
    expect(html).toContain('Piste &lt;1&gt;');
    expect(html).toContain('kiosk.status_upcoming');
    expect(html).toContain('kiosk.no_pool');
    expect(html).toContain('>?<');
  });

  it('kiosk.html charge le module', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'kiosk.html'), 'utf8');
    expect(html).toContain('<script src="/js/kioskLists.js"></script>');
    expect(html).not.toContain('function renderFinalTable');
  });
});
