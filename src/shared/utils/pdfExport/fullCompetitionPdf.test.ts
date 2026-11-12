import { describe, it, expect, vi, beforeEach } from 'vitest';

const savePDF = vi.hoisted(() => vi.fn(async (_html: string, _name: string) => {}));
vi.mock('./core', async orig => ({ ...(await orig<typeof import('./core')>()), savePDF }));

import { exportPoolsAndTableauxNoSignaturePDF } from './fullCompetitionPdf';
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
