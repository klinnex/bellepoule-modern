/**
 * BellePoule Modern - Rapport post-tournoi PDF
 * Génère un rapport HTML complet pour export PDF
 * Licensed under GPL-3.0
 */

import { Competition, FencerCompetitionStats } from '../types';

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

function fmt(seconds: number): string {
  if (!seconds) return '—';
  return `${Math.floor(seconds / 60)}min ${seconds % 60}s`;
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
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 10);
}

export function generatePostTournamentReportHTML(
  competition: Competition,
  fencerStats: FencerCompetitionStats[],
  matchesWithRefs: MatchWithReferee[],
  logoBase64?: string | null
): string {
  const isLaser = competition.weapon === 'L';
  const completedMatches = matchesWithRefs.filter(m => m.status === 'finished').length;
  const totalMatches = matchesWithRefs.length;

  // Top 5 tireurs par victoires
  const sorted = [...fencerStats]
    .filter(f => f.matchesPlayed > 0)
    .sort((a, b) => {
      const vA = fencerStats.indexOf(a);
      const vB = fencerStats.indexOf(b);
      // Use victories from matchesPlayed — stored as field or derive from index position
      return b.totalTouchPoints - a.totalTouchPoints || vA - vB;
    });

  // Victories not directly in FencerCompetitionStats — sort by best indicator available
  const top5 = [...fencerStats]
    .filter(f => f.matchesPlayed > 0)
    .sort((a, b) => b.totalTouchPoints - a.totalTouchPoints || b.matchesPlayed - a.matchesPlayed)
    .slice(0, 5);

  const refereeStats = buildRefereeStats(matchesWithRefs);

  const date = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const topFencersRows = top5
    .map((f, i) => {
      const laserInfo = isLaser
        ? `<br><small style="color:#6b7280">A:${f.touchesZoneA} B:${f.touchesZoneB} C:${f.touchesZoneC} = ${f.totalTouchPoints}pts</small>`
        : '';
      return `
      <tr style="${i % 2 === 0 ? 'background:#f9fafb' : ''}">
        <td style="padding:0.6rem 1rem;font-weight:700;color:#6b7280">${i + 1}</td>
        <td style="padding:0.6rem 1rem;font-weight:600">
          ${f.fencerLastName.toUpperCase()} ${f.fencerFirstName}
          ${f.fencerClub ? `<br><small style="color:#9ca3af;font-weight:400">${f.fencerClub}</small>` : ''}
        </td>
        <td style="padding:0.6rem 1rem;text-align:center">${f.matchesPlayed}</td>
        <td style="padding:0.6rem 1rem;text-align:center">${isLaser ? f.totalTouchPoints + laserInfo : '—'}</td>
        <td style="padding:0.6rem 1rem;text-align:center">
          ${f.yellowCards > 0 ? `${f.yellowCards}🟡 ` : ''}${f.redCards > 0 ? `${f.redCards}🔴` : ''}${f.yellowCards === 0 && f.redCards === 0 ? '—' : ''}
        </td>
      </tr>`;
    })
    .join('');

  const refereeRows = refereeStats
    .map(
      (r, i) =>
        `<tr style="${i % 2 === 0 ? 'background:#f9fafb' : ''}">
      <td style="padding:0.5rem 1rem">${r.name}</td>
      <td style="padding:0.5rem 1rem;text-align:center;font-weight:600">${r.matchCount}</td>
    </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <style>
    @page { margin: 15mm 12mm; size: A4; }
    * { box-sizing: border-box; font-family: -apple-system, Arial, sans-serif; }
    body { margin: 0; color: #111827; font-size: 13px; }
    h1 { font-size: 1.6rem; margin: 0 0 0.2rem; color: #111827; }
    h2 { font-size: 1rem; color: #374151; margin: 1.4rem 0 0.6rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.3rem; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
    th { background: #1d4ed8; color: white; padding: 0.5rem 1rem; text-align: left; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
    th.center { text-align: center; }
    td { border-bottom: 1px solid #f3f4f6; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 3px solid #1d4ed8; }
    .stats-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 0.75rem; margin-bottom: 1.5rem; }
    .stat-box { background: #eff6ff; border-radius: 0.5rem; padding: 0.75rem; text-align: center; border: 1px solid #bfdbfe; }
    .stat-value { font-size: 1.6rem; font-weight: 800; color: #1d4ed8; }
    .stat-label { font-size: 0.7rem; color: #6b7280; margin-top: 0.15rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .footer { margin-top: 2rem; text-align: center; color: #9ca3af; font-size: 0.75rem; border-top: 1px solid #e5e7eb; padding-top: 0.75rem; }
    .badge { display: inline-block; background: #dbeafe; color: #1e40af; border-radius: 0.25rem; padding: 0.15rem 0.5rem; font-size: 0.75rem; font-weight: 600; margin-left: 0.5rem; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${competition.title ?? (competition as any).name ?? ''}</h1>
      <div style="color:#6b7280;font-size:0.85rem;margin-top:0.25rem">
        ${weaponLabel(competition.weapon ?? '')}
        ${competition.category ? `<span class="badge">${categoryLabel(String(competition.category))}</span>` : ''}
        <span style="margin-left:0.75rem">${date}</span>
      </div>
    </div>
    ${logoBase64 ? `<img src="${logoBase64}" style="height:50px;object-fit:contain" alt="logo"/>` : ''}
  </div>

  <h2>Statistiques globales</h2>
  <div class="stats-grid">
    <div class="stat-box">
      <div class="stat-value">${fencerStats.length}</div>
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

  <h2>Top tireurs</h2>
  <table>
    <thead>
      <tr>
        <th style="width:3rem">#</th>
        <th>Tireur</th>
        <th class="center">Matchs</th>
        <th class="center">${isLaser ? 'Points touches' : 'Points'}</th>
        <th class="center">Cartons</th>
      </tr>
    </thead>
    <tbody>${top5.length > 0 ? topFencersRows : '<tr><td colspan="5" style="padding:1rem;text-align:center;color:#9ca3af">Aucune donnée</td></tr>'}</tbody>
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
    Rapport généré par BellePoule Modern · ${new Date().toLocaleString('fr-FR')}
  </div>
</body>
</html>`;
}

export async function exportPostTournamentPDF(
  competition: Competition,
  fencerStats: FencerCompetitionStats[],
  matchesWithRefs: MatchWithReferee[],
  logoBase64?: string | null
): Promise<void> {
  const html = generatePostTournamentReportHTML(
    competition,
    fencerStats,
    matchesWithRefs,
    logoBase64
  );

  const title = competition.title ?? (competition as any).name ?? 'competition';
  const result = await window.electronAPI.dialog.saveFile({
    defaultPath: `rapport-${title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (!result || result.canceled || !result.filePath) return;

  await window.electronAPI.file.printHtmlToPDF(html, result.filePath);
}
