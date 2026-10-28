// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadDESignatures, PDF_DIALOG_INIT, SCORE_EDIT_INIT } from './tableauDialogState';
import type { TableauMatch } from './tableauTypes';

const m = (id: string, a: string, b: string) =>
  ({ id, fencerA: { id: a }, fencerB: { id: b } }) as unknown as TableauMatch;

afterEach(() => {
  delete (window as any).electronAPI;
});

describe('tableauDialogState', () => {
  it('états initiaux', () => {
    expect(SCORE_EDIT_INIT.showScoreModal).toBe(false);
    expect(PDF_DIALOG_INIT.pdfMode).toBe('pdf');
    expect(PDF_DIALOG_INIT.selectedRounds.size).toBe(0);
  });

  it('loadDESignatures associe signature au bon côté', async () => {
    (window as any).electronAPI = {
      db: {
        getDEMatchSignaturesByMatchIds: vi.fn().mockResolvedValue([
          { matchId: 'm1', fencerId: 'b', signatureData: 'SB' },
          { matchId: 'm1', fencerId: 'zz', signatureData: 'X' },
          { matchId: 'nope', fencerId: 'a', signatureData: 'Y' },
        ]),
      },
    };
    expect(await loadDESignatures([m('m1', 'a', 'b')])).toEqual({ m1: { B: 'SB' } });
  });

  it('retourne undefined sans lignes ou en cas d erreur', async () => {
    expect(await loadDESignatures([m('m1', 'a', 'b')])).toBeUndefined();
    (window as any).electronAPI = {
      db: { getDEMatchSignaturesByMatchIds: vi.fn().mockRejectedValue(new Error('x')) },
    };
    expect(await loadDESignatures([m('m1', 'a', 'b')])).toBeUndefined();
  });
});
