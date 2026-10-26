/**
 * BellePoule Modern - File des arènes : match suivant, réaffectation, répartition des poules, matchs de tableau (#1240)
 * Extrait de RemoteScoreServer : l'état reste dans le serveur, exposé par accesseurs (contexte).
 * Licensed under GPL-3.0
 */
import { ArenaMatch } from '../../shared/types/remote';
import { Match, MatchStatus } from '../../shared/types';
import * as slots from './arenaSlots';
import type { RemoteScoreServer } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module (accesseurs : valeurs toujours à jour). */
export interface ArenaQueueContext {
  readonly applySmartMatchOrder: S['applySmartMatchOrder'];
  readonly arenaCount: S['arenaCount'];
  readonly arenaHomePoolId: S['arenaHomePoolId'];
  readonly arenaMatchQueue: S['arenaMatchQueue'];
  readonly arenaNextMatchIndex: S['arenaNextMatchIndex'];
  readonly arenaRefereeSelected: S['arenaRefereeSelected'];
  readonly arenas: S['arenas'];
  readonly assignMatchToArena: S['assignMatchToArena'];
  readonly broadcastArenaUpdate: S['broadcastArenaUpdate'];
  readonly db: S['db'];
  readonly guestQueue: S['guestQueue'];
  readonly io: S['io'];
  readonly isGuestMatch: S['isGuestMatch'];
  readonly isInActiveWave: S['isInActiveWave'];
  readonly isMatchPlayable: S['isMatchPlayable'];
  readonly isTrainingMode: S['isTrainingMode'];
  readonly loadNextMatch: S['loadNextMatch'];
  readonly persistArenaState: S['persistArenaState'];
  readonly poolFencersCache: S['poolFencersCache'];
  readonly poolMatchArenaOverrides: S['poolMatchArenaOverrides'];
  readonly resolveDeMatchReferee: S['resolveDeMatchReferee'];
  readonly resolveReferee: S['resolveReferee'];
  readonly session: S['session'];
  readonly sessionMatchScores: S['sessionMatchScores'];
  sessionMatches: S['sessionMatches'];
  readonly updateArena: S['updateArena'];
}

