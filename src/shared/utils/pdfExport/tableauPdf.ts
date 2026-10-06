/**
 * BellePoule Modern - PDF Export Service
 * Export PDF du tableau d'élimination directe (feuilles d'arbitrage)
 * Licensed under GPL-3.0
 */

import type { PdfTemplate } from '../../types/pdfTemplate.types';
import { savePDF, buildCssOverrides, assembleBody, BASE_CSS } from './core';

// ─── Export Tableau Élimination Directe ──────────────────────────────────────

export interface TableauMatchForPDF {
  id: string;
  round: number;
  position: number;
  fencerA: { id?: string; firstName?: string; lastName: string; club?: string } | null;
  fencerB: { id?: string; firstName?: string; lastName: string; club?: string } | null;
  scoreA: number | null;
  scoreB: number | null;
  winner: { id: string } | null;
  isBye: boolean;
  arena?: number | null;
}

/** Matchs réels (non-exempts, deux tireurs assignés). */
function realMatches(matches: TableauMatchForPDF[]): TableauMatchForPDF[] {
  return matches.filter(m => !m.isBye && m.fencerA && m.fencerB);
}

export function getTableauRoundName(round: number): string {
  const names: Record<number, string> = {
    2: 'Finale',
    3: 'Petite finale',
    4: 'Demi-finales',
    8: 'Quarts de finale',
    16: 'Tableau de 16',
    32: 'Tableau de 32',
    64: 'Tableau de 64',
    128: 'Tableau de 128',
  };
  return names[round] ?? `Tableau de ${round}`;
}

