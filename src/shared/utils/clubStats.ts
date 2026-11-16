/**
 * BellePoule Modern - Mode Club (#1872) : périodes (séance, mois, trimestre,
 * saison sportive septembre → août) et statistiques des membres. Fonctions pures.
 * Licensed under GPL-3.0
 */
import type {
  ClubBout,
  ClubHeadToHead,
  ClubMemberStats,
  ClubPeriod,
  ClubPeriodKind,
} from '../types/club';

/** Premier mois de la saison sportive (septembre) */
export const SEASON_START_MONTH = 9;

const pad = (n: number): string => String(n).padStart(2, '0');
const lastDay = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** AAAA-MM-JJ valide ? */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= lastDay(y, m);
}

/** Période contenant la date (AAAA-MM-JJ) */
export function periodOf(date: string, kind: ClubPeriodKind): ClubPeriod {
  if (!isIsoDate(date)) throw new Error(`Date invalide : ${date}`);
  const [y, m] = date.split('-').map(Number);
  switch (kind) {
    case 'day':
      return { kind, from: date, to: date, key: date };
    case 'month':
      return {
        kind,
        from: `${y}-${pad(m)}-01`,
        to: `${y}-${pad(m)}-${pad(lastDay(y, m))}`,
        key: `${y}-${pad(m)}`,
      };
    case 'quarter': {
      const q = Math.floor((m - 1) / 3) + 1;
      const end = q * 3;
      return {
        kind,
        from: `${y}-${pad(end - 2)}-01`,
        to: `${y}-${pad(end)}-${pad(lastDay(y, end))}`,
        key: `${y}-T${q}`,
      };
    }
    case 'season': {
      const start = m >= SEASON_START_MONTH ? y : y - 1;
      return {
        kind,
        from: `${start}-${pad(SEASON_START_MONTH)}-01`,
        to: `${start + 1}-${pad(SEASON_START_MONTH - 1)}-${pad(lastDay(start + 1, SEASON_START_MONTH - 1))}`,
        key: `${start}-${start + 1}`,
      };
    }
    case 'year':
      return { kind, from: `${y}-01-01`, to: `${y}-12-31`, key: String(y) };
  }
}

const finished = (b: ClubBout): boolean => b.status === 'finished';

/** Statistiques d'un membre sur les combats terminés fournis */
export function computeMemberStats(memberId: string, bouts: readonly ClubBout[]): ClubMemberStats {
  const s: ClubMemberStats = {
    memberId,
    bouts: 0,
    victories: 0,
    defeats: 0,
    draws: 0,
    winRate: 0,
    touchesScored: 0,
    touchesReceived: 0,
    indice: 0,
    sessions: 0,
  };
  const sessions = new Set<string>();
  for (const b of bouts) {
    if (!finished(b)) continue;
    const isA = b.memberAId === memberId;
    if (!isA && b.memberBId !== memberId) continue;
    s.bouts++;
    s.touchesScored += isA ? b.scoreA : b.scoreB;
    s.touchesReceived += isA ? b.scoreB : b.scoreA;
    if (b.winnerId === memberId) s.victories++;
    else if (b.winnerId) s.defeats++;
    else s.draws++;
    sessions.add(b.sessionId);
  }
  s.indice = s.touchesScored - s.touchesReceived;
  s.winRate = s.bouts ? s.victories / s.bouts : 0;
  s.sessions = sessions.size;
  return s;
}

/** Classement du club : % victoires, puis indice, puis TD */
export function computeLeaderboard(bouts: readonly ClubBout[]): ClubMemberStats[] {
  const ids = new Set<string>();
  for (const b of bouts) {
    if (!finished(b)) continue;
    ids.add(b.memberAId);
    ids.add(b.memberBId);
  }
  return [...ids]
    .map(id => computeMemberStats(id, bouts))
    .sort(
      (a, b) =>
        b.winRate - a.winRate ||
        b.indice - a.indice ||
        b.touchesScored - a.touchesScored ||
        a.memberId.localeCompare(b.memberId)
    );
}

/** Bilan d'un membre contre chacun de ses adversaires (plus fréquent d'abord) */
export function computeHeadToHead(memberId: string, bouts: readonly ClubBout[]): ClubHeadToHead[] {
  const map = new Map<string, ClubHeadToHead>();
  for (const b of bouts) {
    if (!finished(b)) continue;
    const isA = b.memberAId === memberId;
    if (!isA && b.memberBId !== memberId) continue;
    const opponentId = isA ? b.memberBId : b.memberAId;
    const h = map.get(opponentId) ?? {
      opponentId,
      bouts: 0,
      victories: 0,
      defeats: 0,
      draws: 0,
      touchesScored: 0,
      touchesReceived: 0,
    };
    h.bouts++;
    h.touchesScored += isA ? b.scoreA : b.scoreB;
    h.touchesReceived += isA ? b.scoreB : b.scoreA;
    if (b.winnerId === memberId) h.victories++;
    else if (b.winnerId) h.defeats++;
    else h.draws++;
    map.set(opponentId, h);
  }
  return [...map.values()].sort(
    (a, b) => b.bouts - a.bouts || a.opponentId.localeCompare(b.opponentId)
  );
}

/** Progression d'un membre : statistiques par période, chronologiques */
export function statsByPeriod(
  memberId: string,
  bouts: readonly ClubBout[],
  kind: ClubPeriodKind
): Array<{ period: ClubPeriod; stats: ClubMemberStats }> {
  const groups = new Map<string, { period: ClubPeriod; bouts: ClubBout[] }>();
  for (const b of bouts) {
    if (!finished(b) || (b.memberAId !== memberId && b.memberBId !== memberId)) continue;
    if (!isIsoDate(b.date)) continue;
    const period = periodOf(b.date, kind);
    const g = groups.get(period.key) ?? { period, bouts: [] };
    g.bouts.push(b);
    groups.set(period.key, g);
  }
  return [...groups.values()]
    .sort((a, b) => a.period.from.localeCompare(b.period.from))
    .map(g => ({ period: g.period, stats: computeMemberStats(memberId, g.bouts) }));
}

/** Vainqueur déduit du score (égalité → null) */
export function winnerFromScore(
  memberAId: string,
  memberBId: string,
  scoreA: number,
  scoreB: number
): string | null {
  if (scoreA > scoreB) return memberAId;
  if (scoreB > scoreA) return memberBId;
  return null;
}
