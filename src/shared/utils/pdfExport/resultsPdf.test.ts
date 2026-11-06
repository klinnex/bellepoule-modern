/**
 * Tests - Export PDF des résultats finaux (#1214)
 */

import { describe, it, expect } from 'vitest';
import { generateResultsHTML, type FinalResultForPDF } from './resultsPdf';
import { buildDefaultTemplate } from '../../types/pdfTemplate.types';
import { Fencer, FencerStatus } from '../../types';

const result = (rank: number, lastName: string): FinalResultForPDF => ({
  rank,
  fencer: {
    id: lastName,
    lastName,
    firstName: 'Prénom',
    club: 'Club',
    status: FencerStatus.QUALIFIED,
  } as Fencer,
  eliminatedAt: 'T8',
});

describe('generateResultsHTML', () => {
  const results = [result(1, 'Dupont'), result(2, 'Martin')];

  it('affiche le classement sans modèle', () => {
    const html = generateResultsHTML(results, 'Résultats');
    expect(html).toContain('DUPONT');
    expect(html).toContain('MARTIN');
  });

  it('affiche le classement avec le modèle « ranking » (feuille vide avant)', () => {
    const html = generateResultsHTML(
      results,
      'Résultats',
      undefined,
      buildDefaultTemplate('ranking')
    );
    expect(html).toContain('<tbody>');
    expect(html).toContain('DUPONT');
    expect(html).toContain('MARTIN');
  });

  it('masque la table si l’élément est masqué dans le modèle', () => {
    const tpl = buildDefaultTemplate('ranking');
    tpl.elements = tpl.elements.map(e => (e.id === 'ranking-table' ? { ...e, visible: false } : e));
    expect(generateResultsHTML(results, 'Résultats', undefined, tpl)).not.toContain('DUPONT');
  });
});
