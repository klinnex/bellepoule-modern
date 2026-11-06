// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printHTML } from './core';
import { printRankingHTML } from './rankingPdf';
import { printResultsHTML } from './resultsPdf';
import { printRapieresRanking } from '../../../features/rapieres/rapieresPdf';
import type { Fencer, PoolRanking } from '../../types';

const fencer = { id: 'a', lastName: 'Alpha', firstName: 'X', club: 'C' } as unknown as Fencer;

describe('impression via la boîte intégrée (#1214)', () => {
  let printHtml: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    printHtml = vi.fn().mockResolvedValue({ success: true });
    (window as any).electronAPI = { file: { printHtml } };
  });
  afterEach(() => {
    delete (window as any).electronAPI;
  });

  it('printHTML transmet le HTML à file.printHtml', async () => {
    await printHTML('<html>x</html>');
    expect(printHtml).toHaveBeenCalledWith('<html>x</html>');
  });

  it('printHTML : annulation = pas d’erreur, échec = erreur', async () => {
    printHtml.mockResolvedValueOnce({ success: true, canceled: true });
    await expect(printHTML('<html></html>')).resolves.toBeUndefined();
    printHtml.mockResolvedValueOnce({ success: false, error: 'imprimante' });
    await expect(printHTML('<html></html>')).rejects.toThrow('imprimante');
  });

  it('classement intermédiaire : imprime le HTML du classement', async () => {
    const ranking = [
      { rank: 1, fencer, victories: 1, defeats: 0, touchesScored: 5, touchesReceived: 0 },
    ] as unknown as PoolRanking[];
    await printRankingHTML(ranking, 'Classement Général');
    expect(printHtml.mock.calls[0][0]).toContain('ALPHA');
  });

  it('résultats finaux : imprime le HTML des résultats', async () => {
    await printResultsHTML([{ rank: 1, fencer }], 'Résultats');
    expect(printHtml.mock.calls[0][0]).toContain('ALPHA');
    await expect(printResultsHTML([])).rejects.toThrow();
  });

  it('rapières : imprime le tableau de classement', async () => {
    await printRapieresRanking({ title: 'T', subtitle: 'S', headers: ['Rg'], rows: [[1]] });
    expect(printHtml.mock.calls[0][0]).toContain('Rg');
  });
});
