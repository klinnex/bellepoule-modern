import { describe, it, expect, vi, afterEach } from 'vitest';
import { generatePoolHTML, exportMultiplePoolsToPDF, allPoolsFileName } from './poolPdf';
import { buildDefaultTemplate } from '../../types/pdfTemplate.types';
import { MatchStatus, type Pool, type Fencer, type Match } from '../../types';

const fencer = (id: string, lastName: string) =>
  ({ id, lastName, firstName: 'X' }) as unknown as Fencer;

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
    const html = generatePoolHTML(makePool(), {
      hideStatColumns: true,
      visibleColumns: ['club', 'rank'],
    });
    expect(html).toContain('>Club</th>');
    expect(html).not.toContain('>Rg</th>');
  });

  it('applique le format paysage', () => {
    expect(generatePoolHTML(makePool(), { landscape: true })).toContain('size: A4 landscape');
    expect(generatePoolHTML(makePool(), {})).not.toContain('size: A4 landscape');
  });
});

describe('exportMultiplePoolsToPDF – un seul PDF (#1413)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('nom par défaut « <compétition>-poules.pdf », caractères interdits remplacés', () => {
    expect(allPoolsFileName('Open de Paris')).toBe('Open de Paris-poules.pdf');
    expect(allPoolsFileName('A/B:C')).toBe('A_B_C-poules.pdf');
    expect(allPoolsFileName()).toBe('competition-poules.pdf');
  });

  it('toutes les poules dans un seul fichier, une seule boîte de dialogue', async () => {
    const saveFile = vi.fn().mockResolvedValue({ filePath: '/tmp/x.pdf' });
    const printHtmlToPDF = vi.fn().mockResolvedValue({ success: true });
    vi.stubGlobal('window', { electronAPI: { dialog: { saveFile }, file: { printHtmlToPDF } } });
    const p1 = makePool();
    const p2 = { ...makePool(), id: 'p2', number: 2 } as Pool;
    await exportMultiplePoolsToPDF([p1, p2], 'T', undefined, undefined, 'Open');
    expect(saveFile).toHaveBeenCalledTimes(1);
    expect(saveFile.mock.calls[0][0].defaultPath).toBe('Open-poules.pdf');
    expect(printHtmlToPDF).toHaveBeenCalledTimes(1);
    const html = printHtmlToPDF.mock.calls[0][0] as string;
    expect(html).toContain('pools-export-break');
    expect(html.match(/<!DOCTYPE html>/g)).toHaveLength(1);
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
