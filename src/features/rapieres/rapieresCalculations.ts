/**
 * BellePoule Modern - Tournoi des rapières : calculs (#1118)
 * Répartition des poules par niveau, vagues de rencontres, classements (règles FIE),
 * qualification et tableau à élimination directe avec match pour la 3e place.
 * Licensed under GPL-3.0
 */

import { calculateTableSize, generateSeedingChart } from '../../shared/utils/tableCalculations';
import {
  RAPIERES_LEVELS,
  RapieresAgeCategory,
  RapieresBout,
  RapieresLevel,
  RapieresPool,
  RapieresRankingRow,
  RapieresState,
  RapieresStats,
  RapieresTableau,
  RapieresTableauMatch,
  RapieresTeam,
  RapieresTeamStatus,
} from './rapieres.types';

export const RAPIERES_MAX_POOL_SIZE = 10;

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// ─── Statuts ─────────────────────────────────────────────────────────────────

export const teamStatus = (team: RapieresTeam): RapieresTeamStatus => team.status ?? 'checked_in';

/** Abandon, forfait ou exclusion : rencontres annulées, classée en dernier, non qualifiée */
export const isWithdrawnStatus = (status: RapieresTeamStatus): boolean =>
  status === 'abandoned' || status === 'forfait' || status === 'excluded';

/** Équipes à répartir dans les poules */
export const checkedInTeams = (teams: RapieresTeam[]): RapieresTeam[] =>
  teams.filter(t => teamStatus(t) === 'checked_in');

export const withdrawnTeamIds = (teams: RapieresTeam[]): Set<string> =>
  new Set(teams.filter(t => isWithdrawnStatus(teamStatus(t))).map(t => t.id));

/** Rencontre annulée : une des deux équipes s'est retirée */
export const isBoutVoid = (b: RapieresBout, withdrawn: Set<string>): boolean =>
  withdrawn.has(b.teamAId) || withdrawn.has(b.teamBId);

/** Rencontres qui comptent (hors équipes retirées) */
export const activeBouts = (state: RapieresState): RapieresBout[] => {
  const withdrawn = withdrawnTeamIds(state.teams);
  return state.bouts.filter(b => !isBoutVoid(b, withdrawn));
};

// ─── Poules ──────────────────────────────────────────────────────────────────

/** Nombre de poules par défaut : poules de 10 équipes au plus */
export const defaultPoolCount = (teamCount: number): number =>
  Math.max(1, Math.ceil(teamCount / RAPIERES_MAX_POOL_SIZE));

/**
 * Répartit les équipes en `poolCount` poules de tailles équilibrées (écart ≤ 1),
 * les équipes de même niveau regroupées (débutants, puis intermédiaires, puis experts).
 */
export function distributeTeams(teams: RapieresTeam[], poolCount: number): RapieresPool[] {
  const count = Math.max(1, Math.min(poolCount, teams.length || 1));
  const sorted = [...teams].sort(
    (a, b) => RAPIERES_LEVELS.indexOf(a.level) - RAPIERES_LEVELS.indexOf(b.level)
  );
  const base = Math.floor(sorted.length / count);
  const extra = sorted.length % count;
  const pools: RapieresPool[] = [];
  let i = 0;
  for (let p = 0; p < count; p++) {
    const size = base + (p < extra ? 1 : 0);
    pools.push({ teamIds: sorted.slice(i, i + size).map(t => t.id) });
    i += size;
  }
  return pools;
}

// ─── Vagues ──────────────────────────────────────────────────────────────────

type Pair = [string, string];

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Couplage de taille maximale parmi les paires restantes (recherche exhaustive, ≤ 10 équipes) */
function maxMatching(teamIds: string[], remaining: Set<string>): Pair[] {
  let best: Pair[] = [];
  const target = Math.floor(teamIds.length / 2);
  const search = (free: string[], acc: Pair[]): boolean => {
    if (acc.length > best.length) best = [...acc];
    if (best.length === target) return true;
    if (free.length < 2 || acc.length + Math.floor(free.length / 2) <= best.length) return false;
    const [first, ...rest] = free;
    for (let j = 0; j < rest.length; j++) {
      if (!remaining.has(pairKey(first, rest[j]))) continue;
      const next = rest.filter((_, k) => k !== j);
      if (search(next, [...acc, [first, rest[j]]])) return true;
    }
    // `first` au repos dans cette vague
    return search(rest, acc);
  };
  search(teamIds, []);
  return best;
}

