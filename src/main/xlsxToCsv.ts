/**
 * BellePoule Modern - Conversion XLSX → CSV (première feuille) (#1211)
 * Lecture minimale d'un classeur Office Open XML (JSZip) : chaînes partagées,
 * chaînes en ligne, nombres. Les dates restent en numéro de série Excel.
 * Licensed under GPL-3.0
 */

import JSZip from 'jszip';
import { checkZipEntries } from './pathAuthorization';

const decodeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

/** Texte d'un nœud <si> / <is> : concaténation des <t> (hors annotations phonétiques <rPh>) */
const richText = (xml: string): string =>
  [
    ...xml
      .replace(/<(\w+:)?rPh\b[\s\S]*?<\/(\w+:)?rPh>/g, '')
      .matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g),
  ]
    .map(m => decodeXml(m[1]))
    .join('');

/** « AB12 » → 27 (index de colonne base 0) */
const columnIndex = (ref: string): number => {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** Lignes de la première feuille d'un classeur .xlsx */
export async function xlsxToRows(buffer: Buffer): Promise<string[][]> {
  const zip = await JSZip.loadAsync(buffer);
  const names = checkZipEntries(zip);
  const sheets = names.filter(n => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort();
  const sheetName = sheets.includes('xl/worksheets/sheet1.xml')
    ? 'xl/worksheets/sheet1.xml'
    : sheets[0];
  if (!sheetName) throw new Error('Classeur XLSX invalide : aucune feuille');

  const sstXml = (await zip.file('xl/sharedStrings.xml')?.async('string')) ?? '';
  const shared = [...sstXml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m =>
    richText(m[1])
  );

  const sheetXml = await zip.file(sheetName)!.async('string');
  const rows: string[][] = [];
  for (const rowMatch of sheetXml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const row: string[] = [];
    let next = 0;
    for (const c of rowMatch[1].matchAll(
      /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g
    )) {
      const attrs = c[1];
      const body = c[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/i.exec(attrs)?.[1];
      const col = ref ? columnIndex(ref) : next;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const raw = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1] ?? '';
      let value: string;
      if (type === 's') value = shared[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = richText(body);
      else value = decodeXml(raw);
      while (row.length < col) row.push('');
      row[col] = value;
      next = col + 1;
    }
    rows.push(row);
  }
  return rows;
}

/** CSV séparé par « ; » (format des exports français, lu par les parseurs d'import) */
export function rowsToCsv(rows: string[][]): string {
  const cell = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map(r => r.map(cell).join(';')).join('\n');
}

export async function xlsxToCsv(buffer: Buffer): Promise<string> {
  return rowsToCsv(await xlsxToRows(buffer));
}
