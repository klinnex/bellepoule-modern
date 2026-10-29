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

  it("reprend le style du classement après poules et colore l'indice (#1279)", () => {
    const html = generateRapieresRankingHTML({
      title: 'T',
      subtitle: 'S',
      headers: ['Rg', 'Équipe', 'Indice'],
      rows: [
        [1, 'Les As', '+3'],
        [2, 'Les Rois', '-2'],
      ],
      kinds: ['rank', 'text', 'index'],
    });
    expect(html).toContain('background: var(--navy)');
    expect(html).toContain('tr:nth-child(even) td');
    expect(html).toContain('color:var(--green)">+3');
    expect(html).toContain('color:#dc2626">-2');
  });
});
