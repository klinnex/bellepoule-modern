import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const savePDF = vi.hoisted(() => vi.fn(async (_html: string, _name: string) => {}));
vi.mock('./core', async orig => ({ ...(await orig<typeof import('./core')>()), savePDF }));

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

describe('exportPoolsAndTableauxNoSignaturePDF – modèles (#1712)', () => {
  beforeEach(() => {
    savePDF.mockClear();
    vi.stubGlobal('localStorage', { getItem: () => null });
  });

  it('les feuilles de poule gardent leur contenu avec le modèle poule', async () => {
    await exportPoolsAndTableauxNoSignaturePDF({
      pools: [makePool()],
      tableauMatches: [],
      consolationBrackets: [],
      competitionTitle: 'Test',
      poolTemplate: buildDefaultTemplate('pool'),
    });
    expect(savePDF).toHaveBeenCalledTimes(1);
    const html = savePDF.mock.calls[0][0];
    expect(html).toContain('score-grid');
    expect(html).toContain('class="meta-row"');
    expect(html).not.toContain('ranking-table');
  });

  it('aucun repère OCR dans l’export sans signature', async () => {
    await exportPoolsAndTableauxNoSignaturePDF({
      pools: [makePool()],
      tableauMatches: [],
      consolationBrackets: [],
      competitionTitle: 'Test',
    });
    expect(savePDF.mock.calls[0][0]).not.toContain('class="ocr-corner');
  });
});

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

describe('exportFullCompetitionPDF – coins OCR (#1712)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pas de cadre OCR fixe répété sur toutes les pages du dossier', async () => {
    savePDF.mockClear();
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('window', {});
    await exportFullCompetitionPDF({
      fencers: [],
      pools: [makePool()],
      overallRanking: [],
      tableauMatches: [deMatch],
      consolationBrackets: [],
      finalResults: [],
      competitionTitle: 'Open',
    });
    const html = savePDF.mock.calls[0][0];
    expect(html).toContain('<table class="score-grid">');
    expect(html).not.toContain('class="ocr-corner');
  });
});
