/**
 * BellePoule Modern - Gestionnaires Socket.IO (connexion, arènes, écrans, équipes) (#1240)
 * Extrait de RemoteScoreServer : l'état reste dans le serveur, exposé par accesseurs (contexte).
 * Licensed under GPL-3.0
 */
import { CardReason } from '../../shared/types';
import { relayCumul, relayWinnerSide } from '../../features/teams/utils/teamRelayLive';
import { createCard, getAvailableReasons } from '../../shared/utils/cardSystem';
import { normalizeIp, isLoopbackAddress } from './network';
import type { RemoteScoreServer } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module (accesseurs : valeurs toujours à jour). */
export interface SocketHandlersContext {
  readonly MAX_SOCKETS_PER_IP: S['MAX_SOCKETS_PER_IP'];
  readonly SOCKET_EVENTS_PER_SEC: S['SOCKET_EVENTS_PER_SEC'];
  readonly SOCKET_EVENT_BURST: S['SOCKET_EVENT_BURST'];
  readonly arenaEventBuffer: S['arenaEventBuffer'];
  readonly arenaRefereeSelected: S['arenaRefereeSelected'];
  readonly arenaScreenThemes: S['arenaScreenThemes'];
  readonly arenaThemeOverrides: S['arenaThemeOverrides'];
  readonly broadcastClientList: S['broadcastClientList'];
  readonly buildDashboardSnapshot: S['buildDashboardSnapshot'];
  readonly checkArenaAuth: S['checkArenaAuth'];
  readonly checkSocketArenaAuth: S['checkSocketArenaAuth'];
  readonly connectedClients: S['connectedClients'];
  readonly db: S['db'];
  readonly getArena: S['getArena'];
  readonly getPublicTeamArenaState: S['getPublicTeamArenaState'];
  readonly getSessionReferees: S['getSessionReferees'];
  readonly handleArenaControl: S['handleArenaControl'];
  readonly handleDisconnect: S['handleDisconnect'];
  readonly io: S['io'];
  readonly isTrainingMode: S['isTrainingMode'];
  readonly kioskThemeVariables: S['kioskThemeVariables'];
  readonly peekNextMatch: S['peekNextMatch'];
  readonly screenLabels: S['screenLabels'];
  readonly sendDiag: S['sendDiag'];
  readonly session: S['session'];
  readonly sessionBlackCardEnabled: S['sessionBlackCardEnabled'];
  readonly sessionCardAnnounce: S['sessionCardAnnounce'];
  readonly sessionPoolTimerSeconds: S['sessionPoolTimerSeconds'];
  readonly sessionRefereeFeatureEnabled: S['sessionRefereeFeatureEnabled'];
  readonly sessionRestSeconds: S['sessionRestSeconds'];
  readonly sessionShowPhotos: S['sessionShowPhotos'];
  readonly sessionTableTimerSeconds: S['sessionTableTimerSeconds'];
  readonly sessionTheme: S['sessionTheme'];
  readonly socketsPerIp: S['socketsPerIp'];
  readonly teamArenaElapsedSec: S['teamArenaElapsedSec'];
  readonly teamArenaState: S['teamArenaState'];
  readonly trainingCustomRules: S['trainingCustomRules'];
}

