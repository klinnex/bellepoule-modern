/**
 * BellePoule Modern - Persistance des événements simulés du remplissage automatique
 * (durée, touches par zone, cartons) pour alimenter l'analytique.
 * Licensed under GPL-3.0
 */

import { logger, LogCategory } from '@shared/services/logger';
import type { SimulatedMatchEvents } from '../../shared/types/preload';

export interface SimulatedEventsEntry {
  /** Id DB du match */
  matchId: string;
  /** null = effacer les événements simulés (annulation) */
  events: SimulatedMatchEvents | null;
}

const RETRY_DELAY_MS = 400;
const MAX_ATTEMPTS = 6;

/**
 * Écrit les événements en base. Un match absent (ligne de tableau pas encore synchronisée
 * par useMatchDbSync) est réessayé quelques fois.
 */
export async function persistSimulatedEvents(entries: SimulatedEventsEntry[]): Promise<void> {
  const db = window.electronAPI?.db;
  if (!db?.replaceSimulatedMatchEvents || entries.length === 0) return;
  let pending = entries;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && pending.length > 0; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    const missing: SimulatedEventsEntry[] = [];
    for (const entry of pending) {
      try {
        const ok = await db.replaceSimulatedMatchEvents(entry.matchId, entry.events);
        if (!ok) missing.push(entry);
      } catch (e) {
        logger.warn(
          LogCategory.DATABASE,
          'replaceSimulatedMatchEvents failed',
          e instanceof Error ? e : undefined
        );
      }
    }
    pending = missing;
  }
}
