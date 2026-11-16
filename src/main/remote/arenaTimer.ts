/**
 * BellePoule Modern - Chrono des arènes : dernière valeur connue, persistance et reprise (#1829)
 * Le chrono est tenu par la tablette (ou l'appareil de piste) ; le serveur mémorise la dernière
 * valeur reçue pour le match en cours, la sauvegarde avec l'état de l'arène et la rend au
 * redémarrage, toujours à l'arrêt (jamais relancé automatiquement).
 * Licensed under GPL-3.0
 */
import type { Arena, ArenaMatch, ArenaTimerSnapshot } from '../../shared/types/remote';

/** Garde-fou : un chrono de plus d'une heure n'est pas plausible */
const MAX_TIMER_SECONDS = 3600;
/** Chrono en marche : une sauvegarde au plus toutes les 5 s (les arrêts sont sauvegardés aussitôt) */
export const RUNNING_PERSIST_INTERVAL_MS = 5000;
const OVERTIME_TYPES = ['supplementary', 'challenger', 'challenger_supplementary'];

/** Clé du chrono dans le `current_match` sauvegardé (table arena_state, sans migration) */
const SAVED_TIMER_KEY = 'savedTimer';

/** Valeur de chrono valide (secondes restantes) */
export function isValidTimerTime(time: unknown): time is number {
  return (
    typeof time === 'number' && Number.isFinite(time) && time >= 0 && time <= MAX_TIMER_SECONDS
  );
}

/** Instantané normalisé, ou null si les données sont inutilisables */
export function normalizeTimerSnapshot(raw: unknown): ArenaTimerSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.matchId !== 'string' || !o.matchId || !isValidTimerTime(o.time)) return null;
  return {
    matchId: o.matchId,
    time: Math.round(o.time * 100) / 100,
    suddenDeath: o.suddenDeath === true,
    overtimeType:
      typeof o.overtimeType === 'string' && OVERTIME_TYPES.includes(o.overtimeType)
        ? o.overtimeType
        : null,
    running: o.running === true,
  };
}

/** Arène porteuse du chrono (`Arena.timer`) */
type TimedArena = Pick<Arena, 'currentMatch' | 'timer'>;

/** Dernière sauvegarde déclenchée par le chrono, par objet arène (limitation en marche) */
const persistedAt = new WeakMap<object, number>();

/** Chrono connu pour le match en cours de l'arène (autre match → null) */
export function timerForMatch(arena: TimedArena | null | undefined): ArenaTimerSnapshot | null {
  const t = arena?.timer;
  const id = arena?.currentMatch?.id;
  return t && id && t.matchId === id ? t : null;
}

/**
 * Mémorise le chrono reçu (update_timer / pause_timer / reset_timer). Ignoré sans match, avec
 * une valeur invalide ou pendant la minute de repos (le décompte est celui du repos, pas du combat).
 * @returns true si l'état de l'arène doit être sauvegardé maintenant
 */
export function recordArenaTimer(
  arena: TimedArena,
  data: {
    time?: number;
    timerStatus?: string;
    suddenDeath?: boolean;
    overtimeType?: string | null;
    resting?: boolean;
  },
  now: number
): boolean {
  const match = arena.currentMatch;
  if (!match?.id || !isValidTimerTime(data.time) || data.resting) return false;
  const snap = normalizeTimerSnapshot({
    matchId: match.id,
    time: data.time,
    suddenDeath: data.suddenDeath,
    overtimeType: data.overtimeType,
    running: data.timerStatus === 'running',
  });
  if (!snap) return false;
  const prev = arena.timer;
  arena.timer = snap;
  // Chrono inchangé (INFO répétés de l'appareil à l'arrêt) : rien de neuf à sauvegarder
  if (
    prev &&
    prev.matchId === snap.matchId &&
    prev.time === snap.time &&
    prev.running === snap.running &&
    prev.suddenDeath === snap.suddenDeath &&
    prev.overtimeType === snap.overtimeType
  )
    return false;
  if (data.timerStatus === 'running') {
    const last = persistedAt.get(arena) ?? 0;
    if (now - last < RUNNING_PERSIST_INTERVAL_MS) return false;
  }
  persistedAt.set(arena, now);
  return true;
}

/** Match à sauvegarder : le chrono du match y est joint (clé `savedTimer`) */
export function withSavedTimer(
  match: ArenaMatch | null,
  timer: ArenaTimerSnapshot | null
): (ArenaMatch & { [SAVED_TIMER_KEY]?: ArenaTimerSnapshot }) | null {
  if (!match) return null;
  return timer ? { ...match, [SAVED_TIMER_KEY]: timer } : match;
}

/** Sépare le match sauvegardé de son chrono (chrono d'un autre match ou invalide → null) */
export function extractSavedTimer(saved: ArenaMatch & { [SAVED_TIMER_KEY]?: unknown }): {
  match: ArenaMatch;
  timer: ArenaTimerSnapshot | null;
} {
  const { [SAVED_TIMER_KEY]: raw, ...match } = saved;
  const timer = normalizeTimerSnapshot(raw);
  // Jamais relancé au redémarrage : le chrono repris est à l'arrêt
  return {
    match,
    timer: timer && timer.matchId === match.id ? { ...timer, running: false } : null,
  };
}

/** Champs de chrono joints à l'état complet envoyé à un client qui rejoint l'arène */
export function timerJoinFields(timer: ArenaTimerSnapshot | null): {
  time?: number;
  timerStatus?: 'running' | 'paused';
  suddenDeath?: boolean;
  overtimeType?: string | null;
} {
  if (!timer) return {};
  return {
    time: timer.time,
    timerStatus: timer.running ? 'running' : 'paused',
    suddenDeath: timer.suddenDeath === true,
    overtimeType: timer.overtimeType ?? null,
  };
}
