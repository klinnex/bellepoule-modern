/**
 * BellePoule Modern - PDF Export Service
 * Export PDF des poules (grille, matchs, statistiques)
 * Licensed under GPL-3.0
 */

import { Pool, Match, MatchStatus, Fencer } from '../../types';
import { calculateFencerQuestStats } from '../poolCalculations';
import type { PdfTemplate } from '../../types/pdfTemplate.types';
import { savePDF, buildCssOverrides, assembleBody, BASE_CSS } from './core';

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
  signatures?: Record<string, string>; // fencerId → data URL PNG
  competitionId?: string;              // pour QR code OCR
  qrDataUrl?: string;                  // data URL QR généré par l'appelant
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

// ─── HTML Poule ───────────────────────────────────────────────────────────────

type RankData = { fencer: Fencer; stats: ReturnType<typeof calculateFencerStats>; rank: number; questPoints: number };

const STAT_COLS: { id: string; header: string; cls: string; render: (d: RankData) => string }[] = [
  { id: 'victories', header: 'V',      cls: 'stat-cell', render: d => `${d.stats.v}` },
  { id: 'ratio',     header: 'V/M',    cls: 'stat-cell', render: d => d.stats.ratio.toFixed(2) },
  { id: 'td',        header: 'TD',     cls: 'stat-cell', render: d => `${d.stats.td}` },
  { id: 'tr',        header: 'TR',     cls: 'stat-cell', render: d => `${d.stats.tr}` },
  { id: 'index',     header: 'Ind',    cls: 'stat-cell', render: d => d.stats.ind >= 0 ? `+${d.stats.ind}` : `${d.stats.ind}` },
  { id: 'rank',      header: 'Rg',     cls: 'rank-cell', render: d => `${d.rank}` },
  { id: 'quest',     header: 'Quest',  cls: 'stat-cell', render: d => `${d.questPoints}` },
  { id: 'club',      header: 'Club',   cls: 'name-cell', render: d => d.fencer.club ?? '' },
  { id: 'nation',    header: 'Nation', cls: 'stat-cell', render: d => d.fencer.nationality ?? '' },
  { id: 'region',    header: 'Région', cls: 'name-cell', render: d => d.fencer.region ?? '' },
];

