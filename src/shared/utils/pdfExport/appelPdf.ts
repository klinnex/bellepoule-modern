/**
 * BellePoule Modern - PDF Export Service
 * Export PDF de la liste d'appel
 * Licensed under GPL-3.0
 */

import { Fencer } from '../../types';
import type { PdfTemplate } from '../../types/pdfTemplate.types';
import { savePDF, buildCssOverrides, assembleBody, BASE_CSS, pdfLang, pdfT } from './core';
import { getActiveLocale } from '../localeFormat';

// ─── Export Liste d'Appel ──────────────────────────────────────────────────────

const APPEL_COL_HEADERS = (): Record<string, string> => ({
  ref: pdfT('col_ref', 'N°'),
  lastName: pdfT('col_last_name', 'Nom'),
  firstName: pdfT('col_first_name', 'Prénom'),
  birthDate: pdfT('col_born', 'Né(e)'),
  club: pdfT('col_club', 'Club'),
  ranking: pdfT('col_ranking', 'Classement'),
  status: pdfT('col_status', 'Statut'),
});

const APPEL_STATUS_LABELS = (): Record<string, string> => ({
  Q: pdfT('status_qualified', 'Qualifié'),
  E: pdfT('status_eliminated', 'Éliminé'),
  A: pdfT('status_abandoned', 'Abandon'),
  X: pdfT('status_excluded', 'Exclu'),
  N: pdfT('status_not_checked_in', 'Non pointé'),
  P: pdfT('status_checked_in', 'Pointé'),
  F: pdfT('status_forfait', 'Forfait'),
});

function getFencerCellValue(fencer: Fencer, col: string): string {
  switch (col) {
    case 'ref':
      return String(fencer.ref);
    case 'lastName':
      return fencer.lastName.toUpperCase();
    case 'firstName':
      return fencer.firstName ?? '';
    case 'birthDate':
      return fencer.birthDate ? String(new Date(fencer.birthDate).getFullYear()) : '-';
    case 'club':
      return fencer.club || '-';
    case 'ranking':
      return fencer.ranking ? `#${fencer.ranking}` : '-';
    case 'status':
      return APPEL_STATUS_LABELS()[fencer.status] ?? fencer.status;
    default:
      return '';
  }
}

export function generateAppelHTML(
  fencers: Fencer[],
  visibleColumns: string[],
  title: string,
  competitionName?: string,
  logoBase64?: string,
  template?: PdfTemplate
): string {
  const now = new Date().toLocaleDateString(getActiveLocale(), {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const effectiveTitle = template?.customTitle?.trim() || title;
  const cssOverrides = template ? buildCssOverrides(template) : '';

  const colHeaders = APPEL_COL_HEADERS();
  const headers = visibleColumns.map(col => `<th>${colHeaders[col] ?? col}</th>`).join('');

  const rows = fencers
    .map(fencer => {
      const cells = visibleColumns
        .map(col => `<td>${getFencerCellValue(fencer, col)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const count = fencers.length;
  const fencersLabel = pdfT('fencers_count', count > 1 ? '{{count}} tireurs' : '{{count}} tireur', {
    count,
  });
  const subtitle = competitionName ? `${competitionName} — ${fencersLabel}` : fencersLabel;

  const sections: Record<string, string> = {
    header: `
  <div class="doc-header">
    ${logoBase64 ? `<img class="doc-header-logo" src="${logoBase64}" alt="Logo" />` : ''}
    <div class="doc-header-left">
      <h1>${effectiveTitle}</h1>
      <div class="subtitle">${subtitle}</div>
    </div>
    <div class="doc-header-badge" style="font-size:11pt">AP</div>
  </div>`,
    'gold-bar': `  <div class="gold-bar"></div>`,
    'appel-table': `
  <table>
    <thead><tr>${headers}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`,
    footer: `
  <div class="doc-footer">
    <span>BellePoule Modern</span>
    <span>${now}</span>
  </div>`,
  };

  const defaultOrder = ['header', 'gold-bar', 'appel-table', 'footer'];
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
      letter-spacing: 0.8px; padding: 2.5mm 3mm; text-align: left;
    }
    td { padding: 2mm 3mm; border-bottom: 1px solid var(--gray-light); vertical-align: middle; }
    tr:nth-child(even) td { background: var(--gray-xlight); }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

export async function exportAppelToPDF(
  fencers: Fencer[],
  visibleColumns: string[] = [
    'ref',
    'lastName',
    'firstName',
    'birthDate',
    'club',
    'ranking',
    'status',
  ],
  title: string = pdfT('appel_title', "Liste d'appel"),
  competitionName?: string,
  logoBase64?: string,
  template?: PdfTemplate
): Promise<void> {
  if (fencers.length === 0)
    throw new Error(pdfT('appel_empty', "Aucun tireur dans la liste d'appel"));
  const html = generateAppelHTML(
    fencers,
    visibleColumns,
    title,
    competitionName,
    logoBase64,
    template
  );
  await savePDF(html, 'appel.pdf');
}
