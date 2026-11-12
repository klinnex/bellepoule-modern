import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generatePoolHTML,
  exportMultiplePoolsToPDF,
  printMultiplePoolsHTML,
  allPoolsFileName,
} from './poolPdf';
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

describe("generatePoolHTML – piste dans l'en-tête (#1653)", () => {
  it('affiche le numéro de piste sans saisie distante (pas de QR)', () => {
    const html = generatePoolHTML(makePool(), { stripNumber: 3 });
    expect(html).toContain('doc-header-strip-qr');
    expect(html).toContain('<span>Piste 3</span>');
    expect(html).not.toContain('alt="QR"');
  });

  it("n'affiche aucun bloc piste sans numéro", () => {
    expect(generatePoolHTML(makePool(), {})).not.toContain('class="doc-header-strip-qr"');
  });

  it('affiche le QR avec le numéro quand la saisie distante est active', () => {
    const html = generatePoolHTML(makePool(), {
      stripNumber: 7,
      stripQrDataUrl: 'data:image/png;base64,QR',
    });
    expect(html).toContain('<img src="data:image/png;base64,QR" alt="QR" />');
    expect(html).toContain('<span>Piste 7</span>');
  });

  it("centre le bloc piste dans la barre d'en-tête", () => {
    const html = generatePoolHTML(makePool(), { stripNumber: 1 });
    expect(html).toContain('.doc-header { position: relative; }');
    expect(html).toContain('left: 50%;');
  });
});

describe('generatePoolHTML – repères OCR (#1712)', () => {
  it('pas de cadre OCR bas-droit sans QR (export complet)', () => {
    expect(generatePoolHTML(makePool(), {})).not.toContain('class="ocr-corner');
  });

  it('cadre OCR et QR présents sur une feuille avec QR', () => {
    const html = generatePoolHTML(makePool(), { qrDataUrl: 'data:image/png;base64,AAAA' });
    expect(html).toContain('class="ocr-corner ocr-br"');
    expect(html).toContain('data:image/png;base64,AAAA');
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

describe('printMultiplePoolsHTML – une seule fenêtre (#1413)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("toutes les feuilles dans un seul appel d'impression", async () => {
    const printHtml = vi.fn().mockResolvedValue({ success: true });
    vi.stubGlobal('window', { electronAPI: { file: { printHtml } } });
    const p1 = makePool();
    const p2 = { ...makePool(), id: 'p2', number: 2 } as Pool;
    await printMultiplePoolsHTML([p1, p2], 'T', undefined, undefined, 'Open');
    expect(printHtml).toHaveBeenCalledTimes(1);
    const html = printHtml.mock.calls[0][0] as string;
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