export function generatePoolHTML(pool: Pool, options: PoolExportOptions, template?: PdfTemplate): string {
  const runtimeTitle = `Poule ${pool.number}`;
  const effectiveTitle = template?.customTitle?.trim() || options.title || runtimeTitle;
  const { competitionName = '', weapon = '', category = '', logoBase64, qrDataUrl } = options;
  const fencers = pool.fencers ?? [];
  const matches = pool.matches ?? [];
  const finishedCount = matches.filter(m => m.status === MatchStatus.FINISHED).length;
  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const isLaserSabre = options.weapon === 'L';
  const activeCols = options.visibleColumns
    ? STAT_COLS.filter(c => options.visibleColumns!.includes(c.id) && (c.id !== 'quest' || isLaserSabre))
    : STAT_COLS.filter(c => c.id !== 'quest' || isLaserSabre);

  const rankings = fencers.map(f => ({
    fencer: f,
    stats: calculateFencerStats(f, matches),
    questPoints: calculateFencerQuestStats(f, matches).questPoints,
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
    const sig = options.signatures?.[fencer.id];
    const sigCell = sig
      ? `<td class="sig-cell"><img src="${sig}" style="max-height:12mm;max-width:30mm;display:block;margin:auto;" /></td>`
      : `<td class="sig-cell"></td>`;
    return `
      <tr>
        <td class="num-cell">${row + 1}</td>
        <td class="name-cell">${fencer.lastName.toUpperCase()} ${fencer.firstName ?? ''}</td>
        ${cells}
        ${statCells}
        ${sigCell}
      </tr>`;
  }).join('');

  const matchIndexById = new Map(matches.map((m, i) => [m.id, i + 1]));
  const pending = matches.filter(m => m.status !== MatchStatus.FINISHED);
  const pendingSection = pending.length === 0 ? '' : `
    <div class="section-label">Matchs à jouer (${pending.length})</div>
    <div class="match-grid">
      ${pending.map(m => {
        const idx = matchIndexById.get(m.id) ?? 0;
        const rA = rankMap.get(m.fencerA?.id ?? '')?.rank ?? '?';
        const rB = rankMap.get(m.fencerB?.id ?? '')?.rank ?? '?';
        return `<div class="match-item match-pending">${idx}. (${rA}) ${m.fencerA?.lastName ?? '?'} — (${rB}) ${m.fencerB?.lastName ?? '?'}</div>`;
      }).join('')}
    </div>`;

  const finished = matches.filter(m => m.status === MatchStatus.FINISHED);
  const finishedSection = finished.length === 0 ? '' : `
    <div class="section-label" style="margin-top:4mm">Résultats (${finished.length})</div>
    <div class="match-grid match-grid-2col">
      ${finished.map(m => {
        const idx = matchIndexById.get(m.id) ?? 0;
        const sA = m.scoreA?.isVictory ? `V${m.scoreA.value}` : `${m.scoreA?.value ?? 0}`;
        const sB = m.scoreB?.isVictory ? `V${m.scoreB.value}` : `${m.scoreB?.value ?? 0}`;
        return `<div class="match-item match-done">${idx}. ${m.fencerA?.lastName ?? '?'} <b>${sA}–${sB}</b> ${m.fencerB?.lastName ?? '?'}</div>`;
      }).join('')}
    </div>`;

  const weaponLabel = weapon ? `<span class="chip"><strong>Arme</strong> ${weapon}</span>` : '';
  const catLabel = category ? `<span class="chip"><strong>Catégorie</strong> ${category}</span>` : '';

  const assignedReferee = pool.referees?.[0];
  const refereeLabel = assignedReferee
    ? `<span style="font-size:0.85em;color:#4b5563;">🧑‍⚖️ ${assignedReferee.lastName} ${assignedReferee.firstName}</span>`
    : '';

  const sections: Record<string, string> = {
    'header': `
  <div class="doc-header">
    ${logoBase64 ? `<img class="doc-header-logo" src="${logoBase64}" alt="Logo" />` : ''}
    <div class="doc-header-left">
      <h1>${effectiveTitle}</h1>
      <div class="subtitle">Grille de poule • ${finishedCount}/${matches.length} matchs joués${refereeLabel ? ' &nbsp;' + refereeLabel : ''}</div>
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
    'ocr-marks': `
  <div class="ocr-corner ocr-tl" aria-hidden="true"></div>
  <div class="ocr-corner ocr-tr" aria-hidden="true"></div>
  <div class="ocr-corner ocr-bl" aria-hidden="true"></div>
  <div class="ocr-corner ocr-br" aria-hidden="true">${qrDataUrl ? `<img src="${qrDataUrl}" alt="" style="display:block;width:100%;height:100%;" />` : ''}</div>`,
  };

  const defaultOrder = ['ocr-marks', 'header', 'gold-bar', 'competition-name', 'meta-chips', 'score-grid', 'pending-matches', 'finished-matches', 'footer'];
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
      text-align: center;
      vertical-align: middle;
      padding: 1mm !important;
    }
    .score-grid thead .sig-header {
      min-width: 32mm;
      background: #1f3a5a;
      border-left: 2px solid var(--navy-light) !important;
    }

    /* Marqueurs OCR (imprimés uniquement) */
    @media print {
      .ocr-corner {
        position: fixed;
        z-index: 9999;
        width: 6mm;
        height: 6mm;
        background: #000;
        box-sizing: border-box;
      }
      .ocr-corner.ocr-tl { top: 1mm; left: 1mm; }
      .ocr-corner.ocr-tr { top: 1mm; right: 1mm; }
      .ocr-corner.ocr-bl { bottom: 1mm; left: 1mm; }
      .ocr-corner.ocr-br {
        bottom: 1mm; right: 1mm;
        width: 18mm; height: 18mm;
        background: #fff;
        border: 1.5mm solid #000;
        padding: 0.5mm;
      }
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

  let qrDataUrl: string | undefined;
  try {
    const QRCode = (await import('qrcode')).default;
    const qrPayload = JSON.stringify({ v: 1, pid: pool.id, cid: options.competitionId ?? '' });
    qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 140, margin: 1, color: { dark: '#000', light: '#fff' } });
  } catch {
    // QR silencieusement omis si qrcode indisponible
  }

  const html = generatePoolHTML(pool, { ...options, title, qrDataUrl }, template);
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
