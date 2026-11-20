// @vitest-environment jsdom
/**
 * Cartons sur la feuille de match de tableau (#1829) : mêmes libellés et même décompte que la
 * feuille de poule (poolPdf.ts), cartons P à part (t.124.3.e).
 * Contenu relu par DOMParser (jsdom) : pas d'analyse du HTML par regex.
 */
import { describe, it, expect } from 'vitest';
import { generatePoolHTML } from './poolPdf';
import { generateTableauHTML, matchCardsCellHTML, type TableauMatchForPDF } from './tableauPdf';
import { MatchStatus, type Fencer, type Match, type Pool } from '../../types';

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');
/** Texte des deux groupes d'une case : cartons de faute, cartons P */
const groups = (root: Element | null) => ({
  std: root?.querySelector('.cards-std')?.textContent ?? null,
  p: root?.querySelector('.cards-p')?.textContent ?? null,
});

describe('matchCardsCellHTML (#1829)', () => {
  it('cartons de faute (avec leur nombre) puis cartons P à part', () => {
    const cell = doc(
      `<div id="c">${matchCardsCellHTML(['red', 'yellow', 'p-red', 'red', 'black', 'p-black'])}</div>`
    ).getElementById('c');
    expect(groups(cell)).toEqual({ std: 'Rouge ×2, Jaune, Noir', p: 'Rouge P, Noir P' });
  });

  it('un seul groupe quand il n’y a que des cartons de faute ou que des cartons P', () => {
    expect(groups(doc(`<div>${matchCardsCellHTML(['yellow'])}</div>`).body)).toEqual({
      std: 'Jaune',
      p: null,
    });
    expect(groups(doc(`<div>${matchCardsCellHTML(['p-yellow'])}</div>`).body)).toEqual({
      std: null,
      p: 'Jaune P',
    });
  });

  it('sans carton : chaîne vide', () => {
    expect(matchCardsCellHTML(undefined)).toBe('');
    expect(matchCardsCellHTML([])).toBe('');
  });
});

describe('feuille de match de tableau : colonne « Cartons » (#1829)', () => {
  const match: TableauMatchForPDF = {
    id: 'd1',
    round: 8,
    position: 1,
    fencerA: { id: 'a', lastName: 'Alpha', firstName: 'A' },
    fencerB: { id: 'b', lastName: 'Beta', firstName: 'B' },
    scoreA: null,
    scoreB: null,
    winner: null,
    isBye: false,
  };
  const render = (cards?: Record<string, { A?: string[]; B?: string[] }>) =>
    doc(generateTableauHTML([match], 4, 'T', undefined, undefined, false, undefined, { cards }));

  it('cartons de A et de B sur leur ligne, entre score et signature', () => {
    const d = render({ d1: { A: ['yellow', 'p-red'], B: ['red', 'red', 'p-black'] } });
    const headers = [...d.querySelectorAll('.match-table thead th')].map(t => t.textContent);
    expect(headers.slice(-3)).toEqual(['Score', 'Cartons', 'Signature']);
    expect(groups(d.querySelector('.row-a .cards-box'))).toEqual({ std: 'Jaune', p: 'Rouge P' });
    expect(groups(d.querySelector('.row-b .cards-box'))).toEqual({ std: 'Rouge ×2', p: 'Noir P' });
  });

  it('sans carton enregistré : cases vides (à remplir à la main)', () => {
    const d = render();
    expect(d.querySelector('.row-a .cards-box')?.innerHTML).toBe('');
    expect(d.querySelector('.row-b .cards-box')?.innerHTML).toBe('');
    const other = render({ autre: { A: ['red'] } });
    expect(other.querySelector('.row-a .cards-box')?.innerHTML).toBe('');
  });
});

describe('feuille de poule et feuille de match : mêmes libellés (#1829)', () => {
  const fencer = (id: string, lastName: string) =>
    ({ id, lastName, firstName: 'X' }) as unknown as Fencer;
  const pool = (types: string[]): Pool => {
    const a = fencer('a', 'Alpha');
    const b = fencer('b', 'Bravo');
    const m = {
      id: 'm1',
      fencerA: a,
      fencerB: b,
      status: MatchStatus.FINISHED,
      cards: types.map((type, i) => ({ id: `c${i}`, matchId: 'm1', fencerId: 'a', type })),
    } as unknown as Match;
    return { id: 'p1', number: 1, fencers: [a, b], matches: [m] } as unknown as Pool;
  };
  const types = ['yellow', 'red', 'red', 'p-red', 'p-black'];

  it('une seule section « Cartons » sur la feuille de poule', () => {
    const d = doc(generatePoolHTML(pool(types), {}));
    expect(d.querySelectorAll('table.pool-cards-table')).toHaveLength(1);
    const labels = [...d.querySelectorAll('.section-label')].map(e => e.textContent);
    expect(labels.filter(l => l === 'Cartons')).toHaveLength(1);
    // Une ligne par tireur sanctionné, pas de second rendu des mêmes cartons
    expect(d.querySelectorAll('table.pool-cards-table tbody tr')).toHaveLength(1);
    expect(d.body.textContent?.match(/Rouge P/g)).toHaveLength(1);
  });

  it('le décompte d’un tireur se lit de la même façon sur les deux feuilles', () => {
    const cells = [
      ...doc(generatePoolHTML(pool(types), {})).querySelectorAll('table.pool-cards-table tbody td'),
    ].map(td => td.textContent);
    const cell = doc(`<div>${matchCardsCellHTML(types)}</div>`).body;
    expect(cells).toEqual(['ALPHA X', groups(cell).std, groups(cell).p]);
  });
});
