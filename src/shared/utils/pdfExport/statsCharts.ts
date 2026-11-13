/**
 * BellePoule Modern - Graphiques des exports PDF de statistiques :
 * mannequins des zones (touches données / reçues), touches par match, résumé par club.
 * Licensed under GPL-3.0
 */

import type { FencerCompetitionStats } from '../../types';
import { pdfT } from './core';
import { touchZoneFigureSvg, zonePaints, ZONE_HUES, type TouchZone } from '../touchZoneFigure';

export const STATS_CHARTS_CSS = `
.charts { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 10px; page-break-inside: avoid; }
.figure-card { flex: 1; border: 2px solid #93c5fd; border-radius: 6px; padding: 8px; display: flex; gap: 10px; align-items: center; }
.figure-card.received { border-color: #fca5a5; }
.figure-card .fig { text-align: center; }
.figure-title { font-size: 11px; font-weight: bold; color: #1d4ed8; margin-bottom: 4px; }
.figure-card.received .figure-title { color: #b91c1c; }
.zone-legend { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; margin-top: 4px; }
.zone-legend div { border-radius: 3px; padding: 2px; font-size: 8px; text-align: center; }
.zone-legend b { display: block; font-size: 11px; }
.zone-bars { flex: 1; }
.zone-bar { margin-bottom: 6px; }
.zone-bar-label { display: flex; justify-content: space-between; font-size: 9px; color: #374151; margin-bottom: 2px; }
.bar-track { height: 8px; background: #f3f4f6; border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; }
.zone-total { font-size: 9px; color: #6b7280; margin-top: 4px; }
.zone-total b { color: #111; }
.match-chart { margin-bottom: 10px; page-break-inside: avoid; }
.match-chart-row { display: grid; grid-template-columns: 130px 1fr; gap: 6px; align-items: center; margin-bottom: 3px; font-size: 9px; }
.match-chart-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.match-chart-name .w { color: #16a34a; font-weight: bold; }
.match-chart-name .l { color: #dc2626; }
.pair-bar { display: flex; flex-direction: column; gap: 1px; }
.pair-bar .bar { height: 6px; border-radius: 2px; }
.pair-bar .given { background: #3b82f6; }
.pair-bar .received { background: #ef4444; }
.pair-val { font-size: 8px; color: #6b7280; }
.chart-legend { font-size: 9px; color: #6b7280; margin-bottom: 4px; }
.chart-legend span { display: inline-block; width: 10px; height: 6px; border-radius: 2px; margin: 0 3px 0 8px; }
.club-page { padding: 24px 28px; page-break-before: always; }
.club-block { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; margin-bottom: 12px; page-break-inside: avoid; }
.club-block h3 { font-size: 13px; color: #1e3a8a; margin-bottom: 6px; }
.club-kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 8px; }
.club-kpis div { background: #f1f5f9; border-radius: 4px; padding: 4px 6px; font-size: 8px; color: #6b7280; text-transform: uppercase; }
.club-kpis b { display: block; font-size: 14px; color: #1e3a8a; text-transform: none; }
`;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Counts = [number, number, number];
const ZONES: TouchZone[] = ['a', 'b', 'c'];
const ZONE_KEYS: Record<TouchZone, [string, string]> = {
  a: ['zone_a_label', 'Main + manche du sabre'],
  b: ['zone_b_label', 'Bras ou jambe'],
  c: ['zone_c_label', 'Tronc ou tête'],
};
const PTS: Record<TouchZone, number> = { a: 1, b: 3, c: 5 };

