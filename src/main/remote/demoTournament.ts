/**
 * BellePoule Modern - Démo autonome : tournoi fictif complet joué en boucle.
 * Poules (matrice remplie au fil des matchs) → classement après poules → tableau d'élimination
 * directe → classement final → pause → nouveau tournoi. Logique pure : l'arbitre virtuel
 * (demoMode.ts) demande les duels et rapporte les scores, l'horloge est injectée.
 * Licensed under GPL-3.0
 */
import type { ArenaMatch } from '../../shared/types/remote';

type DemoFencer = ArenaMatch['fencerA'];

export type DemoPhase = 'pools' | 'pool_ranking' | 'tableau' | 'final_ranking';

/** Nombre de poules et de tireurs par poule. */
export const DEMO_POOL_COUNT = 2;
export const DEMO_POOL_SIZE = 5;
/** Taille du tableau d'élimination directe (les premiers du classement après poules). */
export const DEMO_TABLEAU_SIZE = 8;
/** Durée d'affichage du classement après poules (ms). */
export const DEMO_POOL_RANKING_MS = 15_000;
/** Durée d'affichage du classement final avant de recommencer (ms). */
export const DEMO_FINAL_RANKING_MS = 30_000;

/** Ligne de classement d'une poule */
export interface DemoPoolRanking {
  id: string;
  lastName: string;
  firstName: string;
  club: string;
  matchesPlayed: number;
  victories: number;
  touchesFor: number;
  touchesAgainst: number;
  index: number;
}

export interface DemoFencerView {
  id: string;
  lastName: string;
  firstName: string;
  club: string;
}

/** Poule telle qu'affichée (matrice) */
export interface DemoPoolSheet {
  number: number;
  fencers: DemoFencerView[];
  /** Scores joués : `idA|idB` → touches données par A, reçues de B (et inversement) */
  results: { a: string; b: string; scoreA: number; scoreB: number }[];
  /** Duels en cours (`idA|idB`) */
  playing: string[];
  rankings: DemoPoolRanking[];
}

export interface DemoBracketMatch {
  a: DemoFencerView | null;
  b: DemoFencerView | null;
  seedA: number | null;
  seedB: number | null;
  scoreA: number | null;
  scoreB: number | null;
  /** 'A' | 'B' quand le match est terminé */
  winner: 'A' | 'B' | null;
  status: 'pending' | 'playing' | 'done';
}

export interface DemoRankRow {
  rank: number;
  fencer: DemoFencerView;
  victories: number;
  matchesPlayed: number;
  index: number;
  touchesFor: number;
}

export interface DemoTournamentState {
  cycle: number;
  phase: DemoPhase;
  /** Temps restant dans la phase (ms) pour les phases d'affichage, sinon null */
  remainingMs: number | null;
  pools: DemoPoolSheet[];
  poolRanking: DemoRankRow[];
  /** Tours du tableau, du premier à la finale */
  tableau: DemoBracketMatch[][];
  finalRanking: DemoRankRow[];
}

/** Duel à jouer sur une piste */
export interface DemoPairing {
  fencerA: DemoFencer;
  fencerB: DemoFencer;
  isTableau: boolean;
}

interface Pool {
  number: number;
  fencers: DemoFencer[];
  results: Map<string, { a: string; b: string; scoreA: number; scoreB: number }>;
  total: number;
}

interface BracketMatch {
  a: DemoFencer | null;
  b: DemoFencer | null;
  scoreA: number | null;
  scoreB: number | null;
  winner: 'A' | 'B' | null;
  status: 'pending' | 'playing' | 'done';
}

type Pending =
  { kind: 'pool'; pool: Pool; a: string; b: string } | { kind: 'tableau'; match: BracketMatch };

const view = (f: DemoFencer): DemoFencerView => ({
  id: f.id,
  lastName: f.lastName,
  firstName: f.firstName ?? '',
  club: f.club ?? '',
});

/**
 * Ordre de placement du tableau (1 contre 8, 4 contre 5…) : têtes de série réparties pour que
 * 1 et 2 ne puissent se rencontrer qu'en finale.
 */
export function bracketSeedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap(s => [s, n + 1 - s]);
  }
  return order;
}

/** Classement : V/M, puis indice, puis touches données */
function compareRows(x: DemoPoolRanking, y: DemoPoolRanking): number {
  const rx = x.matchesPlayed ? x.victories / x.matchesPlayed : 0;
  const ry = y.matchesPlayed ? y.victories / y.matchesPlayed : 0;
  return ry - rx || y.index - x.index || y.touchesFor - x.touchesFor;
}

export class DemoTournament {
  private cycle = 0;
  private phase: DemoPhase = 'pools';
  private phaseSince = 0;
  private pools: Pool[] = [];
  private queue: { pool: Pool; a: number; b: number }[] = [];
  private readonly pending = new Map<string, Pending>();
  private seeds: DemoPoolRanking[] = [];
  private fencersById = new Map<string, DemoFencer>();
  private rounds: BracketMatch[][] = [];
  private finalRows: DemoRankRow[] = [];

