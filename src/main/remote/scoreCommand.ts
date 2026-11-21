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
  /** Statut du perdant (carton noir, exclusion ou abandon signalés) : retrait par le moteur */
  specialStatus?: 'abandon' | 'forfait' | 'exclusion';
  /** Exclusion sur carton noir (motif black_card) */
  blackCard?: boolean;
}

/** Identifiant du match dans l'état de session (les matchs de tableau y sont bruts) */
export function sessionMatchId(competitionId: string, matchId: string): string {
  const prefix = `${competitionId}-`;
  return matchId.startsWith(prefix) ? matchId.slice(prefix.length) : matchId;
}

/** Refus qui renvoient au chemin historique : format ou cas que le moteur ne pilote pas */
const FALLBACK_CODES = new Set([
  'unsupported_format',
  'match_not_found',
  'bracket_exists',
  'round_closed',
  'next_match_played',
  'match_not_ready',
  'competition_not_found',
  'internal',
]);

export type FinishOutcome =
  | { kind: 'accepted' }
  | { kind: 'fallback'; code: string }
  | { kind: 'refused'; code: string; message: string };

function runFinished(db: DatabaseManager, score: FinishedScore, dryRun: boolean): FinishOutcome {
  const { competitionId } = score;
  if (!competitionId || !db.eventLog) return { kind: 'fallback', code: 'no_competition' };
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
        ...(score.specialStatus ? { specialStatus: score.specialStatus } : {}),
        ...(score.blackCard ? { blackCard: true } : {}),
        ...(dryRun ? { dryRun: true } : {}),
      }
    );
    return { kind: 'accepted' };
  } catch (e) {
    const code = (e as { code?: string }).code ?? 'internal';
    const message = (e as Error).message;
    return FALLBACK_CODES.has(code)
      ? { kind: 'fallback', code }
      : { kind: 'refused', code, message };
  }
}

/**
 * Enregistre le score par recordScore ; true si le moteur l'a écrit, false pour le
 * chemin historique (format non pris en charge, match hors session, score refusé).
 */
export function recordFinishedScore(db: DatabaseManager, score: FinishedScore): boolean {
  const outcome = runFinished(db, score, false);
  if (outcome.kind !== 'accepted') {
    logger.info(
      LogCategory.NETWORK,
      `[recordFinishedScore] ${score.matchId} : chemin historique (${outcome.code})`
    );
  }
  return outcome.kind === 'accepted';
}

/**
 * Contrôle du score sans rien écrire (recordScore en simulation) : l'appareil de piste
 * reçoit NAK si la commande refuse le score, avant tout ACK (ADR-0005).
 */
export function checkFinishedScore(db: DatabaseManager, score: FinishedScore): FinishOutcome {
  return runFinished(db, score, true);
}

/**
 * Réintégration par reinstateFencer (annulation d'un carton noir depuis la tablette,
 * docs/adr/0016) : true si le moteur l'a écrite, false pour le chemin historique.
 */
export function reinstateByCommand(
  db: DatabaseManager,
  competitionId: string | null | undefined,
  fencerId: string,
  source: FinishedScore['source'] = 'tablet'
): boolean {
  if (!competitionId || !db.eventLog) return false;
  try {
    invokeCommandSync(
      {
        db,
        actor: { source },
        emitChange: emitChangeVia((type, id) => emitCompetitionEvent(type, id)),
      },
      'reinstateFencer',
      { competitionId, fencerId }
    );
    return true;
  } catch (e) {
    logger.info(
      LogCategory.NETWORK,
      `[reinstateByCommand] ${fencerId} : chemin historique (${(e as { code?: string }).code ?? 'internal'})`
    );
    return false;
  }
}
