/**
 * Écriture d'un classeur .xlsx (Mode Club : export inventaire) relu par le lecteur d'import.
 */
import { describe, it, expect } from 'vitest';
import { rowsToXlsx, xlsxToRows } from './xlsxToCsv';

describe('rowsToXlsx', () => {
  it('aller-retour : texte avec caractères spéciaux, nombres et cellules vides', async () => {
    const grid = [
      ['Nom', 'Prix (€)', 'Notes'],
      ['Masque <A> & "B"', 12.5, ''],
      ['Gant\nligne 2', 3, 'à vérifier'],
    ];
    const buf = await rowsToXlsx(grid, 'Inventaire');
    const rows = await xlsxToRows(buf);
    expect(rows[0]).toEqual(['Nom', 'Prix (€)', 'Notes']);
    expect(rows[1][0]).toBe('Masque <A> & "B"');
    expect(rows[1][1]).toBe('12.5');
    expect(rows[2][0]).toBe('Gant\nligne 2');
    expect(rows[2][2]).toBe('à vérifier');
  });

  it('retire les caractères interdits en XML', async () => {
    const rows = await xlsxToRows(await rowsToXlsx([['a\u0001b']]));
    expect(rows[0][0]).toBe('ab');
  });
});
