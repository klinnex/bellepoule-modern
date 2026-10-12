/**
 * BellePoule Modern - Export PDF détaillé par combattant
 * Licensed under GPL-3.0
 */

import { FencerMatchRecord } from '../types/preload';
import { Competition, FencerCompetitionStats } from '../types';

function fmt(seconds: number): string {
  if (!seconds) return '—';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function relTime(ts: string, startIso: string | null): string {
  if (!startIso) return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const diff = Math.max(
    0,
    Math.floor((new Date(ts).getTime() - new Date(startIso).getTime()) / 1000)
  );
  return `${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, '0')}`;
}

interface ParsedScore {
  value: number | null;
  isVictory: boolean;
  isAbstention: boolean;
  isExclusion: boolean;
  isForfait: boolean;
}

function parseScore(json: string | null): ParsedScore | null {
  try {
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

function matchOutcome(rec: FencerMatchRecord): {
  myScore: number | null;
  oppScore: number | null;
  isVictory: boolean;
  outcomeLabel: string;
} {
  const sA = parseScore(rec.scoreA);
  const sB = parseScore(rec.scoreB);
  const mine = rec.side === 'A' ? sA : sB;
  const opp = rec.side === 'A' ? sB : sA;
  const isVictory = mine?.isVictory ?? false;
  const outcomeLabel = mine?.isVictory
    ? 'Victoire'
    : mine?.isExclusion
      ? 'Exclusion'
      : mine?.isForfait
        ? 'Forfait'
        : mine?.isAbstention
          ? 'Abstention'
          : 'Défaite';
  return { myScore: mine?.value ?? null, oppScore: opp?.value ?? null, isVictory, outcomeLabel };
}

const CARD_EMOJI: Record<string, string> = {
  white: '⬜',
  yellow: '🟡',
  red: '🔴',
  black: '⬛',
};

function cardLabel(reason: string, labels: Record<string, string>): string {
  return labels[reason.toUpperCase()] ?? reason.replace(/_/g, ' ');
}

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 11px; color: #111; }
.fencer-page { padding: 24px 28px; page-break-after: always; }
.fencer-page:last-child { page-break-after: avoid; }
.ranking-page { padding: 24px 28px; page-break-after: always; }
.header { border-bottom: 2px solid #1e40af; padding-bottom: 8px; margin-bottom: 14px; }
.header h1 { font-size: 18px; font-weight: bold; color: #1e3a8a; }
.header h2 { font-size: 11px; color: #6b7280; margin-top: 2px; }
.summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
.summary-box { background: #f1f5f9; border-radius: 4px; padding: 8px 10px; }
.summary-box .label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
.summary-box .value { font-size: 18px; font-weight: bold; color: #1e3a8a; }
.summary-box .sub { font-size: 9px; color: #374151; margin-top: 2px; }
.section-title { font-size: 12px; font-weight: bold; color: #374151; border-left: 3px solid #1e40af; padding-left: 6px; margin: 12px 0 6px; }
.match { margin-bottom: 8px; border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden; }
.match-header { background: #f8fafc; padding: 5px 8px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e5e7eb; }
.match-vs { font-weight: bold; color: #111; font-size: 11px; }
.match-result { font-size: 10px; }
.victory { color: #16a34a; font-weight: bold; }
.defeat { color: #dc2626; }
.other-result { color: #6b7280; }
.timeline { padding: 4px 8px; list-style: none; }
.timeline-item { display: flex; gap: 6px; padding: 2px 0; align-items: baseline; font-size: 10px; }
.t-time { color: #6b7280; min-width: 34px; font-family: monospace; font-size: 9px; }
.t-touch { color: #2563eb; }
.t-card-white { color: #9ca3af; }
.t-card-yellow { color: #d97706; }
.t-card-red { color: #dc2626; }
.t-card-black { color: #111827; font-weight: bold; }
.t-reversed { color: #9ca3af; font-style: italic; }
.no-events { color: #9ca3af; font-style: italic; padding: 4px 0; font-size: 10px; }
.ranking-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
.ranking-table th { background: #1e40af; color: white; padding: 5px 6px; text-align: left; font-size: 10px; }
.ranking-table td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; font-size: 10px; }
.ranking-table tr:nth-child(even) td { background: #f9fafb; }
.tc { text-align: center; }
.tb { font-weight: bold; }
`;

function fencerPageHtml(
  fencer: FencerCompetitionStats,
  matches: FencerMatchRecord[],
  isLaser: boolean,
  cardReasonLabels: Record<string, string>,
  competitionTitle: string,
  competitionDate: string
): string {
  const victories = matches.filter(m => matchOutcome(m).isVictory).length;
  const defeats = matches.length - victories;
  const cardTotal = fencer.whiteCards + fencer.yellowCards + fencer.redCards;

  const cardParts: string[] = [];
  if (fencer.whiteCards) cardParts.push(`${fencer.whiteCards} ⬜`);
  if (fencer.yellowCards) cardParts.push(`${fencer.yellowCards} 🟡`);
  if (fencer.redCards) cardParts.push(`${fencer.redCards} 🔴`);
  const cardSub = cardParts.join(' · ') || '&nbsp;';

  const laserBox = isLaser
    ? `
    <div class="summary-box">
      <div class="label">Touches Laser</div>
      <div class="value">${fencer.totalTouchPoints} pts</div>
      <div class="sub">A: ${fencer.touchesZoneA} · B: ${fencer.touchesZoneB} · C: ${fencer.touchesZoneC}</div>
    </div>`
    : `
    <div class="summary-box">
      <div class="label">Sorties d'arène</div>
      <div class="value">${fencer.arenaExits}</div>
      <div class="sub">&nbsp;</div>
    </div>`;

  const matchRows = matches
    .map((rec, i) => {
      const { myScore, oppScore, isVictory, outcomeLabel } = matchOutcome(rec);
      const oppName = rec.opponentLastName
        ? `${rec.opponentLastName}${rec.opponentFirstName ? ' ' + rec.opponentFirstName : ''}`
        : '—';
      const scoreStr = myScore !== null && oppScore !== null ? `${myScore} – ${oppScore}` : '';
      const durStr = rec.duration ? fmt(rec.duration) : '—';
      const phaseStr = rec.poolId ? 'Poule' : rec.tableId ? `Tour ${rec.round ?? ''}` : '';

      type RawTouch = (typeof rec.touches)[0];
      type RawCard = (typeof rec.cards)[0];
      type Event =
        { ts: string; type: 'touch'; data: RawTouch } | { ts: string; type: 'card'; data: RawCard };

      const events: Event[] = [
        ...rec.touches.map(t => ({ ts: t.timestamp, type: 'touch' as const, data: t })),
        ...rec.cards.map(c => ({ ts: c.timestamp, type: 'card' as const, data: c })),
      ].sort((a, b) => a.ts.localeCompare(b.ts));

      const timelineItems = events
        .map(ev => {
          const time = relTime(ev.ts, rec.startTime);
          if (ev.type === 'touch') {
            const t = ev.data;
            const zoneLabel =
              t.zone === 'A'
                ? 'Zone A – 1 pt'
                : t.zone === 'B'
                  ? 'Zone B – 3 pts'
                  : t.zone === 'C'
                    ? 'Zone C – 5 pts'
                    : `Zone ${t.zone}`;
            const reversed = t.isReversed ? ' <span class="t-reversed">(annulée)</span>' : '';
            return `<li class="timeline-item"><span class="t-time">${time}</span><span class="t-touch">● ${zoneLabel}${reversed}</span></li>`;
          } else {
            const c = ev.data;
            const ct = c.cardType.toLowerCase();
            const emoji = CARD_EMOJI[ct] ?? '❓';
            const reason = cardLabel(c.reason, cardReasonLabels);
            const excl = c.resultingExclusion ? ' → <strong>Exclusion</strong>' : '';
            return `<li class="timeline-item"><span class="t-time">${time}</span><span class="t-card-${ct}">${emoji} ${reason}${excl}</span></li>`;
          }
        })
        .join('');

      const noEvents =
        events.length === 0 ? '<li class="no-events">Aucun événement enregistré</li>' : '';

      const resultClass = isVictory
        ? 'victory'
        : outcomeLabel !== 'Défaite'
          ? 'other-result'
          : 'defeat';
      const matchLabel = phaseStr ? `Match ${i + 1} (${phaseStr})` : `Match ${i + 1}`;

      return `
      <div class="match">
        <div class="match-header">
          <span class="match-vs">${matchLabel} – vs ${oppName}</span>
          <span class="match-result"><span class="${resultClass}">${outcomeLabel}</span>${scoreStr ? ' ' + scoreStr : ''} · ${durStr}</span>
        </div>
        <ul class="timeline">${timelineItems}${noEvents}</ul>
      </div>`;
    })
    .join('');

  return `
    <div class="fencer-page">
      <div class="header">
        <h1>${fencer.fencerLastName.toUpperCase()} ${fencer.fencerFirstName}</h1>
        <h2>${fencer.fencerClub ?? ''} — ${competitionTitle} — ${competitionDate}</h2>
      </div>
      <div class="summary-grid">
        <div class="summary-box">
          <div class="label">Matchs</div>
          <div class="value">${fencer.matchesPlayed}</div>
          <div class="sub">${victories}V · ${defeats}D</div>
        </div>
        <div class="summary-box">
          <div class="label">Durée moy.</div>
          <div class="value">${fmt(fencer.averageDurationSeconds)}</div>
          <div class="sub">Total : ${fmt(fencer.totalDurationSeconds)}</div>
        </div>
        <div class="summary-box">
          <div class="label">Cartons</div>
          <div class="value">${cardTotal || '—'}</div>
          <div class="sub">${cardSub}</div>
        </div>
        ${laserBox}
      </div>
      <div class="section-title">Détail des matchs</div>
      ${matches.length ? matchRows : '<p class="no-events">Aucun match terminé enregistré.</p>'}
    </div>`;
}

function rankingPageHtml(
  fencers: FencerCompetitionStats[],
  isLaser: boolean,
  competitionTitle: string,
  competitionDate: string
): string {
  const laserTh = isLaser
    ? '<th class="tc">Zone A</th><th class="tc">Zone B</th><th class="tc">Zone C</th><th class="tc">Pts</th>'
    : '';

  const rows = fencers
    .map((s, i) => {
      const laserTd = isLaser
        ? `<td class="tc">${s.touchesZoneA}</td><td class="tc">${s.touchesZoneB}</td><td class="tc">${s.touchesZoneC}</td><td class="tc tb">${s.totalTouchPoints}</td>`
        : '';
      return `<tr>
      <td class="tc">${i + 1}</td>
      <td>${s.fencerLastName} ${s.fencerFirstName}</td>
      <td>${s.fencerClub ?? '—'}</td>
      <td class="tc">${s.matchesPlayed}</td>
      ${laserTd}
      <td class="tc">${s.whiteCards || '—'}</td>
      <td class="tc">${s.yellowCards || '—'}</td>
      <td class="tc">${s.redCards || '—'}</td>
      <td class="tc">${s.arenaExits || '—'}</td>
      <td class="tc">${fmt(s.averageDurationSeconds)}</td>
    </tr>`;
    })
    .join('');

  return `
    <div class="ranking-page">
      <div class="header">
        <h1>Statistiques globales — ${competitionTitle}</h1>
        <h2>${competitionDate}</h2>
      </div>
      <table class="ranking-table"><thead><tr>
        <th>#</th><th>Nom / Prénom</th><th>Club</th><th class="tc">Matchs</th>
        ${laserTh}
        <th class="tc">⬜</th><th class="tc">🟡</th><th class="tc">🔴</th>
        <th class="tc">Sorties</th><th class="tc">Durée moy.</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>`;
}

function wrapHtml(body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;
}

function competitionDateStr(competition: Competition): string {
  return competition.date instanceof Date
    ? competition.date.toLocaleDateString()
    : String(competition.date ?? '');
}

export async function exportFencerDetailPDF(
  fencer: FencerCompetitionStats,
  matches: FencerMatchRecord[],
  competition: Competition,
  cardReasonLabels: Record<string, string>
): Promise<void> {
  const isLaser = competition.weapon === 'L';
  const dateStr = competitionDateStr(competition);
  const body = fencerPageHtml(
    fencer,
    matches,
    isLaser,
    cardReasonLabels,
    competition.title,
    dateStr
  );
  const html = wrapHtml(body);

  const safeName = `${fencer.fencerLastName}-${fencer.fencerFirstName}`.replace(
    /[^a-zA-Z0-9]/g,
    '_'
  );
  const result = await window.electronAPI.dialog.saveFile({
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    defaultPath: `${safeName}-stats.pdf`,
  });
  if (result?.filePath) {
    await window.electronAPI.file.printHtmlToPDF(html, result.filePath);
  }
}

export async function exportCompetitionDetailPDF(
  fencers: FencerCompetitionStats[],
  histories: Map<string, FencerMatchRecord[]>,
  competition: Competition,
  cardReasonLabels: Record<string, string>
): Promise<void> {
  const isLaser = competition.weapon === 'L';
  const dateStr = competitionDateStr(competition);

  const pages = [
    rankingPageHtml(fencers, isLaser, competition.title, dateStr),
    ...fencers.map(f =>
      fencerPageHtml(
        f,
        histories.get(f.fencerId) ?? [],
        isLaser,
        cardReasonLabels,
        competition.title,
        dateStr
      )
    ),
  ].join('');

  const html = wrapHtml(pages);
  const safeName = competition.title.replace(/[^a-zA-Z0-9]/g, '_');
  const result = await window.electronAPI.dialog.saveFile({
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    defaultPath: `${safeName}-statistiques.pdf`,
  });
  if (result?.filePath) {
    await window.electronAPI.file.printHtmlToPDF(html, result.filePath);
  }
}
