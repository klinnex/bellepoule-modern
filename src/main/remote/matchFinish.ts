/**
 * BellePoule Modern - Fin d’un match d’arène (enregistrement, historique, match suivant) (#1240)
 * Extrait de RemoteScoreServer : l'état reste dans le serveur, exposé par accesseurs (contexte).
 * Licensed under GPL-3.0
 */
import { MatchStatus } from '../../shared/types';
import type { RemoteScoreServer } from '../remoteScoreServer';
import type { ArenaEventList } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module (accesseurs : valeurs toujours à jour). */
export interface MatchFinishContext {
  readonly arenaCards: S['arenaCards'];
  readonly arenaEventTimes: S['arenaEventTimes'];
  readonly arenaExits: S['arenaExits'];
  readonly arenaMatchQueue: S['arenaMatchQueue'];
  readonly arenaRefereeSelected: S['arenaRefereeSelected'];
  readonly arenaTouches: S['arenaTouches'];
  readonly arenas: S['arenas'];
  readonly broadcastArenaUpdate: S['broadcastArenaUpdate'];
  readonly broadcastDashboardUpdate: S['broadcastDashboardUpdate'];
  readonly createTrainingMatch: S['createTrainingMatch'];
  readonly db: S['db'];
  readonly fireWebhook: S['fireWebhook'];
  readonly isTrainingMode: S['isTrainingMode'];
  readonly loadNextMatch: S['loadNextMatch'];
  readonly peekNextMatch: S['peekNextMatch'];
  readonly persistArenaState: S['persistArenaState'];
  readonly recentMatchDurationsMs: S['recentMatchDurationsMs'];
  readonly resolveDbMatchId: S['resolveDbMatchId'];
  readonly sendDiag: S['sendDiag'];
  readonly session: S['session'];
  readonly sessionMatchScores: S['sessionMatchScores'];
  readonly sessionModernRules: S['sessionModernRules'];
  readonly sessionWeapon: S['sessionWeapon'];
  readonly trainingHistory: S['trainingHistory'];
}

