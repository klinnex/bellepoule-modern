import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { rowsToCsv, xlsxToRows } from './xlsxToCsv';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

async function buildXlsx(sheet: string, sst: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('xl/sharedStrings.xml', `<?xml version="1.0"?><x:sst xmlns:x="${NS}">${sst}</x:sst>`);
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0"?><x:worksheet xmlns:x="${NS}"><x:cols><x:col min="1" max="2"/></x:cols>` +
      `<x:sheetData>${sheet}</x:sheetData></x:worksheet>`
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('xlsxToCsv (#1211)', () => {
  it('lit chaînes partagées, chaînes en ligne, nombres et cellules manquantes', async () => {
    const buf = await buildXlsx(
      '<x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="C1" t="s"><x:v>1</x:v></x:c></x:row>' +
        '<x:row r="2"><x:c r="A2" s="4"><x:v>32514</x:v></x:c>' +
        '<x:c r="B2" t="inlineStr"><x:is><x:t>A &amp; B</x:t></x:is></x:c><x:c r="D2"/></x:row>',
      '<x:si><x:t>Nom</x:t></x:si><x:si><x:r><x:t>Pré</x:t></x:r><x:r><x:t>nom</x:t></x:r></x:si>'
    );
    expect(await xlsxToRows(buf)).toEqual([
      ['Nom', '', 'Prénom'],
      ['32514', 'A & B', '', ''],
    ]);
  });

  it('rowsToCsv protège séparateurs et guillemets', () => {
    expect(rowsToCsv([['a;b', 'c"d', 'e']])).toBe('"a;b";"c""d";e');
  });
});
