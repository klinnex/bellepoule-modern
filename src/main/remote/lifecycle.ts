/**
 * BellePoule Modern - Cycle de vie du serveur et de la session distante (#1240)
 * Extrait de RemoteScoreServer : démarrage / arrêt du serveur HTTP, lancement et fin de session.
 * Licensed under GPL-3.0
 */
import type { RemoteScoreServer } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module (accesseurs : valeurs toujours à jour). */
export interface LifecycleContext {
  arenaCount: S['arenaCount'];
  arenaEventBuffer: S['arenaEventBuffer'];
  arenaMatchQueue: S['arenaMatchQueue'];
  arenaNextMatchIndex: S['arenaNextMatchIndex'];
  arenaTokens: S['arenaTokens'];
  arenas: S['arenas'];
  cleanupInterval: S['cleanupInterval'];
  demoPlayer: S['demoPlayer'];
  host: S['host'];
  io: S['io'];
  isTrainingMode: S['isTrainingMode'];
  kioskDataTimer: S['kioskDataTimer'];
  poolFencersCache: S['poolFencersCache'];
  poolMatchArenaOverrides: S['poolMatchArenaOverrides'];
  poolSignaturesCache: S['poolSignaturesCache'];
  port: S['port'];
  server: S['server'];
  session: S['session'];
  sessionMatchScores: S['sessionMatchScores'];
  sessionMatches: S['sessionMatches'];
  sessionPoolArenas: S['sessionPoolArenas'];
  trainingCustomRules: S['trainingCustomRules'];
  unsubscribeDb: S['unsubscribeDb'];
  useHttps: S['useHttps'];
  clearArenaCombatState: S['clearArenaCombatState'];
  getServerUrl: S['getServerUrl'];
  notifyKioskData: S['notifyKioskData'];
  stopSession: S['stopSession'];
  updateArena: S['updateArena'];
}

export function startServer(ctx: LifecycleContext): Promise<void> {
  console.log('[RemoteScoreServer] Démarrage du serveur...');
  console.log(`[RemoteScoreServer] Port: ${ctx.port}`);
  console.log(`[RemoteScoreServer] Interface: ${ctx.host}`);
  console.log(
    `[RemoteScoreServer] URL locale: ${ctx.useHttps ? 'https' : 'http'}://localhost:${ctx.port}`
  );
  console.log(`[RemoteScoreServer] URL réseau: ${ctx.getServerUrl()}`);

  return new Promise((resolve, reject) => {
    ctx.server.once('error', (err: any) => {
      console.error('[RemoteScoreServer] ERREUR DU SERVEUR:', err);
      if (err.code === 'EADDRINUSE') {
        console.error(`[RemoteScoreServer] Le port ${ctx.port} est déjà utilisé!`);
      }
      reject(err);
    });

    ctx.server.listen(ctx.port, ctx.host, () => {
      const url = ctx.getServerUrl();
      console.log(`[RemoteScoreServer] ============================================`);
      console.log(`[RemoteScoreServer] SERVEUR DÉMARRÉ AVEC SUCCÈS ✓`);
      console.log(`[RemoteScoreServer] Port: ${ctx.port}`);
      console.log(`[RemoteScoreServer] URL: ${url}`);
      console.log(`[RemoteScoreServer] Arènes disponibles: ${ctx.arenaCount}`);
      console.log(`[RemoteScoreServer] ============================================`);
      console.log(`[RemoteScoreServer] Les arbitres peuvent se connecter sur: ${url}`);
      // Switch from one-shot 'once' error handler to persistent one for runtime errors
      ctx.server.on('error', (err: any) => {
        console.error('[RemoteScoreServer] ERREUR DU SERVEUR:', err);
      });
      resolve();
    });
  });
}

/** Signale aux kiosques que les données ont changé (regroupé sur 300 ms) */
export function notifyKioskData(ctx: LifecycleContext): void {
  if (ctx.kioskDataTimer || !ctx.io) return;
  ctx.kioskDataTimer = setTimeout(() => {
    ctx.kioskDataTimer = null;
    ctx.io?.emit('kiosk:data');
  }, 300);
}

export function stopServer(ctx: LifecycleContext): void {
  ctx.unsubscribeDb?.();
  ctx.unsubscribeDb = null;
  if (ctx.kioskDataTimer) {
    clearTimeout(ctx.kioskDataTimer);
    ctx.kioskDataTimer = null;
  }
  if (ctx.cleanupInterval) {
    clearInterval(ctx.cleanupInterval);
    ctx.cleanupInterval = null;
  }
  ctx.stopSession();
  // server.close() seul laisse vivre les sockets/connexions keep-alive ouvertes :
  // les tablettes restaient connectées après l'arrêt (#1009).
  ctx.io?.disconnectSockets?.(true);
  if (ctx.server) {
    ctx.server.close();
    (ctx.server as any).closeAllConnections?.();
    console.log('Remote score server stopped');
  }
}

export function launchCompetition(ctx: LifecycleContext): void {
  if (!ctx.session) {
    console.log('[RemoteScoreServer] launchCompetition: aucune session active');
    return;
  }

  let launched = 0;
  for (const [arenaId, arena] of ctx.arenas) {
    if (arena.currentMatch && arena.currentMatch.status === 'not_started') {
      console.log(
        `[RemoteScoreServer] Lancement du match ${arena.currentMatch.id} sur arène ${arenaId}`
      );
      arena.currentMatch.status = 'ready';
      ctx.updateArena(arenaId, { status: 'ready', currentMatch: arena.currentMatch });
      launched++;
    }
  }
  console.log(`[RemoteScoreServer] ${launched} matchs lancés`);
}

export function stopSession(ctx: LifecycleContext): void {
  ctx.demoPlayer?.stop();
  ctx.demoPlayer = null;
  ctx.isTrainingMode = false;
  ctx.trainingCustomRules = null;
  ctx.session = null;
  ctx.notifyKioskData();
  ctx.sessionMatches = [];
  ctx.sessionPoolArenas = new Map();
  ctx.arenaMatchQueue.clear();
  ctx.arenaNextMatchIndex.clear();
  ctx.poolMatchArenaOverrides.clear();
  ctx.poolFencersCache.clear();
  ctx.poolSignaturesCache.clear();
  ctx.sessionMatchScores.clear();
  ctx.arenaTokens.clear();
  ctx.arenaEventBuffer.clear();
  ctx.clearArenaCombatState();
}