  constructor(
    private readonly rng: () => number,
    private readonly makeFencer: (id: string, rng: () => number) => DemoFencer,
    private readonly now: () => number = Date.now
  ) {
    this.newCycle();
  }

  get currentPhase(): DemoPhase {
    return this.phase;
  }

  /** Avance les phases d'affichage (classements) ; true si la phase a changé. */
  tick(): boolean {
    const elapsed = this.now() - this.phaseSince;
    if (this.phase === 'pool_ranking' && elapsed >= DEMO_POOL_RANKING_MS) {
      this.startTableau();
      return true;
    }
    if (this.phase === 'final_ranking' && elapsed >= DEMO_FINAL_RANKING_MS) {
      this.newCycle();
      return true;
    }
    return false;
  }

  /** Prochain duel jouable, ou null (phase d'affichage, ou tour du tableau incomplet). */
  next(matchId: string): DemoPairing | null {
    if (this.phase === 'pools') {
      const item = this.queue.shift();
      if (!item) return null;
      const fencerA = item.pool.fencers[item.a];
      const fencerB = item.pool.fencers[item.b];
      this.pending.set(matchId, { kind: 'pool', pool: item.pool, a: fencerA.id, b: fencerB.id });
      return { fencerA: { ...fencerA }, fencerB: { ...fencerB }, isTableau: false };
    }
    if (this.phase === 'tableau') {
      const round = this.rounds[this.rounds.length - 1];
      const match = round.find(m => m.status === 'pending' && m.a && m.b);
      if (!match) return null;
      match.status = 'playing';
      this.pending.set(matchId, { kind: 'tableau', match });
      return { fencerA: { ...match.a! }, fencerB: { ...match.b! }, isTableau: true };
    }
    return null;
  }

  /** Score final d'un duel distribué par `next` ; true si la phase a changé. */
  record(matchId: string, scoreA: number, scoreB: number): boolean {
    const p = this.pending.get(matchId);
    if (!p) return false;
    this.pending.delete(matchId);
    if (p.kind === 'pool') {
      p.pool.results.set(`${p.a}|${p.b}`, { a: p.a, b: p.b, scoreA, scoreB });
      if (this.phase === 'pools' && this.pools.every(pool => pool.results.size >= pool.total)) {
        this.seeds = this.overallRanking();
        this.setPhase('pool_ranking');
        return true;
      }
      return false;
    }
    const m = p.match;
    m.scoreA = scoreA;
    m.scoreB = scoreB;
    m.winner = scoreA >= scoreB ? 'A' : 'B';
    m.status = 'done';
    return this.advanceTableau();
  }

  state(): DemoTournamentState {
    const elapsed = this.now() - this.phaseSince;
    const remainingMs =
      this.phase === 'pool_ranking'
        ? Math.max(0, DEMO_POOL_RANKING_MS - elapsed)
        : this.phase === 'final_ranking'
          ? Math.max(0, DEMO_FINAL_RANKING_MS - elapsed)
          : null;
    const playing = new Set(
      [...this.pending.values()].flatMap(p => (p.kind === 'pool' ? [`${p.a}|${p.b}`] : []))
    );
    const seedOf = (f: DemoFencer | null) =>
      f ? this.seeds.findIndex(s => s.id === f.id) + 1 || null : null;
    return {
      cycle: this.cycle,
      phase: this.phase,
      remainingMs,
      pools: this.pools.map(pool => ({
        number: pool.number,
        fencers: pool.fencers.map(view),
        results: [...pool.results.values()],
        playing: [...playing].filter(k => pool.fencers.some(f => k.startsWith(`${f.id}|`))),
        rankings: this.poolRankings(pool),
      })),
      poolRanking: this.seeds.map((r, i) => this.rankRow(i + 1, r)),
      tableau: this.rounds.map(round =>
        round.map(m => ({
          a: m.a ? view(m.a) : null,
          b: m.b ? view(m.b) : null,
          seedA: seedOf(m.a),
          seedB: seedOf(m.b),
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          winner: m.winner,
          status: m.status,
        }))
      ),
      finalRanking: this.finalRows,
    };
  }

  private setPhase(phase: DemoPhase): void {
    this.phase = phase;
    this.phaseSince = this.now();
  }

  private rankRow(rank: number, r: DemoPoolRanking): DemoRankRow {
    return {
      rank,
      fencer: { id: r.id, lastName: r.lastName, firstName: r.firstName, club: r.club },
      victories: r.victories,
      matchesPlayed: r.matchesPlayed,
      index: r.index,
      touchesFor: r.touchesFor,
    };
  }

  private poolRows(pool: Pool): DemoPoolRanking[] {
    const rows = new Map<string, DemoPoolRanking>(
      pool.fencers.map(f => [
        f.id,
        {
          ...view(f),
          matchesPlayed: 0,
          victories: 0,
          touchesFor: 0,
          touchesAgainst: 0,
          index: 0,
        },
      ])
    );
    for (const r of pool.results.values()) {
      const ra = rows.get(r.a)!;
      const rb = rows.get(r.b)!;
      ra.matchesPlayed++;
      rb.matchesPlayed++;
      ra.touchesFor += r.scoreA;
      ra.touchesAgainst += r.scoreB;
      rb.touchesFor += r.scoreB;
      rb.touchesAgainst += r.scoreA;
      if (r.scoreA > r.scoreB) ra.victories++;
      else if (r.scoreB > r.scoreA) rb.victories++;
    }
    return [...rows.values()].map(r => ({ ...r, index: r.touchesFor - r.touchesAgainst }));
  }

