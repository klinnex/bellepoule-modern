// @vitest-environment jsdom
/**
 * Cartons sur les feuilles imprimées : poule et match de tableau (#1829)
 * Contenu relu par DOMParser (jsdom) : pas d'analyse du HTML par regex.
 */
import { describe, it, expect } from 'vitest';
import { hasCards, renderCardTally, tallyCards } from './matchCardsPdf';
import { generatePoolHTML } from './poolPdf';
import { generateTableauHTML, type TableauMatchForPDF } from './tableauPdf';
import { MatchStatus, type Fencer, type Match, type Pool } from '../../types';

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');
/** Lettres des pastilles, groupe standard puis groupe P */
const badges = (root: Element | null) => ({
  std: [...(root?.querySelectorAll('.pdf-cards-std .pdf-card') ?? [])].map(e => e.textContent),
  p: [...(root?.querySelectorAll('.pdf-cards-p .pdf-card') ?? [])].map(e => e.textContent),
  counts: [...(root?.querySelectorAll('.pdf-card-count') ?? [])].map(e => e.textContent),
});

describe('matchCardsPdf (#1829)', () => {
  it('tallyCards : chaque type compté, types inconnus ignorés', () => {
    expect(
      tallyCards(['yellow', 'red', 'red', 'p-red', 'p-black', 'black', 'white', 'bogus'])
    ).toEqual({ white: 1, yellow: 1, red: 2, black: 1, pRed: 1, pBlack: 1 });
    expect(hasCards(tallyCards(undefined))).toBe(false);
    expect(hasCards(tallyCards(['p-red']))).toBe(true);
  });

  it('renderCardTally : jaune, rouge (nombre), noir, puis cartons P à part', () => {
    const d = doc(
      `<div id="c">${renderCardTally(tallyCards(['red', 'yellow', 'p-red', 'red', 'black', 'p-black']))}</div>`
    );
    const c = d.getElementById('c');
    expect(badges(c)).toEqual({ std: ['J', 'R', 'N'], p: ['P-R', 'P-N'], counts: ['×2'] });
    expect(c?.querySelector('.pdf-cards-sep')).not.toBeNull();
    expect(renderCardTally(tallyCards([]))).toBe('');
    // Cartons P seuls : pas de séparateur
    const onlyP = doc(`<div id="c">${renderCardTally(tallyCards(['p-red']))}</div>`);
    expect(onlyP.querySelector('.pdf-cards-sep')).toBeNull();
    expect(badges(onlyP.getElementById('c')).p).toEqual(['P-R']);
  });
});

describe('feuille de poule : cartons par tireur (#1829)', () => {
  const fencer = (id: string, lastName: string) =>
    ({ id, lastName, firstName: 'X' }) as unknown as Fencer;
  const pool = (): Pool => {
    const a = fencer('a', 'Alpha');
    const b = fencer('b', 'Bravo');
    const c = fencer('c', '<Charlie>');
    const m = { id: 'm1', fencerA: a, fencerB: b, status: MatchStatus.NOT_STARTED } as Match;
    return { id: 'p1', number: 1, fencers: [a, b, c], matches: [m] } as unknown as Pool;
  };

  it('section Cartons : un tireur par ligne, seulement ceux qui en ont reçu', () => {
    const d = doc(
      generatePoolHTML(pool(), {
        cards: { a: ['yellow', 'red', 'p-red'], c: ['red', 'red', 'black'] },
      })
    );
    const rows = [...d.querySelectorAll('table.pool-cards tr')];
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.num-cell')?.textContent).toBe('1');
    expect(rows[0].querySelector('.name-cell')?.textContent).toBe('ALPHA X');
    expect(badges(rows[0].querySelector('.cards-cell'))).toEqual({
      std: ['J', 'R'],
      p: ['P-R'],
      counts: [],
    });
    // Nom échappé, numéro du tireur dans la poule
    expect(rows[1].querySelector('.num-cell')?.textContent).toBe('3');
    expect(rows[1].querySelector('.name-cell')?.textContent).toBe('<CHARLIE> X');
    expect(badges(rows[1].querySelector('.cards-cell'))).toEqual({
      std: ['R', 'N'],
      p: [],
      counts: ['×2'],
    });
  });

  it('sans carton : pas de section Cartons', () => {
    const d = doc(generatePoolHTML(pool(), {}));
    expect(d.querySelector('table.pool-cards')).toBeNull();
    expect(
      doc(generatePoolHTML(pool(), { cards: { a: [] } })).querySelector('.pool-cards')
    ).toBeNull();
  });
});

describe('feuille de match de tableau : cartons par tireur (#1829)', () => {
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

  it('colonne Cartons : cartons de A et de B sur leur ligne', () => {
    const d = render({ d1: { A: ['yellow', 'p-red'], B: ['red', 'red', 'p-black'] } });
    const headers = [...d.querySelectorAll('.match-table thead th')].map(t => t.textContent);
    expect(headers).toContain('Cartons');
    expect(badges(d.querySelector('.row-a .cards-box'))).toEqual({
      std: ['J'],
      p: ['P-R'],
      counts: [],
    });
    expect(badges(d.querySelector('.row-b .cards-box'))).toEqual({
      std: ['R'],
      p: ['P-N'],
      counts: ['×2'],
    });
  });

  it('sans carton enregistré : cases vides (à remplir à la main)', () => {
    const d = render();
    expect(d.querySelector('.row-a .cards-box')?.innerHTML).toBe('');
    expect(d.querySelector('.row-b .cards-box')?.innerHTML).toBe('');
    expect(render({ autre: { A: ['red'] } }).querySelector('.row-a .pdf-card')).toBeNull();
  });
});
