/**
 * BellePoule Modern - Construction de la pile HTTP / Socket.IO et purge périodique (#1240)
 * Extrait du constructeur de RemoteScoreServer.
 * Licensed under GPL-3.0
 */
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { purgeExpiredTokens, type LoginGuard, type MinuteRateLimiter } from './auth';
import { isLocalNetworkOrigin } from './network';
import { createPublicParser } from './publicDto';

/**
 * Origine acceptée : même hôte que la page ou réseau local. Bloque les pages web tierces
 * (CSRF, WebSocket cross-site). Origin absent accepté : le polling Socket.IO (GET même
 * origine) ne l'envoie pas, et un client hors navigateur peut de toute façon le forger.
 */
export function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  try {
    if (host && new URL(origin).host === host) return true;
  } catch {
    return false;
  }
  return isLocalNetworkOrigin(origin);
}

export interface HttpStack {
  app: express.Application;
  server: ReturnType<typeof createHttpServer> | ReturnType<typeof createHttpsServer>;
  io: SocketIOServer;
}

/** Application Express, serveur HTTP(S) et Socket.IO (CORS limité au réseau local). */
export function createHttpStack(
  tlsOptions: { cert: string; key: string } | undefined,
  showPhotos: () => boolean
): HttpStack {
  const app = express();
  const server = tlsOptions
    ? createHttpsServer({ cert: tlsOptions.cert, key: tlsOptions.key }, app)
    : createHttpServer(app);
  const io = new SocketIOServer(server, {
    // 1 Mo : select_match peut transporter les photos base64 des tireurs
    maxHttpBufferSize: 1e6,
    parser: createPublicParser(showPhotos), // sans données personnelles (#1194)
    // Origine vérifiée à la poignée de main (WebSocket n'est pas soumis au CORS navigateur)
    allowRequest: (req, callback) => {
      callback(null, isAllowedOrigin(req.headers.origin, req.headers.host));
    },
    cors: {
      origin: (origin, callback) => {
        // Autoriser les requêtes sans origin (ex. Electron, curl) et le réseau local
        if (!origin) return callback(null, true);
        callback(null, isLocalNetworkOrigin(origin));
      },
      methods: ['GET', 'POST'],
    },
  });
  return { app, server, io };
}

/** Maps purgées périodiquement (évite la croissance non bornée). */
export interface CleanupTargets {
  loginGuard: LoginGuard;
  scoreLimiter: MinuteRateLimiter;
  trainerTokens: Map<string, number>;
  checkinTokens: Map<string, number>;
  arenaTokens: Map<string, Map<string, number>>;
  scoreUpdateDebounce: Map<string, number>;
}

/** Purge périodique des maps de rate-limiting/debounce et des jetons expirés. */
export function startCleanupTimer(t: CleanupTargets): ReturnType<typeof setInterval> {
  return setInterval(() => {
    const now = Date.now();
    t.loginGuard.purge(now);
    purgeExpiredTokens(t.trainerTokens, now);
    purgeExpiredTokens(t.checkinTokens, now);
    for (const tokens of t.arenaTokens.values()) purgeExpiredTokens(tokens, now);
    t.scoreLimiter.purge(now);
    for (const [key, ts] of t.scoreUpdateDebounce) {
      if (now - ts > 60_000) t.scoreUpdateDebounce.delete(key);
    }
  }, 5 * 60_000);
}