export function generateTableauHTML(
  matches: TableauMatchForPDF[],
  matchesPerPage: number,
  title: string,
  logoBase64?: string,
  template?: PdfTemplate,
  showScores = false,
  signatures?: Record<string, { A?: string; B?: string }>
): string {
  const real = realMatches(matches);
  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const renderMatchCard = (match: TableauMatchForPDF, num: number): string => {
    const roundName = getTableauRoundName(match.round);
    const nameA = `${match.fencerA!.lastName.toUpperCase()} ${match.fencerA!.firstName ?? ''}`.trim();
    const nameB = `${match.fencerB!.lastName.toUpperCase()} ${match.fencerB!.firstName ?? ''}`.trim();
    const clubA = match.fencerA!.club ?? '';
    const clubB = match.fencerB!.club ?? '';
    const pisteLabel = match.arena != null ? `Piste ${match.arena}` : 'Piste ___';
    const winnerId = match.winner?.id;
    const isWinnerA = winnerId != null && winnerId === (match.fencerA as any)?.id;
    const isWinnerB = winnerId != null && winnerId === (match.fencerB as any)?.id;
    const scoreCellA = showScores && match.scoreA != null ? `${isWinnerA ? 'V' : ''}${match.scoreA}` : '';
    const scoreCellB = showScores && match.scoreB != null ? `${isWinnerB ? 'V' : ''}${match.scoreB}` : '';
    const sig = signatures?.[match.id];
    const sigImg = (data?: string) =>
      data ? `<img src="${data}" style="max-height:14mm;max-width:36mm;display:block;margin:auto;" />` : '';
    const sigCellA = sigImg(sig?.A);
    const sigCellB = sigImg(sig?.B);
    return `
<div class="match-card">
  <div class="match-card-header">
    <span class="round-label">${roundName}</span>
    <span class="match-num">N° ${num}</span>
  </div>
  <table class="match-table">
    <colgroup>
      <col class="col-rank">
      <col class="col-name">
      <col class="col-score">
      <col class="col-sig">
    </colgroup>
    <thead>
      <tr>
        <th></th>
        <th style="text-align:left">Tireur</th>
        <th>Score</th>
        <th>Signature</th>
      </tr>
    </thead>
    <tbody>
      <tr class="row-a">
        <td class="row-letter">A</td>
        <td class="fencer-name">${nameA}${clubA ? `<br><span class="fencer-club">${clubA}</span>` : ''}</td>
        <td class="score-box">${scoreCellA}</td>
        <td class="sig-box">${sigCellA}</td>
      </tr>
      <tr class="row-b">
        <td class="row-letter">B</td>
        <td class="fencer-name">${nameB}${clubB ? `<br><span class="fencer-club">${clubB}</span>` : ''}</td>
        <td class="score-box">${scoreCellB}</td>
        <td class="sig-box">${sigCellB}</td>
      </tr>
    </tbody>
  </table>
  <div class="match-card-footer">
    <span>${pisteLabel}</span>
    <span>Arbitre ________________________________</span>
    <span>Heure ___:___</span>
  </div>
</div>`;
  };

  const hasArenas = real.some(m => m.arena != null);

  type PageDef = { matches: TableauMatchForPDF[]; label?: string };
  const pages: PageDef[] = [];

  if (hasArenas) {
    // Sort by arena (asc), then round (desc), then position (asc)
    const sortedByArena = [...real].sort((a, b) => {
      const aArena = a.arena ?? Infinity;
      const bArena = b.arena ?? Infinity;
      if (aArena !== bArena) return aArena < bArena ? -1 : 1;
      if (b.round !== a.round) return b.round - a.round;
      return a.position - b.position;
    });

    // Group by arena
    const arenaMap = new Map<number | 0, TableauMatchForPDF[]>();
    for (const m of sortedByArena) {
      const key = m.arena ?? 0;
      if (!arenaMap.has(key)) arenaMap.set(key, []);
      arenaMap.get(key)!.push(m);
    }

    // Assigned arenas first (ascending), unassigned (key=0) last
    const keys = [...arenaMap.keys()].sort((a, b) => {
      if (a === 0) return 1;
      if (b === 0) return -1;
      return a - b;
    });

    for (const key of keys) {
      const group = arenaMap.get(key)!;
      const label = key > 0 ? `Piste ${key}` : 'Non assignés';
      for (let i = 0; i < group.length; i += matchesPerPage) {
        const chunk = group.slice(i, i + matchesPerPage);
        const chunkLabel = i === 0 ? label : `${label} (suite)`;
        pages.push({ matches: chunk, label: chunkLabel });
      }
    }
  } else {
    const sorted = [...real].sort((a, b) => b.round - a.round || a.position - b.position);
    for (let i = 0; i < sorted.length; i += matchesPerPage) {
      pages.push({ matches: sorted.slice(i, i + matchesPerPage) });
    }
  }

  const effectiveTitle = template?.customTitle?.trim() || title;
  const cssOverrides = template ? buildCssOverrides(template) : '';

  const pageHeaderHTML = `
  <div class="doc-header doc-header--compact">
    ${logoBase64 ? `<img class="doc-header-logo" src="${logoBase64}" alt="Logo" />` : ''}
    <div class="doc-header-left">
      <h1>${effectiveTitle}</h1>
      <div class="subtitle">Feuilles d'arbitrage — Élimination directe</div>
    </div>
    <div class="doc-header-badge">ED</div>
  </div>
  <div class="gold-bar"></div>`;

  let globalMatchNum = 0;
  const pagesHTML = pages.map((page, pageIdx) => {
    let lastRound: number | null = null;
    const cards = page.matches.map(match => {
      globalMatchNum++;
      const roundHeader = match.round !== lastRound
        ? `<div class="round-sub-header">${getTableauRoundName(match.round)}</div>`
        : '';
      lastRound = match.round;
      return roundHeader + renderMatchCard(match, globalMatchNum);
    }).join('');

    const sectionHeader = page.label
      ? `<div class="piste-section-header">${page.label} — ${page.matches.length} combat${page.matches.length !== 1 ? 's' : ''}</div>`
      : '';

    const isLast = pageIdx === pages.length - 1;
    return `<div class="page${isLast ? '' : ' page-break'}">${pageHeaderHTML}${sectionHeader}${cards}</div>`;
  }).join('');

  const sections: Record<string, string> = {
    'match-cards': `  ${pagesHTML}`,
    'footer': `
  <div class="doc-footer">
    <span>BellePoule Modern</span>
    <span>${now}</span>
  </div>`,
  };

  const defaultOrder = ['match-cards', 'footer'];
  const body = assembleBody(sections, template, defaultOrder);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${effectiveTitle}</title>
  <style>
    ${BASE_CSS}
    ${cssOverrides}
    @page { size: A4; margin: 12mm 10mm; }

    .page-break { page-break-after: always; }

    .doc-header--compact {
      padding: 2.5mm 4mm;
    }
    .doc-header--compact .doc-header-left h1 {
      font-size: 11pt;
    }
    .doc-header--compact .doc-header-badge {
      font-size: 9pt;
      min-width: 10mm;
      height: 10mm;
    }
    .doc-header--compact .doc-header-logo {
      max-height: 7mm;
    }
    .doc-header--compact .subtitle {
      font-size: 7.5pt;
      margin-top: 0.8mm;
    }

    .piste-section-header {
      background: var(--navy);
      color: var(--gold-light);
      font-weight: 700;
      font-size: 12pt;
      letter-spacing: 0.5px;
      padding: 2mm 4mm;
      border-radius: 4px;
      margin-bottom: 4mm;
    }

    .round-sub-header {
      color: var(--navy);
      font-weight: 600;
      font-size: 9pt;
      letter-spacing: 0.3px;
      padding: 1mm 3mm;
      margin-top: 3mm;
      margin-bottom: 2mm;
      border-left: 3px solid var(--gold);
    }

    .match-card {
      border: 2px solid var(--navy);
      border-radius: 5px;
      margin-bottom: 5mm;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .match-card-header {
      background: var(--navy);
      color: var(--white);
      padding: 2.5mm 4mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .round-label {
      font-weight: 700;
      font-size: 11pt;
      letter-spacing: 0.3px;
    }
    .match-num {
      font-size: 8.5pt;
      color: var(--gold-light);
      font-weight: 600;
    }
    .match-table {
      width: 100%;
      border-collapse: collapse;
    }
    col.col-rank  { width: 8mm; }
    col.col-name  { width: auto; }
    col.col-score { width: 18mm; }
    col.col-sig   { width: 38mm; }
    .match-table thead th {
      background: var(--gray-xlight);
      font-size: 7.5pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      padding: 1.5mm 3mm;
      border-bottom: 1px solid var(--border);
      color: var(--gray-dark);
      text-align: center;
    }
    .match-table tbody tr { border-bottom: 1px solid var(--gray-light); }
    .match-table tbody tr:last-child { border-bottom: none; }
    .row-a { background: #f0f7ff; }
    .row-b { background: var(--white); }
    .row-letter {
      text-align: center;
      font-weight: 900;
      font-size: 10pt;
      color: var(--gray-mid);
      padding: 3mm 2mm;
    }
    .row-a .row-letter { color: var(--navy); }
    .fencer-name {
      padding: 3.5mm 3mm;
      font-size: 12pt;
      font-weight: 700;
      letter-spacing: 0.2px;
      vertical-align: middle;
    }
    .fencer-club {
      font-size: 8pt;
      font-weight: 400;
      color: var(--gray-dark);
    }
    .score-box {
      border-left: 1px solid var(--border);
      border-right: 1px solid var(--border);
      height: 16mm;
      vertical-align: middle;
      text-align: center;
    }
    .sig-box { height: 16mm; vertical-align: middle; }
    .match-card-footer {
      background: var(--gray-xlight);
      border-top: 1px solid var(--border);
      padding: 1.5mm 4mm;
      display: flex;
      justify-content: space-between;
      font-size: 7.5pt;
      color: var(--gray-dark);
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

export async function exportTableauToPDF(
  matches: TableauMatchForPDF[],
  matchesPerPage: number,
  title: string = 'Tableau Élimination Directe',
  logoBase64?: string,
  template?: PdfTemplate,
  signatures?: Record<string, { A?: string; B?: string }>
): Promise<void> {
  const real = realMatches(matches);
  if (real.length === 0) {
    throw new Error('Aucun match à exporter (tous sont des exempts ou sans tireurs assignés)');
  }

  const html = generateTableauHTML(matches, matchesPerPage, title, logoBase64, template, false, signatures);
  await savePDF(html, `tableau-elimination.pdf`);
}

export async function printTableauHTML(
  matches: TableauMatchForPDF[],
  matchesPerPage: number,
  title: string = 'Tableau Élimination Directe',
  logoBase64?: string,
  template?: PdfTemplate,
  signatures?: Record<string, { A?: string; B?: string }>
): Promise<void> {
  const real = realMatches(matches);
  if (real.length === 0) {
    throw new Error('Aucun match à imprimer (tous sont des exempts ou sans tireurs assignés)');
  }
  const html = generateTableauHTML(matches, matchesPerPage, title, logoBase64, template, false, signatures);
  const api = (window as any).electronAPI;
  if (!api?.file?.printHtml) {
    throw new Error('API Electron non disponible');
  }
  const res = await api.file.printHtml(html);
  if (!res?.success) {
    throw new Error(res?.error ?? "Échec de l'impression");
  }
}

// Aperçu avant impression : génère un PDF et l'ouvre dans le lecteur par défaut de l'OS
// (contourne l'absence d'aperçu dans la boîte de dialogue d'impression native de Windows 11)
export async function previewTableauHTML(
  matches: TableauMatchForPDF[],
  matchesPerPage: number,
  title: string = 'Tableau Élimination Directe',
  logoBase64?: string,
  template?: PdfTemplate,
  signatures?: Record<string, { A?: string; B?: string }>
): Promise<void> {
  const real = realMatches(matches);
  if (real.length === 0) {
    throw new Error('Aucun match à imprimer (tous sont des exempts ou sans tireurs assignés)');
  }
  const html = generateTableauHTML(matches, matchesPerPage, title, logoBase64, template, false, signatures);
  const api = (window as any).electronAPI;
  if (!api?.file?.previewHtmlAsPDF) {
    throw new Error('API Electron non disponible');
  }
  const res = await api.file.previewHtmlAsPDF(html);
  if (!res?.success) {
    throw new Error(res?.error ?? "Échec de la génération de l'aperçu");
  }
}
