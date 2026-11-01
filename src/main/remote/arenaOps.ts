/**
 * BellePoule Modern - Opérations sur les arènes : affectation, démarrage, pause, score (#1240)
 * Extrait de RemoteScoreServer : l'état reste dans le serveur, exposé par accesseurs (contexte).
 * Licensed under GPL-3.0
 */
import { ArenaMatch } from '../../shared/types/remote';
import { Weapon } from '../../shared/types';
import type { RemoteScoreServer } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module. */
export interface ArenaOpsContext {
  readonly arenaOvertimeType: S['arenaOvertimeType'];
  readonly arenaRefereeSelected: S['arenaRefereeSelected'];
  readonly arenaSuddenDeath: S['arenaSuddenDeath'];
  readonly arenas: S['arenas'];
  readonly broadcastArenaUpdate: S['broadcastArenaUpdate'];
  readonly db: S['db'];
  readonly io: S['io'];
  readonly isGuestMatch: S['isGuestMatch'];
  readonly persistArenaState: S['persistArenaState'];
  readonly resolveDbMatchId: S['resolveDbMatchId'];
  readonly resolvePoolReferee: S['resolvePoolReferee'];
  readonly resolveReferee: S['resolveReferee'];
  readonly resolveTableauMatchReferees: S['resolveTableauMatchReferees'];
  readonly sessionMatches: S['sessionMatches'];
  readonly sessionPoolMaxScore: S['sessionPoolMaxScore'];
  readonly sessionTableMaxScore: S['sessionTableMaxScore'];
  readonly sessionWeapon: S['sessionWeapon'];
  readonly updateArena: S['updateArena'];
}

export function assignMatchToArena(
  ctx: ArenaOpsContext,
  arenaId: string,
  match: ArenaMatch,
  fromReferee = false
): void {
  console.log(
    `[RemoteScoreServer] assignMatchToArena called: arenaId=${arenaId}, matchId=${match.id}, fromReferee=${fromReferee}`
  );
  const arena = ctx.arenas.get(arenaId);
  if (!arena) {
    console.error(`[RemoteScoreServer] ERREUR: Arène ${arenaId} n'existe pas!`);
    return;
  }

  // Mettre à jour le flag de sélection arbitre avant le broadcast
  ctx.arenaRefereeSelected.set(arenaId, fromReferee);

  // Arbitre par défaut : celui du match, sinon celui/ceux de la poule (#908)
  if (!match.referee) {
    const defaultRef =
      ctx.resolveTableauMatchReferees(match.poolId ? null : match.id) ??
      ctx.resolveReferee((match as any).refereeId) ??
      ctx.resolvePoolReferee(match.poolId);
    if (defaultRef) match = { ...match, referee: defaultRef };
  }

  arena.currentMatch = match;
  arena.status = 'ready';
  if (match.poolId && !ctx.isGuestMatch(arenaId, match)) arena.activePoolId = match.poolId;

  ctx.updateArena(arenaId, {
    status: 'ready',
    currentMatch: match,
  });

  ctx.persistArenaState(arenaId);
  console.log(`[RemoteScoreServer] Match assigné avec succès à l'arène ${arenaId}`);
}

export function startArenaMatch(ctx: ArenaOpsContext, arenaId: string): void {
  const arena = ctx.arenas.get(arenaId);
  if (!arena || !arena.currentMatch) return;

  arena.status = 'in_progress';
  arena.startTime = new Date();
  arena.currentMatch.status = 'in_progress';
  arena.currentMatch.startTime = new Date();

  ctx.updateArena(arenaId, {
    status: 'in_progress',
    startTime: arena.startTime,
    currentMatch: arena.currentMatch,
  });
  ctx.persistArenaState(arenaId);
}

export function pauseArenaMatch(ctx: ArenaOpsContext, arenaId: string): void {
  const arena = ctx.arenas.get(arenaId);
  if (!arena) return;

  arena.status = 'ready';

  ctx.updateArena(arenaId, { status: 'ready' });
}

