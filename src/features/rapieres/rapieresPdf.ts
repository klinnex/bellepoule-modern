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
  /** Nature de chaque colonne (défaut : rang, 3 textes, chiffres) — utile quand des colonnes sont masquées */
  kinds?: RapieresColumnKind[];
}

export type RapieresColumnKind = 'rank' | 'text' | 'num';

const esc = (s: string | number) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Même mise en page que le classement après poules : rang en gras, textes à gauche, chiffres centrés */
const defaultKind = (i: number): RapieresColumnKind => (i === 0 ? 'rank' : i <= 3 ? 'text' : 'num');

const rankingCellStyle = (kind: RapieresColumnKind, firstText: boolean) =>
  kind === 'rank'
    ? 'text-align:center;font-weight:700;color:var(--navy)'
    : kind === 'text'
      ? firstText
        ? 'font-weight:600'
        : ''
      : 'text-align:center';

export function generateRapieresRankingHTML(table: RapieresPdfTable): string {
  const kinds = table.headers.map((_, i) => table.kinds?.[i] ?? defaultKind(i));
  const firstText = kinds.indexOf('text');
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
          `<th style="${kinds[i] === 'rank' ? 'width:10mm' : kinds[i] === 'text' ? 'text-align:left' : ''}">${esc(h)}</th>`
      )
      .join('')}</tr></thead>
    <tbody>${table.rows
      .map(
        r =>
          `<tr>${r.map((c, i) => `<td style="${rankingCellStyle(kinds[i], i === firstText)}">${esc(c)}</td>`).join('')}</tr>`
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
