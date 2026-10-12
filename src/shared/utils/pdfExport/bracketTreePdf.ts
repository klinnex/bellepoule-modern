/**
 * BellePoule Modern - PDF Export Service
 * Export PDF de l'arbre du tableau (vue graphique SVG, mono et multi-pages)
 * Licensed under GPL-3.0
 */

import type { PdfTemplate } from '../../types/pdfTemplate.types';
import { savePDF, buildCssOverrides } from './core';
import { TableauMatchForPDF, getTableauRoundName } from './tableauPdf';

// ─── Export Arbre (Bracket Tree) ─────────────────────────────────────────────

export function generateBracketTreeHTML(
  matches: TableauMatchForPDF[],
  title: string,
  logoBase64?: string,
  template?: PdfTemplate
): string {
  // ── Layout constants ────────────────────────────────────────────────────────
  const MATCH_W = 175;
  const H_GAP = 55;
  const SCORE_W = 26;
  const HEADER_H = 60;
  const GOLD_H = 4;
  const LABEL_H = 24;
  const TOP_MARGIN = HEADER_H + GOLD_H + LABEL_H;
  const BOT_MARGIN = 20;
  const MARGIN_L = 16;
  const SVG_H = 750;

  // ── Separate petite-finale from main bracket ────────────────────────────────
  const petiteFinale = matches.find(m => m.round === 3);
  const mainMatches = matches.filter(m => m.round !== 3 && m.round >= 2);

  if (mainMatches.length === 0) {
    throw new Error('Aucun match dans le tableau principal');
  }

  const tableauSize = Math.max(...mainMatches.map(m => m.round));
  const numRounds = Math.round(Math.log2(tableauSize));

  // ── Vertical slot height (adapts to bracket size) ──────────────────────────
  const firstRoundCount = tableauSize / 2;
  const USABLE_H = SVG_H - TOP_MARGIN - BOT_MARGIN;
  const SLOT_H = USABLE_H / firstRoundCount;
  const ROW_H = Math.max(14, Math.min(26, Math.floor(SLOT_H * 0.44)));
  const MATCH_H = ROW_H * 2;

  // ── SVG viewBox width ───────────────────────────────────────────────────────
  const naturalW = MARGIN_L + numRounds * MATCH_W + (numRounds - 1) * H_GAP + MARGIN_L;
  const VBW = Math.max(900, naturalW);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  const colX = (r: number): number => {
    const colIndex = Math.round(Math.log2(tableauSize / r));
    return MARGIN_L + colIndex * (MATCH_W + H_GAP);
  };

  const matchCenterY = (r: number, p: number): number =>
    TOP_MARGIN + (p + 0.5) * (tableauSize / r) * SLOT_H;

  const matchTopY = (r: number, p: number): number => matchCenterY(r, p) - MATCH_H / 2;

  // ── Colour helpers (resolve from template, fallback to defaults) ────────────
  const navy = template?.colors.navy ?? '#1a2e4a';
  const gold = template?.colors.gold ?? '#c9a227';
  const green = template?.colors.green ?? '#166534';
  const now = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  // ── SVG: header ─────────────────────────────────────────────────────────────
  const svgHeader = `
  <rect x="0" y="0" width="${VBW}" height="${HEADER_H}" fill="${navy}"/>
  ${logoBase64 ? `<image href="${logoBase64}" x="10" y="8" width="44" height="44" preserveAspectRatio="xMinYMid meet"/>` : ''}
  <text x="${logoBase64 ? 62 : VBW / 2}" y="33"
        font-family="'Segoe UI',Arial,sans-serif" font-size="16" font-weight="700" fill="white"
        ${logoBase64 ? '' : 'text-anchor="middle"'}>${title}</text>
  <text x="${logoBase64 ? 62 : VBW / 2}" y="52"
        font-family="'Segoe UI',Arial,sans-serif" font-size="9" fill="#f5e6a3"
        ${logoBase64 ? '' : 'text-anchor="middle"'}>Tableau d'élimination directe — ${now}</text>
  <text x="${VBW - 14}" y="40" font-family="'Segoe UI',Arial,sans-serif"
        font-size="22" font-weight="900" fill="${gold}" text-anchor="end">ED</text>`;

  // ── SVG: gold bar ───────────────────────────────────────────────────────────
  const svgGoldBar = `
  <rect x="0" y="${HEADER_H}" width="${VBW}" height="${GOLD_H}" fill="${gold}"/>`;

  // ── SVG: round labels ───────────────────────────────────────────────────────
  const roundNums = [...new Set(mainMatches.map(m => m.round))].sort((a, b) => b - a);
  const labelY = TOP_MARGIN - 6;
  const roundLabels = roundNums
    .map(r => {
      const cx = colX(r) + MATCH_W / 2;
      return `<text x="${cx}" y="${labelY}" font-family="'Segoe UI',Arial,sans-serif"
        font-size="9" font-weight="600" fill="${navy}" text-anchor="middle">${getTableauRoundName(r)}</text>`;
    })
    .join('\n  ');

  const petiteFinaleLabel = petiteFinale
    ? `
  <text x="${colX(2) + MATCH_W / 2}" y="${SVG_H - BOT_MARGIN - MATCH_H - 8}"
        font-family="'Segoe UI',Arial,sans-serif"
        font-size="8" font-weight="600" fill="${navy}" text-anchor="middle">Petite finale</text>`
    : '';

  // ── SVG: connection lines ───────────────────────────────────────────────────
  const connectors = mainMatches
    .filter(m => m.round > 2)
    .map(m => {
      const { round: r, position: p } = m;
      const x = colX(r);
      const cy = matchCenterY(r, p);
      const midX = x + MATCH_W + H_GAP / 2;
      const parentX = colX(r / 2);

      const stubH = `<line x1="${x + MATCH_W}" y1="${cy}" x2="${midX}" y2="${cy}" stroke="#94a3b8" stroke-width="1.5"/>`;

      if (p % 2 !== 0) return stubH;

      const sibCy = matchCenterY(r, p + 1);
      const parentY = (cy + sibCy) / 2;
      return `${stubH}
    <line x1="${midX}" y1="${cy}" x2="${midX}" y2="${sibCy}" stroke="#94a3b8" stroke-width="1.5"/>
    <line x1="${midX}" y1="${parentY}" x2="${parentX}" y2="${parentY}" stroke="#94a3b8" stroke-width="1.5"/>`;
    })
    .join('\n  ');

  // ── SVG: match box renderer ─────────────────────────────────────────────────
  const renderMatchBox = (match: TableauMatchForPDF, x: number, yTop: number): string => {
    const { fencerA, fencerB, scoreA, scoreB, winner, isBye } = match;
    const fa_id = (fencerA as any)?.id as string | undefined;
    const fb_id = (fencerB as any)?.id as string | undefined;
    const wid = winner?.id;
    const winA = !!(wid && fa_id && wid === fa_id);
    const winB = !!(wid && fb_id && wid === fb_id);

    const nameW = MATCH_W - SCORE_W;
    const fs = Math.max(7, Math.min(9, Math.floor(ROW_H * 0.42)));
    const clubFs = Math.max(6, fs - 2);
    const scoreFs = Math.max(8, Math.min(11, Math.floor(ROW_H * 0.5)));
    const showClub = ROW_H >= 20;

    if (isBye) {
      const byeName = fencerA
        ? truncate(`${fencerA.lastName.toUpperCase()} ${fencerA.firstName?.charAt(0) ?? ''}.`, 22)
        : fencerB
          ? truncate(`${fencerB.lastName.toUpperCase()} ${fencerB.firstName?.charAt(0) ?? ''}.`, 22)
          : '';
      return `<g>
        <rect x="${x}" y="${yTop}" width="${MATCH_W}" height="${MATCH_H}" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1" rx="2"/>
        ${
          byeName
            ? `<text x="${x + MATCH_W / 2}" y="${yTop + MATCH_H / 2 - 3}"
              text-anchor="middle" dominant-baseline="auto"
              font-family="'Segoe UI',Arial,sans-serif" font-size="${fs}" fill="#475569" font-weight="600">${byeName}</text>`
            : ''
        }
        <text x="${x + MATCH_W / 2}" y="${yTop + MATCH_H / 2 + fs + 2}"
              text-anchor="middle"
              font-family="'Segoe UI',Arial,sans-serif" font-size="${clubFs}" fill="#94a3b8" font-style="italic">Exempté</text>
      </g>`;
    }

    const mkRow = (
      fencer: TableauMatchForPDF['fencerA'],
      score: number | null,
      isWinner: boolean,
      rowY: number
    ): string => {
      const name = fencer
        ? truncate(`${fencer.lastName.toUpperCase()} ${fencer.firstName?.charAt(0) ?? ''}.`, 22)
        : '';
      const club = showClub && fencer?.club ? truncate(fencer.club, 20) : '';
      const bg = isWinner
        ? '#dcfce7'
        : fencer
          ? rowY === yTop
            ? '#f0f7ff'
            : '#ffffff'
          : '#f8fafc';
      const tc = isWinner ? green : '#1e293b';
      const fw = isWinner ? '700' : '500';
      const nameY = rowY + (club ? ROW_H * 0.38 : ROW_H * 0.5);
      const clubY = rowY + ROW_H * 0.75;

      return `<rect x="${x}" y="${rowY}" width="${nameW}" height="${ROW_H}" fill="${bg}"/>
        <rect x="${x + nameW}" y="${rowY}" width="${SCORE_W}" height="${ROW_H}" fill="${bg}"/>
        ${
          fencer
            ? `<text x="${x + 4}" y="${nameY}" dominant-baseline="middle"
              font-family="'Segoe UI',Arial,sans-serif" font-size="${fs}" font-weight="${fw}" fill="${tc}">${name}</text>`
            : `<line x1="${x + 4}" y1="${nameY}" x2="${x + nameW - 8}" y2="${nameY}" stroke="#cbd5e1" stroke-width="0.75" stroke-dasharray="3,4"/>`
        }
        ${
          club
            ? `<text x="${x + 4}" y="${clubY}" dominant-baseline="middle"
              font-family="'Segoe UI',Arial,sans-serif" font-size="${clubFs}" fill="#94a3b8">${club}</text>`
            : ''
        }
        <text x="${x + nameW + SCORE_W / 2}" y="${rowY + ROW_H / 2}" text-anchor="middle" dominant-baseline="middle"
              font-family="'Segoe UI',Arial,sans-serif" font-size="${scoreFs}" font-weight="700" fill="${tc}">${score !== null ? `${isWinner ? 'V ' : ''}${score}` : isWinner ? 'V' : ''}</text>`;
    };

    return `<g>
      <rect x="${x}" y="${yTop}" width="${MATCH_W}" height="${MATCH_H}" fill="white" stroke="#e2e8f0" stroke-width="0.75" rx="2"/>
      ${mkRow(fencerA, scoreA, winA, yTop)}
      <line x1="${x}" y1="${yTop + ROW_H}" x2="${x + MATCH_W}" y2="${yTop + ROW_H}" stroke="#e2e8f0" stroke-width="0.75"/>
      <line x1="${x + nameW}" y1="${yTop}" x2="${x + nameW}" y2="${yTop + MATCH_H}" stroke="#e2e8f0" stroke-width="0.75"/>
      ${mkRow(fencerB, scoreB, winB, yTop + ROW_H)}
      <rect x="${x}" y="${yTop}" width="${MATCH_W}" height="${MATCH_H}" fill="none" stroke="#94a3b8" stroke-width="1" rx="2"/>
    </g>`;
  };

  // ── SVG: all match boxes ────────────────────────────────────────────────────
  const matchBoxes = [
    ...mainMatches.map(m => renderMatchBox(m, colX(m.round), matchTopY(m.round, m.position))),
    ...(petiteFinale ? [renderMatchBox(petiteFinale, colX(2), SVG_H - BOT_MARGIN - MATCH_H)] : []),
  ].join('\n  ');

  // ── SVG: footer ─────────────────────────────────────────────────────────────
  const svgFooter = `
  <line x1="${MARGIN_L}" y1="${SVG_H - 10}" x2="${VBW - MARGIN_L}" y2="${SVG_H - 10}" stroke="#e2e8f0" stroke-width="0.75"/>
  <text x="${MARGIN_L}" y="${SVG_H - 3}" font-family="'Segoe UI',Arial,sans-serif" font-size="7" fill="#94a3b8">BellePoule Modern</text>
  <text x="${VBW - MARGIN_L}" y="${SVG_H - 3}" font-family="'Segoe UI',Arial,sans-serif" font-size="7" fill="#94a3b8" text-anchor="end">${now}</text>`;

  // ── Assemble ─────────────────────────────────────────────────────────────────
  const cssOverrides = template ? buildCssOverrides(template) : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    ${cssOverrides}
    @page { size: A4 landscape; margin: 0; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 297mm; height: 210mm; overflow: hidden; }
    svg { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${VBW} ${SVG_H}"
     preserveAspectRatio="xMinYMid meet">
  ${svgHeader}
  ${svgGoldBar}
  ${roundLabels}
  ${petiteFinaleLabel}
  <g id="connectors">${connectors}</g>
  <g id="matches">${matchBoxes}</g>
  ${svgFooter}
</svg>
</body>
</html>`;
}

// ─── Export Arbre Multi-Pages (poster mural) ─────────────────────────────────

export function generateBracketTreeMultiPageHTML(
  matches: TableauMatchForPDF[],
  title: string,
  logoBase64?: string,
  template?: PdfTemplate
): string {
  // ── Layout constants (wall-poster scale ≈ 2× single-page) ──────────────────
  const MATCH_W = 260;
  const H_GAP = 80;
  const SCORE_W = 40;
  const HEADER_H = 50;
  const GOLD_H = 4;
  const LABEL_H = 22;
  const TOP_MARGIN = HEADER_H + GOLD_H + LABEL_H;
  const BOT_MARGIN = 24;
  const MARGIN_L = 20;

  // ── Separate petite-finale from main bracket ────────────────────────────────
  const petiteFinale = matches.find(m => m.round === 3);
  const mainMatches = matches.filter(m => m.round !== 3 && m.round >= 2);

  if (mainMatches.length === 0) throw new Error('Aucun match dans le tableau principal');

  const tableauSize = Math.max(...mainMatches.map(m => m.round));
  const numRounds = Math.round(Math.log2(tableauSize));

  // ── Page tiling: A4 landscape minus 11mm CSS strip → 297mm × 199mm usable ──
  const A4_RATIO = 297 / 199;
  const cols: 1 | 2 = tableauSize >= 64 ? 2 : 1;
  const rows = 2;
  const totalPages = cols * rows;

  const naturalW = MARGIN_L + numRounds * MATCH_W + (numRounds - 1) * H_GAP + MARGIN_L;
  const VBW = Math.max(1200, naturalW);
  const qW = VBW / cols;
  const qH = Math.round(qW / A4_RATIO);
  const SVG_H = qH * rows;

  // ── Vertical slot height ─────────────────────────────────────────────────────
  const firstRoundCount = tableauSize / 2;
  const USABLE_H = SVG_H - TOP_MARGIN - BOT_MARGIN;
  const SLOT_H = USABLE_H / firstRoundCount;
  const ROW_H = Math.max(10, Math.min(32, Math.floor(SLOT_H * 0.45)));
  const MATCH_H = ROW_H * 2;

  // Snap page split to nearest inter-match gap to avoid cutting through match boxes
  const splitIdx = Math.round((qH - TOP_MARGIN) / SLOT_H - 0.5);
  const nearMatchCY = TOP_MARGIN + (splitIdx + 0.5) * SLOT_H;
  const cutY =
    Math.abs(qH - nearMatchCY) < MATCH_H / 2
      ? Math.round(
          Math.abs(TOP_MARGIN + splitIdx * SLOT_H - qH) <=
            Math.abs(TOP_MARGIN + (splitIdx + 1) * SLOT_H - qH)
            ? TOP_MARGIN + splitIdx * SLOT_H
            : TOP_MARGIN + (splitIdx + 1) * SLOT_H
        )
      : qH;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  const colX = (r: number): number =>
    MARGIN_L + Math.round(Math.log2(tableauSize / r)) * (MATCH_W + H_GAP);

  const matchCenterY = (r: number, p: number): number =>
    TOP_MARGIN + (p + 0.5) * (tableauSize / r) * SLOT_H;

  const matchTopY = (r: number, p: number): number => matchCenterY(r, p) - MATCH_H / 2;

  // ── Colours ──────────────────────────────────────────────────────────────────
  const navy = template?.colors.navy ?? '#1a2e4a';
  const gold = template?.colors.gold ?? '#c9a227';
  const green = template?.colors.green ?? '#166534';
  const now = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  // ── SVG: header (visible on top-row pages via viewBox) ───────────────────────
  const svgHeader = `
  <rect x="0" y="0" width="${VBW}" height="${HEADER_H}" fill="${navy}"/>
  ${logoBase64 ? `<image href="${logoBase64}" x="12" y="6" width="38" height="38" preserveAspectRatio="xMinYMid meet"/>` : ''}
  <text x="${logoBase64 ? 56 : VBW / 2}" y="28"
        font-family="'Segoe UI',Arial,sans-serif" font-size="18" font-weight="700" fill="white"
        ${logoBase64 ? '' : 'text-anchor="middle"'}>${title}</text>
  <text x="${logoBase64 ? 56 : VBW / 2}" y="43"
        font-family="'Segoe UI',Arial,sans-serif" font-size="10" fill="#f5e6a3"
        ${logoBase64 ? '' : 'text-anchor="middle"'}>Tableau d'élimination directe — ${now}</text>
  <text x="${VBW - 16}" y="38" font-family="'Segoe UI',Arial,sans-serif"
        font-size="26" font-weight="900" fill="${gold}" text-anchor="end">ED</text>`;

  const svgGoldBar = `
  <rect x="0" y="${HEADER_H}" width="${VBW}" height="${GOLD_H}" fill="${gold}"/>`;

  // ── SVG: round labels at top and midpoint (both page-rows get labels) ────────
  const roundNums = [...new Set(mainMatches.map(m => m.round))].sort((a, b) => b - a);
  const mkRoundLabels = (baseY: number) =>
    roundNums
      .map(r => {
        const cx = colX(r) + MATCH_W / 2;
        return `<text x="${cx}" y="${baseY}" font-family="'Segoe UI',Arial,sans-serif"
        font-size="11" font-weight="600" fill="${navy}" text-anchor="middle">${getTableauRoundName(r)}</text>`;
      })
      .join('\n  ');

  const roundLabels = mkRoundLabels(TOP_MARGIN - 7) + '\n  ' + mkRoundLabels(cutY + LABEL_H - 5);

  const petiteFinaleLabel = petiteFinale
    ? `
  <text x="${colX(2) + MATCH_W / 2}" y="${SVG_H - BOT_MARGIN - MATCH_H - 10}"
        font-family="'Segoe UI',Arial,sans-serif"
        font-size="10" font-weight="600" fill="${navy}" text-anchor="middle">Petite finale</text>`
    : '';

  // ── SVG: connection lines ─────────────────────────────────────────────────────
  const connectors = mainMatches
    .filter(m => m.round > 2)
    .map(m => {
      const { round: r, position: p } = m;
      const x = colX(r);
      const cy = matchCenterY(r, p);
      const midX = x + MATCH_W + H_GAP / 2;
      const parentX = colX(r / 2);
      const stubH = `<line x1="${x + MATCH_W}" y1="${cy}" x2="${midX}" y2="${cy}" stroke="#94a3b8" stroke-width="2"/>`;
      if (p % 2 !== 0) return stubH;
      const sibCy = matchCenterY(r, p + 1);
      const parentY = (cy + sibCy) / 2;
      return `${stubH}
    <line x1="${midX}" y1="${cy}" x2="${midX}" y2="${sibCy}" stroke="#94a3b8" stroke-width="2"/>
    <line x1="${midX}" y1="${parentY}" x2="${parentX}" y2="${parentY}" stroke="#94a3b8" stroke-width="2"/>`;
    })
    .join('\n  ');

  // ── SVG: match box renderer ───────────────────────────────────────────────────
  const renderMatchBox = (match: TableauMatchForPDF, x: number, yTop: number): string => {
    const { fencerA, fencerB, scoreA, scoreB, winner, isBye } = match;
    const fa_id = (fencerA as any)?.id as string | undefined;
    const fb_id = (fencerB as any)?.id as string | undefined;
    const wid = winner?.id;
    const winA = !!(wid && fa_id && wid === fa_id);
    const winB = !!(wid && fb_id && wid === fb_id);
    const nameW = MATCH_W - SCORE_W;
    const fs = Math.max(9, Math.min(13, Math.floor(ROW_H * 0.42)));
    const clubFs = Math.max(8, fs - 2);
    const scoreFs = Math.max(10, Math.min(15, Math.floor(ROW_H * 0.5)));

    if (isBye) {
      const byeName = fencerA
        ? truncate(`${fencerA.lastName.toUpperCase()} ${fencerA.firstName?.charAt(0) ?? ''}.`, 24)
        : fencerB
          ? truncate(`${fencerB.lastName.toUpperCase()} ${fencerB.firstName?.charAt(0) ?? ''}.`, 24)
          : '';
      return `<g>
        <rect x="${x}" y="${yTop}" width="${MATCH_W}" height="${MATCH_H}" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1.5" rx="3"/>
        ${
          byeName
            ? `<text x="${x + MATCH_W / 2}" y="${yTop + MATCH_H / 2 - 3}"
              text-anchor="middle" dominant-baseline="auto"
              font-family="'Segoe UI',Arial,sans-serif" font-size="${fs}" fill="#475569" font-weight="600">${byeName}</text>`
            : ''
        }
        <text x="${x + MATCH_W / 2}" y="${yTop + MATCH_H / 2 + fs + 3}"
              text-anchor="middle"
              font-family="'Segoe UI',Arial,sans-serif" font-size="${clubFs}" fill="#94a3b8" font-style="italic">Exempté</text>
      </g>`;
    }

    const mkRow = (
      fencer: TableauMatchForPDF['fencerA'],
      score: number | null,
      isWinner: boolean,
      rowY: number
    ): string => {
      const name = fencer
        ? truncate(`${fencer.lastName.toUpperCase()} ${fencer.firstName?.charAt(0) ?? ''}.`, 24)
        : '';
      const club = fencer?.club ? truncate(fencer.club, 22) : '';
      const bg = isWinner
        ? '#dcfce7'
        : fencer
          ? rowY === yTop
            ? '#f0f7ff'
            : '#ffffff'
          : '#f8fafc';
      const tc = isWinner ? green : '#1e293b';
      const fw = isWinner ? '700' : '500';
      const nameY = rowY + (club ? ROW_H * 0.38 : ROW_H * 0.5);
      const clubY = rowY + ROW_H * 0.75;
      return `<rect x="${x}" y="${rowY}" width="${nameW}" height="${ROW_H}" fill="${bg}"/>
        <rect x="${x + nameW}" y="${rowY}" width="${SCORE_W}" height="${ROW_H}" fill="${bg}"/>
        ${
          fencer
            ? `<text x="${x + 5}" y="${nameY}" dominant-baseline="middle"
              font-family="'Segoe UI',Arial,sans-serif" font-size="${fs}" font-weight="${fw}" fill="${tc}">${name}</text>`
            : `<line x1="${x + 5}" y1="${nameY}" x2="${x + nameW - 8}" y2="${nameY}" stroke="#cbd5e1" stroke-width="0.75" stroke-dasharray="3,4"/>`
        }
        ${
          club
            ? `<text x="${x + 5}" y="${clubY}" dominant-baseline="middle"
              font-family="'Segoe UI',Arial,sans-serif" font-size="${clubFs}" fill="#94a3b8">${club}</text>`
            : ''
        }
        <text x="${x + nameW + SCORE_W / 2}" y="${rowY + ROW_H / 2}" text-anchor="middle" dominant-baseline="middle"
              font-family="'Segoe UI',Arial,sans-serif" font-size="${scoreFs}" font-weight="700" fill="${tc}">${score !== null ? `${isWinner ? 'V ' : ''}${score}` : isWinner ? 'V' : ''}</text>`;
    };

    return `<g>
      <rect x="${x}" y="${yTop}" width="${MATCH_W}" height="${MATCH_H}" fill="white" stroke="#e2e8f0" stroke-width="1" rx="3"/>
      ${mkRow(fencerA, scoreA, winA, yTop)}
      <line x1="${x}" y1="${yTop + ROW_H}" x2="${x + MATCH_W}" y2="${yTop + ROW_H}" stroke="#e2e8f0" stroke-width="1"/>
      <line x1="${x + nameW}" y1="${yTop}" x2="${x + nameW}" y2="${yTop + MATCH_H}" stroke="#e2e8f0" stroke-width="1"/>
      ${mkRow(fencerB, scoreB, winB, yTop + ROW_H)}
      <rect x="${x}" y="${yTop}" width="${MATCH_W}" height="${MATCH_H}" fill="none" stroke="#94a3b8" stroke-width="1.5" rx="3"/>
    </g>`;
  };

  // ── SVG: all match boxes ──────────────────────────────────────────────────────
  const matchBoxes = [
    ...mainMatches.map(m => renderMatchBox(m, colX(m.round), matchTopY(m.round, m.position))),
    ...(petiteFinale ? [renderMatchBox(petiteFinale, colX(2), SVG_H - BOT_MARGIN - MATCH_H)] : []),
  ].join('\n  ');

  // ── SVG: footer ───────────────────────────────────────────────────────────────
  const svgFooter = `
  <line x1="${MARGIN_L}" y1="${SVG_H - 12}" x2="${VBW - MARGIN_L}" y2="${SVG_H - 12}" stroke="#e2e8f0" stroke-width="1"/>
  <text x="${MARGIN_L}" y="${SVG_H - 4}" font-family="'Segoe UI',Arial,sans-serif" font-size="9" fill="#94a3b8">BellePoule Modern</text>
  <text x="${VBW - MARGIN_L}" y="${SVG_H - 4}" font-family="'Segoe UI',Arial,sans-serif" font-size="9" fill="#94a3b8" text-anchor="end">${now}</text>`;

  // ── Full SVG content (embedded identically in each page) ─────────────────────
  const svgContent = `${svgHeader}
  ${svgGoldBar}
  ${roundLabels}
  ${petiteFinaleLabel}
  <g>${connectors}</g>
  <g>${matchBoxes}</g>
  ${svgFooter}`;

  // ── Assemble pages ────────────────────────────────────────────────────────────
  const cssOverrides = template ? buildCssOverrides(template) : '';

  const pagesHtml = Array.from({ length: totalPages }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const num = i + 1;
    const vDesc = row === 0 ? 'Haut' : 'Bas';
    const hDesc = cols === 2 ? (col === 0 ? 'Gauche' : 'Droite') : '';
    const desc = [vDesc, hDesc].filter(Boolean).join(' ');
    const adj: string[] = [];
    if (row > 0) adj.push(`↑ p.${(row - 1) * cols + col + 1}`);
    if (col > 0) adj.push(`← p.${row * cols + col}`);
    if (col < cols - 1) adj.push(`→ p.${row * cols + col + 2}`);
    if (row < rows - 1) adj.push(`↓ p.${(row + 1) * cols + col + 1}`);

    const isFirst = i === 0;
    return `
<div class="page${i === totalPages - 1 ? ' last' : ''}">
  <div class="strip${isFirst ? '' : ' strip--mini'}" style="background:${navy};">
    ${
      isFirst
        ? `<span class="strip-title">${title}</span>
    <span class="strip-sep">·</span>
    <span class="strip-page">${num}/${totalPages}&nbsp;·&nbsp;${desc}</span>
    ${adj.length ? `<span class="strip-sep">·</span><span class="strip-adj">${adj.join('&nbsp;')}</span>` : ''}`
        : `<span class="strip-page strip-page--mini">${num}/${totalPages}&nbsp;·&nbsp;${desc}${adj.length ? '&nbsp;·&nbsp;' + adj.join('&nbsp;') : ''}</span>`
    }
  </div>
  <div class="bracket-view">
    <svg xmlns="http://www.w3.org/2000/svg"
         viewBox="${col * qW} ${row === 0 ? 0 : cutY} ${qW} ${row === 0 ? cutY : SVG_H - cutY}"
         preserveAspectRatio="xMinYMin meet">
      ${svgContent}
    </svg>
  </div>
</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    ${cssOverrides}
    @page { size: A4 landscape; margin: 0; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: white; }
    .page {
      width: 297mm;
      height: 210mm;
      display: flex;
      flex-direction: column;
      page-break-after: always;
      overflow: hidden;
    }
    .page.last { page-break-after: auto; }
    .strip {
      flex: 0 0 11mm;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px;
    }
    .strip-title { font-family: 'Segoe UI',Arial,sans-serif; font-size: 11pt; font-weight: 700; color: white; }
    .strip-page  { font-family: 'Segoe UI',Arial,sans-serif; font-size: 9pt; color: #f5e6a3; }
    .strip-sep   { font-family: 'Segoe UI',Arial,sans-serif; font-size: 9pt; color: #7a9bbf; }
    .strip-adj   { font-family: 'Segoe UI',Arial,sans-serif; font-size: 8pt; color: #a8c4d8; }
    .strip--mini { flex: 0 0 4mm; padding: 0 6px; }
    .strip-page--mini { font-family: 'Segoe UI',Arial,sans-serif; font-size: 6pt; color: #a8c4d8; }
    .bracket-view { flex: 1; overflow: hidden; }
    .bracket-view svg { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}

export async function exportBracketTreeToPDF(
  matches: TableauMatchForPDF[],
  title: string = 'Arbre — Élimination Directe',
  logoBase64?: string,
  template?: PdfTemplate
): Promise<void> {
  const tableauSize = Math.max(
    ...matches.filter(m => m.round !== 3 && m.round >= 2).map(m => m.round)
  );
  const html =
    tableauSize >= 32
      ? generateBracketTreeMultiPageHTML(matches, title, logoBase64, template)
      : generateBracketTreeHTML(matches, title, logoBase64, template);
  await savePDF(html, 'arbre-elimination.pdf');
}

export async function printBracketTreeHTML(
  matches: TableauMatchForPDF[],
  title: string = 'Arbre — Élimination Directe',
  logoBase64?: string,
  template?: PdfTemplate
): Promise<void> {
  const tableauSize = Math.max(
    ...matches.filter(m => m.round !== 3 && m.round >= 2).map(m => m.round)
  );
  const html =
    tableauSize >= 32
      ? generateBracketTreeMultiPageHTML(matches, title, logoBase64, template)
      : generateBracketTreeHTML(matches, title, logoBase64, template);
  const api = (window as any).electronAPI;
  if (!api?.file?.printHtml) throw new Error('API Electron non disponible');
  const res = await api.file.printHtml(html);
  if (!res?.success) throw new Error(res?.error ?? "Échec de l'impression");
}
