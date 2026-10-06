import { describe, it, expect } from 'vitest';
import { generatePoolHTML } from './poolPdf';
import { buildDefaultTemplate } from '../../types/pdfTemplate.types';
import { MatchStatus, type Pool, type Fencer, type Match } from '../../types';

const fencer = (id: string, lastName: string) => ({ id, lastName, firstName: 'X' }) as unknown as Fencer;

function makePool(): Pool {
  const a = fencer('a', 'Alpha');
  const b = fencer('b', 'Bravo');
  const match = {
    id: 'm1',
    fencerA: a,
    fencerB: b,
    status: MatchStatus.NOT_STARTED,
  } as unknown as Match;
  return { id: 'p1', number: 1, fencers: [a, b], matches: [match] } as unknown as Pool;
}

describe('generatePoolHTML – options export (#932)', () => {
  it('affiche les colonnes statistiques par défaut', () => {
    const html = generatePoolHTML(makePool(), {});
    expect(html).toContain('>V/M</th>');
    expect(html).toContain('>Rg</th>');
  });

  it('masque V, V/M, TD, TR, Ind et Rg avec hideStatColumns', () => {
    const html = generatePoolHTML(makePool(), { hideStatColumns: true });
    for (const h of ['V', 'V/M', 'TD', 'TR', 'Ind', 'Rg']) {
      expect(html).not.toContain(`>${h}</th>`);
    }
    expect(html).toContain('Signature');
  });

  it('conserve les colonnes non statistiques (club) avec hideStatColumns', () => {
    const html = generatePoolHTML(makePool(), { hideStatColumns: true, visibleColumns: ['club', 'rank'] });
    expect(html).toContain('>Club</th>');
    expect(html).not.toContain('>Rg</th>');
  });

  it('applique le format paysage', () => {
    expect(generatePoolHTML(makePool(), { landscape: true })).toContain('size: A4 landscape');
    expect(generatePoolHTML(makePool(), {})).not.toContain('size: A4 landscape');
  });
});

describe('generatePoolHTML – couleurs du modèle (#992)', () => {
  it('la surcharge de couleurs suit le CSS de base (sinon écrasée)', () => {
    const tpl = buildDefaultTemplate('pool');
    tpl.colors = { navy: '#ff0000', gold: '#00ff00', green: '#0000ff' };
    const html = generatePoolHTML(makePool(), {}, tpl);
    const override = html.indexOf('--navy: #ff0000');
    expect(override).toBeGreaterThan(-1);
    expect(override).toBeGreaterThan(html.lastIndexOf('--navy:        #1a2e4a'));
  });

  it('couleur invalide ignorée (injection CSS)', () => {
    const tpl = buildDefaultTemplate('pool');
    tpl.colors = { navy: 'red;} body{display:none', gold: '#00ff00', green: '#0000ff' };
    const html = generatePoolHTML(makePool(), {}, tpl);
    expect(html).not.toContain('display:none');
  });
});