/**
 * Calendrier en vagues d'une poule (round-robin : chaque équipe rencontre toutes les autres).
 * Chaque vague fait tirer toutes les équipes en même temps. Nombre impair : une équipe tire
 * deux fois dans la vague, jamais deux fois la même sur l'ensemble des vagues.
 * Les équipes les plus contraintes (paires restantes nombreuses) sont appariées en premier.
 */
export function scheduleWaves(
  teamIds: string[]
): { teamAId: string; teamBId: string; wave: number }[] {
  const remaining = new Set<string>();
  for (let i = 0; i < teamIds.length; i++)
    for (let j = i + 1; j < teamIds.length; j++) remaining.add(pairKey(teamIds[i], teamIds[j]));
  const doubled = new Set<string>();
  const result: { teamAId: string; teamBId: string; wave: number }[] = [];
  const pending = (id: string) =>
    teamIds.filter(o => o !== id && remaining.has(pairKey(id, o))).length;

  for (let wave = 1; remaining.size > 0; wave++) {
    const order = [...teamIds].sort((a, b) => pending(b) - pending(a));
    const pairs = maxMatching(order, remaining);
    for (const [a, b] of pairs) remaining.delete(pairKey(a, b));
    const busy = new Set(pairs.flat());
    // Équipe au repos : elle tire contre une équipe qui n'a encore jamais tiré deux fois
    for (const idle of order.filter(id => !busy.has(id))) {
      const partner = order.find(
        o => o !== idle && busy.has(o) && !doubled.has(o) && remaining.has(pairKey(idle, o))
      );
      if (!partner) continue;
      remaining.delete(pairKey(idle, partner));
      doubled.add(partner);
      busy.add(idle);
      pairs.push([partner, idle]);
    }
    if (pairs.length === 0) break; // garde-fou (ne doit pas arriver)
    for (const [a, b] of pairs) result.push({ teamAId: a, teamBId: b, wave });
  }
  return result;
}

/** Rencontres de toutes les poules, vagues numérotées à partir de 1 dans chaque poule */
export function buildBouts(pools: RapieresPool[]): RapieresBout[] {
  return pools.flatMap((pool, poolIndex) =>
    scheduleWaves(pool.teamIds).map(b => ({
      id: newId(),
      poolIndex,
      wave: b.wave,
      teamAId: b.teamAId,
      teamBId: b.teamBId,
      scoreA: null,
      scoreB: null,
    }))
  );
}

export const isBoutDone = (b: RapieresBout): boolean => b.scoreA !== null && b.scoreB !== null;

export const waveCount = (bouts: RapieresBout[]): number =>
  bouts.reduce((max, b) => Math.max(max, b.wave), 0);

/** La vague `wave` est terminée (toutes ses rencontres saisies) */
export const isWaveComplete = (bouts: RapieresBout[], wave: number): boolean =>
  bouts.filter(b => b.wave === wave).every(isBoutDone);

/** Le DT peut lancer la vague suivante */
export const canLaunchNextWave = (state: RapieresState): boolean =>
  state.launchedWave < waveCount(state.bouts) &&
  (state.launchedWave === 0 || isWaveComplete(activeBouts(state), state.launchedWave));

export const arePoolsComplete = (state: RapieresState): boolean =>
  state.bouts.length > 0 && activeBouts(state).every(isBoutDone);

// ─── Classements ─────────────────────────────────────────────────────────────

const emptyStats = (): RapieresStats => ({
  matches: 0,
  victories: 0,
  touchesGiven: 0,
  touchesReceived: 0,
});

export function computeTeamStats(
  bouts: RapieresBout[],
  teamIds?: string[]
): Map<string, RapieresStats> {
  const stats = new Map<string, RapieresStats>();
  for (const id of teamIds ?? []) stats.set(id, emptyStats());
  for (const b of bouts) {
    if (!isBoutDone(b)) continue;
    const a = stats.get(b.teamAId) ?? emptyStats();
    const c = stats.get(b.teamBId) ?? emptyStats();
    a.matches++;
    c.matches++;
    a.touchesGiven += b.scoreA!;
    a.touchesReceived += b.scoreB!;
    c.touchesGiven += b.scoreB!;
    c.touchesReceived += b.scoreA!;
    if (b.scoreA! > b.scoreB!) a.victories++;
    else if (b.scoreB! > b.scoreA!) c.victories++;
    stats.set(b.teamAId, a);
    stats.set(b.teamBId, c);
  }
  return stats;
}