export function setupSocketHandlers(ctx: SocketHandlersContext): void {
  ctx.io.on('connection', (socket: any) => {
    console.log('Client connected:', socket.id);

    // Toute exception d'un handler reste locale : sans ce garde, une donnée nulle
    // (ex. `join_arena` null) remonte en uncaughtException et gèle l'app (#993).
    const rawOn = socket.on.bind(socket);
    socket.on = (event: string, handler: (...args: unknown[]) => unknown) =>
      rawOn(event, (...args: unknown[]) => {
        try {
          return handler(...args);
        } catch (err) {
          ctx.sendDiag(
            `[Sécurité] Événement socket « ${event} » rejeté : ${(err as Error)?.message}`
          );
        }
      });
    socket.on('error', (err: Error) => {
      console.error('Socket.IO error', socket.id, err?.message);
    });

    // Plafond de connexions simultanées par IP
    const clientIp = normalizeIp(socket.handshake?.address);
    const count = (ctx.socketsPerIp.get(clientIp) ?? 0) + 1;
    if (count > ctx.MAX_SOCKETS_PER_IP && !isLoopbackAddress(clientIp)) {
      ctx.sendDiag(`[Sécurité] Trop de connexions socket depuis ${clientIp} — refusée`);
      socket.disconnect(true);
      return;
    }
    ctx.socketsPerIp.set(clientIp, count);
    socket.on('disconnect', () => {
      const n = (ctx.socketsPerIp.get(clientIp) ?? 1) - 1;
      if (n <= 0) ctx.socketsPerIp.delete(clientIp);
      else ctx.socketsPerIp.set(clientIp, n);
    });

    // Seau à jetons : rafale de SOCKET_EVENT_BURST, recharge SOCKET_EVENTS_PER_SEC/s
    let tokens = ctx.SOCKET_EVENT_BURST;
    let lastRefill = Date.now();
    socket.use?.((_packet: unknown, next: (err?: Error) => void) => {
      const now = Date.now();
      tokens = Math.min(
        ctx.SOCKET_EVENT_BURST,
        tokens + ((now - lastRefill) / 1000) * ctx.SOCKET_EVENTS_PER_SEC
      );
      lastRefill = now;
      if (tokens < 1) {
        ctx.sendDiag(`[Sécurité] Flood socket depuis ${clientIp} — déconnecté`);
        socket.disconnect(true);
        return;
      }
      tokens -= 1;
      next();
    });

    // Gestion des arènes
    socket.on('join_arena', (data: { arenaId: string; role?: string; lastSeen?: number }) => {
      if (!data || typeof data.arenaId !== 'string' || !data.arenaId) return;
      console.log(
        `Client ${socket.id} joining arena ${data.arenaId} as ${data.role || 'spectator'}`
      );
      if (data.role === 'referee') {
        if (!ctx.checkArenaAuth(data.arenaId, socket.handshake.headers.cookie as string)) {
          socket.emit('auth_error', { message: 'Authentification requise' });
          socket.disconnect(true);
          return;
        }
      }
      socket.join(`arena:${data.arenaId}`);

      const arena = ctx.getArena(data.arenaId);
      if (!arena && ctx.session) {
        // Arène inconnue mais session active → débloquer l'arbitre
        socket.emit(`arena:${data.arenaId}:update`, {
          arenaId: data.arenaId,
          match: null,
          status: 'idle',
          showPhotos: ctx.sessionShowPhotos,
          cardAnnounce: ctx.sessionCardAnnounce,
          theme: ctx.sessionTheme,
          refereeFeatureEnabled: ctx.sessionRefereeFeatureEnabled,
          blackCardEnabled: ctx.sessionBlackCardEnabled,
          referees: ctx.getSessionReferees(),
        });
      }
      if (arena) {
        const override = ctx.arenaThemeOverrides.get(data.arenaId);

        // Replay des événements manqués si lastSeen fourni
        if (data.lastSeen && data.lastSeen > 0) {
          const buf = ctx.arenaEventBuffer.get(data.arenaId) ?? [];
          const missed = buf.filter(e => e.timestamp > data.lastSeen!);
          if (missed.length > 0) {
            socket.emit(`arena:${data.arenaId}:replay`, {
              events: missed.map(e => e.event),
            });
            return; // pas besoin d'envoyer l'état courant séparément
          }
        }

        // Sinon : état courant complet
        const isPoolMatch = !!arena.currentMatch?.poolId;
        socket.emit(`arena:${data.arenaId}:update`, {
          arenaId: data.arenaId,
          match: arena.currentMatch,
          scoreA: arena.currentMatch?.scoreA,
          scoreB: arena.currentMatch?.scoreB,
          status: arena.status,
          swapped: arena.swapped ?? false,
          showPhotos: ctx.sessionShowPhotos,
          cardAnnounce: ctx.sessionCardAnnounce,
          theme: override?.theme ?? ctx.sessionTheme,
          customTheme: override?.customTheme,
          screenThemes: ctx.arenaScreenThemes.get(data.arenaId),
          fencerA: arena.currentMatch?.fencerA,
          fencerB: arena.currentMatch?.fencerB,
          refereeFeatureEnabled: ctx.sessionRefereeFeatureEnabled,
          blackCardEnabled: ctx.sessionBlackCardEnabled,
          referees: ctx.getSessionReferees(),
          refereeSelected: ctx.arenaRefereeSelected.get(data.arenaId) ?? false,
          timerDuration: isPoolMatch ? ctx.sessionPoolTimerSeconds : ctx.sessionTableTimerSeconds,
          restSeconds: ctx.sessionRestSeconds,
          ...(ctx.isTrainingMode && ctx.trainingCustomRules
            ? { trainingCustomRules: ctx.trainingCustomRules }
            : {}),
          ...(arena.status === 'finished' && {
            nextMatch: ctx.peekNextMatch(data.arenaId),
          }),
        });
      }
    });

    socket.on('join_pool', (data: { arenaId: string }) => {
      if (!data || typeof data.arenaId !== 'string' || !data.arenaId) return;
      socket.join(`pool:${data.arenaId}`);
      const poolTheme = ctx.arenaScreenThemes.get(data.arenaId)?.pool;
      if (poolTheme) {
        socket.emit('server:command', { type: 'pool:theme', variables: poolTheme.variables });
      }
    });

    socket.on('dashboard:subscribe', () => {
      socket.join('dashboard');
      // Envoyer l'état courant immédiatement
      const snapshot = ctx.buildDashboardSnapshot();
      if (snapshot) {
        socket.emit('rankings:update', { rankings: snapshot.rankings });
        socket.emit('pools:update', { pools: snapshot.pools });
        socket.emit('matches:update', { matches: snapshot.liveMatches });
        if (snapshot.eta) socket.emit('eta:update', snapshot.eta);
      }
    });

    socket.on(
      'arena_control',
      (data: { arenaId: string; action: string; scoreA?: number; scoreB?: number }) => {
        if (!data || typeof data !== 'object') return;
        // toggle_swap : inversion d'affichage déclenchée par l'écran d'arène (sans cookie)
        if (data.action !== 'toggle_swap' && !ctx.checkSocketArenaAuth(socket, data.arenaId)) {
          return;
        }
        ctx.handleArenaControl(socket, data);
      }
    );

    // Enregistrement client TV/affichage pour la télécommande
    socket.on(
      'client:register',
      (data: {
        clientType: 'arena' | 'kiosk' | 'public' | 'pool' | 'dashboard' | 'lobby' | 'referee';
        arenaId?: string;
        userAgent?: string;
        screenId?: string;
      }) => {
        if (!data || typeof data !== 'object') return;
        const now = new Date().toISOString();
        const screenId = data.screenId;
        const label = screenId ? ctx.screenLabels.get(screenId) : undefined;
        ctx.connectedClients.set(socket.id, {
          socketId: socket.id,
          clientType: data.clientType ?? 'arena',
          arenaId: data.arenaId,
          ip: normalizeIp(socket.handshake.address),
          userAgent: data.userAgent ?? '',
          connectedAt: now,
          lastSeen: now,
          label,
          screenId,
        });
        if (data.clientType === 'kiosk' && ctx.kioskThemeVariables) {
          socket.emit('server:command', {
            type: 'kiosk:theme',
            variables: ctx.kioskThemeVariables,
          });
        }
        if (data.arenaId && (data.clientType === 'referee' || data.clientType === 'public')) {
          const screenTheme = ctx.arenaScreenThemes.get(data.arenaId)?.[data.clientType];
          if (screenTheme) {
            socket.emit('server:command', {
              type: `${data.clientType}:theme`,
              variables: screenTheme.variables,
            });
          }
        }
        ctx.broadcastClientList();
      }
    );

    socket.on('client:pong', () => {
      const client = ctx.connectedClients.get(socket.id);
      if (client) {
        client.lastSeen = new Date().toISOString();
      }
    });

    // ── Format arène Sabre Laser équipe : saisie temps réel ────────────────────
    // Room dédiée `team-arena:{arenaId}`, événements `team_*` — aucun recouvrement
    // avec les événements `arena_control`/`join_arena` du scoring individuel.
    socket.on('join_team_arena', (data: { arenaId: string; role?: string }) => {
      if (!data || typeof data.arenaId !== 'string' || !data.arenaId) return;
      if (
        data.role === 'referee' &&
        !ctx.checkArenaAuth(data.arenaId, socket.handshake.headers.cookie as string)
      ) {
        socket.emit('auth_error', { message: 'Authentification requise' });
        socket.disconnect(true);
        return;
      }
      socket.join(`team-arena:${data.arenaId}`);
      socket.emit('team_arena_state', ctx.getPublicTeamArenaState(data.arenaId));
    });

    const broadcastTeamArena = (arenaId: string) => {
      ctx.io
        .to(`team-arena:${arenaId}`)
        .emit('team_arena_state', ctx.getPublicTeamArenaState(arenaId));
    };

    // Touche (simple, ou zone A/B/C = 1/3/5 en mode points) — assaut plafonné
    // à 5 touches valides cumulées, vérifié après chaque saisie.
    socket.on('team_touch', (data: { arenaId: string; side: 'A' | 'B'; points: number }) => {
      if (!ctx.checkSocketArenaAuth(socket, data?.arenaId)) return;
      if (data.side !== 'A' && data.side !== 'B') return;
      if (![1, 3, 5].includes(data.points)) return;
      const state = ctx.teamArenaState.get(data.arenaId);
      if (!state) return;
      if (!state.isLaserPoints && data.points !== 1) return;
      const bout = state.bouts[state.currentBoutIndex];
      if (!bout || bout.status === 'finished') return;
      if (data.side === 'A') state.liveScoreA += data.points;
      else state.liveScoreB += data.points;
      broadcastTeamArena(data.arenaId);
    });

    // Réinitialise l'assaut en cours (score et chrono), sans le terminer.
    socket.on('team_reset_bout', (data: { arenaId: string }) => {
      if (!ctx.checkSocketArenaAuth(socket, data?.arenaId)) return;
      const state = ctx.teamArenaState.get(data.arenaId);
      if (!state) return;
      state.liveScoreA = 0;
      state.liveScoreB = 0;
      state.elapsedAccumulatedSec = 0;
      state.timerStartedAt = null;
      broadcastTeamArena(data.arenaId);
    });

    socket.on('team_timer_start', (data: { arenaId: string }) => {
      if (!ctx.checkSocketArenaAuth(socket, data?.arenaId)) return;
      const state = ctx.teamArenaState.get(data.arenaId);
      if (!state || state.timerStartedAt !== null) return;
      state.timerStartedAt = Date.now();
      broadcastTeamArena(data.arenaId);
    });

    socket.on('team_timer_pause', (data: { arenaId: string }) => {
      if (!ctx.checkSocketArenaAuth(socket, data?.arenaId)) return;
      const state = ctx.teamArenaState.get(data.arenaId);
      if (!state || state.timerStartedAt === null) return;
      state.elapsedAccumulatedSec = ctx.teamArenaElapsedSec(state);
      state.timerStartedAt = null;
      broadcastTeamArena(data.arenaId);
    });

    // Termine l'assaut en cours (persiste le score), avance au suivant s'il en reste.
    socket.on('team_advance_bout', (data: { arenaId: string }) => {
      if (!ctx.checkSocketArenaAuth(socket, data?.arenaId)) return;
      const state = ctx.teamArenaState.get(data.arenaId);
      if (!state) return;
      const bout = state.bouts[state.currentBoutIndex];
      if (!bout || bout.status === 'finished') return;
      const scoreA = state.liveScoreA;
      const scoreB = state.liveScoreB;
      // Relais FIE : vainqueur du relais = équipe en tête au cumul ; arène : score de l'assaut
      const { cumulA, cumulB } = relayCumul(state.bouts, bout, scoreA, scoreB);
      const side =
        state.format === 'fie-relay'
          ? relayWinnerSide(cumulA, cumulB)
          : relayWinnerSide(scoreA, scoreB);
      const winnerId = side === 'A' ? bout.fencerAId : side === 'B' ? bout.fencerBId : null;
      ctx.db.updateTeamBout(bout.id, scoreA, scoreB, 'finished', winnerId);
      bout.scoreA = scoreA;
      bout.scoreB = scoreB;
      bout.status = 'finished';
      bout.winnerId = winnerId;
      state.currentBoutIndex = state.bouts.findIndex(b => b.status !== 'finished');
      state.liveScoreA = 0;
      state.liveScoreB = 0;
      state.elapsedAccumulatedSec = 0;
      state.timerStartedAt = null;
      broadcastTeamArena(data.arenaId);
    });

    // Carton d'équipe "E" (traçabilité, pas d'impact automatique sur le score).
    socket.on(
      'team_card',
      (data: { arenaId: string; teamId: string; type: 'white' | 'yellow' | 'red' | 'black' }) => {
        if (!ctx.checkSocketArenaAuth(socket, data?.arenaId)) return;
        if (!['white', 'yellow', 'red', 'black'].includes(data.type)) return;
        const state = ctx.teamArenaState.get(data.arenaId);
        if (!state) return;
        if (
          data.type === 'black' &&
          ctx.db.getCompetition(state.competitionId)?.settings?.blackCardEnabled !== true
        ) {
          return; // carton noir désactivé sur cette compétition
        }
        const { id } = ctx.db.createTeamMatchCard(
          state.matchId,
          data.teamId,
          data.type,
          'late_designation'
        );
        state.cards.push({
          id,
          teamId: data.teamId,
          type: data.type,
          createdAt: new Date().toISOString(),
        });
        broadcastTeamArena(data.arenaId);
      }
    );

    // Carton individuel du tireur en piste (relais) : escalade identique à l'application,
    // persisté en base (#1086). Pas d'impact automatique sur le score.
    socket.on(
      'team_fencer_card',
      (data: { arenaId: string; side: 'A' | 'B'; reason: CardReason }) => {
        if (!ctx.checkSocketArenaAuth(socket, data?.arenaId)) return;
        if (data.side !== 'A' && data.side !== 'B') return;
        const state = ctx.teamArenaState.get(data.arenaId);
        if (!state) return;
        if (!getAvailableReasons(state.weapon).includes(data.reason)) return;
        const bout = state.bouts[state.currentBoutIndex];
        if (!bout) return;
        const fencerId = data.side === 'A' ? bout.fencerAId : bout.fencerBId;
        const previous = ctx.db
          .getTeamBoutCards(state.matchId)
          .map(c => c.card)
          .filter(c => c.fencerId === fencerId);
        const card = createCard(state.matchId, fencerId, data.reason, previous, state.weapon);
        ctx.db.createTeamBoutCard(bout.id, card);
        state.fencerCards.push({
          id: card.id,
          boutId: bout.id,
          fencerId,
          type: card.type,
          reason: card.reason,
        });
        broadcastTeamArena(data.arenaId);
      }
    );

    // Niveau de batterie remonté par les tablettes arbitre
    socket.on('client:battery', (data: { level: number; charging: boolean }) => {
      if (!data || typeof data.level !== 'number') return;
      const client = ctx.connectedClients.get(socket.id);
      if (!client) return;
      client.battery = {
        level: Math.max(0, Math.min(1, data.level)),
        charging: !!data.charging,
        updatedAt: new Date().toISOString(),
      };
      ctx.broadcastClientList();
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      ctx.connectedClients.delete(socket.id);
      ctx.broadcastClientList();
      ctx.handleDisconnect(socket);
    });
  });
}
