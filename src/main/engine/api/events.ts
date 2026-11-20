/**
 * BellePoule Modern - Bus d'événements de données côté main (#1981)
 * Alimenté par emitCompetitionEvent ; lu par les abonnements du contrat (onCompetitionEvents).
 * Licensed under GPL-3.0
 */
import { EventEmitter } from 'events';

export interface CompetitionEventPayload {
  type: string;
  competitionId?: string;
  /** journal:appended : nouvelle révision du journal de l'épreuve (#1980) */
  revision?: number;
}

const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publishCompetitionEvent(event: CompetitionEventPayload): void {
  bus.emit('event', event);
}

export function onCompetitionEvent(cb: (event: CompetitionEventPayload) => void): () => void {
  bus.on('event', cb);
  return () => {
    bus.off('event', cb);
  };
}