const ratio = (s: RapieresStats) => (s.matches > 0 ? s.victories / s.matches : 0);
const indice = (s: RapieresStats) => s.touchesGiven - s.touchesReceived;

/** Règle FIE : V/M, puis indice (TD − TR), puis touches données */
export function compareStats(a: RapieresStats, b: RapieresStats): number {
  return ratio(b) - ratio(a) || indice(b) - indice(a) || b.touchesGiven - a.touchesGiven;
}

/** Classement d'équipes (ex æquo possibles), équipes retirées classées d'office en dernier */
export function rankTeams(
  teamIds: string[],
  stats: Map<string, RapieresStats>,
  withdrawn: Set<string> = new Set()
): RapieresRankingRow[] {
  const rows = teamIds
    .filter(id => !withdrawn.has(id))
    .map(teamId => ({ teamId, stats: stats.get(teamId) ?? emptyStats() }));
  rows.sort((a, b) => compareStats(a.stats, b.stats));
  const ranked: RapieresRankingRow[] = [];
  rows.forEach((row, i) => {
    const tied = i > 0 && compareStats(rows[i - 1].stats, row.stats) === 0;
    ranked.push({ ...row, rank: tied ? ranked[i - 1].rank : i + 1 });
  });
  for (const teamId of teamIds.filter(id => withdrawn.has(id)))
    ranked.push({ teamId, stats: stats.get(teamId) ?? emptyStats(), rank: ranked.length + 1 });
  return ranked;
}

/** Classement de chaque poule */
export function computePoolRankings(state: RapieresState): RapieresRankingRow[][] {
  const bouts = activeBouts(state);
  const withdrawn = withdrawnTeamIds(state.teams);
  return state.pools.map((pool, poolIndex) =>
    rankTeams(
      pool.teamIds,
      computeTeamStats(
        bouts.filter(b => b.poolIndex === poolIndex),
        pool.teamIds
      ),
      withdrawn
    )
  );
}

/** Classement général intermédiaire (fin de poules), toutes poules confondues */
export function computeOverallRanking(state: RapieresState): RapieresRankingRow[] {
  const teamIds = state.pools.flatMap(p => p.teamIds);
  return rankTeams(
    teamIds,
    computeTeamStats(activeBouts(state), teamIds),
    withdrawnTeamIds(state.teams)
  );
}

/** Équipes qualifiées pour le tableau : 1ers de poule, et 2es si 3 poules ou moins */
export function selectQualifiers(state: RapieresState): string[] {
  const perPool = state.pools.length <= 3 ? 2 : 1;
  const withdrawn = withdrawnTeamIds(state.teams);
  const qualified = new Set(
    computePoolRankings(state).flatMap(ranking =>
      ranking
        .filter(r => !withdrawn.has(r.teamId))
        .slice(0, perPool)
        .map(r => r.teamId)
    )
  );
  return computeOverallRanking(state)
    .map(r => r.teamId)
    .filter(id => qualified.has(id));
}

// ─── Tableau ─────────────────────────────────────────────────────────────────

export function createTableau(seeds: string[]): RapieresTableau {
  return { seeds, size: calculateTableSize(Math.max(2, seeds.length)), scores: [] };
}

const scoreOf = (t: RapieresTableau, round: number, position: number) =>
  t.scores.find(s => s.round === round && s.position === position);

/**
 * Vainqueur d'un match entre deux équipes connues : par le score, ou d'office si une seule
 * s'est retirée (deux retirées : aucune ne passe, l'emplacement suivant reste vide).
 */
function decideMatch(
  a: string,
  b: string,
  s: { scoreA: number; scoreB: number } | undefined,
  withdrawn: Set<string>
): { winnerId: string | null; loserId: string | null; walkover: boolean; void: boolean } {
  const outA = withdrawn.has(a);
  const outB = withdrawn.has(b);
  if (outA && outB) return { winnerId: null, loserId: null, walkover: false, void: true };
  if (outA || outB)
    return { winnerId: outA ? b : a, loserId: outA ? a : b, walkover: true, void: false };
  if (s && s.scoreA !== s.scoreB) {
    const winnerId = s.scoreA > s.scoreB ? a : b;
    return { winnerId, loserId: winnerId === a ? b : a, walkover: false, void: false };
  }
  return { winnerId: null, loserId: null, walkover: false, void: false };
}

