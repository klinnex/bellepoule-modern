/**
 * BellePoule Modern - Fin de match distante par la commande recordScore (#1980, ADR-0005)
 * Tablettes et appareils de piste (Cyrano, OPP2) écrivent le score par le moteur : mêmes
 * contrôles que l'écran et le MCP, état de session, base et journal dans une transaction.
 * L'écran ouvert relit la session (session:changed). Formats que le moteur ne pilote pas
 * (équipes, tableaux séparés) ou match absent de la session : repli sur le chemin historique.
 * Licensed under GPL-3.0
 */
import type { DatabaseManager } from '../../database';
import type { EventSource } from '../../database/repos/eventLogRepo';
import { invokeCommandSync } from '../engine/api/engine';
import type { CommandContext } from '../engine/commands/context';
import { emitChangeVia } from '../mcp/mcpDomain';
import { emitCompetitionEvent } from '../ipc/dbHandlers';
import { logger, LogCategory } from '../../shared/services/logger';

export interface FinishedScore {
  competitionId: string | null | undefined;
  /** Identifiant brut de la session ou composite en base (`${competitionId}-16-0`) */
  matchId: string;
  scoreA: number;
  scoreB: number;
  winner: 'A' | 'B' | null;
  source: Extract<EventSource, 'tablet' | 'cyrano' | 'opp2'>;
  /** Identifiant de l'arbitre (journal d'épreuve : identifiants seulement, RGPD #1882) */
  author?: string;
  /** Détails du journal des scores : arbitre, adresse de la tablette, motif */
  audit?: CommandContext['scoreAudit'];
}

/** Identifiant du match dans l'état de session (les matchs de tableau y sont bruts) */
export function sessionMatchId(competitionId: string, matchId: string): string {
  const prefix = `${competitionId}-`;
  return matchId.startsWith(prefix) ? matchId.slice(prefix.length) : matchId;
}

/**
 * Enregistre le score par recordScore ; true si le moteur l'a écrit, false pour le
 * chemin historique (format non pris en charge, match hors session, score refusé).
 */
export function recordFinishedScore(db: DatabaseManager, score: FinishedScore): boolean {
  const { competitionId } = score;
  if (!competitionId || !db.eventLog) return false;
  try {
    invokeCommandSync(
      {
        db,
        actor: { source: score.source, ...(score.author ? { author: score.author } : {}) },
        emitChange: emitChangeVia((type, id) => emitCompetitionEvent(type, id)),
        ...(score.audit ? { scoreAudit: score.audit } : {}),
      },
      'recordScore',
      {
        competitionId,
        matchId: sessionMatchId(competitionId, score.matchId),
        scoreA: score.scoreA,
        scoreB: score.scoreB,
        ...(score.winner ? { winner: score.winner } : {}),
      }
    );
    return true;
  } catch (e) {
    const code = (e as { code?: string }).code ?? 'internal';
    logger.info(
      LogCategory.NETWORK,
      `[recordFinishedScore] ${score.matchId} : chemin historique (${code}) ${(e as Error).message}`
    );
    return false;
  }
}