export function updateArenaScore(
  ctx: ArenaOpsContext,
  arenaId: string,
  scoreA: number,
  scoreB: number
): void {
  const arena = ctx.arenas.get(arenaId);
  if (!arena || !arena.currentMatch) return;

  // Ignorer si le match est terminé
  if (arena.status === 'finished' || arena.currentMatch.status === 'finished') {
    console.log(
      `[RemoteScoreServer] Match terminé, mise à jour du score ignorée pour arène ${arenaId}`
    );
    return;
  }

  const previousScoreA = arena.currentMatch.scoreA;
  const previousScoreB = arena.currentMatch.scoreB;

  arena.currentMatch.scoreA = scoreA;
  arena.currentMatch.scoreB = scoreB;

  // Audit trail si le match est en DB
  try {
    // Id DB : composite pour un match de tableau (sinon aucun score_change → replay figé, #1074)
    const matchId = ctx.resolveDbMatchId(arena.currentMatch);
    if (ctx.db.getMatch(matchId)) {
      ctx.db.logScoreChange({
        matchId,
        arenaId,
        previousScoreA: { value: previousScoreA },
        previousScoreB: { value: previousScoreB },
        newScoreA: { value: scoreA },
        newScoreB: { value: scoreB },
        changedBy: 'referee',
        reason: 'remote_entry',
      });
    }
  } catch (e) {
    console.warn('[RemoteScoreServer] logScoreChange (updateArenaScore) failed:', e);
  }

  // Envoyer la mise à jour via WebSocket
  ctx.broadcastArenaUpdate(arenaId, {
    arenaId,
    match: arena.currentMatch,
    scoreA,
    scoreB,
    suddenDeath: ctx.arenaSuddenDeath.get(arenaId) ?? false,
    overtimeType: ctx.arenaOvertimeType.get(arenaId) ?? null,
    status: arena.status,
  });

  // Vérifier si le match doit s'arrêter automatiquement en Laser Sabre
  checkAndAutoFinishMatch(ctx, arenaId, scoreA, scoreB, previousScoreA, previousScoreB);
}

/** Score max du match : paramètres de la compétition / formule (#1125 #1134), 15 en Laser Sabre */
export function getScoreLimit(ctx: ArenaOpsContext, match: ArenaMatch): number {
  if (ctx.sessionWeapon === Weapon.LASER) return 15;
  const sessionMatch = ctx.sessionMatches.find(m => m.id === match.id);
  const isTableau = match.isTableau || sessionMatch?.isTableau;
  const max = isTableau
    ? ctx.sessionTableMaxScore
    : (ctx.sessionPoolMaxScore ?? sessionMatch?.maxScore);
  if (typeof max !== 'number') return 15;
  return max <= 0 || max >= 999 ? Infinity : max;
}

function checkAndAutoFinishMatch(
  ctx: ArenaOpsContext,
  arenaId: string,
  scoreA: number,
  scoreB: number,
  previousScoreA: number,
  previousScoreB: number
): void {
  const arena = ctx.arenas.get(arenaId);
  if (!arena || arena.status === 'finished' || !arena.currentMatch) return;

  // Notifier la tablette arbitre uniquement quand un tireur franchit le seuil de 15 points
  const SCORE_LIMIT = getScoreLimit(ctx, arena.currentMatch);
  const justCrossed =
    (scoreA >= SCORE_LIMIT && previousScoreA < SCORE_LIMIT) ||
    (scoreB >= SCORE_LIMIT && previousScoreB < SCORE_LIMIT);
  if (justCrossed) {
    console.log(
      `[RemoteScoreServer] Score limite (${SCORE_LIMIT}) atteint - notification arbitre pour l'arène ${arenaId}`
    );
    ctx.io.to(`arena:${arenaId}`).emit(`arena:${arenaId}:score_limit_reached`);
  }
}
