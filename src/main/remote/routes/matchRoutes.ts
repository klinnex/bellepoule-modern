/**
 * BellePoule Modern - Routes du serveur distant (extraites de remoteScoreServer.ts, #1065).
 * Licensed under GPL-3.0
 */

import { FencerStatus, MatchStatus, type Match } from '../../../shared/types';
import type {
  Arena,
  ArenaMatch,
  RemoteScoreUpdate,
  WebSocketMessage,
} from '../../../shared/types/remote';
import type { BlackCardRecord } from '../types';
import type { PoolRouteContext } from './poolRoutes';
import { baseArenaId, matchesTakenBySiblings } from '../arenaSlots';

/** État et opérations utilisés par les routes de matchs des arènes. */
export interface MatchRouteContext extends PoolRouteContext {
  readonly arenaMatchQueue: Map<string, ArenaMatch[]>;
  readonly poolMatchArenaOverrides: Map<string, string>;
  readonly sessionBlackCardEnabled: boolean;
  readonly sessionBlackCards: Map<string, BlackCardRecord>;
  applySmartMatchOrder(matches: Match[]): Match[];
  arenaHomePoolId(arena: Arena): string | undefined;
  broadcastMessage(message: WebSocketMessage): void;
  cancelBlackCard(
    arenaId: string,
    fencerId: string
  ): { success: true; matchId: string } | { success: false; status: number; error: string };
  finishArenaMatch(arenaId: string): void;
  formatFencerName(fencer: unknown): string;
  getArenaBlackCards(arenaId: string): BlackCardRecord[];
  guestQueue(arenaId: string): ArenaMatch[];
  isInActiveWave(match: { id: string }): boolean;
  /** Match de l'arène ouvert par sa tablette arbitre (sélectionné dans la liste) */
  isArenaMatchOpened(arenaId: string): boolean;
  claimArenaSlot(arenaId: string, deviceKey: string, current?: string): string;
  isMatchPlayable(match: Match | ArenaMatch): boolean;
  isPendingMatch(match: ArenaMatch): boolean;
  resolvePoolReferee(poolId?: string | null): { id: string; name: string } | null;
  restorableStatus(status: FencerStatus | undefined): FencerStatus;
  sendDiag(message: string): void;
  updateMatchScore(matchId: string, update: RemoteScoreUpdate): Promise<void>;
}

