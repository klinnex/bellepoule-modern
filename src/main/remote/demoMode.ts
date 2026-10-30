/**
 * BellePoule Modern - Mode démo : matchs aléatoires joués automatiquement sur les arènes.
 * S'appuie sur la session d'entraînement : le serveur joue le rôle de l'arbitre
 * (démarrage, points, fin de match) avec des tireurs fictifs et des scores aléatoires.
 * Les écrans arène, la saisie distante et le tableau de bord voient donc une activité réelle.
 * Licensed under GPL-3.0
 */
import type { ArenaMatch } from '../../shared/types/remote';
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

/**
 * Lanceur de la démo : génère les matchs aléatoires et pilote les arènes à intervalle régulier.
 * Le minuteur n'est pas armé à la construction : appeler `start()`.
 */
export class DemoPlayer {
  private readonly rng: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private matchCount = 0;

  constructor(
    private readonly host: DemoPlayerHost,
    seed: number = Date.now()
  ) {
    this.rng = createRng(seed);
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /** Match aléatoire à assigner à une arène (tireurs et club tirés au sort). */
  createMatch(): ArenaMatch {
    this.matchCount++;
    const suffix = Math.floor(this.rng() * 1e9).toString(36);
    return {
      id: `demo-${this.matchCount}-${suffix}`,
      poolId: '__training__',
      fencerA: createDemoFencer(`demo-${this.matchCount}-A`, this.rng),
      fencerB: createDemoFencer(`demo-${this.matchCount}-B`, this.rng),
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
      } else if (action.kind === 'point') {
        const scoreA = match.scoreA + (action.side === 'A' ? 1 : 0);
        const scoreB = match.scoreB + (action.side === 'B' ? 1 : 0);
        this.host.updateArenaScore(arenaId, scoreA, scoreB);
      } else if (action.kind === 'finish') {
        this.host.finishArenaMatch(arenaId);
      }
    }
  }
}