export function peekNextMatch(ctx: ArenaQueueContext, arenaId: string): ArenaMatch | null {
  const arena = ctx.arenas.get(arenaId);
  if (!arena || !ctx.session) return null;

  const currentMatchId = arena.currentMatch?.id;
  const currentPoolId = ctx.arenaHomePoolId(arena);

  // Match réassigné sur cette piste : joué en priorité (#1037)
  const guest = ctx.guestQueue(arenaId).find(m => m.id !== currentMatchId);
  if (guest) return guest;

  if (currentPoolId && ctx.sessionMatches.length > 0) {
    const rawPoolMatches = ctx.sessionMatches
      .filter((m: any) => {
        const matchPoolId = m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`;
        return matchPoolId === currentPoolId && ctx.isInActiveWave(m);
      })
      .map((m: any) => {
        const scoreUpdate = ctx.sessionMatchScores.get(m.id);
        return scoreUpdate ? { ...m, ...scoreUpdate } : m;
      });
    const poolMatches = ctx
      .applySmartMatchOrder(rawPoolMatches as Match[])
      .filter(m => m.status !== MatchStatus.FINISHED && ctx.isMatchPlayable(m));
    const taken = slots.matchesTakenBySiblings(
      ctx.arenas,
      arenaId,
      id => ctx.arenaRefereeSelected.get(id) === true
    );
    const nextMatch = poolMatches.find(m => {
      if (m.id === currentMatchId || taken.has(m.id)) return false;
      const override = ctx.poolMatchArenaOverrides.get(m.id);
      return !override || override === slots.baseArenaId(arenaId);
    });
    if (nextMatch) {
      const nextReferee = ctx.resolveReferee((nextMatch as any).refereeId ?? nextMatch.referee?.id);
      return {
        id: nextMatch.id,
        poolId: currentPoolId,
        fencerA: nextMatch.fencerA!,
        fencerB: nextMatch.fencerB!,
        scoreA: 0,
        scoreB: 0,
        status: 'not_started',
        startTime: null,
        endTime: null,
        ...(nextReferee ? { referee: nextReferee } : {}),
      };
    }
  }

  const deQueue = ctx.arenaMatchQueue.get(arenaId) || [];
  if (deQueue.length > 0) {
    const nextDeMatch = deQueue[0];
    return nextDeMatch;
  }

  return null;
}

export function loadNextMatch(ctx: ArenaQueueContext, arenaId: string): void {
  const arena = ctx.arenas.get(arenaId);
  if (!arena || !ctx.session) {
    console.log(
      `[RemoteScoreServer] Impossible de charger le match suivant: arène ou session invalide`
    );
    return;
  }

  const currentMatchId = arena.currentMatch?.id;
  const currentPoolId = ctx.arenaHomePoolId(arena);
  let completedPoolId: string | null = null;

  console.log(
    `[RemoteScoreServer] loadNextMatch: arena=${arenaId}, pool=${currentPoolId}, total=${ctx.sessionMatches.length}`
  );

  // Si pas de matches en mémoire, essayer la DB (sauf mode entraînement)
  if (ctx.sessionMatches.length === 0 && !ctx.isTrainingMode) {
    console.log('[RemoteScoreServer] Pas de matches en mémoire, recherche dans la DB...');
    const pendingMatches = ctx.db.getPendingMatches(ctx.session.competitionId);
    if (pendingMatches.length === 0) {
      console.log('[RemoteScoreServer] Pas de matches non plus en DB');
      arena.currentMatch = null;
      arena.status = 'idle';
      ctx.updateArena(arenaId, { currentMatch: null, status: 'idle' });
      return;
    }
    // Ajouter les matches de la DB à sessionMatches
    ctx.sessionMatches = pendingMatches;
  }

  // Match réassigné sur cette piste : joué en priorité (#1037)
  const guest = ctx.guestQueue(arenaId).find(m => m.id !== currentMatchId);
  if (guest) {
    ctx.arenaMatchQueue.set(
      arenaId,
      (ctx.arenaMatchQueue.get(arenaId) || []).filter(m => m.id !== guest.id)
    );
    ctx.assignMatchToArena(arenaId, guest);
    return;
  }

  // Chercher le prochain match dans le même pool (ordre smart = même ordre que l'affichage)
  if (currentPoolId) {
    const rawPoolMatches = ctx.sessionMatches
      .filter(m => {
        const matchPoolId = m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`;
        return matchPoolId === currentPoolId && ctx.isInActiveWave(m);
      })
      .map((m: any) => {
        const scoreUpdate = ctx.sessionMatchScores.get(m.id);
        return scoreUpdate ? { ...m, ...scoreUpdate } : m;
      });
    const poolMatches = ctx
      .applySmartMatchOrder(rawPoolMatches as Match[])
      .filter(m => m.status !== MatchStatus.FINISHED && ctx.isMatchPlayable(m));

    console.log(
      `[RemoteScoreServer] ${poolMatches.length} matches en attente dans le pool ${currentPoolId} (ordre smart)`
    );

    // Respecter les overrides de piste : ignorer les matchs pré-assignés à une autre arène
    let nextMatch = poolMatches.find(m => {
      if (m.id === currentMatchId) return false;
      const override = ctx.poolMatchArenaOverrides.get(m.id);
      return !override || override === arenaId;
    });
    // Si rien de dispo pour cette arène, chercher un match explicitement redirigé ici
    if (!nextMatch) {
      nextMatch = poolMatches.find(
        m => m.id !== currentMatchId && ctx.poolMatchArenaOverrides.get(m.id) === arenaId
      );
    }
    if (nextMatch) {
      console.log(
        `[RemoteScoreServer] Chargement du match ${nextMatch.id} (pool ${currentPoolId}) sur arène ${arenaId}`
      );

      const arenaMatch: ArenaMatch = {
        id: nextMatch.id,
        poolId: currentPoolId,
        fencerA: nextMatch.fencerA!,
        fencerB: nextMatch.fencerB!,
        scoreA: 0,
        scoreB: 0,
        status: 'not_started',
        startTime: null,
        endTime: null,
      };

      ctx.assignMatchToArena(arenaId, arenaMatch);
      return;
    }

    console.log(
      `[RemoteScoreServer] Plus de matches dans le pool ${currentPoolId} pour l'arène ${arenaId}`
    );

    // Vérifier si la poule est entièrement terminée (tous matchs FINISHED en DB)
    if (!ctx.isTrainingMode)
      try {
        const allPoolMatches = ctx.db.getMatchesByPool(currentPoolId);
        if (
          allPoolMatches.length > 0 &&
          allPoolMatches.every(m => m.status === MatchStatus.FINISHED)
        ) {
          completedPoolId = currentPoolId;
        }
      } catch (e) {
        console.warn('[RemoteScoreServer] pool completion check failed:', e);
      }
  }

  // Vérifier la file d'attente DE avant de marquer l'arène comme vide
  const deQueue = ctx.arenaMatchQueue.get(arenaId) || [];
  if (deQueue.length > 0) {
    const nextDeMatch = deQueue[0];

    ctx.arenaMatchQueue.set(arenaId, deQueue.slice(1));
    console.log(
      `[RemoteScoreServer] Match DE suivant ${nextDeMatch.id} chargé depuis la file sur arène ${arenaId}`
    );
    ctx.assignMatchToArena(arenaId, nextDeMatch);
    return;
  }

  // Plus aucun match - marquer l'arène comme vide
  arena.currentMatch = null;
  arena.status = 'idle';
  arena.startTime = null;

  ctx.updateArena(arenaId, {
    currentMatch: null,
    status: 'idle',
    startTime: null,
    ...(completedPoolId ? { poolComplete: true, completedPoolId } : {}),
  });
  ctx.persistArenaState(arenaId);
  console.log(`[RemoteScoreServer] Arène ${arenaId} marquée comme vide`);
}

