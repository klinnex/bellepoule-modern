/**
 * BellePoule Modern - PDF Export Service
 * Export PDF du classement général
 * Licensed under GPL-3.0
 */

import { PoolRanking, Weapon } from '../../types';
import type { PdfTemplate } from '../../types/pdfTemplate.types';
import { savePDF, buildCssOverrides, assembleBody, BASE_CSS } from './core';

// ─── Export Classement Général ───────────────────────────────────────────────

export function generateRankingHTML(
  ranking: PoolRanking[],
  title: string,
  isLaserSabre: boolean,
  visibleColumns: string[],
  logoBase64?: string,
  template?: PdfTemplate
): string {
  const vis = (col: string) => visibleColumns.includes(col);
  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const rows = ranking.map(r => {
    const ratio = r.matchesPlayed > 0 ? (r.victories / r.matchesPlayed).toFixed(2) : '0.00';
    const idx = r.index >= 0 ? `+${r.index}` : `${r.index}`;
    const abandoned = (r.fencer as any).status === 'ABANDONED'
      ? ' <span style="color:#ef4444;font-size:8pt">(A)</span>' : '';
    return `
<tr>
  ${vis('rank') ? `<td style="text-align:center;font-weight:700;color:var(--navy)">${r.rank}</td>` : ''}
  ${vis('lastName') ? `<td style="font-weight:600">${r.fencer.lastName.toUpperCase()}${abandoned}</td>` : ''}
  ${vis('firstName') ? `<td>${r.fencer.firstName ?? ''}</td>` : ''}
  ${vis('club') ? `<td style="color:var(--gray-dark)">${r.fencer.club ?? ''}</td>` : ''}
  ${vis('victories') ? `<td style="text-align:center">${r.victories}</td>` : ''}
  ${vis('ratio') ? `<td style="text-align:center">${r.matchesPlayed > 0 ? ratio : '-'}</td>` : ''}
  ${vis('td') ? `<td style="text-align:center">${r.touchesScored}</td>` : ''}
  ${vis('tr') ? `<td style="text-align:center">${r.touchesReceived}</td>` : ''}
  ${vis('quest') && isLaserSabre ? `<td style="text-align:center;color:#7c3aed;font-weight:600">${r.questPoints ?? 0}</td>` : ''}
  ${vis('index') ? `<td style="text-align:center;font-weight:600;color:${r.index >= 0 ? 'var(--green)' : '#dc2626'}">${idx}</td>` : ''}
</tr>`;
  }).join('');

  const th = (col: string, label: string, style = '') =>
    vis(col) ? `<th style="${style}">${label}</th>` : '';

  const headers = [
    th('rank', 'Rg', 'width:10mm'),
    th('lastName', 'Nom', 'text-align:left'),
    th('firstName', 'Prénom', 'text-align:left'),
    th('club', 'Club', 'text-align:left'),
    th('victories', 'V'),
    th('ratio', 'V/M'),
    th('td', 'TD'),
    th('tr', 'TR'),
    vis('quest') && isLaserSabre ? '<th style="color:var(--white)">Quest</th>' : '',
    th('index', 'Indice'),
  ].join('');

  const effectiveTitle = template?.customTitle?.trim() || title;
  const cssOverrides = template ? buildCssOverrides(template) : '';

  const sections: Record<string, string> = {
    'header': `
  <div class="doc-header">
    ${logoBase64 ? `<img class="doc-header-logo" src="${logoBase64}" alt="Logo" />` : ''}
    <div class="doc-header-left">
      <h1>${effectiveTitle}</h1>
      <div class="subtitle">Classement général — ${ranking.length} tireur${ranking.length > 1 ? 's' : ''}</div>
    </div>
    <div class="doc-header-badge" style="font-size:11pt">RG</div>
  </div>`,
    'gold-bar': `  <div class="gold-bar"></div>`,
    'ranking-table': `
  <table>
    <thead><tr>${headers}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`,
    'footer': `
  <div class="doc-footer">
    <span>BellePoule Modern</span>
    <span>${now}</span>
  </div>`,
  };

  const defaultOrder = ['header', 'gold-bar', 'ranking-table', 'footer'];
  const body = assembleBody(sections, template, defaultOrder);

  return `<!DOCTYPE html>
<html lang="fr">
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
    tr:nth-child(1) td, tr:nth-child(2) td, tr:nth-child(3) td { font-size: 9.5pt; }
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

export async function exportRankingToPDF(
  ranking: PoolRanking[],
  title: string = 'Classement Général',
  weapon?: Weapon,
  visibleColumns?: string[],
  logoBase64?: string,
  template?: PdfTemplate
): Promise<void> {
  if (ranking.length === 0) throw new Error('Aucun tireur dans le classement');
  const isLaserSabre = weapon === 'L' || weapon === ('LASER' as any);
  const cols = visibleColumns ?? ['rank', 'lastName', 'firstName', 'club', 'victories', 'ratio', 'td', 'tr', 'quest', 'index'];
  const html = generateRankingHTML(ranking, title, isLaserSabre, cols, logoBase64, template);
  await savePDF(html, 'classement-general.pdf');
}
