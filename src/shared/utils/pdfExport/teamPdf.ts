/**
 * BellePoule Modern - PDF Export Service
 * Export PDF des compétitions par équipes : poules, tableau, classement (#1087)
 * Licensed under GPL-3.0
 */

import type { TeamMatchRow, TeamRow } from '../../../features/teams/types/team.types';
import {
  calculateTableSize,
  calculateTeamPoolRanking,
  placeRankedTeamsInTable,
  resolveTeamTableauSlot,
} from '../../../features/teams/utils/teamCalculations';
import {
  calculateLaserArenaMatchScore,
  calculateLaserArenaPoolRanking,
} from '../../../features/teams/utils/laserArenaCalculations';
import { savePDF, BASE_CSS, pdfLang, pdfT } from './core';
import { getActiveLocale } from '../localeFormat';

export interface TeamPdfOptions {
  title: string;
  teams: TeamRow[];
  fencerName: (id: string) => string;
  /** Format arène Sabre Laser : score = total des points, classement aux points */
  isLaserArena?: boolean;
}

export interface TeamFinalRankingRow {
  rank: number;
  team: TeamRow;
}

const esc = (s: string | number | null | undefined) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const roundLabel = (round: number): string =>
  ({
    1: pdfT('round_final', 'Finale'),
    2: pdfT('round_semi', 'Demi-finales'),
    4: pdfT('round_quarter', 'Quarts de finale'),
  })[round] ?? pdfT('round_table', 'Tableau de {{n}}', { n: round * 2 });

function matchScore(m: TeamMatchRow, isLaserArena?: boolean) {
  return isLaserArena
    ? calculateLaserArenaMatchScore(m)
    : { scoreA: m.scoreBoutsA, scoreB: m.scoreBoutsB };
}

/** Poules équipes regroupées par numéro (format arène : A/B/C ; relais FIE : poule unique). */
export function groupTeamPools(
  teams: TeamRow[],
  matches: TeamMatchRow[]
): { number: number; teams: TeamRow[]; matches: TeamMatchRow[] }[] {
  const byNumber = new Map<number, TeamMatchRow[]>();
  for (const m of matches) {
    const n = m.poolNumber ?? 1;
    byNumber.set(n, [...(byNumber.get(n) ?? []), m]);
  }
  return [...byNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, list]) => {
      const ids = new Set(list.flatMap(m => [m.teamAId, m.teamBId]));
      return { number, teams: teams.filter(t => ids.has(t.id)), matches: list };
    });
}

/**
 * Classement final : vainqueur du tableau 1er, finaliste 2e, perdants d'un tour de N matchs
 * classés N+1 ex æquo (3e, 5e, 9e…), départage par ordre de tête de série. Équipes encore
 * en lice en tête (classement provisoire). Sans tableau : ordre de poule.
 */
