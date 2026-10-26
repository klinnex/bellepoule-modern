/**
 * BellePoule Modern - PDF Export Service
 * Export PDF des résultats finaux
 * Licensed under GPL-3.0
 */

import { Fencer, FencerStatus } from '../../types';
import type { PdfTemplate } from '../../types/pdfTemplate.types';
import {
  savePDF,
  printHTML,
  buildCssOverrides,
  assembleBody,
  BASE_CSS,
  pdfLang,
  pdfT,
} from './core';
import { getActiveLocale } from '../localeFormat';
import { forfeitCode } from '../forfeit';

// ─── Export Résultats Finaux ───────────────────────────────────────────────────

export interface FinalResultForPDF {
  rank: number;
  fencer: Fencer;
  eliminatedAt?: string;
}

export function generateResultsHTML(
  results: FinalResultForPDF[],
  title: string,
  logoBase64?: string,
  template?: PdfTemplate
): string {
  const now = new Date().toLocaleDateString(getActiveLocale(), {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

  const rows = results
    .map(r => {
      const medal = medals[r.rank] ?? '';
      const status =
        r.fencer.status === FencerStatus.ABANDONED
          ? ' <span style="color:#ef4444;font-size:8pt">(A)</span>'
          : r.fencer.status === FencerStatus.FORFAIT
            ? ` <span style="color:#ef4444;font-size:8pt">(${forfeitCode(r.fencer)})</span>`
            : r.fencer.status === FencerStatus.EXCLUDED
              ? r.fencer.exclusionReason === 'black_card'
                ? ` <span title="${pdfT('black_card', 'Carton noir')}" style="display:inline-block;width:7pt;height:10pt;margin-left:4pt;background:#000;border-radius:1pt;vertical-align:-1pt"></span>`
                : ' <span style="color:#ef4444;font-size:8pt">(X)</span>'
              : '';
      return `
<tr>
  <td style="text-align:center;font-weight:700;color:var(--navy)">${medal} ${r.rank}</td>
  <td style="font-weight:600">${r.fencer.lastName.toUpperCase()}${status}</td>
  <td>${r.fencer.firstName ?? ''}</td>
  <td style="color:var(--gray-dark)">${r.fencer.club ?? ''}</td>
  <td style="text-align:center;color:var(--gray-dark)">${r.eliminatedAt ?? '-'}</td>
</tr>`;
    })
    .join('');

  const effectiveTitle = template?.customTitle?.trim() || title;
  const cssOverrides = template ? buildCssOverrides(template) : '';

  const sections: Record<string, string> = {
    header: `
  <div class="doc-header">
    ${logoBase64 ? `<img class="doc-header-logo" src="${logoBase64}" alt="Logo" />` : ''}
    <div class="doc-header-left">
      <h1>${effectiveTitle}</h1>
      <div class="subtitle">${pdfT('final_ranking', 'Classement final')} — ${pdfT('fencers_count', results.length > 1 ? '{{count}} tireurs' : '{{count}} tireur', { count: results.length })}</div>
    </div>
    <div class="doc-header-badge" style="font-size:11pt">RF</div>
  </div>`,
    'gold-bar': `  <div class="gold-bar"></div>`,
    'results-table': `
  <table>
    <thead>
      <tr>
        <th style="width:10mm">${pdfT('col_rank', 'Rg')}</th>
        <th style="text-align:left">${pdfT('col_last_name', 'Nom')}</th>
        <th style="text-align:left">${pdfT('col_first_name', 'Prénom')}</th>
        <th style="text-align:left">${pdfT('col_club', 'Club')}</th>
        <th>${pdfT('col_eliminated_in', 'Éliminé en')}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`,
    footer: `
  <div class="doc-footer">
    <span>BellePoule Modern</span>
    <span>${now}</span>
  </div>`,
  };

  const defaultOrder = ['header', 'gold-bar', 'results-table', 'footer'];
  const body = assembleBody(sections, template, defaultOrder);

  return `<!DOCTYPE html>
<html lang="${pdfLang()}">
<head>
  <meta charset="UTF-8">
  <title>${effectiveTitle}</title>
  <style>
    ${BASE_CSS}
    ${cssOverrides}
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    th {
      background: var(--navy); color: var(--white);
      font-size: 8pt; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.8px; padding: 2.5mm 3mm; text-align: center;
    }
    td { padding: 2mm 3mm; border-bottom: 1px solid var(--gray-light); vertical-align: middle; }
    tr:nth-child(even) td { background: var(--gray-xlight); }
    tr:nth-child(1) td:first-child { color: #d97706; font-size: 11pt; }
    tr:nth-child(2) td:first-child { color: #6b7280; font-size: 11pt; }
    tr:nth-child(3) td:first-child { color: #92400e; font-size: 11pt; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

export async function exportResultsToPDF(
  results: FinalResultForPDF[],
  title: string = pdfT('results_title', 'Résultats Finaux'),
  logoBase64?: string,
  template?: PdfTemplate
): Promise<void> {
  if (results.length === 0) throw new Error(pdfT('results_empty', 'Aucun résultat à exporter'));
  const html = generateResultsHTML(results, title, logoBase64, template);
  await savePDF(html, 'resultats-finaux.pdf');
}

/** Impression des résultats finaux (boîte d'impression intégrée avec aperçu, #1214) */
export async function printResultsHTML(
  results: FinalResultForPDF[],
  title: string = pdfT('results_title', 'Résultats Finaux'),
  logoBase64?: string,
  template?: PdfTemplate
): Promise<void> {
  if (results.length === 0) throw new Error(pdfT('results_empty', 'Aucun résultat à exporter'));
  await printHTML(generateResultsHTML(results, title, logoBase64, template));
}