export function updateMatchArena(
  ctx: ArenaQueueContext,
  matchId: string,
  fromArena: number | null,
  toArena: number | null,
  fencerA?: any,
  fencerB?: any
): void {
  let matchToMove: ArenaMatch | undefined;

  // Overrides d'abord : la piste d'origine doit ignorer ce match en rechargeant sa poule
  if (toArena !== null) {
    ctx.poolMatchArenaOverrides.set(matchId, `arena${toArena}`);
  } else {
    ctx.poolMatchArenaOverrides.delete(matchId);
  }

  // 1. Retirer le match de TOUTES les arènes (files et currentMatch non démarré).
  //    startSession distribue les matchs DE en round-robin, donc le match peut se
  //    trouver dans n'importe quelle arène même si fromArena est null.
  for (const [arenaId, arena] of ctx.arenas) {
    // Chercher et supprimer tous les doublons dans les files d'attente
    const queue = ctx.arenaMatchQueue.get(arenaId) || [];
    const filtered = queue.filter(m => m.id !== matchId);
    if (filtered.length < queue.length) {
      // Au moins une occurrence trouvée dans cette file
      if (!matchToMove) matchToMove = queue.find(m => m.id === matchId);
      ctx.arenaMatchQueue.set(arenaId, filtered);
    }

    // Chercher dans le currentMatch (seulement si non démarré, on ne peut pas
    // retirer un match en cours)
    if (arena.currentMatch?.id === matchId && arena.currentMatch.status !== 'in_progress') {
      if (!matchToMove) matchToMove = arena.currentMatch;
      // Piste de poule : enchaîner sur le match suivant de sa poule (#1037)
      if (arena.currentMatch.poolId) {
        ctx.loadNextMatch(arenaId);
        continue;
      }
      // Promouvoir le premier match en file comme nouveau currentMatch
      const nextInQueue = ctx.arenaMatchQueue.get(arenaId) || [];
      if (nextInQueue.length > 0) {
        arena.currentMatch = nextInQueue[0];
        arena.status = 'ready';
        ctx.arenaMatchQueue.set(arenaId, nextInQueue.slice(1));
        ctx.updateArena(arenaId, { status: 'ready', currentMatch: arena.currentMatch });
      } else {
        arena.currentMatch = null;
        arena.status = 'idle';
        ctx.updateArena(arenaId, { status: 'idle', currentMatch: null });
      }
    }
  }

  // Si le match n'est dans aucune arène, le construire depuis sessionMatches ou les données passées
  if (!matchToMove) {
    const sm = ctx.sessionMatches.find((m: any) => m.id === matchId);
    if (sm) {
      // Mettre à jour les données de tireurs si le renderer fournit des données plus récentes
      if (fencerA) sm.fencerA = fencerA;
      if (fencerB) sm.fencerB = fencerB;
      if (sm.poolId) {
        // Match de poule : conserver poolId, ne pas marquer isTableau
        matchToMove = {
          id: sm.id,
          poolId: sm.poolId,
          fencerA: fencerA ?? sm.fencerA,
          fencerB: fencerB ?? sm.fencerB,
          scoreA: 0,
          scoreB: 0,
          status: 'not_started',
          startTime: null,
          endTime: null,
        };
      } else {
        matchToMove = {
          id: sm.id,
          fencerA: fencerA ?? sm.fencerA,
          fencerB: fencerB ?? sm.fencerB,
          scoreA: 0,
          scoreB: 0,
          status: 'not_started',
          startTime: null,
          endTime: null,
          isTableau: true,
        };
      }
    } else if (fencerA && fencerB) {
      // Match DE non encore en session (ex: session de poule toujours active) → créer depuis les données passées
      matchToMove = {
        id: matchId,
        fencerA,
        fencerB,
        scoreA: 0,
        scoreB: 0,
        status: 'not_started',
        startTime: null,
        endTime: null,
        isTableau: true,
      };
      ctx.sessionMatches.push({
        id: matchId,
        fencerA,
        fencerB,
        isTableau: true,
        status: 'not_started',
      } as any);
      console.log(
        `[RemoteScoreServer] Match DE ${matchId} ajouté à sessionMatches depuis updateMatchArena`
      );
    }
  }

  if (!matchToMove || !toArena) return;
  if (!matchToMove.fencerA || !matchToMove.fencerB) return;

  // 2. Ajouter à la nouvelle arène
  const toArenaId = `arena${toArena}`;
  const toArenaObj = ctx.arenas.get(toArenaId);
  if (!toArenaObj) return;

  if (!toArenaObj.currentMatch) {
    // Arène libre → le match devient le currentMatch visible immédiatement
    ctx.assignMatchToArena(toArenaId, matchToMove);
  } else {
    // Arène occupée : un match réassigné manuellement passe en tête de file ;
    // les suivants se rajoutent par le haut (#1037)
    const toQueue = ctx.arenaMatchQueue.get(toArenaId) || [];
    ctx.arenaMatchQueue.set(toArenaId, [matchToMove, ...toQueue]);
    ctx.updateArena(toArenaId, { status: toArenaObj.status });
  }

  console.log(`[RemoteScoreServer] Match ${matchId} assigné à arena${toArena}`);
}