/** Bloc mannequin + légende + barres par zone. */
function figureCard(counts: Counts, received: boolean): string {
  const paints = zonePaints(counts);
  const total = counts[0] + counts[1] + counts[2];
  const points = counts[0] + counts[1] * 3 + counts[2] * 5;
  const title = received
    ? pdfT('touches_received_title', 'Touches reçues')
    : pdfT('touches_given_title', 'Touches données');
  const legend = ZONES.map(
    (z, i) =>
      `<div style="background:${paints[z].fill};color:${paints[z].text}"><b>${counts[i]}</b>${z.toUpperCase()} · ${PTS[z]} pt${PTS[z] > 1 ? 's' : ''}</div>`
  ).join('');
  const bars = ZONES.map((z, i) => {
    const pct = total > 0 ? (counts[i] / total) * 100 : 0;
    const [key, fr] = ZONE_KEYS[z];
    return `<div class="zone-bar"><div class="zone-bar-label"><span>${z.toUpperCase()} · ${pdfT(key, fr)}</span><span>${counts[i]} (${pct.toFixed(0)}%)</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct.toFixed(1)}%;background:${ZONE_HUES[z].medium}"></div></div></div>`;
  }).join('');
  const totalLabel = received
    ? pdfT('points_received', 'Points reçus')
    : pdfT('points_given', 'Points marqués');
  return `<div class="figure-card${received ? ' received' : ''}">
    <div class="fig"><div class="figure-title">${title}</div>${touchZoneFigureSvg(counts, { width: 80, height: 124 }, `${title} A=${counts[0]} B=${counts[1]} C=${counts[2]}`)}
      <div class="zone-legend">${legend}</div></div>
    <div class="zone-bars">${bars}<div class="zone-total">${totalLabel} : <b>${points}</b></div></div>
  </div>`;
}

/** Les deux corps : touches données et reçues. */
export function zoneFiguresHtml(given: Counts, received: Counts): string {
  return `<div class="charts">${figureCard(given, false)}${figureCard(received, true)}</div>`;
}

export interface MatchChartRow {
  label: string;
  given: number;
  received: number;
  isVictory: boolean;
}

/** Touches données (bleu) / reçues (rouge) par match. */
export function matchTouchesChartHtml(rows: MatchChartRow[]): string {
  const scored = rows.filter(r => r.given > 0 || r.received > 0);
  if (scored.length === 0) return '';
  const max = Math.max(...scored.map(r => Math.max(r.given, r.received)), 1);
  const lines = scored
    .map(
      r => `<div class="match-chart-row">
      <div class="match-chart-name"><span class="${r.isVictory ? 'w' : 'l'}">${r.isVictory ? 'V' : 'D'}</span> ${esc(r.label)}</div>
      <div class="pair-bar">
        <div class="bar given" style="width:${((r.given / max) * 100).toFixed(1)}%"></div>
        <div class="bar received" style="width:${((r.received / max) * 100).toFixed(1)}%"></div>
        <div class="pair-val">${r.given} – ${r.received}</div>
      </div>
    </div>`
    )
    .join('');
  return `<div class="match-chart">
    <div class="chart-legend">${pdfT('touches_per_match', 'Touches par match')} :<span style="background:#3b82f6"></span>${pdfT('touches_given_title', 'Touches données')}<span style="background:#ef4444"></span>${pdfT('touches_received_title', 'Touches reçues')}</div>
    ${lines}
  </div>`;
}

export interface FencerResult {
  victories: number;
  defeats: number;
  /** Touches données / reçues (score des matchs) */
  td: number;
  tr: number;
}

