/**
 * Journalisation des événements des saisies distantes (#1817) : appels DT,
 * pertes de connexion des tablettes, resynchros hors-ligne. Ne lève jamais.
 */
import type { DatabaseManager } from '../../database';
import type { RemoteEvent } from '../../shared/types';
import { logger, LogCategory } from '../../shared/services/logger';

export interface RemoteEventSink {
  readonly db: Pick<DatabaseManager, 'logRemoteEvent'> | null | undefined;
  readonly session: { competitionId?: string } | null | undefined;
  readonly isTrainingMode?: boolean;
}

export function recordRemoteEvent(
  ctx: RemoteEventSink,
  evt: Omit<RemoteEvent, 'id' | 'createdAt' | 'competitionId'>
): void {
  const competitionId = ctx.session?.competitionId;
  if (!competitionId || ctx.isTrainingMode || !ctx.db) return;
  try {
    ctx.db.logRemoteEvent({ ...evt, competitionId });
  } catch (err) {
    logger.warn(LogCategory.DATABASE, '[remoteEvents] journalisation impossible', err);
  }
}
