// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  loadDECards,
  loadDESignatures,
  PDF_DIALOG_INIT,
  SCORE_EDIT_INIT,
} from './tableauDialogState';
import type { TableauMatch } from '../../../shared/domain/tableau/tableauTypes';

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

  it('loadDECards : id composite (saisie distante) ou id simple, rangés par côté (#1829)', async () => {
    const getCardsByMatchIds = vi.fn().mockResolvedValue([
      { matchId: 'comp-m1', fencerId: 'a', cardType: 'yellow' },
      { matchId: 'comp-m1', fencerId: 'a', cardType: 'p-red' },
      { matchId: 'm2', fencerId: 'd', cardType: 'red' },
      { matchId: 'm2', fencerId: 'zz', cardType: 'red' },
      { matchId: 'nope', fencerId: 'a', cardType: 'black' },
    ]);
    (window as unknown as { electronAPI: unknown }).electronAPI = { db: { getCardsByMatchIds } };
    expect(await loadDECards([m('m1', 'a', 'b'), m('m2', 'c', 'd')], 'comp')).toEqual({
      m1: { A: ['yellow', 'p-red'] },
      m2: { B: ['red'] },
    });
    expect(getCardsByMatchIds).toHaveBeenCalledWith(['m1', 'comp-m1', 'm2', 'comp-m2']);
  });

  it('loadDECards : match saisi à distance, lignes sous l’id simple ignorées (pas de doublon)', async () => {
    const getCardsByMatchIds = vi.fn().mockResolvedValue([
      { matchId: 'comp-m1', fencerId: 'a', cardType: 'yellow' },
      { matchId: 'm1', fencerId: 'a', cardType: 'yellow' },
    ]);
    (window as unknown as { electronAPI: unknown }).electronAPI = { db: { getCardsByMatchIds } };
    expect(await loadDECards([m('m1', 'a', 'b')], 'comp')).toEqual({ m1: { A: ['yellow'] } });
  });

  it('loadDECards : undefined sans carton ou en cas d erreur', async () => {
    expect(await loadDECards([m('m1', 'a', 'b')], 'comp')).toBeUndefined();
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      db: { getCardsByMatchIds: vi.fn().mockRejectedValue(new Error('x')) },
    };
    expect(await loadDECards([m('m1', 'a', 'b')], 'comp')).toBeUndefined();
  });

  it('retourne undefined sans lignes ou en cas d erreur', async () => {
    expect(await loadDESignatures([m('m1', 'a', 'b')])).toBeUndefined();
    (window as any).electronAPI = {
      db: { getDEMatchSignaturesByMatchIds: vi.fn().mockRejectedValue(new Error('x')) },
    };
    expect(await loadDESignatures([m('m1', 'a', 'b')])).toBeUndefined();
  });
});
