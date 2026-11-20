/**
 * BellePoule Modern - Rapport post-tournoi PDF
 * Génère un rapport HTML complet pour export PDF
 * Licensed under GPL-3.0
 */

import {
  Competition,
  Fencer,
  FencerCompetitionStats,
  Match,
  MatchStatus,
  PoolRanking,
} from '../types';
import { getActiveLocale } from './localeFormat';
import { escHtml } from './pdfExport/bookToc';

interface MatchWithReferee {
  matchId: string;
  matchNumber: number;
  poolName: string | null;
  fencerAName: string;
  fencerBName: string;
  scoreA: number | null;
  scoreB: number | null;
  status: string;
  refereeId: string | null;
  refereeName: string | null;
}

interface RefereeStats {
  name: string;
  matchCount: number;
}

function weaponLabel(w: string): string {
  return w === 'E'
    ? 'Épée'
    : w === 'F'
      ? 'Fleuret'
      : w === 'S'
        ? 'Sabre'
        : w === 'L'
          ? 'Laser Sabre'
          : w;
}

function categoryLabel(c: string): string {
  const MAP: Record<string, string> = {
    U9: 'M9',
    U11: 'M11',
    U13: 'M13',
    U15: 'M15',
    U17: 'M17',
    U20: 'M20',
    SEN: 'Seniors',
    SENIOR: 'Seniors',
    V1: 'Vétérans 1',
    V2: 'Vétérans 2',
    V3: 'Vétérans 3',
    V4: 'Vétérans 4',
  };
  return MAP[c] ?? c;
}

function buildRefereeStats(matches: MatchWithReferee[]): RefereeStats[] {
  const map = new Map<string, { name: string; count: number }>();
  for (const m of matches) {
    if (!m.refereeId || !m.refereeName) continue;
    const e = map.get(m.refereeId) ?? { name: m.refereeName, count: 0 };
    e.count++;
    map.set(m.refereeId, e);
  }
  return Array.from(map.values())
    .map(e => ({ name: e.name, matchCount: e.count }))
    .sort((a, b) => b.matchCount - a.matchCount);
}

/** Ligne du classement (final, sinon après poules) */
export interface ReportRankingRow {
  rank: number;
  name: string;
  club?: string;
  victories?: number;
  matches?: number;
  touchesScored?: number;
  touchesReceived?: number;
  index?: number;
}

/** Données complémentaires : classement complet et décompte de tous les matchs */
export interface ReportExtras {
  ranking?: ReportRankingRow[];
  /** Classement final (tableaux) ou après poules */
  rankingKind?: 'final' | 'pools';
  /** Tous les matchs (poules + tableau), pas seulement ceux avec arbitre */
  matchCounts?: { total: number; finished: number };
}

function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const TD = 'padding:0.4rem 0.6rem';
const TDC = `${TD};text-align:center`;
const stripe = (i: number) => (i % 2 === 0 ? ' style="background:#f9fafb"' : '');