/**
 * Matchs du tableau, tour par tour (round = nombre de matchs du tour), puis le match
 * pour la 3e place (round 0) entre les perdants des demi-finales.
 * Équipe retirée (abandon, forfait, exclusion) : son adversaire passe d'office.
 */
export function resolveTableau(
  t: RapieresTableau,
  withdrawn: Set<string> = new Set()
): RapieresTableauMatch[] {
  const chart = generateSeedingChart(t.size);
  let slots: (string | null)[] = chart.map(seed => t.seeds[seed - 1] ?? null);
  // known[i] : occupant du slot connu (null = exempt) ; faux tant que le match amont n'est pas joué
  let known: boolean[] = slots.map(() => true);
  const matches: RapieresTableauMatch[] = [];
  const semiLosers: (string | null)[] = [];
  let semisKnown = true;

  for (let round = t.size / 2; round >= 1; round /= 2) {
    const nextSlots: (string | null)[] = [];
    const nextKnown: boolean[] = [];
    for (let position = 0; position < round; position++) {
      const a = slots[position * 2];
      const b = slots[position * 2 + 1];
      const ready = known[position * 2] && known[position * 2 + 1];
      const isBye = ready && (a === null) !== (b === null);
      const s = scoreOf(t, round, position);
      let winnerId: string | null = null;
      let loserId: string | null = null;
      let walkover = false;
      let both = false;
      if (isBye) winnerId = a ?? b;
      else if (ready && a && b) {
        const d = decideMatch(a, b, s, withdrawn);
        ({ winnerId, loserId, walkover } = d);
        both = d.void;
      }
      const decided = ready && (isBye || (a === null && b === null) || winnerId !== null || both);
      matches.push({
        round,
        position,
        teamAId: known[position * 2] ? a : null,
        teamBId: known[position * 2 + 1] ? b : null,
        isBye,
        scoreA: !isBye && !walkover && s ? s.scoreA : null,
        scoreB: !isBye && !walkover && s ? s.scoreB : null,
        winnerId,
        loserId,
        ...(walkover ? { walkover } : {}),
      });
      nextSlots.push(winnerId);
      nextKnown.push(decided);
      if (round === 2) {
        semiLosers.push(loserId);
        if (!decided) semisKnown = false;
      }
    }
    slots = nextSlots;
    known = nextKnown;
  }

  if (t.size >= 4) {
    const [a, b] = [semiLosers[0] ?? null, semiLosers[1] ?? null];
    const s = scoreOf(t, 0, 0);
    const isBye = semisKnown && (a === null) !== (b === null);
    let winnerId: string | null = null;
    let loserId: string | null = null;
    let walkover = false;
    if (isBye) winnerId = a ?? b;
    else if (semisKnown && a && b)
      ({ winnerId, loserId, walkover } = decideMatch(a, b, s, withdrawn));
    matches.push({
      round: 0,
      position: 0,
      teamAId: semisKnown ? a : null,
      teamBId: semisKnown ? b : null,
      isBye,
      scoreA: !isBye && !walkover && s ? s.scoreA : null,
      scoreB: !isBye && !walkover && s ? s.scoreB : null,
      winnerId,
      loserId,
      ...(walkover ? { walkover } : {}),
    });
  }
  return matches;
}

/** Match jouable : deux équipes connues, pas un exempt ni un match gagné d'office */
export const isPlayable = (m: RapieresTableauMatch): boolean =>
  !!m.teamAId && !!m.teamBId && !m.isBye && !m.walkover;

export const isTableauComplete = (
  t: RapieresTableau,
  withdrawn: Set<string> = new Set()
): boolean =>
  resolveTableau(t, withdrawn).every(
    m =>
      !isPlayable(m) ||
      m.winnerId !== null ||
      (withdrawn.has(m.teamAId!) && withdrawn.has(m.teamBId!))
  );

/** Enregistre (ou efface avec null) le score d'un match et invalide les tours suivants */
export function setTableauScore(
  t: RapieresTableau,
  round: number,
  position: number,
  score: { scoreA: number; scoreB: number } | null
): RapieresTableau {
  // Tours suivants dépendants : effacés, le vainqueur pouvant changer
  const downstream = (r: number, p: number): { round: number; position: number }[] => {
    if (r === 0 || r === 1) return [];
    const next = { round: r / 2, position: Math.floor(p / 2) };
    const third = r === 2 ? [{ round: 0, position: 0 }] : [];
    return [next, ...third, ...downstream(next.round, next.position)];
  };
  const cleared = new Set(downstream(round, position).map(k => `${k.round}:${k.position}`));
  const scores = t.scores.filter(
    s => !(s.round === round && s.position === position) && !cleared.has(`${s.round}:${s.position}`)
  );
  if (score) scores.push({ round, position, ...score });
  return { ...t, scores };
}

