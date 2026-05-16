/**
 * BellePoule Modern - PDF Export Service
 * Génération PDF via Electron printToPDF (sans menus ni chrome applicatif)
 * Licensed under GPL-3.0
 */

import { Pool, Match, MatchStatus, Fencer, PoolRanking, Weapon } from '../types';
import type { PdfTemplate } from '../types/pdfTemplate.types';

export interface PoolExportOptions {
  title?: string;
  competitionName?: string;
  weapon?: string;
  category?: string;
  includeFinishedMatches?: boolean;
  includePendingMatches?: boolean;
  includePoolStats?: boolean;
  logoBase64?: string;
  visibleColumns?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getScoreForCell(
  fencer: Fencer,
  opponent: Fencer,
  matches: Match[]
): { display: string; isVictory: boolean } | null {
  const match = matches.find(
    m =>
      (m.fencerA?.id === fencer.id && m.fencerB?.id === opponent.id) ||
      (m.fencerB?.id === fencer.id && m.fencerA?.id === opponent.id)
  );
  if (!match || match.status !== MatchStatus.FINISHED) return null;
  const isFencerA = match.fencerA?.id === fencer.id;
  const score = isFencerA ? match.scoreA : match.scoreB;
  if (!score) return null;
  return {
    display: `${score.isVictory ? 'V' : ''}${score.value ?? 0}`,
    isVictory: score.isVictory,
  };
}

function calculateFencerStats(
  fencer: Fencer,
  matches: Match[]
): { v: number; d: number; td: number; tr: number; ind: number; ratio: number } {
  let v = 0, d = 0, td = 0, tr = 0;
  for (const match of matches) {
    if (match.status !== MatchStatus.FINISHED) continue;
    const isFencerA = match.fencerA?.id === fencer.id;
    const isFencerB = match.fencerB?.id === fencer.id;
    if (!isFencerA && !isFencerB) continue;
    const myScore = isFencerA ? match.scoreA : match.scoreB;
    const oppScore = isFencerA ? match.scoreB : match.scoreA;
    if (!myScore || !oppScore) continue;
    td += myScore.value ?? 0;
    tr += oppScore.value ?? 0;
    if (myScore.isVictory) v++; else d++;
  }
  const played = v + d;
  return { v, d, td, tr, ind: td - tr, ratio: played > 0 ? v / played : 0 };
}

/** Sauvegarde PDF via Electron IPC, avec dialogue de fichier. */
async function savePDF(html: string, defaultName: string): Promise<void> {
  const api = (window as any).electronAPI;
  if (!api?.dialog?.saveFile || !api?.file?.printHtmlToPDF) {
    throw new Error('API Electron non disponible');
  }

  const result = await api.dialog.saveFile({
    title: 'Enregistrer le PDF',
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (!result || result.canceled || !result.filePath) return;

  const res = await api.file.printHtmlToPDF(html, result.filePath);
  if (!res.success) {
    throw new Error(res.error ?? 'Échec de la génération PDF');
  }
}

// ─── Template helpers ─────────────────────────────────────────────────────────

function buildCssOverrides(t: PdfTemplate): string {
  return `:root { --navy: ${t.colors.navy}; --gold: ${t.colors.gold}; --green: ${t.colors.green}; }`;
}

function isVisible(t: PdfTemplate | undefined, id: string): boolean {
  if (!t) return true;
  return t.elements.find(e => e.id === id)?.visible ?? true;
}

function assembleBody(
  sections: Record<string, string>,
  t: PdfTemplate | undefined,
  defaultOrder: string[]
): string {
  const order = t
    ? [...t.elements].sort((a, b) => a.order - b.order).map(e => e.id)
    : defaultOrder;
  return order.filter(id => isVisible(t, id)).map(id => sections[id] ?? '').join('\n');
}

// ─── CSS commun ───────────────────────────────────────────────────────────────

const BASE_CSS = `
  @page { size: A4; margin: 12mm 10mm; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --navy:        #1a2e4a;
    --navy-light:  #2c4a73;
    --gold:        #c9a227;
    --gold-light:  #f5e6a3;
    --gold-bg:     #fffbeb;
    --green:       #166534;
    --green-bg:    #dcfce7;
    --gray-dark:   #475569;
    --gray-mid:    #94a3b8;
    --gray-light:  #e2e8f0;
    --gray-xlight: #f8fafc;
    --border:      #cbd5e1;
    --text:        #1e293b;
    --white:       #ffffff;
  }
  body {
    font-family: 'Segoe UI', -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 9.5pt;
    color: var(--text);
    background: var(--white);
  }
  /* ── Header ── */
  .doc-header {
    background: var(--navy);
    color: var(--white);
    padding: 5mm 6mm;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0;
  }
  .doc-header-logo {
    max-height: 10mm;
    max-width: 35mm;
    object-fit: contain;
    margin-right: 4mm;
    flex-shrink: 0;
  }
  .doc-header-left h1 {
    font-size: 15pt;
    font-weight: 700;
    letter-spacing: 0.3px;
    line-height: 1.2;
  }
  .doc-header-left .subtitle {
    font-size: 8.5pt;
    color: var(--gold-light);
    margin-top: 1.5mm;
    letter-spacing: 0.5px;
  }
  .doc-header-badge {
    background: var(--gold);
    color: var(--navy);
    font-weight: 900;
    font-size: 18pt;
    min-width: 16mm;
    height: 16mm;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .gold-bar {
    height: 3px;
    background: linear-gradient(90deg, var(--navy) 0%, var(--gold) 50%, var(--navy) 100%);
    margin-bottom: 4mm;
  }
  /* ── Meta chips ── */
  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 2mm;
    margin-bottom: 4mm;
    align-items: center;
  }
  .chip {
    background: var(--gray-xlight);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.8mm 3mm;
    font-size: 8pt;
    color: var(--gray-dark);
  }
  .chip strong { color: var(--navy); }
  .chip.gold { background: var(--gold-bg); border-color: var(--gold); }
  .chip.gold strong { color: #92400e; }
  /* ── Nom compétition ── */
  .competition-name-section {
    text-align: center;
    padding: 2mm 6mm;
    background: var(--navy);
    color: var(--gold);
    font-size: 10pt;
    font-weight: 700;
    letter-spacing: 0.5px;
    margin-bottom: 2mm;
    border-radius: 3px;
  }
  /* ── Section titre ── */
  .section-label {
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: var(--navy);
    display: flex;
    align-items: center;
    gap: 2mm;
    margin-bottom: 2mm;
  }
  .section-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  /* ── Footer ── */
  .doc-footer {
    margin-top: 5mm;
    padding-top: 2mm;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    font-size: 7pt;
    color: var(--gray-mid);
  }
`;

// ─── HTML Poule ───────────────────────────────────────────────────────────────

type RankData = { fencer: Fencer; stats: ReturnType<typeof calculateFencerStats>; rank: number };

const STAT_COLS: { id: string; header: string; cls: string; render: (d: RankData) => string }[] = [
  { id: 'victories', header: 'V',   cls: 'stat-cell', render: d => `${d.stats.v}` },
  { id: 'ratio',     header: 'V/M', cls: 'stat-cell', render: d => d.stats.ratio.toFixed(2) },
  { id: 'td',        header: 'TD',  cls: 'stat-cell', render: d => `${d.stats.td}` },
  { id: 'tr',        header: 'TR',  cls: 'stat-cell', render: d => `${d.stats.tr}` },
  { id: 'index',     header: 'Ind', cls: 'stat-cell', render: d => d.stats.ind >= 0 ? `+${d.stats.ind}` : `${d.stats.ind}` },
  { id: 'rank',      header: 'Rg',  cls: 'rank-cell', render: d => `${d.rank}` },
];

export function generatePoolHTML(pool: Pool, options: PoolExportOptions, template?: PdfTemplate): string {
  const runtimeTitle = `Poule ${pool.number}`;
  const effectiveTitle = template?.customTitle?.trim() || options.title || runtimeTitle;
  const { competitionName = '', weapon = '', category = '', logoBase64 } = options;
  const fencers = pool.fencers ?? [];
  const matches = pool.matches ?? [];
  const finishedCount = matches.filter(m => m.status === MatchStatus.FINISHED).length;
  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const activeCols = options.visibleColumns
    ? STAT_COLS.filter(c => options.visibleColumns!.includes(c.id))
    : STAT_COLS;

  const rankings = fencers.map(f => ({
    fencer: f,
    stats: calculateFencerStats(f, matches),
    rank: 0,
  }));
  rankings.sort((a, b) => {
    if (a.stats.ratio !== b.stats.ratio) return b.stats.ratio - a.stats.ratio;
    if (a.stats.ind !== b.stats.ind) return b.stats.ind - a.stats.ind;
    return b.stats.td - a.stats.td;
  });
  rankings.forEach((r, i) => { r.rank = i + 1; });
  const rankMap = new Map(rankings.map(r => [r.fencer.id, r]));

  const colHeaders = fencers.map((_, i) => `<th class="num-header">${i + 1}</th>`).join('');
  const rows = fencers.map((fencer, row) => {
    const data = rankMap.get(fencer.id)!;
    const cells = fencers.map((opponent, col) => {
      if (row === col) return '<td class="diagonal"></td>';
      const s = getScoreForCell(fencer, opponent, matches);
      if (!s) return '<td class="cell-pending"></td>';
      return `<td class="${s.isVictory ? 'cell-victory' : 'cell-defeat'}">${s.display}</td>`;
    }).join('');
    const statCells = activeCols.map(c => `<td class="${c.cls}">${c.render(data)}</td>`).join('');
    return `
      <tr>
        <td class="num-cell">${row + 1}</td>
        <td class="name-cell">${fencer.lastName.toUpperCase()} ${fencer.firstName?.charAt(0) ?? ''}.</td>
        ${cells}
        ${statCells}
        <td class="sig-cell"></td>
      </tr>`;
  }).join('');

  const pending = matches.filter(m => m.status !== MatchStatus.FINISHED);
  const pendingSection = pending.length === 0 ? '' : `
    <div class="section-label">Matchs à jouer (${pending.length})</div>
    <div class="match-grid">
      ${pending.map(m => {
        const idx = matches.indexOf(m) + 1;
        return `<div class="match-item match-pending">${idx}. ${m.fencerA?.lastName ?? '?'} — ${m.fencerB?.lastName ?? '?'}</div>`;
      }).join('')}
    </div>`;

  const finished = matches.filter(m => m.status === MatchStatus.FINISHED);
  const finishedSection = finished.length === 0 ? '' : `
    <div class="section-label" style="margin-top:4mm">Résultats (${finished.length})</div>
    <div class="match-grid match-grid-2col">
      ${finished.map(m => {
        const idx = matches.indexOf(m) + 1;
        const sA = m.scoreA?.isVictory ? `V${m.scoreA.value}` : `${m.scoreA?.value ?? 0}`;
        const sB = m.scoreB?.isVictory ? `V${m.scoreB.value}` : `${m.scoreB?.value ?? 0}`;
        return `<div class="match-item match-done">${idx}. ${m.fencerA?.lastName ?? '?'} <b>${sA}–${sB}</b> ${m.fencerB?.lastName ?? '?'}</div>`;
      }).join('')}
    </div>`;

  const weaponLabel = weapon ? `<span class="chip"><strong>Arme</strong> ${weapon}</span>` : '';
  const catLabel = category ? `<span class="chip"><strong>Catégorie</strong> ${category}</span>` : '';

  const sections: Record<string, string> = {
    'header': `
  <div class="doc-header">
    ${logoBase64 ? `<img class="doc-header-logo" src="${logoBase64}" alt="Logo" />` : ''}
    <div class="doc-header-left">
      <h1>${effectiveTitle}</h1>
      <div class="subtitle">Grille de poule • ${finishedCount}/${matches.length} matchs joués</div>
    </div>
    <div class="doc-header-badge">P${pool.number}</div>
  </div>`,
    'gold-bar': `  <div class="gold-bar"></div>`,
    'competition-name': competitionName ? `  <div class="competition-name-section">${competitionName}</div>` : '',
    'meta-chips': `
  <div class="meta-row">
    ${weaponLabel}${catLabel}
    <span class="chip"><strong>Tireurs</strong> ${fencers.length}</span>
    <span class="chip"><strong>Matchs</strong> ${finishedCount}/${matches.length}</span>
  </div>`,
    'score-grid': `
  <div class="section-label">Grille des scores</div>
  <table class="score-grid">
    <thead>
      <tr>
        <th class="num-header">#</th>
        <th class="name-header">Tireur</th>
        ${colHeaders}
        ${activeCols.map(c => `<th class="${c.cls === 'rank-cell' ? 'rank-header' : 'stat-header'}">${c.header}</th>`).join('')}
        <th class="sig-header">Signature</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`,
    'pending-matches': pendingSection,
    'finished-matches': finishedSection,
    'footer': `
  <div class="doc-footer">
    <span>BellePoule Modern</span>
    <span>${now}</span>
  </div>`,
  };

  const defaultOrder = ['header', 'gold-bar', 'competition-name', 'meta-chips', 'score-grid', 'pending-matches', 'finished-matches', 'footer'];
  const body = assembleBody(sections, template, defaultOrder);
  const cssOverrides = template ? buildCssOverrides(template) : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${effectiveTitle}</title>
  <style>
    ${cssOverrides}
    ${BASE_CSS}

    /* Grille scores */
    .score-grid {
      border-collapse: collapse;
      width: 100%;
      font-size: 8.5pt;
      margin-bottom: 5mm;
    }
    .score-grid thead tr th {
      background: var(--navy);
      color: var(--white);
      font-weight: 600;
      padding: 2mm 1.5mm;
      text-align: center;
      border: 1px solid var(--navy-light);
      font-size: 8pt;
    }
    .score-grid thead .name-header { text-align: left; padding-left: 3mm; min-width: 28mm; }
    .score-grid thead .num-header { min-width: 8mm; }
    .score-grid thead .stat-header { min-width: 10mm; background: #243858; }
    .score-grid thead .rank-header { min-width: 10mm; background: var(--gold); color: var(--navy); }
    .score-grid tbody tr:nth-child(odd)  td { background: var(--white); }
    .score-grid tbody tr:nth-child(even) td { background: var(--gray-xlight); }
    .score-grid tbody td {
      border: 1px solid var(--border);
      padding: 1.8mm 1.5mm;
      text-align: center;
      vertical-align: middle;
    }
    .score-grid .num-cell {
      font-weight: 700;
      color: var(--gold);
      background: var(--navy) !important;
      font-size: 8pt;
    }
    .score-grid .name-cell {
      text-align: left;
      padding-left: 3mm;
      font-weight: 600;
      white-space: nowrap;
      font-size: 9pt;
    }
    .score-grid .diagonal { background: var(--navy) !important; }
    .score-grid .cell-victory {
      background: var(--green-bg) !important;
      color: var(--green);
      font-weight: 700;
    }
    .score-grid .cell-defeat { color: var(--gray-dark); }
    .score-grid .cell-pending { background: var(--gold-bg) !important; }
    .score-grid .stat-cell {
      background: #f0f4f8 !important;
      font-weight: 500;
      font-size: 8.5pt;
    }
    .score-grid .rank-cell {
      background: var(--gold) !important;
      color: var(--navy);
      font-weight: 900;
      font-size: 10pt;
    }
    .score-grid .sig-cell {
      min-width: 32mm;
      border-left: 2px solid var(--border) !important;
    }
    .score-grid thead .sig-header {
      min-width: 32mm;
      background: #1f3a5a;
      border-left: 2px solid var(--navy-light) !important;
    }

    /* Matchs */
    .match-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5mm 4mm;
      margin-bottom: 3mm;
    }
    .match-grid-2col { grid-template-columns: repeat(2, 1fr); }
    .match-item {
      font-size: 7.5pt;
      padding: 1mm 2.5mm;
      border-radius: 3px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .match-pending { background: var(--gold-bg); color: #92400e; border-left: 2px solid var(--gold); }
    .match-done    { background: var(--green-bg); color: var(--green); border-left: 2px solid #4ade80; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

// ─── Export Poule ─────────────────────────────────────────────────────────────

export async function exportPoolToPDF(pool: Pool, options: PoolExportOptions = {}, template?: PdfTemplate): Promise<void> {
  if (!pool.fencers || pool.fencers.length === 0) throw new Error('La poule ne contient aucun tireur');
  if (!pool.matches || pool.matches.length === 0) throw new Error('La poule ne contient aucun match');

  const title = options.title ?? `Poule ${pool.number}`;
  const html = generatePoolHTML(pool, { ...options, title }, template);
  await savePDF(html, `poule-${pool.number}.pdf`);
}

export async function exportMultiplePoolsToPDF(
  pools: Pool[],
  title: string = 'Export des Poules',
  logoBase64?: string,
  template?: PdfTemplate,
  competitionName?: string
): Promise<void> {
  if (pools.length === 0) throw new Error('Aucune poule à exporter');
  for (const pool of pools) {
    await exportPoolToPDF(pool, { title: `${title} - Poule ${pool.number}`, logoBase64, competitionName }, template);
  }
}

export const exportOptimizedPoolToPDF = exportPoolToPDF;

// ─── Export Tableau Élimination Directe ──────────────────────────────────────

export interface TableauMatchForPDF {
  id: string;
  round: number;
  position: number;
  fencerA: { firstName?: string; lastName: string } | null;
  fencerB: { firstName?: string; lastName: string } | null;
  scoreA: number | null;
  scoreB: number | null;
  winner: { id: string } | null;
  isBye: boolean;
  arena?: number | null;
}

export const MAX_MATCHES_PER_PAGE_TABLEAU = 5;

function getTableauRoundName(round: number): string {
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
  template?: PdfTemplate
): string {
  const real = matches.filter(m => !m.isBye && m.fencerA && m.fencerB);
  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const renderMatchCard = (match: TableauMatchForPDF, num: number): string => {
    const roundName = getTableauRoundName(match.round);
    const nameA = `${match.fencerA!.lastName.toUpperCase()} ${match.fencerA!.firstName ?? ''}`.trim();
    const nameB = `${match.fencerB!.lastName.toUpperCase()} ${match.fencerB!.firstName ?? ''}`.trim();
    const pisteLabel = match.arena != null ? `Piste ${match.arena}` : 'Piste ___';
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
        <td class="fencer-name">${nameA}</td>
        <td class="score-box"></td>
        <td class="sig-box"></td>
      </tr>
      <tr class="row-b">
        <td class="row-letter">B</td>
        <td class="fencer-name">${nameB}</td>
        <td class="score-box"></td>
        <td class="sig-box"></td>
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
    // No arenas: simple chunking, first page gets one fewer match to account for the doc header
    const firstPageCount = Math.max(1, matchesPerPage - 1);
    const sorted = [...real].sort((a, b) => b.round - a.round || a.position - b.position);
    let i = 0;
    if (sorted.length > 0) {
      pages.push({ matches: sorted.slice(0, firstPageCount) });
      i = firstPageCount;
    }
    for (; i < sorted.length; i += matchesPerPage) {
      pages.push({ matches: sorted.slice(i, i + matchesPerPage) });
    }
  }

  let globalMatchNum = 0;
  const pagesHTML = pages.map((page, pageIdx) => {
    const cards = page.matches.map(match => {
      globalMatchNum++;
      return renderMatchCard(match, globalMatchNum);
    }).join('');

    const sectionHeader = page.label
      ? `<div class="piste-section-header">${page.label} — ${page.matches.length} combat${page.matches.length !== 1 ? 's' : ''}</div>`
      : '';

    const isLast = pageIdx === pages.length - 1;
    return `<div class="page${isLast ? '' : ' page-break'}">${sectionHeader}${cards}</div>`;
  }).join('');

  const effectiveTitle = template?.customTitle?.trim() || title;
  const cssOverrides = template ? buildCssOverrides(template) : '';

  const sections: Record<string, string> = {
    'header': `
  <div class="doc-header">
    ${logoBase64 ? `<img class="doc-header-logo" src="${logoBase64}" alt="Logo" />` : ''}
    <div class="doc-header-left">
      <h1>${effectiveTitle}</h1>
      <div class="subtitle">Feuilles d'arbitrage — Élimination directe</div>
    </div>
    <div class="doc-header-badge" style="font-size:11pt">ED</div>
  </div>`,
    'gold-bar': `  <div class="gold-bar"></div>`,
    'match-cards': `  ${pagesHTML}`,
    'footer': `
  <div class="doc-footer">
    <span>BellePoule Modern</span>
    <span>${now}</span>
  </div>`,
  };

  const defaultOrder = ['header', 'gold-bar', 'match-cards', 'footer'];
  const body = assembleBody(sections, template, defaultOrder);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${effectiveTitle}</title>
  <style>
    ${cssOverrides}
    ${BASE_CSS}
    @page { size: A4; margin: 12mm 10mm; }

    .page-break { page-break-after: always; }

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
  template?: PdfTemplate
): Promise<void> {
  const real = matches.filter(m => !m.isBye && m.fencerA && m.fencerB);
  if (real.length === 0) {
    throw new Error('Aucun match à exporter (tous sont des exempts ou sans tireurs assignés)');
  }

  const html = generateTableauHTML(matches, matchesPerPage, title, logoBase64, template);
  await savePDF(html, `tableau-elimination.pdf`);
}

export async function printTableauHTML(
  matches: TableauMatchForPDF[],
  matchesPerPage: number,
  title: string = 'Tableau Élimination Directe',
  logoBase64?: string,
  template?: PdfTemplate
): Promise<void> {
  const real = matches.filter(m => !m.isBye && m.fencerA && m.fencerB);
  if (real.length === 0) {
    throw new Error('Aucun match à imprimer (tous sont des exempts ou sans tireurs assignés)');
  }
  const html = generateTableauHTML(matches, matchesPerPage, title, logoBase64, template);
  const api = (window as any).electronAPI;
  if (!api?.file?.printHtml) {
    throw new Error('API Electron non disponible');
  }
  const res = await api.file.printHtml(html);
  if (!res?.success) {
    throw new Error(res?.error ?? "Échec de l'impression");
  }
}

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
    ${cssOverrides}
    ${BASE_CSS}
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

// ─── Export Résultats Finaux ───────────────────────────────────────────────────

interface FinalResultForPDF {
  rank: number;
  fencer: Fencer;
  eliminatedAt?: string;
}

function generateResultsHTML(
  results: FinalResultForPDF[],
  title: string,
  logoBase64?: string,
  template?: PdfTemplate
): string {
  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

  const rows = results.map(r => {
    const medal = medals[r.rank] ?? '';
    const status =
      (r.fencer as any).status === 'ABANDONED' ? ' <span style="color:#ef4444;font-size:8pt">(A)</span>' :
      (r.fencer as any).status === 'FORFAIT'   ? ' <span style="color:#ef4444;font-size:8pt">(F)</span>' :
      (r.fencer as any).status === 'EXCLUDED'  ? ' <span style="color:#ef4444;font-size:8pt">(X)</span>' : '';
    return `
<tr>
  <td style="text-align:center;font-weight:700;color:var(--navy)">${medal} ${r.rank}</td>
  <td style="font-weight:600">${r.fencer.lastName.toUpperCase()}${status}</td>
  <td>${r.fencer.firstName ?? ''}</td>
  <td style="color:var(--gray-dark)">${r.fencer.club ?? ''}</td>
  <td style="text-align:center;color:var(--gray-dark)">${r.eliminatedAt ?? '-'}</td>
</tr>`;
  }).join('');

  const effectiveTitle = template?.customTitle?.trim() || title;
  const cssOverrides = template ? buildCssOverrides(template) : '';

  const sections: Record<string, string> = {
    'header': `
  <div class="doc-header">
    ${logoBase64 ? `<img class="doc-header-logo" src="${logoBase64}" alt="Logo" />` : ''}
    <div class="doc-header-left">
      <h1>${effectiveTitle}</h1>
      <div class="subtitle">Classement final — ${results.length} tireur${results.length > 1 ? 's' : ''}</div>
    </div>
    <div class="doc-header-badge" style="font-size:11pt">RF</div>
  </div>`,
    'gold-bar': `  <div class="gold-bar"></div>`,
    'results-table': `
  <table>
    <thead>
      <tr>
        <th style="width:10mm">Rg</th>
        <th style="text-align:left">Nom</th>
        <th style="text-align:left">Prénom</th>
        <th style="text-align:left">Club</th>
        <th>Éliminé en</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`,
    'footer': `
  <div class="doc-footer">
    <span>BellePoule Modern</span>
    <span>${now}</span>
  </div>`,
  };

  const defaultOrder = ['header', 'gold-bar', 'results-table', 'footer'];
  const body = assembleBody(sections, template, defaultOrder);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${effectiveTitle}</title>
  <style>
    ${cssOverrides}
    ${BASE_CSS}
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
  title: string = 'Résultats Finaux',
  logoBase64?: string,
  template?: PdfTemplate
): Promise<void> {
  if (results.length === 0) throw new Error('Aucun résultat à exporter');
  const html = generateResultsHTML(results, title, logoBase64, template);
  await savePDF(html, 'resultats-finaux.pdf');
}