export function computeTeamFinalRanking(
  rankedTeams: TeamRow[],
  tableauMatches: TeamMatchRow[]
): { rows: TeamFinalRankingRow[]; provisional: boolean } {
  if (tableauMatches.length === 0 || rankedTeams.length < 2) {
    return {
      rows: rankedTeams.map((team, i) => ({ rank: i + 1, team })),
      provisional: tableauMatches.length === 0 && rankedTeams.length >= 2,
    };
  }
  const tableSize = calculateTableSize(rankedTeams.length);
  const placements = placeRankedTeamsInTable(rankedTeams, tableSize);
  const teamById = new Map(rankedTeams.map(t => [t.id, t]));
  const matchesByKey = new Map(tableauMatches.map(m => [`${m.round}-${m.position}`, m]));
  const eliminatedAt = new Map<string, number>();
  let championId: string | null = null;

  for (let round = tableSize / 2; round >= 1; round /= 2) {
    for (let position = 0; position < round; position++) {
      const slot = resolveTeamTableauSlot(
        round,
        position,
        tableSize,
        placements,
        matchesByKey,
        teamById
      );
      if (round === 1 && slot.isBye && slot.team) championId = slot.team.id;
      const m = slot.match;
      if (!m || m.status !== 'finished' || !m.winnerId || !slot.teamA || !slot.teamB) continue;
      const loser = m.winnerId === slot.teamA.id ? slot.teamB : slot.teamA;
      eliminatedAt.set(loser.id, round);
      if (round === 1) championId = m.winnerId;
    }
  }

  const seed = new Map(rankedTeams.map((t, i) => [t.id, i]));
  // Clé : champion 0, encore en lice 0.5, éliminé au tour de N matchs → N
  const key = (t: TeamRow) =>
    t.id === championId ? 0 : (eliminatedAt.get(t.id) ?? (championId ? Infinity : 0.5));
  const sorted = [...rankedTeams].sort(
    (a, b) => key(a) - key(b) || (seed.get(a.id) ?? 0) - (seed.get(b.id) ?? 0)
  );
  const rows = sorted.map((team, i) => {
    const elim = eliminatedAt.get(team.id);
    return { rank: team.id === championId ? 1 : elim !== undefined ? elim + 1 : i + 1, team };
  });
  return { rows, provisional: championId === null };
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

const TEAM_CSS = `
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 4mm; }
  th {
    background: var(--navy); color: var(--white);
    font-size: 8pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.6px; padding: 2mm 2.5mm; text-align: center;
  }
  td { padding: 1.6mm 2.5mm; border-bottom: 1px solid var(--gray-light); vertical-align: middle; }
  tr:nth-child(even) td { background: var(--gray-xlight); }
  h2 { font-size: 12pt; color: var(--navy); margin: 5mm 0 2mm; }
  h3 { font-size: 10pt; margin: 3mm 0 1.5mm; }
  .section { page-break-inside: avoid; }
  .relays td { font-size: 8pt; padding: 1mm 2.5mm; color: var(--gray-dark); }
  .win { font-weight: 700; }
  .muted { color: var(--gray-dark); font-style: italic; }
  .c { text-align: center; }
`;

function wrapDocument(title: string, subtitle: string, badge: string, body: string): string {
  const now = new Date().toLocaleDateString(getActiveLocale(), {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  return `<!DOCTYPE html>
<html lang="${pdfLang()}">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <style>
    ${BASE_CSS}
    ${TEAM_CSS}
  </style>
</head>
<body>
  <div class="doc-header">
    <div class="doc-header-left">
      <h1>${esc(title)}</h1>
      <div class="subtitle">${esc(subtitle)}</div>
    </div>
    <div class="doc-header-badge" style="font-size:11pt">${esc(badge)}</div>
  </div>
  <div class="gold-bar"></div>
${body}
  <div class="doc-footer">
    <span>BellePoule Modern</span>
    <span>${now}</span>
  </div>
</body>
</html>`;
}

function matchTable(
  m: TeamMatchRow,
  teamById: Map<string, TeamRow>,
  fencerName: (id: string) => string,
  isLaserArena?: boolean
): string {
  const a = teamById.get(m.teamAId)?.name ?? '?';
  const b = teamById.get(m.teamBId)?.name ?? '?';
  const { scoreA, scoreB } = matchScore(m, isLaserArena);
  const finished = m.status === 'finished';
  const winA = finished && m.winnerId === m.teamAId ? ' win' : '';
  const winB = finished && m.winnerId === m.teamBId ? ' win' : '';
  const relays = [...m.bouts]
    .sort((x, y) => x.boutOrder - y.boutOrder)
    .map(
      bt => `
      <tr>
        <td class="c">${bt.boutOrder}</td>
        <td>${esc(fencerName(bt.fencerAId))}</td>
        <td class="c">${bt.status === 'finished' ? `${bt.scoreA} – ${bt.scoreB}` : '—'}</td>
        <td>${esc(fencerName(bt.fencerBId))}</td>
      </tr>`
    )
    .join('');
  return `
  <table>
    <thead><tr>
      <th style="text-align:left">${esc(a)}</th>
      <th style="width:28mm">${finished ? pdfT('score', 'Score') : m.status === 'in_progress' ? pdfT('in_progress', 'En cours') : pdfT('to_play', 'À jouer')}</th>
      <th style="text-align:left">${esc(b)}</th>
    </tr></thead>
    <tbody>
      <tr>
        <td class="${winA.trim()}">${esc(a)}</td>
        <td class="c" style="font-size:11pt;font-weight:700">${scoreA} – ${scoreB}</td>
        <td class="${winB.trim()}">${esc(b)}</td>
      </tr>
    </tbody>
  </table>
  ${relays ? `<table class="relays"><thead><tr><th style="width:10mm">#</th><th style="text-align:left">${esc(a)}</th><th style="width:20mm"></th><th style="text-align:left">${esc(b)}</th></tr></thead><tbody>${relays}</tbody></table>` : ''}`;
}

function poolRankingTable(
  pool: { teams: TeamRow[]; matches: TeamMatchRow[] },
  isLaserArena?: boolean
): string {
  if (isLaserArena) {
    const rows = calculateLaserArenaPoolRanking(pool.teams, pool.matches)
      .map(
        (r, i) => `
      <tr>
        <td class="c">${i + 1}</td><td class="win">${esc(r.team.name)}</td><td>${esc(r.team.club)}</td>
        <td class="c">${r.victories}</td><td class="c">${r.defeats}</td>
        <td class="c">${r.pointsFor}</td><td class="c">${r.pointsAgainst}</td>
      </tr>`
      )
      .join('');
    return `<table><thead><tr><th style="width:10mm">${pdfT('col_rank', 'Rg')}</th><th style="text-align:left">${pdfT('col_team', 'Équipe')}</th><th style="text-align:left">${pdfT('col_club', 'Club')}</th><th>${pdfT('col_v', 'V')}</th><th>${pdfT('col_d', 'D')}</th><th>${pdfT('col_points_for', 'Points+')}</th><th>${pdfT('col_points_against', 'Points-')}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  const rows = calculateTeamPoolRanking(pool.teams, pool.matches)
    .map(
      (r, i) => `
      <tr>
        <td class="c">${i + 1}</td><td class="win">${esc(r.team.name)}</td><td>${esc(r.team.club)}</td>
        <td class="c">${r.victories}</td><td class="c">${r.defeats}</td>
        <td class="c">${r.boutsWon}</td><td class="c">${r.boutsLost}</td>
        <td class="c">${r.pointsFor}</td><td class="c">${r.pointsAgainst}</td>
      </tr>`
    )
    .join('');
  return `<table><thead><tr><th style="width:10mm">${pdfT('col_rank', 'Rg')}</th><th style="text-align:left">${pdfT('col_team', 'Équipe')}</th><th style="text-align:left">${pdfT('col_club', 'Club')}</th><th>${pdfT('col_v', 'V')}</th><th>${pdfT('col_d', 'D')}</th><th>${pdfT('col_relays_won', 'Relais G')}</th><th>${pdfT('col_relays_lost', 'Relais P')}</th><th>${pdfT('col_touches_for', 'Touches+')}</th><th>${pdfT('col_touches_against', 'Touches-')}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function generateTeamPoolsHTML(opts: TeamPdfOptions, matches: TeamMatchRow[]): string {
  const teamById = new Map(opts.teams.map(t => [t.id, t]));
  const pools = groupTeamPools(opts.teams, matches);
  const body = pools
    .map(pool => {
      const label =
        pools.length > 1
          ? pdfT('pool_n', 'Poule {{n}}', {
              n: opts.isLaserArena ? String.fromCharCode(64 + pool.number) : pool.number,
            })
          : pdfT('pool', 'Poule');
      const list = pool.matches
        .map(m => matchTable(m, teamById, opts.fencerName, opts.isLaserArena))
        .join('');
      return `
  <div class="section">
    <h2>${esc(label)} — ${pdfT('teams_count', '{{count}} équipes', { count: pool.teams.length })}</h2>
    ${poolRankingTable(pool, opts.isLaserArena)}
  </div>
  <h3>${pdfT('team_matches', 'Rencontres')}</h3>
  ${list}`;
    })
    .join('');
  return wrapDocument(
    opts.title,
    `${pdfT('team_pools_title', 'Poules équipes')} — ${pdfT('teams_count', '{{count}} équipes', { count: opts.teams.length })}, ${pdfT('team_matches_count', '{{count}} rencontres', { count: matches.length })}`,
    'PE',
    body || `<p class="muted">${pdfT('team_no_match', 'Aucune rencontre.')}</p>`
  );
}

export function generateTeamTableauHTML(
  opts: TeamPdfOptions,
  rankedTeams: TeamRow[],
  tableauMatches: TeamMatchRow[]
): string {
  const teamById = new Map(opts.teams.map(t => [t.id, t]));
  const tableSize = calculateTableSize(Math.max(rankedTeams.length, 2));
  const placements = placeRankedTeamsInTable(rankedTeams, tableSize);
  const matchesByKey = new Map(tableauMatches.map(m => [`${m.round}-${m.position}`, m]));
  const sections: string[] = [];
  for (let round = tableSize / 2; round >= 1; round /= 2) {
    const items = Array.from({ length: round }, (_, position) => {
      const slot = resolveTeamTableauSlot(
        round,
        position,
        tableSize,
        placements,
        matchesByKey,
        teamById
      );
      if (slot.isBye) {
        return slot.team ? `<p class="muted">${esc(slot.team.name)} — exempt</p>` : '';
      }
      if (slot.match) return matchTable(slot.match, teamById, opts.fencerName, opts.isLaserArena);
      if (slot.teamA && slot.teamB)
        return `<p class="muted">${esc(slot.teamA.name)} – ${esc(slot.teamB.name)} : ${pdfT('to_play', 'À jouer')}</p>`;
      return `<p class="muted">${pdfT('waiting_previous_round', 'En attente du tour précédent')}</p>`;
    }).join('');
    sections.push(`<div class="section"><h2>${esc(roundLabel(round))}</h2>${items}</div>`);
  }
  return wrapDocument(
    opts.title,
    `${pdfT('team_tableau_title', 'Tableau équipes')} — ${pdfT('teams_count', '{{count}} équipes', { count: rankedTeams.length })} (${pdfT('table_of', 'tableau de {{n}}', { n: tableSize })})`,
    'TE',
    sections.join('')
  );
}

export function generateTeamRankingHTML(
  opts: TeamPdfOptions,
  rankedTeams: TeamRow[],
  tableauMatches: TeamMatchRow[]
): string {
  const { rows, provisional } = computeTeamFinalRanking(rankedTeams, tableauMatches);
  const body = `
  <table>
    <thead><tr><th style="width:12mm">${pdfT('col_rank', 'Rg')}</th><th style="text-align:left">${pdfT('col_team', 'Équipe')}</th><th style="text-align:left">${pdfT('col_club', 'Club')}</th><th style="text-align:left">${pdfT('fencers', 'Tireurs')}</th></tr></thead>
    <tbody>${rows
      .map(
        r => `
      <tr>
        <td class="c" style="font-weight:700">${r.rank}</td>
        <td class="win">${esc(r.team.name)}</td>
        <td>${esc(r.team.club)}</td>
        <td style="font-size:8pt">${r.team.fencers
          .filter(f => !f.isReserve)
          .sort((a, b) => a.teamOrder - b.teamOrder)
          .map(f => esc(`${f.fencerLastName.toUpperCase()} ${f.fencerFirstName ?? ''}`.trim()))
          .join(', ')}</td>
      </tr>`
      )
      .join('')}</tbody>
  </table>`;
  return wrapDocument(
    opts.title,
    `${pdfT('team_ranking_title', 'Classement équipes')}${provisional ? ` (${pdfT('provisional', 'provisoire')})` : ''} — ${pdfT('teams_count', '{{count}} équipes', { count: rows.length })}`,
    'CE',
    body
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportTeamPoolsToPDF(
  opts: TeamPdfOptions,
  matches: TeamMatchRow[]
): Promise<void> {
  if (matches.length === 0)
    throw new Error(pdfT('team_no_pool_match', 'Aucune rencontre de poule'));
  await savePDF(generateTeamPoolsHTML(opts, matches), 'poules-equipes.pdf');
}

export async function exportTeamTableauToPDF(
  opts: TeamPdfOptions,
  rankedTeams: TeamRow[],
  tableauMatches: TeamMatchRow[]
): Promise<void> {
  if (rankedTeams.length < 2) throw new Error(pdfT('team_min_two', 'Au moins 2 équipes requises'));
  await savePDF(generateTeamTableauHTML(opts, rankedTeams, tableauMatches), 'tableau-equipes.pdf');
}

export async function exportTeamRankingToPDF(
  opts: TeamPdfOptions,
  rankedTeams: TeamRow[],
  tableauMatches: TeamMatchRow[]
): Promise<void> {
  if (rankedTeams.length === 0) throw new Error(pdfT('team_none', 'Aucune équipe'));
  await savePDF(
    generateTeamRankingHTML(opts, rankedTeams, tableauMatches),
    'classement-equipes.pdf'
  );
}