export function finishArenaMatch(ctx: MatchFinishContext, arenaId: string): void {
  const arena = ctx.arenas.get(arenaId);
  ctx.sendDiag(
    `[finishArenaMatch] arena=${arenaId} hasCurrent=${!!arena?.currentMatch} status=${arena?.status} matchId=${arena?.currentMatch?.id} isTableau=${(arena?.currentMatch as any)?.isTableau}`
  );
  if (!arena || !arena.currentMatch) return;
  // Éviter le double-déclenchement (REST + Socket.IO)
  if (arena.status === 'finished') return;

  // Réinitialiser le flag de sélection arbitre (match terminé)
  ctx.arenaRefereeSelected.set(arenaId, false);

  const finishedMatch = { ...arena.currentMatch };

  arena.status = 'finished';
  arena.currentMatch.status = 'finished';
  arena.currentMatch.endTime = new Date();

  if (arena.startTime) {
    const wallMs = new Date().getTime() - arena.startTime.getTime();
    arena.currentMatch.duration = Math.floor(wallMs / 1000);
    // Durées réelles pour l'estimation de fin de phase (#1077)
    ctx.recentMatchDurationsMs.push(wallMs);
    if (ctx.recentMatchDurationsMs.length > 50) ctx.recentMatchDurationsMs.shift();
  }

  // Persistance secondaire (timing / cartons / touches / sorties) : ces écritures
  // utilisent arena.currentMatch.id qui, pour un match de tableau, n'est PAS l'id DB
  // (stocké en composite). Une éventuelle exception (ex: contrainte FK) NE DOIT PAS
  // empêcher l'émission de match:finished vers le renderer (sinon : vainqueur jamais
  // remonté, pas de passage au tour suivant). On isole donc tout ce bloc.
  if (!ctx.isTrainingMode)
    try {
      // Id DB du match : composite pour un match de tableau (sinon FK rejetée → journal vide, #1031)
      const matchId = ctx.resolveDbMatchId(arena.currentMatch);
      // Persister le timing en DB
      if (matchId && arena.startTime) {
        const durationSec = arena.currentMatch.duration ?? 0;
        ctx.db.updateMatchTiming(
          matchId,
          arena.startTime.toISOString(),
          arena.currentMatch.endTime!.toISOString(),
          durationSec
        );
      }

      // Persister les cartons accumulés en mémoire
      const cards = ctx.arenaCards.get(arenaId) ?? { cardsA: [], cardsB: [] };
      const now = new Date().toISOString();
      const times = ctx.arenaEventTimes.get(arenaId);
      // Horodatage réel de l'événement (replay #1074), sinon fin de match
      const timeOf = (list: ArenaEventList, i: number) => times?.[list][i] ?? now;
      if (matchId) {
        const persistCards = (
          list: string[],
          fencerId: string | undefined,
          key: ArenaEventList
        ) => {
          if (!fencerId) return;
          for (const [i, cardType] of list.entries()) {
            ctx.db.saveCard({
              id: `${matchId}-${fencerId}-${cardType}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              matchId,
              fencerId,
              cardType,
              reason: 'unknown',
              cardGroup: 1,
              timestamp: timeOf(key, i),
              pointsAwarded: 0,
              resultingExclusion: false,
            });
          }
        };
        persistCards(cards.cardsA, arena.currentMatch.fencerA?.id, 'cardsA');
        persistCards(cards.cardsB, arena.currentMatch.fencerB?.id, 'cardsB');

        // Persister les touches par zone
        const touches = ctx.arenaTouches.get(arenaId) ?? { touchesA: [], touchesB: [] };
        const persistTouches = (
          zoneList: string[],
          fencerId: string | undefined,
          key: ArenaEventList
        ) => {
          if (!fencerId) return;
          const ZONE_POINTS: Record<string, number> = { A: 1, B: 3, C: 5 };
          for (const [i, zone] of zoneList.entries()) {
            ctx.db.saveTouch({
              id: `${matchId}-${fencerId}-${zone}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              matchId,
              fencerId,
              zone,
              points: ZONE_POINTS[zone] ?? 1,
              timestamp: timeOf(key, i),
              isValidInSuddenDeath: false,
              isReversed: false,
            });
          }
        };
        persistTouches(touches.touchesA, arena.currentMatch.fencerA?.id, 'touchesA');
        persistTouches(touches.touchesB, arena.currentMatch.fencerB?.id, 'touchesB');

        // Persister les sorties d'arène
        const exits = ctx.arenaExits.get(arenaId) ?? [];
        for (const [i, exit] of exits.entries()) {
          const fencerId =
            exit.fencer === 'A' ? arena.currentMatch.fencerA?.id : arena.currentMatch.fencerB?.id;
          if (!fencerId) continue;
          ctx.db.saveArenaExit({
            id: `${matchId}-${fencerId}-exit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            matchId,
            fencerId,
            exitType: exit.isVoluntary ? 'arena_exit_voluntary' : 'arena_exit',
            timestamp: timeOf('exits', i),
            // Escrime olympique : une touche ; Sabre Laser : 3 points (#1027)
            pointsAwarded: ctx.sessionModernRules ? 1 : 3,
          });
        }
      }
    } catch (e) {
      ctx.sendDiag(
        `[finishArenaMatch] persistance secondaire échouée (non bloquant): ${(e as Error)?.message}`
      );
      console.warn(
        '[RemoteScoreServer] Persistance secondaire (timing/cartons/touches) échouée:',
        e
      );
    }

  // Enregistrement mode entraînement (pas de DB)
  if (ctx.isTrainingMode) {
    ctx.trainingHistory.push({
      id: finishedMatch.id,
      arenaId,
      arenaNumber: arena.number,
      weapon: ctx.sessionWeapon ?? '',
      scoreA: finishedMatch.scoreA,
      scoreB: finishedMatch.scoreB,
      durationSec: finishedMatch.duration ?? 0,
      finishedAt: new Date().toISOString(),
    });
    // Pré-charger le prochain match entraînement dans la file
    const queue = ctx.arenaMatchQueue.get(arenaId) ?? [];
    ctx.arenaMatchQueue.set(arenaId, [...queue, ctx.createTrainingMatch()]);
  }

  const nextMatch = ctx.peekNextMatch(arenaId);

  // Mettre à jour l'état en mémoire sans broadcaster (on fait le broadcast manuellement
  // pour pouvoir inclure nextMatch, absent de Arena)
  const arenaRef = ctx.arenas.get(arenaId)!;
  Object.assign(arenaRef, { status: 'finished', currentMatch: arena.currentMatch });

  ctx.broadcastArenaUpdate(arenaId, {
    arenaId,
    match: arena.currentMatch,
    scoreA: arena.currentMatch?.scoreA,
    scoreB: arena.currentMatch?.scoreB,
    status: 'finished',
    fencerA: arena.currentMatch?.fencerA,
    fencerB: arena.currentMatch?.fencerB,
    nextMatch,
  });

  // Webhook résultats
  let competitionName = '';
  try {
    competitionName = ctx.session?.competitionId
      ? (ctx.db.getCompetition(ctx.session.competitionId)?.title ?? '')
      : '';
  } catch {
    // nom indisponible : message sans nom de compétition
  }
  ctx.fireWebhook({
    event: 'match_finished',
    arenaId,
    matchId: finishedMatch.id,
    fencerA: finishedMatch.fencerA
      ? {
          id: finishedMatch.fencerA.id,
          name: `${finishedMatch.fencerA.lastName} ${finishedMatch.fencerA.firstName}`,
          club: finishedMatch.fencerA.club,
        }
      : null,
    fencerB: finishedMatch.fencerB
      ? {
          id: finishedMatch.fencerB.id,
          name: `${finishedMatch.fencerB.lastName} ${finishedMatch.fencerB.firstName}`,
          club: finishedMatch.fencerB.club,
        }
      : null,
    scoreA: finishedMatch.scoreA,
    scoreB: finishedMatch.scoreB,
    winner:
      finishedMatch.scoreA > finishedMatch.scoreB
        ? 'A'
        : finishedMatch.scoreB > finishedMatch.scoreA
          ? 'B'
          : null,
    duration: finishedMatch.duration ?? null,
    timestamp: new Date().toISOString(),
    // Compatibilité Slack/Discord : champ text en clair
    competitionName,
    arenaNumber: arenaRef.number,
    text: `${competitionName ? `${competitionName} — ` : ''}Match terminé — Piste ${arenaRef.number} — ${finishedMatch.fencerA ? `${finishedMatch.fencerA.lastName} ${finishedMatch.fencerA.firstName}` : '?'} ${finishedMatch.scoreA} – ${finishedMatch.scoreB} ${finishedMatch.fencerB ? `${finishedMatch.fencerB.lastName} ${finishedMatch.fencerB.firstName}` : '?'}`,
  });

  // Persister le score final dans la DB et dans l'audit log (pas en mode entraînement)
  if (!ctx.isTrainingMode)
    try {
      const finalMatchId = finishedMatch.id;
      const dbMatch = ctx.db.getMatch(finalMatchId);
      // Pour les matchs TED, l'ID en base est "${competitionId}-${matchId}"
      const compositeId = ctx.session?.competitionId
        ? `${ctx.session.competitionId}-${finalMatchId}`
        : null;
      const dbTableauMatch =
        !dbMatch && !finishedMatch.poolId && compositeId ? ctx.db.getMatch(compositeId) : null;
      const effectiveDbMatch = dbMatch ?? dbTableauMatch;
      const effectiveDbId = dbMatch ? finalMatchId : compositeId;

      if (effectiveDbMatch && effectiveDbId) {
        let winner: 'A' | 'B' | null =
          finishedMatch.scoreA > finishedMatch.scoreB
            ? 'A'
            : finishedMatch.scoreB > finishedMatch.scoreA
              ? 'B'
              : null;
        if (!winner) {
          const mem = ctx.sessionMatchScores.get(finishedMatch.id);
          if ((mem?.scoreA as any)?.isVictory) winner = 'A';
          else if ((mem?.scoreB as any)?.isVictory) winner = 'B';
        }
        const scoreAObj = {
          value: finishedMatch.scoreA,
          isVictory: winner === 'A',
          isAbstention: false,
          isExclusion: false,
          isForfait: false,
        };
        const scoreBObj = {
          value: finishedMatch.scoreB,
          isVictory: winner === 'B',
          isAbstention: false,
          isExclusion: false,
          isForfait: false,
        };
        ctx.db.updateMatch(effectiveDbId, {
          scoreA: scoreAObj,
          scoreB: scoreBObj,
          status: MatchStatus.FINISHED,
        });
        ctx.db.logScoreChange({
          matchId: effectiveDbId,
          arenaId,
          previousScoreA: effectiveDbMatch.scoreA ?? null,
          previousScoreB: effectiveDbMatch.scoreB ?? null,
          newScoreA: scoreAObj,
          newScoreB: scoreBObj,
          changedBy: 'referee',
          reason: 'arena_finish',
          poolId: finishedMatch.poolId,
        });
      }
    } catch (e) {
      console.warn('[RemoteScoreServer] logScoreChange (finishArenaMatch) failed:', e);
    }

  // Émettre l'event pour le renderer (pour sauvegarder le score dans les pools)
  const mainWindow = (global as any).mainWindow;
  if (mainWindow && !ctx.isTrainingMode) {
    // Dériver le vainqueur depuis la DB pour gérer le cas tirage au sort (scores égaux)
    let winnerForRenderer: 'A' | 'B' | null =
      finishedMatch.scoreA > finishedMatch.scoreB
        ? 'A'
        : finishedMatch.scoreB > finishedMatch.scoreA
          ? 'B'
          : null;
    if (!winnerForRenderer) {
      try {
        const dbM = ctx.db.getMatch(finishedMatch.id) as any;
        if (dbM?.scoreA?.isVictory) winnerForRenderer = 'A';
        else if (dbM?.scoreB?.isVictory) winnerForRenderer = 'B';
      } catch (err) {
        console.warn(
          `[RemoteScoreServer] Lecture DB échouée pour le vainqueur du match ${finishedMatch.id}:`,
          err
        );
      }
    }
    // Fallback pour les matchs en mémoire (non persistés en DB) : tirage au sort
    if (!winnerForRenderer) {
      const memScore = ctx.sessionMatchScores.get(finishedMatch.id);
      if ((memScore?.scoreA as any)?.isVictory) winnerForRenderer = 'A';
      else if ((memScore?.scoreB as any)?.isVictory) winnerForRenderer = 'B';
    }
    mainWindow.webContents.send('match:finished', {
      matchId: finishedMatch.id,
      scoreA: finishedMatch.scoreA,
      scoreB: finishedMatch.scoreB,
      winner: winnerForRenderer,
      poolId: finishedMatch.poolId,
      isTableau: finishedMatch.isTableau ?? false,
    });
    console.log(
      `[RemoteScoreServer] Émission match:finished pour ${finishedMatch.id}: ${finishedMatch.scoreA}-${finishedMatch.scoreB}`
    );
  }
  if (mainWindow && ctx.isTrainingMode) {
    mainWindow.webContents.send('training:match_finished', {
      record: ctx.trainingHistory[ctx.trainingHistory.length - 1] ?? null,
    });
  }

  ctx.persistArenaState(arenaId);
  ctx.broadcastDashboardUpdate();

  // Charger automatiquement le prochain match après un délai
  // (loadNextMatch gère aussi le cas "plus de matchs" → arène idle)
  setTimeout(() => {
    const a = ctx.arenas.get(arenaId);
    if (a && a.status === 'finished') {
      ctx.loadNextMatch(arenaId);
    }
  }, 3000);
}