// ─── Classement final ────────────────────────────────────────────────────────

/**
 * Classement final des équipes : 1er vainqueur, 2e finaliste, 3e / 4e selon le match
 * pour la 3e place, puis perdants de chaque tour (classés entre eux selon les poules),
 * puis équipes non qualifiées dans l'ordre du classement de poules.
 */
export function computeFinalRanking(state: RapieresState): { teamId: string; rank: number }[] {
  const overall = computeOverallRanking(state).map(r => r.teamId);
  const order = (ids: string[]) => [...ids].sort((a, b) => overall.indexOf(a) - overall.indexOf(b));
  if (!state.tableau) return overall.map((teamId, i) => ({ teamId, rank: i + 1 }));

  const withdrawn = withdrawnTeamIds(state.teams);
  const matches = resolveTableau(state.tableau, withdrawn);
  const placed: string[] = [];
  const final = matches.find(m => m.round === 1);
  const third = matches.find(m => m.round === 0);
  if (final?.winnerId) placed.push(final.winnerId);
  if (final?.loserId) placed.push(final.loserId);
  if (third?.winnerId) placed.push(third.winnerId);
  if (third?.loserId) placed.push(third.loserId);
  for (let round = 2; round <= state.tableau.size / 2; round *= 2) {
    if (round === 2 && third) continue; // déjà classés par le match pour la 3e place
    placed.push(
      ...order(
        matches
          .filter(m => m.round === round && m.loserId)
          .map(m => m.loserId as string)
          .filter(id => !placed.includes(id))
      )
    );
  }
  // Équipes encore en lice (tableau inachevé), puis non qualifiées
  const rest = order(overall.filter(id => !placed.includes(id)));
  const inTableau = new Set(state.tableau.seeds);
  const ordered = [
    ...placed,
    ...rest.filter(id => inTableau.has(id)),
    ...rest.filter(id => !inTableau.has(id)),
  ];
  // Exclusion : classée d'office en dernier (l'abandon garde la place acquise)
  const excluded = new Set(state.teams.filter(t => teamStatus(t) === 'excluded').map(t => t.id));
  return [
    ...ordered.filter(id => !excluded.has(id)),
    ...ordered.filter(id => excluded.has(id)),
  ].map((teamId, i) => ({ teamId, rank: i + 1 }));
}

// ─── Filtres de classement ───────────────────────────────────────────────────

export type RapieresRankingFilter =
  | { kind: 'teams' }
  | { kind: 'level'; level: RapieresLevel }
  | { kind: 'category'; category: RapieresAgeCategory };

export interface RapieresDisplayRow {
  rank: number;
  teamId: string;
  /** Tireur concerné (classement individuel par catégorie d'âge), sinon absent */
  fencerIndex?: 0 | 1;
}

/**
 * Applique un filtre à un classement d'équipes déjà ordonné (rangs recalculés dans le filtre,
 * ex æquo conservés). Par catégorie : un rang par tireur, avec le résultat de son équipe.
 */
export function filterRanking(
  ranked: { teamId: string; rank: number }[],
  teams: RapieresTeam[],
  filter: RapieresRankingFilter
): RapieresDisplayRow[] {
  const byId = new Map(teams.map(t => [t.id, t]));
  const rows: (RapieresDisplayRow & { source: number })[] = [];
  for (const r of ranked) {
    const team = byId.get(r.teamId);
    if (!team) continue;
    if (filter.kind === 'teams') rows.push({ rank: 0, teamId: r.teamId, source: r.rank });
    else if (filter.kind === 'level') {
      if (team.level === filter.level) rows.push({ rank: 0, teamId: r.teamId, source: r.rank });
    } else {
      team.fencers.forEach((f, i) => {
        if (f.category === filter.category)
          rows.push({ rank: 0, teamId: r.teamId, fencerIndex: i as 0 | 1, source: r.rank });
      });
    }
  }
  return rows.map((row, i) => ({
    teamId: row.teamId,
    ...(row.fencerIndex !== undefined ? { fencerIndex: row.fencerIndex } : {}),
    rank:
      i > 0 && rows[i - 1].source === row.source
        ? rows.findIndex(x => x.source === row.source) + 1
        : i + 1,
  }));
}
