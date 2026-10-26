/**
 * BellePoule Modern - Cartons noirs : liste par arène et annulation (réintégration) (#1240)
 * Extrait de RemoteScoreServer : l'état reste dans le serveur, exposé par accesseurs (contexte).
 * Licensed under GPL-3.0
 */
import { MatchStatus, FencerStatus, Score } from '../../shared/types';
import type { BlackCardRecord } from './types';
import type { RemoteScoreServer } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module (accesseurs : valeurs toujours à jour). */
export interface BlackCardsContext {
  readonly arenaMatchQueue: S['arenaMatchQueue'];
  readonly arenas: S['arenas'];
  readonly db: S['db'];
  readonly formatFencerName: S['formatFencerName'];
  readonly getArenaBlackCards: S['getArenaBlackCards'];
  readonly matchPoolId: S['matchPoolId'];
  readonly poolFencersCache: S['poolFencersCache'];
  readonly sessionBlackCards: S['sessionBlackCards'];
  readonly sessionMatchScores: S['sessionMatchScores'];
  sessionMatches: S['sessionMatches'];
}

/**
 * Cartons noirs annulables visibles depuis une arène : ceux donnés sur cette arène
 * ou dans la poule qu'elle affiche. Les exclusions persistées (redémarrage de session)
 * sont reconstituées depuis les matchs de poule de la session.
 */
export function getArenaBlackCards(ctx: BlackCardsContext, arenaId: string): BlackCardRecord[] {
  // Reconstituer les cartons noirs absents de la mémoire (session relancée)
  for (const m of ctx.sessionMatches) {
    if (m.isTableau) continue;
    for (const f of [m.fencerA, m.fencerB]) {
      if (
        !f?.id ||
        f.status !== FencerStatus.EXCLUDED ||
        f.exclusionReason !== 'black_card' ||
        ctx.sessionBlackCards.has(f.id)
      )
        continue;
      const last = ctx.sessionMatches
        .filter(
          (x: any) =>
            !x.isTableau &&
            (x.fencerA?.id === f.id || x.fencerB?.id === f.id) &&
            (ctx.sessionMatchScores.get(x.id)?.status ?? x.status) === MatchStatus.FINISHED
        )
        .sort(
          (a: any, b: any) =>
            new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
        )[0];
      if (!last) continue;
      const opponent = last.fencerA?.id === f.id ? last.fencerB : last.fencerA;
      ctx.sessionBlackCards.set(f.id, {
        fencerId: f.id,
        matchId: last.id,
        arenaId: null,
        poolId: ctx.matchPoolId(last),
        previousStatus: FencerStatus.CHECKED_IN,
        fencerName: ctx.formatFencerName(f),
        opponentName: ctx.formatFencerName(opponent),
        timestamp: new Date(last.updatedAt ?? Date.now()).getTime(),
      });
    }
  }

  // Écarter les exclusions déjà levées ailleurs (ex. depuis le poste DT)
  for (const [fencerId] of ctx.sessionBlackCards) {
    const f = ctx.db.getFencer(fencerId);
    if (f && f.status !== FencerStatus.EXCLUDED) ctx.sessionBlackCards.delete(fencerId);
  }

  const arenaPoolId = ctx.arenas.get(arenaId)?.currentMatch?.poolId ?? null;
  return Array.from(ctx.sessionBlackCards.values())
    .filter(r => r.arenaId === arenaId || (arenaPoolId !== null && r.poolId === arenaPoolId))
    .sort((a, b) => b.timestamp - a.timestamp);
}

/** Annule un carton noir : réintègre le combattant et rouvre le match interrompu */
export function cancelBlackCard(
  ctx: BlackCardsContext,
  arenaId: string,
  fencerId: string
): { success: true; matchId: string } | { success: false; status: number; error: string } {
  const record = ctx.getArenaBlackCards(arenaId).find(r => r.fencerId === fencerId);
  if (!record) return { success: false, status: 404, error: 'black_card_not_found' };
  const { matchId } = record;
  const dbMatch = ctx.db.getMatch(matchId);
  const sessionMatch = ctx.sessionMatches.find((m: any) => m.id === matchId);
  if ((dbMatch && !dbMatch.poolId) || sessionMatch?.isTableau) {
    return {
      success: false,
      status: 409,
      error: 'cancel_tableau_forbidden',
    };
  }

  const status = record.previousStatus;
  try {
    ctx.db.updateFencer(fencerId, { status, exclusionReason: null });
  } catch (e) {
    console.error('[RemoteScoreServer] Erreur réintégration combattant:', e);
    return { success: false, status: 500, error: 'reinstate_failed' };
  }

  // Rouvrir le match interrompu par le carton noir avec le score atteint
  const current = ctx.sessionMatchScores.get(matchId);
  const valueOf = (s: any): number =>
    typeof s === 'object' && s !== null ? Number(s.value ?? 0) : Number(s ?? 0);
  const scoreA = valueOf(current?.scoreA ?? dbMatch?.scoreA ?? sessionMatch?.scoreA);
  const scoreB = valueOf(current?.scoreB ?? dbMatch?.scoreB ?? sessionMatch?.scoreB);
  const reopened = (value: number): Score => ({
    value,
    isVictory: false,
    isAbstention: false,
    isExclusion: false,
    isForfait: false,
  });
  if (dbMatch) {
    ctx.db.updateMatch(matchId, {
      scoreA: reopened(scoreA),
      scoreB: reopened(scoreB),
      status: MatchStatus.IN_PROGRESS,
    });
  }
  ctx.sessionMatchScores.set(matchId, {
    scoreA: reopened(scoreA),
    scoreB: reopened(scoreB),
    status: MatchStatus.IN_PROGRESS,
  });

  // Propager le statut dans les copies en mémoire : ses matchs suivants redeviennent jouables
  const patch = (f: any) => (f?.id === fencerId ? { ...f, status, exclusionReason: null } : f);
  ctx.sessionMatches = ctx.sessionMatches.map((m: any) =>
    m.fencerA?.id === fencerId || m.fencerB?.id === fencerId
      ? { ...m, fencerA: patch(m.fencerA), fencerB: patch(m.fencerB) }
      : m
  );
  for (const [qArenaId, queue] of ctx.arenaMatchQueue) {
    ctx.arenaMatchQueue.set(
      qArenaId,
      queue.map(m => ({ ...m, fencerA: patch(m.fencerA), fencerB: patch(m.fencerB) }))
    );
  }
  for (const [poolId, fencers] of ctx.poolFencersCache) {
    ctx.poolFencersCache.set(poolId, fencers.map(patch));
  }
  for (const arena of ctx.arenas.values()) {
    if (!arena.currentMatch) continue;
    arena.currentMatch = {
      ...arena.currentMatch,
      fencerA: patch(arena.currentMatch.fencerA),
      fencerB: patch(arena.currentMatch.fencerB),
    };
  }

  ctx.sessionBlackCards.delete(fencerId);
  console.log(
    `[RemoteScoreServer] Carton noir annulé : combattant ${fencerId} réintégré, match ${matchId} rouvert`
  );

  const mainWin = (global as any).mainWindow;
  if (mainWin) {
    mainWin.webContents.send('remote:fencer_reinstated', {
      fencerId,
      matchId,
      status,
      scoreA,
      scoreB,
    });
  }
  return { success: true, matchId };
}