  private poolRankings(pool: Pool): DemoPoolRanking[] {
    return this.poolRows(pool).sort(compareRows);
  }

  private overallRanking(): DemoPoolRanking[] {
    return this.pools.flatMap(pool => this.poolRows(pool)).sort(compareRows);
  }

  private startTableau(): void {
    const size = Math.min(DEMO_TABLEAU_SIZE, this.seeds.length);
    const order = bracketSeedOrder(size);
    const first: BracketMatch[] = [];
    for (let i = 0; i < order.length; i += 2) {
      const a = this.fencersById.get(this.seeds[order[i] - 1]?.id) ?? null;
      const b = this.fencersById.get(this.seeds[order[i + 1] - 1]?.id) ?? null;
      first.push({ a, b, scoreA: null, scoreB: null, winner: null, status: 'pending' });
    }
    this.rounds = [first];
    this.setPhase('tableau');
  }

  /** Tour terminé → tour suivant ; finale terminée → classement final. */
  private advanceTableau(): boolean {
    const round = this.rounds[this.rounds.length - 1];
    if (!round.every(m => m.status === 'done')) return false;
    const winners = round.map(m => (m.winner === 'A' ? m.a : m.b));
    if (winners.length === 1) {
      this.finalRows = this.computeFinalRanking();
      this.setPhase('final_ranking');
      return true;
    }
    const next: BracketMatch[] = [];
    for (let i = 0; i < winners.length; i += 2) {
      next.push({
        a: winners[i],
        b: winners[i + 1],
        scoreA: null,
        scoreB: null,
        winner: null,
        status: 'pending',
      });
    }
    this.rounds.push(next);
    return true;
  }

  /** 1er, 2e, puis perdants de chaque tour (même place, départagés par la tête de série), puis non qualifiés. */
  private computeFinalRanking(): DemoRankRow[] {
    const seedIndex = new Map(this.seeds.map((s, i) => [s.id, i]));
    const bySeed = (ids: string[]) => ids.sort((x, y) => seedIndex.get(x)! - seedIndex.get(y)!);
    const groups: string[][] = [];
    const final = this.rounds[this.rounds.length - 1][0];
    const loserOf = (m: BracketMatch) => (m.winner === 'A' ? m.b : m.a)!;
    groups.push([(final.winner === 'A' ? final.a : final.b)!.id], [loserOf(final).id]);
    for (let r = this.rounds.length - 2; r >= 0; r--) {
      groups.push(bySeed(this.rounds[r].map(m => loserOf(m).id)));
    }
    const qualified = new Set(groups.flat());
    groups.push(this.seeds.filter(s => !qualified.has(s.id)).map(s => s.id));
    const rows: DemoRankRow[] = [];
    for (const group of groups) {
      const rank = rows.length + 1;
      for (const id of group) {
        const s = this.seeds[seedIndex.get(id)!];
        rows.push(this.rankRow(rank, s));
      }
    }
    return rows;
  }

  private newCycle(): void {
    this.cycle++;
    this.pending.clear();
    this.rounds = [];
    this.seeds = [];
    this.finalRows = [];
    this.fencersById = new Map();
    const used = new Set<string>();
    this.pools = Array.from({ length: DEMO_POOL_COUNT }, (_, p) => {
      const fencers = Array.from({ length: DEMO_POOL_SIZE }, (_, i) => {
        let f: DemoFencer;
        let tries = 0;
        do {
          f = this.makeFencer(`demo-c${this.cycle}-p${p + 1}-${i + 1}`, this.rng);
        } while (used.has(`${f.firstName}|${f.lastName}`) && ++tries < 20);
        used.add(`${f.firstName}|${f.lastName}`);
        this.fencersById.set(f.id, f);
        return f;
      });
      const n = fencers.length;
      return { number: p + 1, fencers, results: new Map(), total: (n * (n - 1)) / 2 };
    });
    // Tourniquet : duels de chaque poule mélangés, poules entrelacées (une poule par piste)
    const perPool = this.pools.map(pool => {
      const pairs: { pool: Pool; a: number; b: number }[] = [];
      for (let i = 0; i < pool.fencers.length; i++) {
        for (let j = i + 1; j < pool.fencers.length; j++) pairs.push({ pool, a: i, b: j });
      }
      for (let k = pairs.length - 1; k > 0; k--) {
        const r = Math.floor(this.rng() * (k + 1));
        [pairs[k], pairs[r]] = [pairs[r], pairs[k]];
      }
      return pairs;
    });
    const longest = Math.max(...perPool.map(p => p.length));
    this.queue = [];
    for (let i = 0; i < longest; i++) {
      for (const pairs of perPool) if (pairs[i]) this.queue.push(pairs[i]);
    }
    this.setPhase('pools');
  }
}
