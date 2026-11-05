/**
 * BellePoule Modern - Mode démo : matchs aléatoires joués automatiquement sur les arènes.
 * S'appuie sur la session d'entraînement : le serveur joue le rôle de l'arbitre
 * (démarrage, points, fin de match) avec des tireurs fictifs et des scores aléatoires.
 * Les écrans arène, la saisie distante et le tableau de bord voient donc une activité réelle.
 * Licensed under GPL-3.0
 */
import type { ArenaMatch } from '../../shared/types/remote';
import { TargetZone, Weapon, ZONE_POINTS } from '../../shared/types';
import { createRng } from '../../shared/utils/tournamentSimulator';

/** Intervalle entre deux décisions de l'arbitre virtuel (ms). */
export const DEMO_TICK_MS = 1000;
/** Probabilité qu'un tick marque un point sur une arène en cours. */
export const DEMO_POINT_PROBABILITY = 0.55;

const FIRST_NAMES = [
  'Lucas',
  'Emma',
  'Hugo',
  'Léa',
  'Louis',
  'Chloé',
  'Arthur',
  'Manon',
  'Jules',
  'Camille',
  'Gabriel',
  'Inès',
  'Raphaël',
  'Zoé',
  'Adam',
  'Jade',
];

const LAST_NAMES = [
  'Martin',
  'Bernard',
  'Dubois',
  'Thomas',
  'Robert',
  'Petit',
  'Durand',
  'Leroy',
  'Moreau',
  'Simon',
  'Laurent',
  'Lefebvre',
  'Michel',
  'Garcia',
  'Roux',
  'Fontaine',
];

const CLUBS = ['Escrime Club Nord', 'Épée Sud', 'Cercle Lame Bleue', 'Salle des Mousquetaires'];

/** État vu par l'arbitre virtuel pour une arène. */
export interface DemoArenaView {
  status: string;
  currentMatch: ArenaMatch | null;
}

/** Services du serveur utilisés par la démo (accesseurs : valeurs toujours à jour). */
export interface DemoPlayerHost {
  arenas: () => Map<string, DemoArenaView>;
  startArenaMatch(arenaId: string): void;
  updateArenaScore(arenaId: string, scoreA: number, scoreB: number): void;
  finishArenaMatch(arenaId: string): void;
  getScoreLimit(match: ArenaMatch): number;
  /** Diffuse le chrono restant (s) d'un match en cours : écrans d'arène animés comme avec un arbitre */
  updateArenaTimer?(arenaId: string, remainingSeconds: number): void;
  /** Durée d'un match (s), 180 par défaut */
  matchSeconds?: () => number;
}

export type DemoAction =
  { kind: 'start' } | { kind: 'point'; side: 'A' | 'B' } | { kind: 'finish' } | { kind: 'wait' };

export interface DemoArenaState {
  status: string;
  scoreA: number;
  scoreB: number;
  scoreLimit: number;
}

/**
 * Décide l'action de l'arbitre virtuel pour une arène (fonction pure).
 * - `ready` → démarrer le match
 * - `in_progress` → marquer un point (côté aléatoire) ou terminer dès que la limite est atteinte
 */
export function decideDemoAction(
  state: DemoArenaState,
  rng: () => number,
  pointProbability = DEMO_POINT_PROBABILITY
): DemoAction {
  if (state.status === 'ready') return { kind: 'start' };
  if (state.status !== 'in_progress') return { kind: 'wait' };
  if (Math.max(state.scoreA, state.scoreB) >= state.scoreLimit) return { kind: 'finish' };
  if (rng() < pointProbability) return { kind: 'point', side: rng() < 0.5 ? 'A' : 'B' };
  return { kind: 'wait' };
}

function randomItem<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

/** Arme simulée par la démo et zones autorisées (Laser uniquement). */
export interface DemoWeaponProfile {
  weapon: string;
  allowedZones: string[];
}

/**
 * Points d'une touche selon l'arme simulée : 1 pour E/F/S/C ; en Laser, la zone touchée
 * est tirée parmi les zones autorisées (toutes si aucune restriction) → 1, 3 ou 5 points.
 */
