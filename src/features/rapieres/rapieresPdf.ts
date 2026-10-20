/**
 * BellePoule Modern - Tournoi des rapières : export PDF d'un classement (#1118)
 * Licensed under GPL-3.0
 */

import { BASE_CSS, savePDF } from '../../shared/utils/pdfExport/core';
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

export function generateRapieresRankingHTML(table: RapieresPdfTable): string {
  const now = new Date().toLocaleDateString(getActiveLocale(), {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  return `<!DOCTYPE html>
<html lang="fr">
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
    <thead><tr>${table.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${table.rows
      .map(
        r =>
          `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="c"' : ''}>${esc(c)}</td>`).join('')}</tr>`
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