/** Matchs des arènes : liste, cartons noirs, fin de match, scores, synchronisation hors-ligne. */
export function registerMatchRoutes(ctx: MatchRouteContext): void {
  // API pour récupérer les matchs d'une arène/poule
  ctx.app.get('/api/arenas/:arenaId/matches', (req, res) => {
    try {
      const { arenaId } = req.params;
      console.log(`[RemoteScoreServer] GET /api/arenas/${arenaId}/matches`);

      if (!ctx.session) {
        console.log('[RemoteScoreServer] Pas de session active');
        return res.status(404).json({ error: 'no_session' });
      }

      const competitionId = ctx.session.competitionId;
      console.log(`[RemoteScoreServer] CompetitionId: ${competitionId}`);

      const arena = ctx.arenas.get(arenaId);

      // Si l'arène a un pool associé, retourner les matchs NON TERMINÉS du pool.
      // On exclut les matchs finis pour que, en fin de poule, le fallthrough
      // atteigne la file d'attente DE (Tier 3) au lieu de bloquer dessus.
      const currentPoolId = arena ? ctx.arenaHomePoolId(arena) : undefined;
      if (arena && currentPoolId && ctx.sessionMatches.length > 0) {
        const taken = matchesTakenBySiblings(ctx.arenas, arenaId, id => ctx.isArenaMatchOpened(id));
        const rawPoolMatches = ctx.sessionMatches
          .filter((m: any) => {
            const matchPoolId = m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`;
            if (matchPoolId !== currentPoolId) return false;
            // Tournoi des rapières : uniquement la vague active (#1118)
            if (!ctx.isInActiveWave(m)) return false;
            // Match réassigné sur une autre piste : plus dans la liste de celle-ci (#1037)
            const override = ctx.poolMatchArenaOverrides.get(m.id);
            if (override && override !== baseArenaId(arenaId)) return false;
            // Match déjà chargé sur une autre sous-piste de la piste (rapières, #1118)
            if (taken.has(m.id)) return false;
            const scoreUpdate = ctx.sessionMatchScores.get(m.id);
            const effectiveStatus = scoreUpdate?.status ?? m.status;
            if (effectiveStatus === MatchStatus.FINISHED) return false;
            // Exclure les matchs où un tireur est inactif (exclu/forfait/abandon)
            return ctx.isMatchPlayable(m as Match);
          })
          .map((m: any) => {
            const scoreUpdate = ctx.sessionMatchScores.get(m.id);
            return scoreUpdate ? { ...m, ...scoreUpdate } : m;
          });
        // Arbitre affiché sur la tablette : celui du match, sinon celui/ceux de la poule (#908)
        const poolReferee = ctx.resolvePoolReferee(currentPoolId);
        const poolMatches = ctx.applySmartMatchOrder(rawPoolMatches as Match[]).map((m: any) => {
          const referee = ctx.resolveReferee(m.refereeId ?? m.referee?.id) ?? poolReferee;
          return referee ? { ...m, referee } : m;
        });
        // Matchs d'autres poules réassignés sur cette piste : en tête de liste (#1037)
        const cur = arena.currentMatch;
        const guests = [
          ...(cur && cur.poolId !== currentPoolId && ctx.isPendingMatch(cur) ? [cur] : []),
          ...ctx.guestQueue(arenaId),
        ].map((m: ArenaMatch) => {
          const scoreUpdate = ctx.sessionMatchScores.get(m.id);
          const referee = m.referee ?? ctx.resolvePoolReferee(m.poolId);
          return {
            ...m,
            ...(scoreUpdate ?? {}),
            ...(referee ? { referee } : {}),
          };
        });
        const matches = [...guests, ...poolMatches];
        console.log(
          `[RemoteScoreServer] ${matches.length} matchs de pool non terminés pour arène ${arenaId} (pool ${currentPoolId})`
        );
        if (matches.length > 0) {
          return res.json({ matches, poolId: currentPoolId, poolName: null });
        }
      }

      // Fallback: match courant seul.
      // On utilise sessionMatches comme source de vérité pour le statut : en "fast poule",
      // les scores sont saisis via l'UI principale sans passer par finishArenaMatch, donc
      // arena.currentMatch.status reste 'not_started' en mémoire alors que le match est
      // réellement terminé dans sessionMatches.
      if (arena?.currentMatch) {
        const scoreUpdate = ctx.sessionMatchScores.get(arena.currentMatch.id);
        const inSession = ctx.sessionMatches.find((m: any) => m.id === arena.currentMatch!.id);
        const effectiveStatus =
          scoreUpdate?.status ?? inSession?.status ?? arena.currentMatch.status;
        // Tournoi des rapières : un match de poule hors vague active n'est pas proposé (#1118)
        const inWave = arena.currentMatch.isTableau || ctx.isInActiveWave(arena.currentMatch);
        if (
          effectiveStatus !== MatchStatus.FINISHED &&
          inWave &&
          ctx.isMatchPlayable(arena.currentMatch)
        ) {
          console.log(
            `[RemoteScoreServer] Fallback match courant pour arène ${arenaId}: ${arena.currentMatch.id}`
          );
          const queueMatches = (ctx.arenaMatchQueue.get(arenaId) || [])
            .filter(m => m.fencerA && m.fencerB && ctx.isMatchPlayable(m))
            .map(m => ({
              id: m.id,
              poolId: m.poolId,
              fencerA: m.fencerA,
              fencerB: m.fencerB,
              scoreA: m.scoreA ?? 0,
              scoreB: m.scoreB ?? 0,
              status: m.status,
            }));
          return res.json({
            matches: [
              {
                id: arena.currentMatch.id,
                poolId: arena.currentMatch.poolId,
                fencerA: arena.currentMatch.fencerA,
                fencerB: arena.currentMatch.fencerB,
                scoreA: arena.currentMatch.scoreA,
                scoreB: arena.currentMatch.scoreB,
                status: effectiveStatus,
                ...(arena.currentMatch.referee ? { referee: arena.currentMatch.referee } : {}),
              },
              ...queueMatches,
            ],
            poolId: null,
            poolName: null,
          });
        }
      }

      // File d'attente DE (currentMatch nul ou terminé)
      const arenaQueue = ctx.arenaMatchQueue.get(arenaId) || [];
      if (arenaQueue.length > 0) {
        console.log(
          `[RemoteScoreServer] ${arenaQueue.length} matchs en file DE pour arène ${arenaId}`
        );
        const queueMatches = arenaQueue
          .filter(m => m.fencerA && m.fencerB && ctx.isMatchPlayable(m))
          .map(m => ({
            id: m.id,
            poolId: m.poolId,
            fencerA: m.fencerA,
            fencerB: m.fencerB,
            scoreA: m.scoreA ?? 0,
            scoreB: m.scoreB ?? 0,
            status: m.status,
            isTableau: m.isTableau ?? false,
          }));
        return res.json({ matches: queueMatches, poolId: null, poolName: null });
      }

      console.log(`[RemoteScoreServer] Aucun match disponible pour arène ${arenaId}`);
      res.json({ matches: [], poolId: null, poolName: null });
    } catch (error) {
      console.error('[RemoteScoreServer] Erreur récupération matchs:', error);
      res.status(500).json({ error: 'matches_fetch_failed' });
    }
  });

  // API : cartons noirs annulables pour une arène (écran de sélection des matchs)
  ctx.app.get('/api/arenas/:arenaId/black-cards', (req, res) => {
    if (!ctx.hasAnyValidToken(req.headers.cookie)) {
      return res.status(401).json({ error: 'auth_required' });
    }
    if (!ctx.session) return res.json({ blackCards: [] });
    res.json({ blackCards: ctx.getArenaBlackCards(req.params.arenaId) });
  });

  // API : annuler un carton noir → le combattant est réintégré, ses scores et
  // ceux de ses adversaires comptent de nouveau, le match interrompu est rouvert
  ctx.app.post('/api/arenas/:arenaId/black-cards/:fencerId/cancel', (req, res) => {
    if (!ctx.hasAnyValidToken(req.headers.cookie)) {
      return res.status(401).json({ error: 'auth_required' });
    }
    if (!ctx.session) return res.status(404).json({ error: 'no_session' });
    const result = ctx.cancelBlackCard(req.params.arenaId, req.params.fencerId);
    if (!result.success) return res.status(result.status).json({ error: result.error });
    res.json({ success: true, matchId: result.matchId });
  });

  // API pour terminer un match avec enregistrement final
  ctx.app.post('/api/matches/:matchId/finish', async (req, res) => {
    if (!ctx.hasAnyValidToken(req.headers.cookie)) {
      return res.status(401).json({ error: 'auth_required' });
    }
    const clientIp = ctx.getClientIp(req);
    if (!ctx.checkScoreRateLimit(clientIp)) {
      return res.status(429).json({ error: 'rate_limited' });
    }
    try {
      const { matchId } = req.params;
      const {
        scoreA: rawA,
        scoreB: rawB,
        cardsA,
        cardsB,
        winner: winnerOverride,
        blackCardFencer,
      } = req.body;

      const scoreA = Number(rawA);
      const scoreB = Number(rawB);
      if (
        !Number.isInteger(scoreA) ||
        !Number.isInteger(scoreB) ||
        scoreA < 0 ||
        scoreB < 0 ||
        scoreA > 50 ||
        scoreB > 50
      ) {
        return res.status(400).json({ error: 'invalid_scores' });
      }

      console.log(`[RemoteScoreServer] POST /api/matches/${matchId}/finish`);
      console.log(`[RemoteScoreServer] Score final: ${scoreA}-${scoreB}`);

      // Vérifier que le match existe (en DB ou en mémoire)
      const dbMatch = ctx.db.getMatch(matchId);
      const inMemoryMatch = !dbMatch && ctx.sessionMatches.find((m: any) => m.id === matchId);
      ctx.sendDiag(
        `[REST /finish] matchId=${matchId} dbMatch=${!!dbMatch} poolId=${(dbMatch as any)?.poolId ?? '-'} inMemory=${!!inMemoryMatch} sessionMatchesIds=[${ctx.sessionMatches.map((m: any) => m.id).join(',')}]`
      );
      if (!dbMatch && !inMemoryMatch) {
        ctx.sendDiag(`[REST /finish] 404 match introuvable: ${matchId}`);
        return res.status(404).json({ error: 'match_not_found' });
      }

      // Carton noir : le combattant fautif est exclu de la compétition
      // Ignoré si le carton noir n'est pas activé sur la compétition
      const blackCarded =
        ctx.sessionBlackCardEnabled && (blackCardFencer === 'A' || blackCardFencer === 'B')
          ? blackCardFencer
          : null;

      // Déterminer le vainqueur : carton noir → adversaire du fautif,
      // scores égaux + tirage au sort → utiliser winnerOverride
      const winner = blackCarded
        ? blackCarded === 'A'
          ? 'B'
          : 'A'
        : scoreA > scoreB
          ? 'A'
          : scoreB > scoreA
            ? 'B'
            : winnerOverride === 'A' || winnerOverride === 'B'
              ? winnerOverride
              : null;

      // Arène du match (capturée avant que finishArenaMatch ne charge le match suivant)
      const blackCardArenaId = blackCarded
        ? (Array.from(ctx.arenas.entries()).find(([, a]) => a.currentMatch?.id === matchId)?.[0] ??
          null)
        : null;

      // Créer les objets Score
      const scoreAObj = {
        value: scoreA,
        isVictory: winner === 'A',
        isAbstention: false,
        isExclusion: blackCarded === 'A',
        isForfait: false,
      };

      const scoreBObj = {
        value: scoreB,
        isVictory: winner === 'B',
        isAbstention: false,
        isExclusion: blackCarded === 'B',
        isForfait: false,
      };

      if (dbMatch) {
        // Match persisté en DB : mise à jour directe
        ctx.db.updateMatch(matchId, {
          scoreA: scoreAObj,
          scoreB: scoreBObj,
          status: MatchStatus.FINISHED,
        });
        // Synchroniser sessionMatchScores pour que peekNextMatch/loadNextMatch
        // puisse filtrer ce match comme terminé (sinon il réapparaît comme "prochain")
        ctx.sessionMatchScores.set(matchId, {
          scoreA: scoreAObj,
          scoreB: scoreBObj,
          status: MatchStatus.FINISHED,
        });
        // Mettre à jour le score en mémoire de l'arène pour que le broadcast
        // finishArenaMatch envoie le vrai score (pas 0-0) à l'affichage, puis
        // libérer l'arène exactement comme le fait la console arbitre.
        let arenaToFinish: string | null = null;
        for (const [arenaId, arena] of ctx.arenas) {
          if (arena.currentMatch && arena.currentMatch.id === matchId) {
            arena.currentMatch.scoreA = scoreA;
            arena.currentMatch.scoreB = scoreB;
            arenaToFinish = arenaId;
            break;
          }
        }
        if (arenaToFinish) {
          ctx.finishArenaMatch(arenaToFinish);
        } else {
          // Match non trouvé dans une arène active : notifier quand même le renderer
          // (cas où l'arbitre soumet depuis referee.html mais l'arène a déjà changé)
          const mainWin = (global as any).mainWindow;
          if (mainWin) {
            const isTableauMatch = !dbMatch.poolId;
            mainWin.webContents.send('match:finished', {
              matchId,
              scoreA,
              scoreB,
              winner: winner as 'A' | 'B' | null,
              poolId: dbMatch.poolId ?? null,
              isTableau: isTableauMatch,
            });
            console.log(
              `[RemoteScoreServer] Émission match:finished hors-arène pour ${matchId}: ${scoreA}-${scoreB}`
            );
          }
        }
      } else {
        // Match en mémoire uniquement (poule non persistée)
        // Synchroniser les scores dans l'arène et déclencher l'IPC vers le renderer
        ctx.sessionMatchScores.set(matchId, {
          scoreA: scoreAObj,
          scoreB: scoreBObj,
          status: MatchStatus.FINISHED,
        });
        // Mettre à jour les scores de l'arène puis terminer le match via l'IPC
        let arenaFoundForInMemory = false;
        for (const [arenaId, arena] of ctx.arenas) {
          if (arena.currentMatch && arena.currentMatch.id === matchId) {
            arena.currentMatch.scoreA = scoreA;
            arena.currentMatch.scoreB = scoreB;
            ctx.finishArenaMatch(arenaId);
            arenaFoundForInMemory = true;
            break;
          }
        }
        if (!arenaFoundForInMemory) {
          // Match en mémoire non trouvé dans une arène : notifier quand même le renderer
          const mainWin = (global as any).mainWindow;
          if (mainWin) {
            const sm = ctx.sessionMatches.find((m: any) => m.id === matchId);
            mainWin.webContents.send('match:finished', {
              matchId,
              scoreA,
              scoreB,
              winner: winner as 'A' | 'B' | null,
              poolId: sm?.poolId ?? null,
              isTableau: sm?.isTableau ?? false,
            });
            console.log(
              `[RemoteScoreServer] Émission match:finished hors-arène (mémoire) pour ${matchId}: ${scoreA}-${scoreB}`
            );
          }
        }
      }

      // Carton noir : exclure le combattant fautif de la compétition
      if (blackCarded) {
        const matchObj: any = dbMatch || inMemoryMatch;
        const culpritId =
          blackCarded === 'A'
            ? (matchObj?.fencerA?.id ?? matchObj?.fencerAId)
            : (matchObj?.fencerB?.id ?? matchObj?.fencerBId);
        if (culpritId) {
          try {
            const previousStatus = ctx.db.getFencer(culpritId)?.status;
            ctx.db.updateFencer(culpritId, {
              status: FencerStatus.EXCLUDED,
              exclusionReason: 'black_card',
            });
            // Mémoriser le carton noir pour permettre son annulation depuis la tablette
            const culpritObj = blackCarded === 'A' ? matchObj?.fencerA : matchObj?.fencerB;
            const opponentObj = blackCarded === 'A' ? matchObj?.fencerB : matchObj?.fencerA;
            ctx.sessionBlackCards.set(culpritId, {
              fencerId: culpritId,
              matchId,
              arenaId: blackCardArenaId,
              poolId: matchObj?.poolId ?? matchObj?.pool?.id ?? null,
              previousStatus: ctx.restorableStatus(previousStatus),
              fencerName: ctx.formatFencerName(culpritObj),
              opponentName: ctx.formatFencerName(opponentObj),
              timestamp: Date.now(),
            });
            console.log(`[RemoteScoreServer] Carton noir : combattant ${culpritId} exclu`);
            // Notifier le renderer pour mettre à jour le statut dans son store
            const mainWin = (global as any).mainWindow;
            if (mainWin) {
              mainWin.webContents.send('remote:fencer_excluded', {
                fencerId: culpritId,
                matchId,
                reason: 'black_card',
              });
              // Carton noir → appel DT automatique (rapport fédéral)
              const culprit = blackCarded === 'A' ? matchObj?.fencerA : matchObj?.fencerB;
              const arena = Array.from(ctx.arenas.values()).find(
                (a: any) => a.currentMatch?.id === matchId
              );
              mainWin.webContents.send('remote:dt_call', {
                arenaId: arena?.id ?? `match-${matchId}`,
                arenaNumber: arena?.number ?? null,
                matchNumber: matchObj?.number ?? null,
                competitionId: ctx.session?.competitionId ?? null,
                timestamp: Date.now(),
                reason: 'black_card',
                fencerName: culprit
                  ? `${culprit.lastName ?? ''} ${culprit.firstName ?? ''}`.trim()
                  : null,
              });
            }
          } catch (e) {
            console.error('[RemoteScoreServer] Erreur exclusion combattant:', e);
          }
        }
      }

      // Notifier tous les clients
      ctx.broadcastMessage({
        type: 'match_finished',
        data: {
          matchId,
          scoreA,
          scoreB,
          winner,
          cardsA: cardsA || [],
          cardsB: cardsB || [],
        },
        timestamp: new Date(),
        sender: 'server',
      });

      // Signature requise après le match si c'est un match de tableau et l'option est activée
      const matchObjForSig: any = dbMatch || inMemoryMatch;
      const isTableauMatch = !matchObjForSig?.poolId;
      let requireSignature = false;
      if (isTableauMatch && ctx.session) {
        try {
          const comp = ctx.db.getCompetition(ctx.session.competitionId);
          requireSignature = comp?.settings?.signTableauMatches === true;
        } catch {
          /* défaut: false */
        }
      }

      console.log(`[RemoteScoreServer] Match ${matchId} terminé et enregistré`);
      res.json({ success: true, winner, requireSignature });
    } catch (error) {
      console.error('[RemoteScoreServer] Erreur fin de match:', error);
      res.status(500).json({ error: 'finish_failed' });
    }
  });

  ctx.app.get('/api/strips', (req, res) => {
    if (!ctx.session) {
      return res.status(404).json({ error: 'no_session' });
    }
    res.json(ctx.session.strips);
  });

  ctx.app.post('/api/matches/:matchId/score', async (req, res) => {
    if (!ctx.hasAnyValidToken(req.headers.cookie)) {
      return res.status(401).json({ error: 'auth_required' });
    }
    try {
      const { matchId } = req.params;
      const scoreUpdate: RemoteScoreUpdate = req.body;
      // Validation des scores si présents dans le body
      if (scoreUpdate.scoreA !== undefined && scoreUpdate.scoreB !== undefined) {
        const sA = Number(scoreUpdate.scoreA);
        const sB = Number(scoreUpdate.scoreB);
        if (
          !Number.isInteger(sA) ||
          !Number.isInteger(sB) ||
          sA < 0 ||
          sB < 0 ||
          sA > 50 ||
          sB > 50
        ) {
          return res.status(400).json({ error: 'invalid_scores' });
        }
      }

      // Mettre à jour le match dans la base de données
      await ctx.updateMatchScore(matchId, scoreUpdate);

      // Diffuser la mise à jour à tous les clients connectés
      ctx.broadcastMessage({
        type: 'score_update',
        data: { matchId, scoreUpdate },
        timestamp: new Date(),
        sender: 'server',
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating score:', error);
      res.status(500).json({ error: 'score_update_failed' });
    }
  });

  // API : synchronisation des actions hors-ligne (tablettes arbitres)
  ctx.app.post('/api/sync', async (req, res) => {
    if (!ctx.hasAnyValidToken(req.headers.cookie)) {
      return res.status(401).json({ error: 'auth_required' });
    }
    if (!ctx.checkScoreRateLimit(ctx.getClientIp(req))) {
      return res.status(429).json({ error: 'rate_limited' });
    }
    const actions: Array<{ id: string; type: string; payload: unknown }> = req.body?.actions || [];
    const results: Array<{ id: string; success: boolean }> = [];
    for (const action of actions) {
      try {
        if (action.type === 'score_save') {
          const p = action.payload as {
            matchId: string;
            scoreA: number;
            scoreB: number;
            status: string;
          };
          if (p?.matchId) {
            await ctx.updateMatchScore(p.matchId, {
              matchId: p.matchId,
              scoreA: p.scoreA,
              scoreB: p.scoreB,
              status: p.status as RemoteScoreUpdate['status'],
              timestamp: new Date(),
              refereeId: 'offline-sync',
            });
          }
        }
        // Les autres types d'actions (score_update, card, arena_exit) sont déjà broadcast
        // via Socket.IO en temps réel ; on les accepte sans traitement supplémentaire.
        results.push({ id: action.id, success: true });
      } catch (err) {
        console.error('[RemoteScoreServer] Erreur sync action', action.id, err);
        results.push({ id: action.id, success: false });
      }
    }
    res.json({ results });
  });
}
