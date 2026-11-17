/**
 * BellePoule Modern - Fonction « match précédent » (PREV) d'une arène (#1829, manque n°4)
 * Fenêtre de correction bornée : on ne rouvre le dernier match terminé que peu de temps après
 * sa fin, tant que le match suivant n'a pas démarré (cf. Engarde : refus au-delà de 3 min).
 * Licensed under GPL-3.0
 */
import type { ArenaMatch } from '../../shared/types/remote';
import type { ArenaEventList } from '../remoteScoreServer';

/** Durée pendant laquelle le dernier match terminé reste rappelable */
export const PREV_WINDOW_MS = 3 * 60 * 1000;

/**
 * Événements de combat d'un match terminé (cartons, touches, sorties, horodatages), gardés en
 * mémoire : la piste les remet à zéro au « suivant », le rappel PREV doit pouvoir les restaurer.
 */
export interface ArenaEventsSnapshot {
  cards?: { cardsA: string[]; cardsB: string[] };
  touches?: { touchesA: string[]; touchesB: string[] };
  exits: Array<{ fencer: 'A' | 'B'; isVoluntary: boolean }>;
  times?: Record<ArenaEventList, string[]>;
}

/** Dernier match terminé d'une arène, conservé pour une éventuelle correction */
export interface LastFinishedSnapshot {
  match: ArenaMatch;
  finishedAt: number;
  events: ArenaEventsSnapshot;
}

export type PrevRefusal = 'none' | 'expired' | 'in_progress';

export type PrevEligibility = { ok: true } | { ok: false; reason: PrevRefusal };

/**
 * Peut-on rappeler le match précédent ?
 * - rien à rappeler : `none` ;
 * - fenêtre de correction dépassée : `expired` ;
 * - un match est en cours sur la piste (chrono lancé) : `in_progress`, on ne coupe pas un combat.
 */
export function checkPrevEligibility(
  snapshot: LastFinishedSnapshot | undefined,
  current: ArenaMatch | null | undefined,
  now: number
): PrevEligibility {
  if (!snapshot) return { ok: false, reason: 'none' };
  if (current?.status === 'in_progress') return { ok: false, reason: 'in_progress' };
  if (now - snapshot.finishedAt > PREV_WINDOW_MS) return { ok: false, reason: 'expired' };
  return { ok: true };
}

/**
 * Match rendu à l'arbitre pour correction : scores et tireurs conservés, fin et durée effacées,
 * pour qu'un nouveau « fin de match » le réenregistre proprement.
 */
export function restoreForCorrection(snapshot: LastFinishedSnapshot): ArenaMatch {
  const {
    endTime: _endTime,
    duration: _duration,
    deviceEnd,
    recalledOut: _previous,
    ...rest
  } = snapshot.match;
  // Abandon ou exclusion signalé par l'appareil : gardé pour le renvoyer avec le match rappelé
  const out =
    deviceEnd?.winner && (deviceEnd.reason === 'abandon' || deviceEnd.reason === 'exclusion')
      ? {
          fencer: deviceEnd.winner === 'A' ? ('B' as const) : ('A' as const),
          reason: deviceEnd.reason,
        }
      : undefined;
  return {
    ...rest,
    status: 'not_started',
    startTime: null,
    endTime: null,
    ...(out ? { recalledOut: out } : {}),
  };
}
