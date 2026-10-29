import { describe, expect, it } from 'vitest';
import { generateRapieresRankingHTML } from './rapieresPdf';

describe('generateRapieresRankingHTML', () => {
  it('aligne les colonnes selon leur nature quand des colonnes sont masquées (#1279)', () => {
    const html = generateRapieresRankingHTML({
      title: 'T',
      subtitle: 'S',
      headers: ['Équipe', 'V'],
      rows: [['Les As', 3]],
      kinds: ['text', 'num'],
    });
    expect(html).toContain('<th style="text-align:left">Équipe</th>');
    expect(html).toContain('<td style="font-weight:600">Les As</td>');
    expect(html).toContain('<td style="text-align:center">3</td>');
  });

  it('garde la mise en page par défaut sans kinds', () => {
    const html = generateRapieresRankingHTML({
      title: 'T',
      subtitle: 'S',
      headers: ['Rg'],
      rows: [[1]],
    });
    expect(html).toContain('<th style="width:10mm">Rg</th>');
  });
});
