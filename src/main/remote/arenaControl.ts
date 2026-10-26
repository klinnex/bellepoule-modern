/**
 * BellePoule Modern - Actions arbitre (événement arena_control) (#1240)
 * Extrait de RemoteScoreServer : l'état reste dans le serveur, exposé par accesseurs (contexte).
 * Licensed under GPL-3.0
 */
import { ArenaMatch } from '../../shared/types/remote';
import { sanitizeAnnouncement } from './announcement';
import type { RemoteScoreServer } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module (accesseurs : valeurs toujours à jour). */
export interface ArenaControlContext {
  readonly SCORE_UPDATE_DEBOUNCE_MS: S['SCORE_UPDATE_DEBOUNCE_MS'];
  readonly arenaCards: S['arenaCards'];
  readonly arenaEventTimes: S['arenaEventTimes'];
  readonly arenaExits: S['arenaExits'];
  readonly arenaOvertimeType: S['arenaOvertimeType'];
  readonly arenaRefereeSelected: S['arenaRefereeSelected'];
  readonly arenaSuddenDeath: S['arenaSuddenDeath'];
  readonly arenaTouches: S['arenaTouches'];
  readonly arenaWaitingOvertime: S['arenaWaitingOvertime'];
  readonly assignMatchToArena: S['assignMatchToArena'];
  readonly broadcastArenaUpdate: S['broadcastArenaUpdate'];
  readonly db: S['db'];
  readonly finishArenaMatch: S['finishArenaMatch'];
  readonly getArena: S['getArena'];
  readonly io: S['io'];
  readonly isTrainingMode: S['isTrainingMode'];
  readonly loadNextMatch: S['loadNextMatch'];
  readonly pauseArenaMatch: S['pauseArenaMatch'];
  readonly resolveReferee: S['resolveReferee'];
  readonly scoreUpdateDebounce: S['scoreUpdateDebounce'];
  readonly sendDiag: S['sendDiag'];
  readonly session: S['session'];
  readonly sessionCardAnnounce: S['sessionCardAnnounce'];
  readonly sessionMatches: S['sessionMatches'];
  readonly stampArenaEvents: S['stampArenaEvents'];
  readonly startArenaMatch: S['startArenaMatch'];
  readonly trainingCustomRules: S['trainingCustomRules'];
  readonly updateArenaScore: S['updateArenaScore'];
}