/**
 * Réassigne les poules aux pistes pendant une session active (#1037) :
 * poules générées après le démarrage de la saisie distante, ou piste modifiée
 * en préparation. Un match en cours n'est jamais retiré ; une poule envoyée sur
 * une piste déjà occupée par une autre poule est mise en file (pas de remplacement).
 */
export function assignPools(
  ctx: ArenaQueueContext,
  poolsData: Array<{
    poolId: string;
    poolNumber?: number;
    strip?: number | null;
    fencers?: any[];
    matches: any[];
  }>
): void {
  if (!ctx.session) return;
  const poolKey = (m: any) => m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`;
  const poolIds = new Set(poolsData.map(p => p.poolId));

  // 1. Matchs de poule en mémoire remplacés par ceux du renderer (poules obsolètes retirées)
  ctx.sessionMatches = [
    ...ctx.sessionMatches.filter((m: any) => m.isTableau || !m.poolId),
    ...poolsData.flatMap(p => p.matches.map(m => ({ ...m, poolNumber: p.poolNumber }))),
  ];
  for (const p of poolsData) {
    if (p.fencers && p.fencers.length > 0) ctx.poolFencersCache.set(p.poolId, p.fencers);
  }

  // 2. Piste cible par poule : pool.strip si défini, sinon première piste libre
  const sorted = [...poolsData].sort((a, b) => (a.poolNumber ?? 0) - (b.poolNumber ?? 0));
  const target = new Map<string, string>();
  const used = new Set<number>();
  for (const p of sorted) {
    const s = Number(p.strip);
    if (Number.isInteger(s) && s > 0 && s <= ctx.arenaCount) {
      target.set(p.poolId, `arena${s}`);
      used.add(s);
    }
  }
  let nextFree = 1;
  for (const p of sorted) {
    if (target.has(p.poolId)) continue;
    while (used.has(nextFree)) nextFree++;
    if (nextFree > ctx.arenaCount) break;
    target.set(p.poolId, `arena${nextFree}`);
    used.add(nextFree);
  }

  // 3. Libérer les pistes dont la poule a changé de piste ou n'existe plus
  for (const [arenaId, arena] of ctx.arenas) {
    const queue = ctx.arenaMatchQueue.get(arenaId) || [];
    const keptQueue = queue.filter(
      m =>
        !m.poolId ||
        ctx.isGuestMatch(arenaId, m) ||
        (poolIds.has(m.poolId) && target.get(m.poolId) === arenaId)
    );
    if (keptQueue.length !== queue.length) ctx.arenaMatchQueue.set(arenaId, keptQueue);

    const current = arena.currentMatch;
    const currentPool = current ? ctx.arenaHomePoolId(arena) : arena.activePoolId;
    if (!currentPool) continue;
    if (poolIds.has(currentPool) && target.get(currentPool) === arenaId) continue;
    if (current?.status === 'in_progress') continue; // jamais interrompre un match en cours
    arena.activePoolId = undefined;
    if (current) {
      const next = keptQueue[0];
      if (next) {
        ctx.arenaMatchQueue.set(arenaId, keptQueue.slice(1));
        ctx.assignMatchToArena(arenaId, next);
      } else {
        arena.currentMatch = null;
        arena.status = 'idle';
        ctx.updateArena(arenaId, { status: 'idle', currentMatch: null });
        ctx.persistArenaState(arenaId);
      }
    }
  }

  // 4. Charger chaque poule sur sa piste (ou en file si la piste est occupée)
  for (const p of sorted) {
    const arenaId = target.get(p.poolId);
    const arena = arenaId ? ctx.arenas.get(arenaId) : undefined;
    if (!arenaId || !arena) continue;
    if ((ctx.arenaHomePoolId(arena) ?? arena.activePoolId) === p.poolId) continue;
    const queue = ctx.arenaMatchQueue.get(arenaId) || [];
    if (queue.some(m => m.poolId === p.poolId)) continue;

    const poolMatches = ctx.sessionMatches
      .filter((m: any) => !m.isTableau && poolKey(m) === p.poolId)
      .sort((a: any, b: any) => (a.number || 0) - (b.number || 0));
    const first = poolMatches.find(m => m.status !== 'finished' && m.status !== 'in_progress');
    if (!first || !first.fencerA || !first.fencerB) {
      if (!arena.currentMatch && poolMatches.length > 0) arena.activePoolId = p.poolId;
      continue;
    }
    const arenaMatch: ArenaMatch = {
      id: first.id,
      poolId: p.poolId,
      fencerA: first.fencerA,
      fencerB: first.fencerB,
      scoreA: 0,
      scoreB: 0,
      status: 'not_started',
      startTime: null,
      endTime: null,
    };
    if (arena.currentMatch) {
      ctx.arenaMatchQueue.set(arenaId, [...queue, arenaMatch]);
      continue;
    }
    ctx.assignMatchToArena(arenaId, arenaMatch);
    ctx.arenaNextMatchIndex.set(arenaId, poolMatches.findIndex(m => m.id === first.id) + 1);
  }

  // 5. Rafraîchir les feuilles de poule affichées
  for (const [arenaId, arena] of ctx.arenas) {
    const poolId = arena.currentMatch?.poolId ?? arena.activePoolId;
    if (!poolId || !poolIds.has(poolId)) continue;
    const matches = ctx.sessionMatches
      .filter((m: any) => !m.isTableau && poolKey(m) === poolId)
      .sort((a: any, b: any) => (a.number || 0) - (b.number || 0))
      .map((m: any) => {
        const u = ctx.sessionMatchScores.get(m.id);
        return u ? { ...m, ...u } : m;
      });
    const isComplete =
      matches.length > 0 && matches.every((m: any) => m.status === MatchStatus.FINISHED);
    ctx.io?.to(`pool:${arenaId}`).emit(`pool:${arenaId}:update`, {
      poolId,
      fencers: ctx.poolFencersCache.get(poolId) ?? [],
      matches,
      isComplete,
    });
  }
}

export function refreshDeMatches(ctx: ArenaQueueContext, matchesFromRenderer: any[]): void {
  if (!ctx.session) throw new Error('Aucune session active');

  const strips = ctx.session.strips.length;

  // Collect IDs of matches currently assigned to an arena (must not be disturbed)
  const activeMatchIds = new Set<string>();
  for (const arena of ctx.arenas.values()) {
    if (arena.currentMatch) activeMatchIds.add(arena.currentMatch.id);
  }

  // Build the new DE match list, excluding already-active matches
  const deMatches = matchesFromRenderer
    .filter(m => !m.__poolFencers && m.isTableau && m.fencerA && m.fencerB)
    .sort((a: any, b: any) => (b.round || 0) - (a.round || 0));

  // Replace DE entries in sessionMatches (keep pool matches intact)
  ctx.sessionMatches = ctx.sessionMatches.filter((m: any) => !m.isTableau);
  for (const m of deMatches) ctx.sessionMatches.push(m);

  // Rebuild DE queues (preserve any non-DE entries already queued)
  for (const [arenaId, queue] of ctx.arenaMatchQueue.entries()) {
    ctx.arenaMatchQueue.set(
      arenaId,
      queue.filter((m: ArenaMatch) => !m.isTableau)
    );
  }

  // Arbitre(s) assigné(s) depuis l'appli → match en cours sur la tablette (#977)
  for (const [arenaId, arena] of ctx.arenas) {
    const current = arena.currentMatch;
    if (!current?.isTableau || arena.status === 'finished') continue;
    const m = deMatches.find(x => x.id === current.id);
    if (!m) continue;
    const referee = ctx.resolveDeMatchReferee(m);
    if (referee?.id === current.referee?.id && referee?.name === current.referee?.name) continue;
    arena.currentMatch = { ...current, referee: referee ?? undefined };
    ctx.broadcastArenaUpdate(arenaId, {
      arenaId,
      match: arena.currentMatch,
      scoreA: arena.currentMatch.scoreA,
      scoreB: arena.currentMatch.scoreB,
      status: arena.status,
    });
    ctx.persistArenaState(arenaId);
  }

  const pending = deMatches.filter(m => !activeMatchIds.has(m.id));
  const queuesByArena = new Map<string, ArenaMatch[]>();
  for (let i = 1; i <= strips; i++) queuesByArena.set(`arena${i}`, []);

  // N'assigner QUE les matchs ayant une piste explicitement définie (match.arena).
  // Sans piste assignée → on ne charge rien sur une arène : sinon des matchs
  // apparaissent sur l'arène 1 alors que l'assignation auto est désactivée.
  for (const match of pending) {
    if (!match.arena) continue; // pas de piste assignée → ne pas distribuer
    const targetArenaId = `arena${match.arena}`;
    if (!ctx.arenas.has(targetArenaId)) continue; // hors plage → ignorer
    const referee = ctx.resolveDeMatchReferee(match);
    queuesByArena.get(targetArenaId)!.push({
      id: match.id,
      fencerA: match.fencerA,
      fencerB: match.fencerB,
      scoreA: 0,
      scoreB: 0,
      status: 'not_started',
      startTime: null,
      endTime: null,
      isTableau: true,
      ...(referee ? { referee } : {}),
    });
  }

  for (const [arenaId, queue] of queuesByArena) {
    const arena = ctx.arenas.get(arenaId);
    if (!arena) continue;
    const existing = ctx.arenaMatchQueue.get(arenaId) || [];

    // Déterminer si l'arène est effectivement libre : en fast-poule les scores sont
    // saisis via l'UI principale, donc arena.currentMatch.status reste 'not_started'
    // alors que le match est terminé dans sessionMatches. On vérifie sessionMatches.
    let arenaEffectivelyFree = !arena.currentMatch;
    if (!arenaEffectivelyFree && arena.currentMatch) {
      // Cas 1 : match tableau terminé (tablette ou appli) → il n'est plus dans deMatches
      if (arena.currentMatch.isTableau && !deMatches.some(m => m.id === arena.currentMatch!.id)) {
        arena.currentMatch = null;
        if (arena.status === 'finished') {
          // Terminé via tablette : le timer loadNextMatch (3 s) est déjà programmé et
          // lira la nouvelle file d'attente ; ne pas écraser 'finished' → ne pas bloquer
          // le timer, et ne pas assigner immédiatement (firstPlayable restera undefined).
          ctx.updateArena(arenaId, { currentMatch: null });
        } else {
          // Scoré manuellement depuis l'appli : libérer l'arène immédiatement.
          arena.status = 'idle';
          arenaEffectivelyFree = true;
          ctx.updateArena(arenaId, { status: 'idle', currentMatch: null });
        }
      } else {
        // Cas 2 : score remote ou fast-poule → vérifier le statut effectif
        const scoreUpdate = ctx.sessionMatchScores.get(arena.currentMatch.id);
        const inSession = ctx.sessionMatches.find((m: any) => m.id === arena.currentMatch!.id);
        const effectiveStatus =
          scoreUpdate?.status ?? inSession?.status ?? arena.currentMatch.status;
        if (effectiveStatus === MatchStatus.FINISHED) {
          arena.currentMatch = null;
          arena.status = 'idle';
          arenaEffectivelyFree = true;
        }
      }
    }

    const firstPlayable = arenaEffectivelyFree && queue.length > 0 ? queue[0] : undefined;
    if (firstPlayable) {
      ctx.assignMatchToArena(arenaId, firstPlayable);
      const rest = queue.filter(m => m.id !== firstPlayable.id);
      ctx.arenaMatchQueue.set(arenaId, [...existing, ...rest]);
    } else {
      ctx.arenaMatchQueue.set(arenaId, [...existing, ...queue]);
    }
  }

  console.log(
    `[RemoteScoreServer] refreshDeMatches: ${deMatches.length} matchs DE, ${pending.length} distribués`
  );

  // Notifier le kiosk que le bracket a changé
  ctx.io.emit('bracket:update');
}
