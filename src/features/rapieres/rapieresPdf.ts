/**
 * BellePoule Modern - Tournoi des rapières : export PDF d'un classement (#1118)
 * Licensed under GPL-3.0
 */

import { BASE_CSS, pdfLang, printHTML, savePDF } from '../../shared/utils/pdfExport/core';
import { getActiveLocale } from '../../shared/utils/localeFormat';

export interface RapieresPdfTable {
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | number)[][];
}

const esc = (s: string | number) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Même mise en page que le classement après poules : rang en gras, textes à gauche, chiffres centrés */
const rankingCellStyle = (i: number) =>
  i === 0
    ? 'text-align:center;font-weight:700;color:var(--navy)'
    : i <= 3
      ? i === 1
        ? 'font-weight:600'
        : ''
      : 'text-align:center';

export function generateRapieresRankingHTML(table: RapieresPdfTable): string {
  const now = new Date().toLocaleDateString(getActiveLocale(), {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  return `<!DOCTYPE html>
<html lang="${pdfLang()}">
<head>
  <meta charset="UTF-8">
  <title>${esc(table.title)}</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <div class="doc-header">
    <div class="doc-header-left">
      <h1>${esc(table.title)}</h1>
      <div class="subtitle">${esc(table.subtitle)}</div>
    </div>
  </div>
  <div class="gold-bar"></div>
  <table>
    <thead><tr>${table.headers
      .map(
        (h, i) =>
          `<th style="${i === 0 ? 'width:10mm' : i <= 3 ? 'text-align:left' : ''}">${esc(h)}</th>`
      )
      .join('')}</tr></thead>
    <tbody>${table.rows
      .map(
        r =>
          `<tr>${r.map((c, i) => `<td style="${rankingCellStyle(i)}">${esc(c)}</td>`).join('')}</tr>`
      )
      .join('')}</tbody>
  </table>
  <div class="doc-footer">
    <span>BellePoule Modern</span>
    <span>${now}</span>
  </div>
</body>
</html>`;
}

export async function exportRapieresRankingToPDF(
  table: RapieresPdfTable,
  fileName: string
): Promise<void> {
  await savePDF(generateRapieresRankingHTML(table), fileName);
}

/** Impression du classement (boîte d'impression intégrée avec aperçu, #1214) */
export async function printRapieresRanking(table: RapieresPdfTable): Promise<void> {
  await printHTML(generateRapieresRankingHTML(table));
}
