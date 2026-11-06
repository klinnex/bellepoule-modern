/**
 * BellePoule Modern - Mode démo : matchs aléatoires joués automatiquement sur les arènes.
 * S'appuie sur la session d'entraînement : le serveur joue le rôle de l'arbitre
 * (démarrage, points, fin de match) avec des tireurs fictifs et des scores aléatoires.
 * Les écrans arène, la saisie distante et le tableau de bord voient donc une activité réelle.
 * Licensed under GPL-3.0
 */
import type { ArenaMatch, ArenaUpdate } from '../../shared/types/remote';
import { TargetZone, Weapon, ZONE_POINTS } from '../../shared/types';
import { createRng } from '../../shared/utils/tournamentSimulator';
import { DemoTournament, type DemoTournamentState } from './demoTournament';

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

/** Services du serveur utilisés par la démo (contexte du serveur : valeurs toujours à jour). */
export interface DemoPlayerHost {
  readonly arenas: Map<string, DemoArenaView>;
  startArenaMatch(arenaId: string): void;
  updateArenaScore(arenaId: string, scoreA: number, scoreB: number): void;
  finishArenaMatch(arenaId: string): void;
  getScoreLimit(match: ArenaMatch): number;
  /** Diffusion d'arène : chrono restant envoyé aux écrans, comme le ferait un arbitre */
  broadcastArenaUpdate?(arenaId: string, update: ArenaUpdate): void;
  /** Durée d'un match (180 s par défaut) */
  readonly trainingCustomRules?: { matchDurationSeconds: number } | null;
  /** Place un duel sur une piste libre (entre deux phases, ou au tour suivant du tableau) */
  assignMatchToArena?(arenaId: string, match: ArenaMatch): void;
  /** Prévient les écrans (affichage démo, kiosque) d'un changement de phase */
  notifyKioskData?(): void;
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
export function createDemoFencer(id: string, rng: () => number): ArenaMatch['fencerA'] {
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
  private readonly tournament: DemoTournament;
  /** Arène → match chronométré et instant de début (ms) */
  private readonly started = new Map<string, { matchId: string; at: number }>();
  private now: () => number = Date.now;

  constructor(
    private readonly host: DemoPlayerHost,
    seed: number = Date.now(),
    private readonly profile: DemoWeaponProfile = { weapon: Weapon.EPEE, allowedZones: [] }
  ) {
    this.rng = createRng(seed);
    this.tournament = new DemoTournament(this.rng, createDemoFencer, () => this.now());
  }

  /** État complet du tournoi de démo (page /demo). */
  tournamentState(): DemoTournamentState {
    return this.tournament.state();
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /** Prochain duel du tournoi de démo, ou null si aucun n'est jouable maintenant. */
  createMatch(): ArenaMatch | null {
    const suffix = Math.floor(this.rng() * 1e9).toString(36);
    const id = `demo-${this.matchCount + 1}-${suffix}`;
    const pairing = this.tournament.next(id);
    if (!pairing) return null;
    this.matchCount++;
    return {
      id,
      poolId: '__training__',
      ...(pairing.isTableau ? { isTableau: true } : {}),
      fencerA: pairing.fencerA,
      fencerB: pairing.fencerB,
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
    if (this.tournament.tick()) this.host.notifyKioskData?.();
    for (const [arenaId, arena] of this.host.arenas) {
      const match = arena.currentMatch;
      // Piste libre : nouveau duel dès qu'il y en a un (tour suivant, nouveau tournoi)
      if (!match || arena.status === 'idle') {
        const next = this.host.assignMatchToArena ? this.createMatch() : null;
        if (next) this.host.assignMatchToArena!(arenaId, next);
        continue;
      }
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
        const phaseChanged = this.tournament.record(match.id, match.scoreA, match.scoreB);
        this.host.finishArenaMatch(arenaId);
        if (phaseChanged) this.host.notifyKioskData?.();
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
    if (!this.host.broadcastArenaUpdate || status !== 'in_progress' || s?.matchId !== matchId) {
      return;
    }
    const total = this.host.trainingCustomRules?.matchDurationSeconds ?? 180;
    const time = Math.max(0, total - Math.floor((this.now() - s.at) / 1000));
    const arena = this.host.arenas.get(arenaId);
    this.host.broadcastArenaUpdate(arenaId, {
      arenaId,
      match: arena?.currentMatch ?? null,
      time,
      timerStatus: 'running',
      status: 'in_progress',
    });
  }
}