export function generatePostTournamentReportHTML(
  competition: Competition,
  fencerStats: FencerCompetitionStats[],
  matchesWithRefs: MatchWithReferee[],
  logoBase64?: string | null,
  extras: ReportExtras = {}
): string {
  const isLaser = competition.weapon === 'L';
  const completedMatches =
    extras.matchCounts?.finished ?? matchesWithRefs.filter(m => m.status === 'finished').length;
  const totalMatches = extras.matchCounts?.total ?? matchesWithRefs.length;
  const ranking = extras.ranking ?? [];
  const fencerCount = Math.max(fencerStats.length, ranking.length);

  const refereeStats = buildRefereeStats(matchesWithRefs);

  const date = new Date().toLocaleDateString(getActiveLocale(), {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const hasPoolDetail = ranking.some(r => r.victories !== undefined);
  const rankingRows = ranking
    .map(
      (r, i) => `
      <tr${stripe(i)}>
        <td style="${TD};font-weight:700;color:#6b7280">${r.rank}</td>
        <td style="${TD};font-weight:600">${escHtml(r.name)}</td>
        <td style="${TD};color:#6b7280">${escHtml(r.club ?? '')}</td>
        ${
          hasPoolDetail
            ? `<td style="${TDC}">${r.victories ?? ''}${r.matches !== undefined ? ` / ${r.matches}` : ''}</td>
        <td style="${TDC}">${r.touchesScored ?? ''}</td>
        <td style="${TDC}">${r.touchesReceived ?? ''}</td>
        <td style="${TDC}">${r.index !== undefined ? (r.index > 0 ? '+' : '') + r.index : ''}</td>`
            : ''
        }
      </tr>`
    )
    .join('');

  const statsRows = [...fencerStats]
    .sort(
      (a, b) =>
        a.fencerLastName.localeCompare(b.fencerLastName) ||
        a.fencerFirstName.localeCompare(b.fencerFirstName)
    )
    .map(
      (f, i) => `
      <tr${stripe(i)}>
        <td style="${TD};font-weight:600">${escHtml(f.fencerLastName.toUpperCase())} ${escHtml(f.fencerFirstName)}</td>
        <td style="${TD};color:#6b7280">${escHtml(f.fencerClub ?? '')}</td>
        <td style="${TDC}">${f.matchesPlayed}</td>
        ${
          isLaser
            ? `<td style="${TDC}">${f.touchesZoneA}</td><td style="${TDC}">${f.touchesZoneB}</td><td style="${TDC}">${f.touchesZoneC}</td><td style="${TDC};font-weight:600">${f.totalTouchPoints}</td><td style="${TDC}">${f.receivedTouchPoints ?? 0}</td>`
            : ''
        }
        <td style="${TDC}">${f.whiteCards || ''}</td>
        <td style="${TDC}">${f.yellowCards || ''}</td>
        <td style="${TDC}">${f.redCards || ''}</td>
        <td style="${TDC}">${f.arenaExits || ''}</td>
        <td style="${TDC}">${formatDuration(f.averageDurationSeconds)}</td>
      </tr>`
    )
    .join('');

  // Agrégat par club : tireurs, meilleur rang, matchs, touches (laser), cartons
  const clubs = new Map<
    string,
    {
      fencers: Set<string>;
      best?: number;
      matches: number;
      points: number;
      yellow: number;
      red: number;
    }
  >();
  const club = (name?: string) => {
    const k = (name ?? '').trim() || '—';
    let c = clubs.get(k);
    if (!c) {
      c = { fencers: new Set(), matches: 0, points: 0, yellow: 0, red: 0 };
      clubs.set(k, c);
    }
    return c;
  };
  for (const r of ranking) {
    const c = club(r.club);
    c.fencers.add(r.name);
    c.best = c.best === undefined ? r.rank : Math.min(c.best, r.rank);
  }
  for (const f of fencerStats) {
    const c = club(f.fencerClub);
    c.fencers.add(`${f.fencerLastName.toUpperCase()} ${f.fencerFirstName}`);
    c.matches += f.matchesPlayed;
    c.points += f.totalTouchPoints;
    c.yellow += f.yellowCards;
    c.red += f.redCards;
  }
  const clubRows = [...clubs.entries()]
    .sort(
      ([an, a], [bn, b]) =>
        (a.best ?? Infinity) - (b.best ?? Infinity) ||
        b.fencers.size - a.fencers.size ||
        an.localeCompare(bn)
    )
    .map(
      ([name, c], i) => `
      <tr${stripe(i)}>
        <td style="${TD};font-weight:600">${escHtml(name)}</td>
        <td style="${TDC}">${c.fencers.size}</td>
        <td style="${TDC}">${c.best ?? '—'}</td>
        <td style="${TDC}">${c.matches}</td>
        ${isLaser ? `<td style="${TDC}">${c.points}</td>` : ''}
        <td style="${TDC}">${c.yellow || ''}</td>
        <td style="${TDC}">${c.red || ''}</td>
      </tr>`
    )
    .join('');

  const refereeRows = refereeStats
    .map(
      (r, i) => `<tr${stripe(i)}>
      <td style="${TD}">${escHtml(r.name)}</td>
      <td style="${TDC};font-weight:600">${r.matchCount}</td>
    </tr>`
    )
    .join('');

  const empty = (cols: number) =>
    `<tr><td colspan="${cols}" style="padding:1rem;text-align:center;color:#9ca3af">Aucune donnée</td></tr>`;
  const statsCols = 8 + (isLaser ? 5 : 0);
  const title = competition.title ?? (competition as { name?: string }).name ?? '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <style>
    @page { margin: 15mm 12mm; size: A4; }
    * { box-sizing: border-box; font-family: -apple-system, Arial, sans-serif; }
    body { margin: 0; color: #111827; font-size: 12px; }
    h1 { font-size: 1.6rem; margin: 0 0 0.2rem; color: #111827; }
    h2 { font-size: 1rem; color: #374151; margin: 1.4rem 0 0.6rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.3rem; break-after: avoid; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    th { background: #1d4ed8; color: white; padding: 0.45rem 0.6rem; text-align: left; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; }
    th.center { text-align: center; }
    td { border-bottom: 1px solid #f3f4f6; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 3px solid #1d4ed8; }
    .stats-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 0.75rem; margin-bottom: 1.5rem; }
    .stat-box { background: #eff6ff; border-radius: 0.5rem; padding: 0.75rem; text-align: center; border: 1px solid #bfdbfe; }
    .stat-value { font-size: 1.6rem; font-weight: 800; color: #1d4ed8; }
    .stat-label { font-size: 0.7rem; color: #6b7280; margin-top: 0.15rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .section-break { break-before: page; }
    .footer { margin-top: 2rem; text-align: center; color: #9ca3af; font-size: 0.75rem; border-top: 1px solid #e5e7eb; padding-top: 0.75rem; }
    .badge { display: inline-block; background: #dbeafe; color: #1e40af; border-radius: 0.25rem; padding: 0.15rem 0.5rem; font-size: 0.75rem; font-weight: 600; margin-left: 0.5rem; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${escHtml(title)}</h1>
      <div style="color:#6b7280;font-size:0.85rem;margin-top:0.25rem">
        ${weaponLabel(competition.weapon ?? '')}
        ${competition.category ? `<span class="badge">${escHtml(categoryLabel(String(competition.category)))}</span>` : ''}
        <span style="margin-left:0.75rem">${date}</span>
      </div>
    </div>
    ${logoBase64 ? `<img src="${escHtml(logoBase64)}" style="height:50px;object-fit:contain" alt="logo"/>` : ''}
  </div>

  <h2>Statistiques globales</h2>
  <div class="stats-grid">
    <div class="stat-box">
      <div class="stat-value">${fencerCount}</div>
      <div class="stat-label">Tireurs</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${completedMatches}</div>
      <div class="stat-label">Matchs terminés</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${totalMatches}</div>
      <div class="stat-label">Matchs total</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${Math.round((completedMatches / Math.max(totalMatches, 1)) * 100)}%</div>
      <div class="stat-label">Complétion</div>
    </div>
  </div>

  ${
    ranking.length > 0
      ? `
  <h2>${extras.rankingKind === 'final' ? 'Classement final' : 'Classement après poules'}</h2>
  <table>
    <thead>
      <tr>
        <th style="width:3rem">#</th>
        <th>Tireur</th>
        <th>Club</th>
        ${hasPoolDetail ? '<th class="center">V / M</th><th class="center">TD</th><th class="center">TR</th><th class="center">Ind.</th>' : ''}
      </tr>
    </thead>
    <tbody>${rankingRows}</tbody>
  </table>`
      : ''
  }

  ${
    clubs.size > 0
      ? `
  <h2>Par club</h2>
  <table>
    <thead>
      <tr>
        <th>Club</th>
        <th class="center">Tireurs</th>
        <th class="center">Meilleur rang</th>
        <th class="center">Matchs</th>
        ${isLaser ? '<th class="center">Pts</th>' : ''}
        <th class="center">Jaune</th>
        <th class="center">Rouge</th>
      </tr>
    </thead>
    <tbody>${clubRows}</tbody>
  </table>`
      : ''
  }

  <h2 class="section-break">Statistiques individuelles</h2>
  <table>
    <thead>
      <tr>
        <th>Tireur</th>
        <th>Club</th>
        <th class="center">Matchs</th>
        ${isLaser ? '<th class="center">A</th><th class="center">B</th><th class="center">C</th><th class="center">Pts</th><th class="center">Reçus</th>' : ''}
        <th class="center">Blanc</th>
        <th class="center">Jaune</th>
        <th class="center">Rouge</th>
        <th class="center">Sorties</th>
        <th class="center">Durée moy.</th>
      </tr>
    </thead>
    <tbody>${statsRows || empty(statsCols)}</tbody>
  </table>

  ${
    refereeStats.length > 0
      ? `
  <h2>Arbitres</h2>
  <table>
    <thead>
      <tr>
        <th>Arbitre</th>
        <th class="center">Matchs arbitrés</th>
      </tr>
    </thead>
    <tbody>${refereeRows}</tbody>
  </table>`
      : ''
  }

  <div class="footer">
    Rapport généré par BellePoule Modern · ${new Date().toLocaleString(getActiveLocale())}
  </div>
</body>
</html>`;
}

/** Sous-ensemble d'un match de tableau utile au décompte */
interface ReportTableauMatch {
  fencerA: { id: string } | null;
  fencerB: { id: string } | null;
  winner: { id: string } | null;
  isBye: boolean;
}

/** Données de la compétition déjà chargées dans le tableau de bord analytique */
export interface ReportSource {
  matches: Match[];
  tableauMatches?: ReportTableauMatch[];
  fencers: Fencer[];
  overallRanking?: PoolRanking[];
  finalResults?: Array<{ rank: number; fencer: { id: string } }>;
}

const fencerName = (f: Fencer) => `${f.lastName.toUpperCase()} ${f.firstName}`;

/**
 * Classement complet (final si tableaux, sinon après poules) et décompte de tous les matchs
 * (poules + tableau, exempts exclus) pour le rapport post-tournoi.
 */
export function buildReportExtras({
  matches: poolMatches,
  tableauMatches = [],
  fencers,
  overallRanking = [],
  finalResults = [],
}: ReportSource): ReportExtras {
  const byId = new Map(fencers.map(f => [f.id, f]));
  const poolById = new Map(overallRanking.map(r => [r.fencer.id, r]));
  const poolDetail = (id: string) => {
    const p = poolById.get(id);
    return p
      ? {
          victories: p.victories,
          matches: p.matchesPlayed,
          touchesScored: p.touchesScored,
          touchesReceived: p.touchesReceived,
          index: p.index,
        }
      : {};
  };

  let ranking: ReportRankingRow[] = [];
  let rankingKind: ReportExtras['rankingKind'];
  if (finalResults.length > 0) {
    rankingKind = 'final';
    ranking = finalResults.flatMap(r => {
      const f = byId.get(r.fencer.id);
      return f ? [{ rank: r.rank, name: fencerName(f), club: f.club, ...poolDetail(f.id) }] : [];
    });
  } else if (overallRanking.length > 0) {
    rankingKind = 'pools';
    ranking = overallRanking.map(r => ({
      rank: r.rank,
      name: fencerName(r.fencer),
      club: r.fencer.club,
      ...poolDetail(r.fencer.id),
    }));
  }

  const realTableau = tableauMatches.filter(m => !m.isBye && m.fencerA && m.fencerB);
  const total = poolMatches.length + realTableau.length;
  const finished =
    poolMatches.filter(m => m.status === MatchStatus.FINISHED).length +
    realTableau.filter(m => m.winner).length;

  return { ranking, rankingKind, matchCounts: { total, finished } };
}

/** Charge stats + matchs arbitrés, génère le rapport et l'enregistre en PDF */
export async function exportPostTournamentPDF(
  competition: Competition,
  source: ReportSource
): Promise<void> {
  const api = window.electronAPI;
  const [fencerStats, matchesWithRefs] = await Promise.all([
    api.db.getCompetitionFencerStats(competition.id),
    api.db.getMatchesWithReferees(competition.id),
  ]);
  const logo = localStorage.getItem('bellepoule-logo') ?? undefined;
  const html = generatePostTournamentReportHTML(
    competition,
    fencerStats,
    matchesWithRefs,
    logo,
    buildReportExtras(source)
  );

  const title = competition.title ?? (competition as { name?: string }).name ?? 'competition';
  const result = await api.dialog.saveFile({
    defaultPath: `rapport-${title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (!result || result.canceled || !result.filePath) return;

  const res = await api.file.printHtmlToPDF(html, result.filePath);
  if (res && !res.success) throw new Error(res.error ?? 'PDF export failed');
}