export function touchPoints(profile: DemoWeaponProfile, rng: () => number): number {
  if (profile.weapon !== Weapon.LASER) return 1;
  const allowed = Object.values(TargetZone).filter(
    zone => profile.allowedZones.length === 0 || profile.allowedZones.includes(zone)
  );
  return ZONE_POINTS[randomItem(allowed, rng)];
}

/** Tireur fictif aléatoire (même forme que le tireur d'entraînement). */
function createDemoFencer(id: string, rng: () => number): ArenaMatch['fencerA'] {
  return {
    id,
    firstName: randomItem(FIRST_NAMES, rng),
    lastName: randomItem(LAST_NAMES, rng).toUpperCase(),
    club: randomItem(CLUBS, rng),
    ref: 0,
  } as ArenaMatch['fencerA'];
}

/** Ligne de classement d'une poule de démo (même forme que /results-data pour le kiosque). */
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

export interface DemoPoolView {
  id: string;
  number: number;
  name: string;
  isComplete: boolean;
  rankings: DemoPoolRanking[];
}

/** Nombre de poules et de tireurs par poule simulés par la démo. */
export const DEMO_POOL_COUNT = 2;
export const DEMO_POOL_SIZE = 5;

interface DemoPool {
  id: string;
  number: number;
  fencers: ArenaMatch['fencerA'][];
  /** Matchs joués : clé `idA|idB` → scores */
  results: Map<string, { a: string; b: string; scoreA: number; scoreB: number }>;
  total: number;
}

/**
 * Poules fictives de la démo : tireurs tirés au sort, matchs en tourniquet (toutes poules
 * entrelacées) et classement recalculé à chaque résultat. Quand tous les matchs sont distribués,
 * un nouveau tour de poules est tiré (la démo tourne sans fin).
 */
export class DemoPools {
  private pools: DemoPool[] = [];
  private queue: { pool: DemoPool; a: number; b: number }[] = [];
  /** Match en cours → poule et identifiants des tireurs */
  private readonly pending = new Map<string, { pool: DemoPool; a: string; b: string }>();
  private round = 0;

  constructor(private readonly rng: () => number) {}

  /** Prochain duel (nouveau tour de poules si la file est vide). */
  next(matchId: string): { fencerA: ArenaMatch['fencerA']; fencerB: ArenaMatch['fencerB'] } {
    if (this.queue.length === 0) this.newRound();
    const { pool, a, b } = this.queue.shift()!;
    const fencerA = pool.fencers[a];
    const fencerB = pool.fencers[b];
    this.pending.set(matchId, { pool, a: fencerA.id, b: fencerB.id });
    // Copies : l'arène peut modifier le match sans toucher la poule
    return { fencerA: { ...fencerA }, fencerB: { ...fencerB } };
  }

  /** Enregistre le score final d'un duel distribué par `next`. */
  record(matchId: string, scoreA: number, scoreB: number): void {
    const p = this.pending.get(matchId);
    if (!p) return;
    this.pending.delete(matchId);
    p.pool.results.set(`${p.a}|${p.b}`, { a: p.a, b: p.b, scoreA, scoreB });
  }