export function handleArenaControl(
  ctx: ArenaControlContext,
  socket: any,
  data: {
    arenaId: string;
    action: string;
    match?: ArenaMatch;
    scoreA?: number;
    scoreB?: number;
    time?: number;
    timerStatus?: 'running' | 'paused' | 'reset';
    fencer?: 'A' | 'B';
    cardType?: 'white' | 'yellow' | 'red';
    cardsA?: string[];
    cardsB?: string[];
    touchesA?: string[];
    touchesB?: string[];
    suddenDeath?: boolean;
    winner?: 'A' | 'B';
    overtimeType?: string | null;
    isVoluntary?: boolean;
    matchId?: string;
    refereeId?: string;
    announcement?: {
      fencer: 'A' | 'B';
      fencerName: string;
      cardType: string;
      isRevalorisation: boolean;
      fromCard: string | null;
      toCard: string | null;
    };
  }
): void {
  const arena = ctx.getArena(data.arenaId);
  if (!arena) {
    socket.emit('error', { message: 'Arène non trouvée' });
    return;
  }

  switch (data.action) {
    case 'select_match':
      // Sélection d'un match par l'arbitre (depuis sa tablette)
      if (data.match) {
        const m = data.match;
        ctx.sendDiag(
          `[select_match] arena=${data.arenaId} matchId=${m.id} isTableau=${(m as any).isTableau}`
        );
        // Restaurer isTableau depuis sessionMatches car la tablette ne le transmet pas
        const sessionMatch = ctx.sessionMatches.find(sm => sm.id === m.id);
        ctx.assignMatchToArena(
          data.arenaId,
          {
            ...m,
            isTableau: m.isTableau ?? sessionMatch?.isTableau ?? false,
            scoreA:
              typeof (m.scoreA as unknown) === 'object'
                ? ((m.scoreA as unknown as { value?: number })?.value ?? 0)
                : (m.scoreA ?? 0),
            scoreB:
              typeof (m.scoreB as unknown) === 'object'
                ? ((m.scoreB as unknown as { value?: number })?.value ?? 0)
                : (m.scoreB ?? 0),
          },
          true
        );
        ctx.arenaCards.set(data.arenaId, { cardsA: [], cardsB: [] });
        ctx.arenaTouches.set(data.arenaId, { touchesA: [], touchesB: [] });
        ctx.arenaExits.set(data.arenaId, []);
        ctx.arenaEventTimes.delete(data.arenaId);
      }
      break;
    case 'release_match':
      // Retour à la liste sans avoir lancé le chrono : match de nouveau proposé
      // aux autres tablettes de la piste (rapières, #1118)
      if (arena.status !== 'in_progress' && !arena.currentMatch?.startTime) {
        ctx.arenaRefereeSelected.set(data.arenaId, false);
      }
      break;
    case 'start':
      ctx.startArenaMatch(data.arenaId);
      break;
    case 'pause':
      ctx.pauseArenaMatch(data.arenaId);
      break;
    case 'finish':
      ctx.sendDiag(`[socket finish] arena=${data.arenaId}`);
      ctx.arenaSuddenDeath.set(data.arenaId, false);
      ctx.arenaOvertimeType.set(data.arenaId, null);
      ctx.arenaWaitingOvertime.set(data.arenaId, false);
      ctx.finishArenaMatch(data.arenaId);
      ctx.arenaCards.set(data.arenaId, { cardsA: [], cardsB: [] });
      ctx.arenaTouches.set(data.arenaId, { touchesA: [], touchesB: [] });
      ctx.arenaExits.set(data.arenaId, []);
      ctx.arenaEventTimes.delete(data.arenaId);
      break;
    case 'waiting_overtime':
      ctx.arenaWaitingOvertime.set(data.arenaId, true);
      ctx.broadcastArenaUpdate(data.arenaId, {
        arenaId: data.arenaId,
        match: arena.currentMatch,
        time: 0,
        timerStatus: 'paused',
        suddenDeath: false,
        overtimeType: null,
        waitingOvertime: true,
        status: arena.status,
      });
      break;
    case 'coin_flip':
      if (data.winner === 'A' || data.winner === 'B') {
        ctx.io.to(`arena:${data.arenaId}`).emit(`arena:${data.arenaId}:coin_flip`, {
          winner: data.winner,
          fencerA: arena.currentMatch?.fencerA,
          fencerB: arena.currentMatch?.fencerB,
        });
      }
      break;
    case 'dt_call': {
      const mainWin = (global as any).mainWindow;
      if (mainWin) {
        mainWin.webContents.send('remote:dt_call', {
          arenaId: data.arenaId,
          arenaNumber: arena.number,
          matchNumber: null,
          competitionId: ctx.session?.competitionId ?? null,
          timestamp: Date.now(),
        });
      }
      break;
    }
    case 'dt_cancel': {
      const mainWin = (global as any).mainWindow;
      if (mainWin) {
        mainWin.webContents.send('remote:dt_cancel', { arenaId: data.arenaId });
      }
      break;
    }
    case 'next':
      ctx.loadNextMatch(data.arenaId);
      ctx.arenaCards.set(data.arenaId, { cardsA: [], cardsB: [] });
      ctx.arenaTouches.set(data.arenaId, { touchesA: [], touchesB: [] });
      ctx.arenaExits.set(data.arenaId, []);
      ctx.arenaEventTimes.delete(data.arenaId);
      ctx.arenaSuddenDeath.set(data.arenaId, false);
      ctx.arenaOvertimeType.set(data.arenaId, null);
      ctx.arenaWaitingOvertime.set(data.arenaId, false);
      break;
    case 'update_score': {
      const debounceKey = `${socket.id}:${data.arenaId}`;
      const lastUpdate = ctx.scoreUpdateDebounce.get(debounceKey) ?? 0;
      if (Date.now() - lastUpdate < ctx.SCORE_UPDATE_DEBOUNCE_MS) break;
      ctx.scoreUpdateDebounce.set(debounceKey, Date.now());
      // Supprimer la mort subite si désactivée en entraînement
      const effectiveSuddenDeath =
        ctx.isTrainingMode && ctx.trainingCustomRules?.disableSuddenDeath
          ? false
          : data.suddenDeath;
      if (effectiveSuddenDeath !== undefined) {
        ctx.arenaSuddenDeath.set(data.arenaId, effectiveSuddenDeath);
      }
      if (data.overtimeType !== undefined) {
        ctx.arenaOvertimeType.set(data.arenaId, data.overtimeType);
      }
      if (data.scoreA !== undefined && data.scoreB !== undefined) {
        ctx.updateArenaScore(data.arenaId, data.scoreA, data.scoreB);
      }
      // Mettre à jour aussi les cartons si fournis
      if (data.cardsA !== undefined || data.cardsB !== undefined) {
        const currentCards = ctx.arenaCards.get(data.arenaId) || { cardsA: [], cardsB: [] };
        if (data.cardsA !== undefined) currentCards.cardsA = data.cardsA;
        if (data.cardsB !== undefined) currentCards.cardsB = data.cardsB;
        ctx.arenaCards.set(data.arenaId, currentCards);
        // Mettre à jour les touches par zone si fournies
        const currentTouches = ctx.arenaTouches.get(data.arenaId) || {
          touchesA: [],
          touchesB: [],
        };
        if (data.touchesA !== undefined) currentTouches.touchesA = data.touchesA;
        if (data.touchesB !== undefined) currentTouches.touchesB = data.touchesB;
        ctx.arenaTouches.set(data.arenaId, currentTouches);
        ctx.stampArenaEvents(data.arenaId, 'cardsA', currentCards.cardsA.length);
        ctx.stampArenaEvents(data.arenaId, 'cardsB', currentCards.cardsB.length);
        ctx.stampArenaEvents(data.arenaId, 'touchesA', currentTouches.touchesA.length);
        ctx.stampArenaEvents(data.arenaId, 'touchesB', currentTouches.touchesB.length);

        ctx.broadcastArenaUpdate(data.arenaId, {
          arenaId: data.arenaId,
          match: arena.currentMatch,
          scoreA: data.scoreA ?? arena.currentMatch?.scoreA,
          scoreB: data.scoreB ?? arena.currentMatch?.scoreB,
          cardsA: currentCards.cardsA,
          cardsB: currentCards.cardsB,
          touchesA: currentTouches.touchesA,
          touchesB: currentTouches.touchesB,
          suddenDeath: ctx.arenaSuddenDeath.get(data.arenaId) ?? false,
          overtimeType: ctx.arenaOvertimeType.get(data.arenaId) ?? null,
          waitingOvertime: ctx.arenaWaitingOvertime.get(data.arenaId) ?? false,
          status: arena.status,
        });
      }
      break;
    }
    case 'add_card':
      // Gestion des cartons
      if (data.fencer && data.cardType) {
        const currentCards = ctx.arenaCards.get(data.arenaId) || { cardsA: [], cardsB: [] };
        const targetCards = data.fencer === 'A' ? currentCards.cardsA : currentCards.cardsB;
        targetCards.push(data.cardType);
        ctx.arenaCards.set(data.arenaId, currentCards);
        ctx.stampArenaEvents(
          data.arenaId,
          data.fencer === 'A' ? 'cardsA' : 'cardsB',
          targetCards.length
        );
        ctx.broadcastArenaUpdate(data.arenaId, {
          arenaId: data.arenaId,
          match: arena.currentMatch,
          scoreA: arena.currentMatch?.scoreA,
          scoreB: arena.currentMatch?.scoreB,
          cardsA: currentCards.cardsA,
          cardsB: currentCards.cardsB,
          status: arena.status,
        });
      }
      break;
    case 'arena_exit':
      if (data.fencer) {
        const exits = ctx.arenaExits.get(data.arenaId) || [];
        exits.push({ fencer: data.fencer as 'A' | 'B', isVoluntary: !!data.isVoluntary });
        ctx.arenaExits.set(data.arenaId, exits);
        ctx.stampArenaEvents(data.arenaId, 'exits', exits.length);
      }
      break;
    case 'reset_scores':
      if (arena.currentMatch) {
        ctx.arenaSuddenDeath.set(data.arenaId, false);
        ctx.arenaOvertimeType.set(data.arenaId, null);
        ctx.arenaWaitingOvertime.set(data.arenaId, false);
        ctx.updateArenaScore(data.arenaId, 0, 0);
        ctx.arenaCards.set(data.arenaId, { cardsA: [], cardsB: [] });
        ctx.arenaTouches.set(data.arenaId, { touchesA: [], touchesB: [] });
        ctx.arenaExits.set(data.arenaId, []);
        ctx.arenaEventTimes.delete(data.arenaId);
        ctx.broadcastArenaUpdate(data.arenaId, {
          arenaId: data.arenaId,
          match: arena.currentMatch,
          scoreA: 0,
          scoreB: 0,
          cardsA: [],
          cardsB: [],
          suddenDeath: false,
          overtimeType: null,
          waitingOvertime: false,
          status: arena.status,
        });
      }
      break;
    case 'toggle_swap': {
      arena.swapped = !(arena.swapped ?? false);
      const cards = ctx.arenaCards.get(data.arenaId) || { cardsA: [], cardsB: [] };
      ctx.broadcastArenaUpdate(data.arenaId, {
        arenaId: data.arenaId,
        match: arena.currentMatch,
        scoreA: arena.currentMatch?.scoreA,
        scoreB: arena.currentMatch?.scoreB,
        cardsA: cards.cardsA,
        cardsB: cards.cardsB,
        suddenDeath: ctx.arenaSuddenDeath.get(data.arenaId) ?? false,
        status: arena.status,
      });
      break;
    }
    case 'card_announcement': {
      const ann = sanitizeAnnouncement(data.announcement);
      if (ann) {
        ctx.io.to(`arena:${data.arenaId}`).emit(`arena:${data.arenaId}:card_announcement`, ann);
      }
      break;
    }
    case 'exit_announcement': {
      const ann = sanitizeAnnouncement(data.announcement);
      if (ann && ctx.sessionCardAnnounce) {
        ctx.io.to(`arena:${data.arenaId}`).emit(`arena:${data.arenaId}:exit_announcement`, ann);
      }
      break;
    }
    case 'update_timer':
    case 'pause_timer':
    case 'reset_timer': {
      const timerSuddenDeath =
        ctx.isTrainingMode && ctx.trainingCustomRules?.disableSuddenDeath
          ? false
          : data.suddenDeath;
      if (timerSuddenDeath !== undefined) {
        ctx.arenaSuddenDeath.set(data.arenaId, timerSuddenDeath);
      }
      if (data.overtimeType !== undefined) {
        ctx.arenaOvertimeType.set(data.arenaId, data.overtimeType);
      }
      // Clear waiting state when sudden death actually starts
      if (timerSuddenDeath) {
        ctx.arenaWaitingOvertime.set(data.arenaId, false);
      }
      ctx.broadcastArenaUpdate(data.arenaId, {
        arenaId: data.arenaId,
        match: arena.currentMatch,
        time: data.time,
        timerStatus: data.timerStatus,
        suddenDeath: ctx.arenaSuddenDeath.get(data.arenaId) ?? false,
        overtimeType: ctx.arenaOvertimeType.get(data.arenaId) ?? null,
        waitingOvertime: ctx.arenaWaitingOvertime.get(data.arenaId) ?? false,
        status: arena.status,
      });
      break;
    }
    case 'change_referee': {
      if (!data.matchId || !data.refereeId || !arena.currentMatch) break;
      if (arena.currentMatch.id !== data.matchId) break;
      ctx.db.updateMatch(data.matchId, { refereeId: data.refereeId });
      // Mettre à jour sessionMatches en mémoire
      const idx = ctx.sessionMatches.findIndex((m: any) => m.id === data.matchId);
      if (idx >= 0)
        ctx.sessionMatches[idx] = { ...ctx.sessionMatches[idx], refereeId: data.refereeId };
      // Mettre à jour l'ArenaMatch courant
      const resolvedRef = ctx.resolveReferee(data.refereeId);
      arena.currentMatch = {
        ...arena.currentMatch,
        ...(resolvedRef ? { referee: resolvedRef } : {}),
      };
      // Application organisateur : sinon son état en mémoire réécrit l'ancien arbitre (#977)
      const mainWin = (global as any).mainWindow;
      if (mainWin && !mainWin.isDestroyed?.()) {
        mainWin.webContents.send('remote:referee_changed', {
          matchId: data.matchId,
          refereeId: data.refereeId,
        });
      }
      ctx.broadcastArenaUpdate(data.arenaId, {
        arenaId: data.arenaId,
        match: arena.currentMatch,
        scoreA: arena.currentMatch.scoreA,
        scoreB: arena.currentMatch.scoreB,
        status: arena.status,
      });
      break;
    }
    default:
      socket.emit('error', { message: 'Action non reconnue' });
  }
}