/** Agrège par club (tireurs sans club regroupés). */
export function groupByClub(
  fencers: FencerCompetitionStats[]
): Map<string, FencerCompetitionStats[]> {
  const map = new Map<string, FencerCompetitionStats[]>();
  for (const f of fencers) {
    const club = f.fencerClub?.trim() || '';
    const list = map.get(club) ?? [];
    list.push(f);
    map.set(club, list);
  }
  return new Map(
    [...map.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
  );
}

/** Page(s) « Résumé par club » en fin d'export. */
export function clubSummaryHtml(
  fencers: FencerCompetitionStats[],
  results: Map<string, FencerResult>,
  isLaser: boolean,
  competitionTitle: string,
  competitionDate: string
): string {
  const clubs = groupByClub(fencers);
  const noClub = pdfT('no_club', 'Sans club');
  const sum = (list: FencerCompetitionStats[], f: (s: FencerCompetitionStats) => number) =>
    list.reduce((acc, s) => acc + (f(s) || 0), 0);

  const overviewRows: string[] = [];
  const blocks: string[] = [];
  for (const [club, list] of clubs) {
    const name = esc(club || noClub);
    const res = list.map(
      f => results.get(f.fencerId) ?? { victories: 0, defeats: 0, td: 0, tr: 0 }
    );
    const v = res.reduce((a, r) => a + r.victories, 0);
    const d = res.reduce((a, r) => a + r.defeats, 0);
    const td = res.reduce((a, r) => a + r.td, 0);
    const tr = res.reduce((a, r) => a + r.tr, 0);
    const cards = sum(list, s => s.whiteCards + s.yellowCards + s.redCards);
    const pct = v + d > 0 ? Math.round((v / (v + d)) * 100) : 0;
    overviewRows.push(
      `<tr><td>${name}</td><td class="tc">${list.length}</td><td class="tc">${v}</td><td class="tc">${d}</td><td class="tc">${pct}%</td><td class="tc">${td}</td><td class="tc">${tr}</td><td class="tc">${td - tr > 0 ? '+' : ''}${td - tr}</td><td class="tc">${cards || '—'}</td></tr>`
    );

    const given: Counts = [
      sum(list, s => s.touchesZoneA),
      sum(list, s => s.touchesZoneB),
      sum(list, s => s.touchesZoneC),
    ];
    const received: Counts = [
      sum(list, s => s.receivedZoneA),
      sum(list, s => s.receivedZoneB),
      sum(list, s => s.receivedZoneC),
    ];
    const members = [...list]
      .sort((a, b) => {
        const ra = results.get(a.fencerId);
        const rb = results.get(b.fencerId);
        return (rb?.victories ?? 0) - (ra?.victories ?? 0) || (rb?.td ?? 0) - (ra?.td ?? 0);
      })
      .map(f => {
        const r = results.get(f.fencerId) ?? { victories: 0, defeats: 0, td: 0, tr: 0 };
        return `<tr><td>${esc(`${f.fencerLastName} ${f.fencerFirstName}`)}</td><td class="tc">${r.victories}</td><td class="tc">${r.defeats}</td><td class="tc">${r.td}</td><td class="tc">${r.tr}</td>${isLaser ? `<td class="tc">${f.totalTouchPoints}</td><td class="tc">${f.receivedTouchPoints ?? 0}</td>` : ''}</tr>`;
      })
      .join('');
    blocks.push(`<div class="club-block">
      <h3>${name}</h3>
      <div class="club-kpis">
        <div>${pdfT('fencers', 'Tireurs')}<b>${list.length}</b></div>
        <div>${pdfT('victories_defeats', 'V / D')}<b>${v} / ${d}</b></div>
        <div>${pdfT('col_td', 'TD')} / ${pdfT('col_tr', 'TR')}<b>${td} / ${tr}</b></div>
        <div>${pdfT('cards', 'Cartons')}<b>${cards}</b></div>
        <div>${pdfT('avg_duration', 'Durée moy.')}<b>${fmtDuration(list)}</b></div>
      </div>
      ${isLaser ? zoneFiguresHtml(given, received) : ''}
      <table class="ranking-table"><thead><tr><th>${pdfT('fencer', 'Tireur')}</th><th class="tc">V</th><th class="tc">D</th><th class="tc">${pdfT('col_td', 'TD')}</th><th class="tc">${pdfT('col_tr', 'TR')}</th>${isLaser ? `<th class="tc">${pdfT('points_given', 'Points marqués')}</th><th class="tc">${pdfT('points_received', 'Points reçus')}</th>` : ''}</tr></thead><tbody>${members}</tbody></table>
    </div>`);
  }

  return `<div class="club-page">
    <div class="header"><h1>${pdfT('club_summary', 'Résumé par club')} — ${esc(competitionTitle)}</h1><h2>${esc(competitionDate)}</h2></div>
    <table class="ranking-table"><thead><tr><th>${pdfT('col_club', 'Club')}</th><th class="tc">${pdfT('fencers', 'Tireurs')}</th><th class="tc">V</th><th class="tc">D</th><th class="tc">%V</th><th class="tc">${pdfT('col_td', 'TD')}</th><th class="tc">${pdfT('col_tr', 'TR')}</th><th class="tc">+/-</th><th class="tc">${pdfT('cards', 'Cartons')}</th></tr></thead><tbody>${overviewRows.join('')}</tbody></table>
    <div class="section-title">${pdfT('club_details', 'Détail par club')}</div>
    ${blocks.join('')}
  </div>`;
}

function fmtDuration(list: FencerCompetitionStats[]): string {
  const total = list.reduce((a, s) => a + (s.totalDurationSeconds || 0), 0);
  const matches = list.reduce((a, s) => a + (s.matchesPlayed || 0), 0);
  if (!matches) return '—';
  const sec = Math.round(total / matches);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
