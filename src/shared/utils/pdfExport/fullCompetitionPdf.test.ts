import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  exportPoolsAndTableauxNoSignaturePDF,
  exportFullCompetitionPDF,
} from './fullCompetitionPdf';
import { generatePoolHTML } from './poolPdf';
import { generateTableauHTML, type TableauMatchForPDF } from './tableauPdf';
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

const deMatch: TableauMatchForPDF = {
  id: 'd1',
  round: 2,
  position: 1,
  fencerA: { id: 'a', lastName: 'Alpha', firstName: 'A' },
  fencerB: { id: 'b', lastName: 'Bravo', firstName: 'B' },
  scoreA: null,
  scoreB: null,
  winner: null,
  isBye: false,
};

function stubElectron() {
  const saveFile = vi.fn().mockResolvedValue({ filePath: '/tmp/x.pdf' });
  const printHtmlToPDF = vi.fn().mockResolvedValue({ success: true });
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.stubGlobal('window', { electronAPI: { dialog: { saveFile }, file: { printHtmlToPDF } } });
  return printHtmlToPDF;
}

describe('modèle PDF d’un autre type ignoré (#1712)', () => {
  it('poule : un modèle « classement » ne vide pas la grille', () => {
    const html = generatePoolHTML(makePool(), {}, buildDefaultTemplate('ranking'));
    expect(html).toContain('class="score-grid"');
  });

  it('tableau : un modèle « classement » ne vide pas les feuilles de match', () => {
    const html = generateTableauHTML([deMatch], 4, 'T', undefined, buildDefaultTemplate('ranking'));
    expect(html).toContain('ALPHA');
  });

  it('poule : titre personnalisé d’un modèle « classement » ignoré', () => {
    const tpl = { ...buildDefaultTemplate('ranking'), customTitle: 'Classement X' };
    expect(generatePoolHTML(makePool(), { title: 'Poule 1' }, tpl)).not.toContain('Classement X');
  });
});

describe('exportPoolsAndTableauxNoSignaturePDF (#1712)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('corps des poules et tableaux présent, sans coins OCR', async () => {
    const printHtmlToPDF = stubElectron();
    await exportPoolsAndTableauxNoSignaturePDF({
      pools: [makePool()],
      tableauMatches: [deMatch],
      consolationBrackets: [],
      competitionTitle: 'Open',
      poolTemplate: buildDefaultTemplate('pool'),
      tableauTemplate: buildDefaultTemplate('tableau'),
    });
    const html = printHtmlToPDF.mock.calls[0][0] as string;
    expect(html).toContain('<table class="score-grid">');
    expect(html).toContain('ALPHA');
    expect(html).not.toContain('class="ocr-corner');
  });
});

describe('exportFullCompetitionPDF – coins OCR (#1712)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pas de cadre OCR fixe répété sur toutes les pages du dossier', async () => {
    const printHtmlToPDF = stubElectron();
    await exportFullCompetitionPDF({
      fencers: [],
      pools: [makePool()],
      overallRanking: [],
      tableauMatches: [deMatch],
      consolationBrackets: [],
      finalResults: [],
      competitionTitle: 'Open',
    });
    const html = printHtmlToPDF.mock.calls[0][0] as string;
    expect(html).toContain('<table class="score-grid">');
    expect(html).not.toContain('class="ocr-corner');
  });
});