  view(): DemoPoolView[] {
    return this.pools.map(pool => {
      const rows = new Map<string, DemoPoolRanking>(
        pool.fencers.map(f => [
          f.id,
          {
            id: f.id,
            lastName: f.lastName,
            firstName: f.firstName ?? '',
            club: f.club ?? '',
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
      const rankings = [...rows.values()].map(r => ({
        ...r,
        index: r.touchesFor - r.touchesAgainst,
      }));
      rankings.sort(
        (x, y) =>
          (y.matchesPlayed ? y.victories / y.matchesPlayed : 0) -
            (x.matchesPlayed ? x.victories / x.matchesPlayed : 0) ||
          y.index - x.index ||
          y.touchesFor - x.touchesFor
      );
      return {
        id: pool.id,
        number: pool.number,
        name: `Poule ${pool.number}`,
        isComplete: pool.results.size >= pool.total,
        rankings,
      };
    });
  }

  private newRound(): void {
    this.round++;
    const used = new Set<string>();
    this.pools = Array.from({ length: DEMO_POOL_COUNT }, (_, p) => {
      const fencers = Array.from({ length: DEMO_POOL_SIZE }, (_, i) => {
        let f: ArenaMatch['fencerA'];
        let key: string;
        let tries = 0;
        do {
          f = createDemoFencer(`demo-r${this.round}-p${p + 1}-${i + 1}`, this.rng);
          key = `${f.firstName}|${f.lastName}`;
        } while (used.has(key) && ++tries < 20);
        used.add(key);
        return f;
      });
      const n = fencers.length;
      return {
        id: `demo-pool-${this.round}-${p + 1}`,
        number: p + 1,
        fencers,
        results: new Map(),
        total: (n * (n - 1)) / 2,
      };
    });
    // Tourniquet : chaque poule fournit ses duels dans l'ordre, poules entrelacées
    const perPool = this.pools.map(pool => {
      const pairs: { pool: DemoPool; a: number; b: number }[] = [];
      for (let i = 0; i < pool.fencers.length; i++) {
        for (let j = i + 1; j < pool.fencers.length; j++) pairs.push({ pool, a: i, b: j });
      }
      // Ordre mélangé pour éviter qu'un tireur enchaîne tous ses matchs
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
  }
}

/**
 * Lanceur de la démo : génère les matchs aléatoires et pilote les arènes à intervalle régulier.
 * Le minuteur n'est pas armé à la construction : appeler `start()`.
 */
export class DemoPlayer {
  private readonly rng: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private matchCount = 0;
  private readonly demoPools: DemoPools;
  /** Arène → match chronométré et instant de début (ms) */
  private readonly started = new Map<string, { matchId: string; at: number }>();
  private now: () => number = Date.now;

  constructor(
    private readonly host: DemoPlayerHost,
    seed: number = Date.now(),
    private readonly profile: DemoWeaponProfile = { weapon: Weapon.EPEE, allowedZones: [] }
  ) {
    this.rng = createRng(seed);
    this.demoPools = new DemoPools(this.rng);
  }

  /** Classements des poules de démo (vue kiosque). */
  poolsView(): DemoPoolView[] {
    return this.demoPools.view();
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /** Prochain duel des poules de démo, à assigner à une arène. */
  createMatch(): ArenaMatch {
    this.matchCount++;
    const suffix = Math.floor(this.rng() * 1e9).toString(36);
    const id = `demo-${this.matchCount}-${suffix}`;
    const { fencerA, fencerB } = this.demoPools.next(id);
    return {
      id,
      poolId: '__training__',
      fencerA,
      fencerB,
      scoreA: 0,
      scoreB: 0,
      status: 'not_started',
      startTime: null,
      endTime: null,
    };
  }

  start(intervalMs: number = DEMO_TICK_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Une décision par arène ; exposé pour les tests. */
  tick(): void {
    for (const [arenaId, arena] of this.host.arenas()) {
      const match = arena.currentMatch;
      if (!match) continue;
      const action = decideDemoAction(
        {
          status: arena.status,
          scoreA: match.scoreA,
          scoreB: match.scoreB,
          scoreLimit: this.host.getScoreLimit(match),
        },
        this.rng
      );
      if (action.kind === 'start') {
        this.host.startArenaMatch(arenaId);
        this.started.set(arenaId, { matchId: match.id, at: this.now() });
      } else if (action.kind === 'point') {
        const points = touchPoints(this.profile, this.rng);
        const scoreA = match.scoreA + (action.side === 'A' ? points : 0);
        const scoreB = match.scoreB + (action.side === 'B' ? points : 0);
        this.host.updateArenaScore(arenaId, scoreA, scoreB);
      } else if (action.kind === 'finish') {
        this.demoPools.record(match.id, match.scoreA, match.scoreB);
        this.host.finishArenaMatch(arenaId);
        this.started.delete(arenaId);
        continue;
      }
      this.tickTimer(arenaId, arena.status, match.id);
    }
  }

  /** Horloge injectable (tests). */
  setClock(now: () => number): void {
    this.now = now;
  }

  private tickTimer(arenaId: string, status: string, matchId: string): void {
    const s = this.started.get(arenaId);
    if (!this.host.updateArenaTimer || status !== 'in_progress' || s?.matchId !== matchId) return;
    const total = this.host.matchSeconds?.() ?? 180;
    const remaining = Math.max(0, total - Math.floor((this.now() - s.at) / 1000));
    this.host.updateArenaTimer(arenaId, remaining);
  }
}
