/**
 * BellePoule Modern - Remote Score Entry Server
 * Web server for referees to enter scores remotely
 * Licensed under GPL-3.0
 */

import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import path from 'path';
import os from 'os';
import {
  RemoteSession,
  RemoteScoreUpdate,
  WebSocketMessage,
  Arena,
  ArenaMatch,
  ArenaUpdate,
  OrgNote,
  DisplayTheme,
  CustomTheme,
  ThemeTargetType,
  MatchSignatureRequest,
} from '../shared/types/remote';
import { CardReason, Match, MatchStatus, FencerStatus, Score, Weapon } from '../shared/types';
import { DatabaseManager } from '../database';
import { estimatePhaseEta } from '../shared/utils/phaseEta';
import {
  PASSWORD_MIN_LENGTH,
  isLocalNetworkOrigin,
  isLoginPath,
  isLoopbackAddress,
  normalizeIp,
} from './remote/network';
import type { BlackCardRecord, TeamArenaCard, TeamArenaState } from './remote/types';
import type { RouteContext } from './remote/routes/context';
import {
  LoginGuard,
  MinuteRateLimiter,
  assertPasswordStrength,
  hashPassword,
  isTokenValid,
  issueToken,
  parseCookies,
  purgeExpiredTokens,
  sendLoginLimited,
  verifyPassword,
} from './remote/auth';
import { registerPageRoutes } from './remote/routes/pageRoutes';
import { registerResultsRoutes } from './remote/routes/resultsRoutes';
import {
  registerRegistrationRoutes,
  type RegistrationRouteContext,
} from './remote/routes/registrationRoutes';
import { registerPoolRoutes, type PoolRouteContext } from './remote/routes/poolRoutes';
import { registerMatchRoutes, type MatchRouteContext } from './remote/routes/matchRoutes';
import { registerApiRoutes, type ApiRouteContext } from './remote/routes/apiRoutes';

export { PASSWORD_MIN_LENGTH };
import {
  getLaserArenaBoutCap,
  isLaserArenaBoutComplete,
} from '../features/teams/utils/laserArenaCalculations';
import { getTeamTargetRule } from '../features/teams/utils/teamCalculations';
import {
  FIE_RELAY_DURATION_SEC,
  isRelayComplete,
  relayCapFor,
  relayCumul,
  relayWinnerSide,
} from '../features/teams/utils/teamRelayLive';
import { createCard, getAvailableReasons } from '../shared/utils/cardSystem';

export class RemoteScoreServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private port: number;
  private host: string;
  private useHttps: boolean = false;
  private db: DatabaseManager;
  private session: RemoteSession | null = null;
  private arenas: Map<string, Arena> = new Map();
  private arenaCount: number = 4; // Nombre d'arènes par défaut
  private sessionWeapon: string | null = null; // Type d'arme de la compétition (L = Laser)
  private sessionPoolTimerSeconds: number = 180; // Durée chrono poules
  private sessionTableTimerSeconds: number = 180; // Durée chrono tableau
  private sessionMatches: any[] = []; // Matches passés depuis le renderer
  // Durées réelles (ms) des derniers matchs terminés sur les arènes (#1077)
  private recentMatchDurationsMs: number[] = [];
  private arenaNextMatchIndex: Map<string, number> = new Map(); // Index du prochain match par arène
  private arenaMatchQueue: Map<string, ArenaMatch[]> = new Map(); // File d'attente DE par arène
  private poolMatchArenaOverrides: Map<string, string> = new Map(); // matchId → arenaId (réassignation piste poule)
  private poolFencersCache: Map<string, any[]> = new Map(); // Tireurs par poolId (depuis le renderer)
  private sessionMatchScores: Map<string, { scoreA: any; scoreB: any; status: string }> = new Map(); // Scores en mémoire
  private sessionShowPhotos: boolean = false; // Afficher les photos des combattants avant le combat
  private sessionCardAnnounce: boolean = false; // Annoncer les cartons avec raison sur les affichages
  private sessionRefereeFeatureEnabled: boolean = false; // Fonctionnalité gestion arbitres activée
  private sessionBlackCardEnabled: boolean = false; // Carton noir activé (paramètre compétition)
  private sessionBlackCards: Map<string, BlackCardRecord> = new Map(); // fencerId → carton noir annulable
  private sessionTheme: DisplayTheme = 'dark'; // Thème visuel de l'affichage distant (global)
  private arenaThemeOverrides: Map<string, { theme: DisplayTheme; customTheme?: CustomTheme }> =
    new Map();
  private arenaScreenThemes: Map<string, Partial<Record<ThemeTargetType, CustomTheme>>> = new Map();
  private kioskThemeVariables: Record<string, string> | null = null; // Thème CSS vars pour le kiosk
  private orgNote: OrgNote | null = null; // Note d'organisation affichée sur le kiosk
  private isTrainingMode: boolean = false;
  private trainingHistory: Array<{
    id: string;
    arenaId: string;
    arenaNumber: number;
    weapon: string;
    scoreA: number;
    scoreB: number;
    durationSec: number;
    finishedAt: string;
  }> = [];
  private trainingCustomRules: {
    matchDurationSeconds: number;
    allowedZones: string[];
    disableSuddenDeath: boolean;
  } | null = null;
  private sessionLogo: string | null = null; // Logo organisateur (base64) pour kiosk et affichages publics
  private sessionWallpaper: string | null = null; // Fond d'écran (base64) affiché sur les arènes en attente
  // Format arène Sabre Laser équipe (assauts 5 touches/3min) : état de saisie
  // temps réel par arène, entièrement séparé de `this.arenas` (arènes
  // individuelles) — aucune interférence possible avec le scoring individuel.
  private teamArenaState: Map<string, TeamArenaState> = new Map();
  // Config TTS (minuteur vocal) poussée aux tablettes d'arbitrage depuis les paramètres globaux
  private ttsConfig: {
    voiceName: string | null;
    rate: number;
    announce: Record<string, boolean>;
  } = {
    voiceName: null,
    rate: 1.1,
    announce: { '60': true, '30': true, '10': true, '5': true, countdown: true, '0': true },
  };
  private currentLang: string = 'fr'; // Langue courante de l'interface (fr, en, zh-HK, ...)
  private sessionKioskViews: {
    poules: boolean;
    classement: boolean;
    direct: boolean;
    suivants: boolean;
    tableau: boolean;
  } = {
    poules: true,
    classement: true,
    direct: true,
    suivants: true,
    tableau: true,
  };

  // Webhook résultats (URL HTTPS externe configurée via Settings)
  private webhookUrl: string | null = null;

  // Inscription distante : actif pendant la phase CHECKIN, désactivé après génération des poules
  /** Fermée par défaut : ouverte par le renderer uniquement en phase d'appel (#986). */
  private registrationEnabled: boolean = false;

  // Appel distant (#919) : pointage tireurs/arbitres depuis un téléphone, phase CHECKIN seulement.
  // Mot de passe dédié obligatoire (hashé), tokens de session en cookie.
  private checkinEnabled: boolean = true;
  private checkinPassword: string | null = null;
  private checkinTokens: Map<string, number> = new Map(); // token → expiresAt
  // Espace formateurs (#989) : commentaires d'arbitrage, mot de passe indépendant des pistes
  private trainerEnabled: boolean = false;
  private trainerPassword: string | null = null;
  private trainerTokens: Map<string, number> = new Map(); // token → expiresAt

  // Stocker le contenu des fichiers HTML en mémoire pour éviter les problèmes de chemin
  private htmlFiles: Map<string, string> = new Map();

  // Client socket.io chargé en mémoire au démarrage (injecté inline dans le HTML)
  private socketIoClientJs: string | null = null;

  // Tokens d'authentification par arène (password protection)
  private arenaTokens: Map<string, Map<string, number>> = new Map(); // arène → (token → expiresAt)

  // Connexions : limites par IP / cible, blocage progressif (src/main/remote/auth.ts)
  private loginGuard = new LoginGuard(msg => this.sendDiag(msg));
  // Anti-DoS Socket.IO : connexions simultanées par IP + seau à jetons par socket
  private socketsPerIp: Map<string, number> = new Map();
  private readonly MAX_SOCKETS_PER_IP = 30;
  private readonly SOCKET_EVENT_BURST = 40;
  private readonly SOCKET_EVENTS_PER_SEC = 20;
  // X-Forwarded-For ignoré sauf derrière un reverse proxy de confiance
  private trustProxy = false;
  private cleanupInterval: NodeJS.Timeout | null = null;
  // Rate limiting des soumissions de score et des inscriptions (par IP, par minute)
  private readonly SCORE_RATE_LIMIT = 30;
  private scoreLimiter = new MinuteRateLimiter(this.SCORE_RATE_LIMIT);
  private registrationLimiter = new MinuteRateLimiter(5);
  // Signatures numériques par poule : poolId → (fencerId → base64PNG)
  private poolSignaturesCache: Map<string, Map<string, string>> = new Map();

  // Buffer d'événements par arène pour la reconnexion WebSocket (replay)
  private arenaEventBuffer: Map<string, Array<{ event: ArenaUpdate; timestamp: number }>> =
    new Map();
  private readonly EVENT_BUFFER_MAX = 50;
  private readonly EVENT_BUFFER_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // Registre des clients TV/affichage connectés (télécommande)
  private connectedClients: Map<
    string,
    {
      socketId: string;
      clientType: 'arena' | 'kiosk' | 'public' | 'pool' | 'dashboard' | 'lobby' | 'referee';
      arenaId?: string;
      ip: string;
      userAgent: string;
      connectedAt: string;
      lastSeen: string;
      label?: string;
      screenId?: string;
      battery?: { level: number; charging: boolean; updatedAt: string };
    }
  > = new Map();

  // Labels persistants par screenId (survivent aux reconnexions)
  private screenLabels: Map<string, string> = new Map();

  constructor(
    db: DatabaseManager,
    port: number = 8066,
    host: string = '0.0.0.0',
    tlsOptions?: { cert: string; key: string }
  ) {
    console.log('[RemoteScoreServer] Initialisation du serveur de saisie distante...');
    this.db = db;
    this.port = port;
    this.host = host;
    this.useHttps = !!tlsOptions;
    this.app = express();
    this.server = tlsOptions
      ? createHttpsServer({ cert: tlsOptions.cert, key: tlsOptions.key }, this.app)
      : createHttpServer(this.app);
    // Limiter CORS au réseau local (localhost + LAN) pour la sécurité
    this.io = new SocketIOServer(this.server, {
      // 1 Mo : select_match peut transporter les photos base64 des tireurs
      maxHttpBufferSize: 1e6,
      // Origine vérifiée à la poignée de main (WebSocket n'est pas soumis au CORS navigateur)
      allowRequest: (req, callback) => {
        callback(null, this.isAllowedOrigin(req.headers.origin, req.headers.host));
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

    // Purge périodique des maps de rate-limiting/debounce (évite la croissance non bornée)
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      this.loginGuard.purge(now);
      purgeExpiredTokens(this.trainerTokens, now);
      purgeExpiredTokens(this.checkinTokens, now);
      for (const tokens of this.arenaTokens.values()) purgeExpiredTokens(tokens, now);
      this.scoreLimiter.purge(now);
      for (const [key, ts] of this.scoreUpdateDebounce) {
        if (now - ts > 60_000) this.scoreUpdateDebounce.delete(key);
      }
    }, 5 * 60_000);

    // Charger le client socket.io AVANT le HTML (injection inline dans loadHtmlFiles)
    this.loadSocketIoClient();
    // Charger les fichiers HTML en mémoire au démarrage
    this.loadHtmlFiles();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
    this.initializeArenas();
    console.log(`[RemoteScoreServer] Serveur initialisé avec ${this.arenaCount} arènes`);
  }

  // Localiser et charger le client socket.io en mémoire.
  // Plusieurs stratégies pour couvrir dev, app.asar et asar.unpacked.
  private loadSocketIoClient(): void {
    const fs = require('fs');
    const candidates: string[] = [];

    // 1) Fichier copié dans dist/remote au build (cas packagé : node_modules absent)
    candidates.push(
      path.join(__dirname, '../remote/socket.io.min.js'), // dist/main → dist/remote
      ...(process.resourcesPath
        ? [
            path.join(process.resourcesPath, 'app.asar.unpacked', 'dist/remote/socket.io.min.js'),
            path.join(process.resourcesPath, 'app.asar', 'dist/remote/socket.io.min.js'),
          ]
        : []),
      path.join(__dirname, '../../src/remote/socket.io.min.js') // fallback dev sans webpack
    );

    // 2) Résolution via node_modules (dev / si présent dans le package)
    for (const sub of ['client-dist/socket.io.min.js', 'client-dist/socket.io.js']) {
      try {
        candidates.push(require.resolve(`socket.io/${sub}`));
      } catch {
        /* ignore */
      }
    }

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          this.socketIoClientJs = fs.readFileSync(candidate, 'utf-8');
          console.log(`[RemoteScoreServer] Client socket.io chargé depuis: ${candidate}`);
          return;
        }
      } catch (err) {
        console.error(`[RemoteScoreServer] Erreur lecture client socket.io ${candidate}:`, err);
      }
    }

    console.error(
      '[RemoteScoreServer] ERREUR: client socket.io introuvable! Chemins testés:',
      candidates
    );
  }

  // Charger les fichiers HTML en mémoire pour éviter les problèmes de chemin
  private loadHtmlFiles(): void {
    const fs = require('fs');
    const isDev = process.env.NODE_ENV === 'development';

    // Liste des fichiers à charger
    const filesToLoad = [
      'referee.html',
      'arena.html',
      'dashboard.html',
      'index.html',
      'pool.html',
      'pool-ocr.html',
      'kiosk.html',
      'lobby.html',
      'login.html',
      'public.html',
      'overlay.html',
      'overlay-config.html',
      'register.html',
      'checkin.html',
      'trainer.html',
      'matchs.html',
      'tireur.html',
      'teamArena.html',
      'teamReferee.html',
    ];

    // Essayer plusieurs chemins pour trouver les fichiers
    const possiblePaths = isDev
      ? [
          path.join(__dirname, '../remote'), // dist/remote/ (après webpack)
          path.join(__dirname, '../../src/remote'), // src/remote/ (sans webpack)
        ]
      : [
          // process.resourcesPath n'existe que sous Electron (pas en tests Node)
          ...(process.resourcesPath
            ? [path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'remote')]
            : []),
          path.join(__dirname, '..', 'remote').replace('app.asar', 'app.asar.unpacked'),
          path.join(__dirname, '..', 'remote'),
          path.join(__dirname, '../../src/remote'), // fallback source sans webpack
        ];

    console.log('[RemoteScoreServer] Chargement des fichiers HTML...');

    for (const basePath of possiblePaths) {
      console.log(`[RemoteScoreServer] Essai chemin: ${basePath}`);

      try {
        if (fs.existsSync(basePath)) {
          console.log(`[RemoteScoreServer] Chemin trouvé: ${basePath}`);

          for (const file of filesToLoad) {
            const filePath = path.join(basePath, file);
            if (fs.existsSync(filePath)) {
              this.htmlFiles.set(file, fs.readFileSync(filePath, 'utf-8'));
              console.log(`[RemoteScoreServer] Chargé: ${file}`);
            } else {
              console.log(`[RemoteScoreServer] Fichier non trouvé: ${filePath}`);
            }
          }

          // Si on a chargé au moins un fichier, on utilise ce chemin
          if (this.htmlFiles.size > 0) {
            console.log(
              `[RemoteScoreServer] ${this.htmlFiles.size} fichiers chargés depuis: ${basePath}`
            );
            break;
          }
        }
      } catch (err) {
        console.error(`[RemoteScoreServer] Erreur avec chemin ${basePath}:`, err);
      }
    }

    if (this.htmlFiles.size === 0) {
      console.error('[RemoteScoreServer] ERREUR: Aucun fichier HTML chargé!');
    } else {
      console.log(
        `[RemoteScoreServer] Chargement terminé: ${Array.from(this.htmlFiles.keys()).join(', ')}`
      );
    }

    // Injecter le client socket.io inline dans chaque HTML : élimine la requête
    // séparée /bp-sio.js (cache service worker, résolution de chemin runtime…).
    if (this.socketIoClientJs) {
      const inlineTag = `<script>${this.socketIoClientJs}</script>`;
      for (const [name, content] of this.htmlFiles) {
        // Nouvelle instance de regex à chaque itération (évite l'état lastIndex partagé).
        // Remplaçant en fonction : une chaîne interpréterait les motifs spéciaux `$&`, `$'`…
        // présents dans le client minifié (socket.io 4.8.4 : `this.$&&…`) → script corrompu (#1009).
        const updated = content.replace(
          /<script\s+src=["'](?:\/socket\.io\.min\.js|\/bp-sio\.js|\/socket\.io\/socket\.io\.js)["']><\/script>/g,
          () => inlineTag
        );
        if (updated !== content) this.htmlFiles.set(name, updated);
      }
      console.log('[RemoteScoreServer] Client socket.io injecté inline dans le HTML ✓');
    } else {
      console.error(
        '[RemoteScoreServer] ATTENTION: client socket.io non chargé, fallback sur /bp-sio.js'
      );
    }
  }

  // Servir un fichier HTML depuis la mémoire
  private sendHtmlFromMemory(filename: string, res: express.Response): void {
    const html = this.htmlFiles.get(filename);
    if (html) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      console.error(`[RemoteScoreServer] ERREUR: Fichier ${filename} non trouvé en mémoire`);
      res.status(500).send(`Erreur: fichier ${filename} non trouvé`);
    }
  }

  // ── Format arène Sabre Laser équipe : saisie temps réel ──────────────────────
  // API publique appelée depuis les IPC handlers (renderer → main → ici), suivant
  // le même modèle que les arènes individuelles mais sur un état séparé.

  /** Assigne une rencontre d'équipe à une arène pour saisie temps réel. */
  public setTeamArenaMatch(arenaId: string, matchId: string, isLaserPoints: boolean): boolean {
    const detail = this.db.getTeamMatchDetail(matchId);
    if (!detail) return false;
    const competition = this.db.getCompetition(detail.competitionId);
    const settings = competition?.settings;
    const weapon = (competition?.weapon ?? Weapon.EPEE) as Weapon;
    const rule = getTeamTargetRule(
      weapon,
      settings?.minTeamSize ?? 3,
      settings?.laserTeamMode ?? 'touches',
      settings?.teamRelayStepSize ?? 5
    );
    this.teamArenaState.set(arenaId, {
      format: settings?.teamFormat === 'laser-arena' ? 'laser-arena' : 'fie-relay',
      weapon,
      relayRule: { stepSize: rule.stepSize, target: rule.target },
      fencerCards: this.db.getTeamBoutCards(matchId).map(({ boutId, card }) => ({
        id: card.id,
        boutId,
        fencerId: card.fencerId,
        type: card.type,
        reason: card.reason,
      })),
      matchId: detail.id,
      competitionId: detail.competitionId,
      teamAId: detail.teamAId,
      teamAName: detail.teamAName,
      teamBId: detail.teamBId,
      teamBName: detail.teamBName,
      isLaserPoints,
      bouts: detail.bouts,
      currentBoutIndex: detail.bouts.findIndex(b => b.status !== 'finished'),
      liveScoreA: 0,
      liveScoreB: 0,
      elapsedAccumulatedSec: 0,
      timerStartedAt: null,
      cards: this.db.getTeamMatchCards(matchId) as TeamArenaCard[],
    });
    this.io
      .to(`team-arena:${arenaId}`)
      .emit('team_arena_state', this.getPublicTeamArenaState(arenaId));
    return true;
  }

  /** Retire l'assignation d'une arène (fin de saisie temps réel pour cette arène). */
  public clearTeamArenaMatch(arenaId: string): void {
    this.teamArenaState.delete(arenaId);
    this.io.to(`team-arena:${arenaId}`).emit('team_arena_state', null);
  }

  private teamArenaElapsedSec(state: TeamArenaState): number {
    const running = state.timerStartedAt ? (Date.now() - state.timerStartedAt) / 1000 : 0;
    return state.elapsedAccumulatedSec + running;
  }

  private getPublicTeamArenaState(arenaId: string): unknown {
    const state = this.teamArenaState.get(arenaId);
    if (!state) return null;
    const currentBout = state.bouts[state.currentBoutIndex] ?? null;
    const elapsedSec = this.teamArenaElapsedSec(state);
    const relay = state.format === 'fie-relay';
    const { cumulA, cumulB } = relayCumul(
      state.bouts,
      currentBout,
      state.liveScoreA,
      state.liveScoreB
    );
    const relayCap = currentBout ? relayCapFor(currentBout.boutOrder, state.relayRule) : 0;
    const cap = relay
      ? { maxTouches: relayCap, maxDurationSec: FIE_RELAY_DURATION_SEC }
      : getLaserArenaBoutCap();
    const boutComplete = !currentBout
      ? false
      : relay
        ? isRelayComplete(cumulA, cumulB, relayCap, elapsedSec)
        : isLaserArenaBoutComplete(state.liveScoreA, state.liveScoreB, elapsedSec, cap);
    return {
      format: state.format,
      cumulA,
      cumulB,
      target: state.relayRule.target,
      fencerCards: state.fencerCards,
      cardReasons: relay ? getAvailableReasons(state.weapon) : [],
      matchId: state.matchId,
      teamAId: state.teamAId,
      teamAName: state.teamAName,
      teamBId: state.teamBId,
      teamBName: state.teamBName,
      isLaserPoints: state.isLaserPoints,
      bouts: state.bouts,
      currentBoutIndex: state.currentBoutIndex,
      currentBout,
      liveScoreA: state.liveScoreA,
      liveScoreB: state.liveScoreB,
      elapsedSec,
      timerRunning: state.timerStartedAt !== null,
      cap,
      boutComplete,
      matchComplete: !currentBout,
      cards: state.cards,
      blackCardEnabled:
        this.db.getCompetition(state.competitionId)?.settings?.blackCardEnabled === true,
    };
  }

  // Délégués vers src/main/remote/auth.ts (noms conservés pour les routes existantes)
  private parseCookies = parseCookies;
  private hashPassword = hashPassword;
  private verifyPassword = verifyPassword;
  private assertPasswordStrength = assertPasswordStrength;
  private issueToken = issueToken;
  private isTokenValid = isTokenValid;

  /** Version d'une arène sans secret, seule forme autorisée vers les clients HTTP/Socket.IO. */
  private toPublicArena(arena: Arena): Omit<Arena, 'password'> & { hasPassword: boolean } {
    const { password, ...rest } = arena;
    return { ...rest, hasPassword: !!password };
  }

  private checkArenaAuth(arenaId: string, cookieHeader: string | undefined): boolean {
    const fullId = arenaId.startsWith('arena') ? arenaId : `arena${arenaId}`;
    const arena = this.arenas.get(fullId);
    if (!arena?.password) return true;
    const token = this.parseCookies(cookieHeader)[`bp_token_${fullId}`];
    return this.isTokenValid(this.arenaTokens.get(fullId), token);
  }

  /** Auth d'une socket pour une arène : re-vérifiée à chaque événement mutant
   *  (le cookie du handshake suffit, pas besoin d'avoir rejoint la room). */
  private checkSocketArenaAuth(socket: any, arenaId: unknown): boolean {
    if (typeof arenaId !== 'string' || !arenaId) return false;
    if (this.checkArenaAuth(arenaId, socket.handshake?.headers?.cookie as string)) return true;
    socket.emit('auth_error', { message: 'Authentification requise' });
    return false;
  }

  private static normalizeIp = normalizeIp;
  private static isLoopbackAddress = isLoopbackAddress;

  /** Origine acceptée : même hôte que la page ou réseau local. Bloque les pages web tierces
   *  (CSRF, WebSocket cross-site). Origin absent accepté : le polling Socket.IO (GET même
   *  origine) ne l'envoie pas, et un client hors navigateur peut de toute façon le forger. */
  private isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
    if (!origin) return true;
    try {
      if (host && new URL(origin).host === host) return true;
    } catch {
      return false;
    }
    return isLocalNetworkOrigin(origin);
  }

  /** Requête émise depuis la machine hôte (loopback uniquement, sans X-Forwarded-For). */
  private isLoopbackRequest(req: express.Request): boolean {
    return RemoteScoreServer.isLoopbackAddress(req.socket?.remoteAddress);
  }

  /** Middleware : exige l'auth de l'arène `:arenaId`. */
  private requireArenaAuth: express.RequestHandler<{ arenaId: string }> = (req, res, next) => {
    if (!this.checkArenaAuth(req.params.arenaId, req.headers.cookie)) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }
    next();
  };

  /** Middleware : réservé à la machine hôte. */
  private requireLoopback: express.RequestHandler = (req, res, next) => {
    if (!this.isLoopbackRequest(req)) {
      res.status(403).json({ error: 'Accès réservé à la machine hôte' });
      return;
    }
    next();
  };

  /** Vérifie qu'au moins un token d'arène valide est présent dans le cookie.
   *  Si aucune arène n'a de mot de passe, accès libre (comportement par défaut). */
  private hasAnyValidToken(cookieHeader: string | undefined): boolean {
    const hasPasswordProtection = Array.from(this.arenas.values()).some(a => !!a.password);
    if (!hasPasswordProtection) return true;
    if (!cookieHeader) return false;
    const cookies = this.parseCookies(cookieHeader);
    for (const [arenaId, tokens] of this.arenaTokens) {
      const token = cookies[`bp_token_${arenaId}`];
      if (this.isTokenValid(tokens, token)) return true;
    }
    return false;
  }

  private static isLoginPath = isLoginPath;

  private setupMiddleware(): void {
    console.log('[RemoteScoreServer] Configuration du middleware...');
    // Limite de taille : les photos d'inscription (base64 ~700KB) sont le plus gros payload légitime.
    // Routes de connexion : 4 Ko suffisent (mot de passe seul).
    const smallJson = express.json({ limit: '4kb' });
    const largeJson = express.json({ limit: '1mb' });
    this.app.use((req, res, next) =>
      (RemoteScoreServer.isLoginPath(req.path) ? smallJson : largeJson)(req, res, next)
    );

    // Requêtes mutantes : refus d'une Origin étrangère (page web tierce → CSRF).
    this.app.use((req, res, next) => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
      if (!this.isAllowedOrigin(req.headers.origin, req.headers.host)) {
        res.status(403).json({ error: 'Origine refusée' });
        return;
      }
      next();
    });

    // En-têtes de sécurité de base. Pas de restriction script-src/style-src : les pages
    // remote (arena/kiosk/overlay/...) utilisent des <script> inline sans nonce.
    // frame-ancestors 'self' remplace X-Frame-Options (overlay-config.html prévisualise
    // overlay.html dans une iframe same-origin).
    this.app.use((_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader(
        'Content-Security-Policy',
        "frame-ancestors 'self'; object-src 'none'; base-uri 'self'"
      );
      next();
    });

    // Déterminer le chemin des fichiers remote
    let remotePath: string;
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
      // En développement
      remotePath = path.join(__dirname, '../remote'); // dist/remote/ (après webpack)
      if (!require('fs').existsSync(remotePath)) {
        remotePath = path.join(__dirname, '../../src/remote'); // src/remote/ (sans webpack)
      }
    } else {
      // En production - utiliser process.resourcesPath qui est plus fiable
      // Les fichiers unpacked sont dans resourcesPath/app.asar.unpacked/dist/remote
      // __dirname est dans resourcesPath/app.asar/dist/main/

      // Essayer plusieurs chemins possibles
      const possiblePaths = [
        // Chemin standard avec asarUnpack (process.resourcesPath n'existe que sous Electron)
        ...(process.resourcesPath
          ? [path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'remote')]
          : []),
        // Chemin relatif depuis __dirname
        path.join(__dirname, '..', 'remote').replace('app.asar', 'app.asar.unpacked'),
        // Dernier recours: chemin relatif standard
        path.join(__dirname, '..', 'remote'),
        // Fallback source sans webpack
        path.join(__dirname, '../../src/remote'),
      ];

      remotePath = '';
      const fs = require('fs');
      for (const p of possiblePaths) {
        console.log(`[RemoteScoreServer] Vérification chemin: ${p}`);
        if (fs.existsSync(p)) {
          remotePath = p;
          console.log(`[RemoteScoreServer] Chemin valide trouvé: ${p}`);
          break;
        }
      }

      if (!remotePath) {
        console.error('[RemoteScoreServer] ERREUR: Aucun chemin valide trouvé!');
        console.error('[RemoteScoreServer] Chemins testés:', possiblePaths);
        // Utiliser le dernier chemin comme fallback
        remotePath = possiblePaths[possiblePaths.length - 1];
      }
    }

    console.log('[RemoteScoreServer] Chemin des fichiers distants:', remotePath);
    console.log('[RemoteScoreServer] NODE_ENV:', process.env.NODE_ENV || 'production');
    console.log('[RemoteScoreServer] __dirname:', __dirname);
    console.log('[RemoteScoreServer] process.resourcesPath:', process.resourcesPath);

    // Vérifier que le dossier existe
    try {
      const fs = require('fs');
      if (fs.existsSync(remotePath)) {
        console.log('[RemoteScoreServer] Dossier distant trouvé ✓');
        const files = fs.readdirSync(remotePath);
        console.log('[RemoteScoreServer] Fichiers disponibles:', files);
      } else {
        console.error('[RemoteScoreServer] ERREUR: Dossier distant non trouvé!', remotePath);
      }
    } catch (err) {
      console.error('[RemoteScoreServer] ERREUR lors de la vérification du dossier:', err);
    }

    this.app.use(express.static(remotePath));

    this.app.use((req, res, next) => {
      console.log(`[RemoteScoreServer] ${req.method} ${req.url} - ${new Date().toISOString()}`);
      // Restreindre CORS au réseau local uniquement (même logique que Socket.IO)
      const origin = req.headers.origin;
      if (origin && isLocalNetworkOrigin(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
      }
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });
    console.log('[RemoteScoreServer] Middleware configuré ✓');
  }

  /** État exposé aux modules de routes (src/main/remote/routes/), en accesseurs. */
  private routeContext(): RouteContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      get app() {
        return self.app;
      },
      get db() {
        return self.db;
      },
      get session() {
        return self.session;
      },
      get isTrainingMode() {
        return self.isTrainingMode;
      },
      get arenas() {
        return self.arenas;
      },
      get sessionMatches() {
        return self.sessionMatches;
      },
      get sessionMatchScores() {
        return self.sessionMatchScores;
      },
      get trainingHistory() {
        return self.trainingHistory;
      },
      sendHtmlFromMemory: (filename, res) => self.sendHtmlFromMemory(filename, res),
      checkArenaAuth: (arenaId, cookie) => self.checkArenaAuth(arenaId, cookie),
      hasAnyValidToken: cookie => self.hasAnyValidToken(cookie),
      computePhaseEta: () => self.computePhaseEta(),
    };
  }

  /** Contexte des routes inscription / appel / formateurs : état + auth (accesseurs). */
  private registrationRouteContext(): RegistrationRouteContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return Object.defineProperties(this.routeContext(), {
      registrationEnabled: { get: () => self.registrationEnabled },
      checkinEnabled: { get: () => self.checkinEnabled },
      checkinPassword: { get: () => self.checkinPassword },
      checkinTokens: { get: () => self.checkinTokens },
      trainerEnabled: { get: () => self.trainerEnabled },
      trainerPassword: { get: () => self.trainerPassword },
      trainerTokens: { get: () => self.trainerTokens },
      getClientIp: { value: (req: express.Request) => self.getClientIp(req) },
      checkRegistrationRateLimit: { value: (ip: string) => self.checkRegistrationRateLimit(ip) },
      checkLoginAllowed: {
        value: (ip: string, target: string) => self.checkLoginAllowed(ip, target),
      },
      sendLoginLimited: { value: sendLoginLimited },
      verifyPassword: { value: verifyPassword },
      issueToken: { value: issueToken },
      recordLoginFailure: {
        value: (ip: string, target: string) => self.recordLoginFailure(ip, target),
      },
      recordLoginSuccess: { value: (ip: string) => self.recordLoginSuccess(ip) },
      checkCheckinAuth: { value: (cookie: string | undefined) => self.checkCheckinAuth(cookie) },
      checkTrainerAuth: { value: (cookie: string | undefined) => self.checkTrainerAuth(cookie) },
      checkinGuard: { value: (cookie: string | undefined) => self.checkinGuard(cookie) },
      trainerGuard: { value: (cookie: string | undefined) => self.trainerGuard(cookie) },
      findArenaOfReferee: { value: (refereeId: string) => self.findArenaOfReferee(refereeId) },
      arenaMatchLabel: { value: (arena: Arena) => self.arenaMatchLabel(arena) },
    }) as RegistrationRouteContext;
  }

  /** Contexte des routes de poule : contexte inscription + état des poules (accesseurs). */
  private poolRouteContext(): PoolRouteContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return Object.defineProperties(this.registrationRouteContext(), {
      io: { get: () => self.io },
      arenaTokens: { get: () => self.arenaTokens },
      poolFencersCache: { get: () => self.poolFencersCache },
      poolSignaturesCache: { get: () => self.poolSignaturesCache },
      checkScoreRateLimit: { value: (ip: string) => self.checkScoreRateLimit(ip) },
      resolveReferee: { value: (id?: string | null) => self.resolveReferee(id) },
      broadcastDashboardUpdate: { value: () => self.broadcastDashboardUpdate() },
    }) as PoolRouteContext;
  }

  /** Contexte des routes de matchs : contexte poules + files, cartons noirs (accesseurs). */
  private matchRouteContext(): MatchRouteContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return Object.defineProperties(this.poolRouteContext(), {
      arenaMatchQueue: { get: () => self.arenaMatchQueue },
      poolMatchArenaOverrides: { get: () => self.poolMatchArenaOverrides },
      sessionBlackCardEnabled: { get: () => self.sessionBlackCardEnabled },
      sessionBlackCards: { get: () => self.sessionBlackCards },
      applySmartMatchOrder: { value: (m: Match[]) => self.applySmartMatchOrder(m) },
      arenaHomePoolId: { value: (a: Arena) => self.arenaHomePoolId(a) },
      broadcastMessage: { value: (msg: WebSocketMessage) => self.broadcastMessage(msg) },
      cancelBlackCard: { value: (a: string, f: string) => self.cancelBlackCard(a, f) },
      finishArenaMatch: { value: (a: string) => self.finishArenaMatch(a) },
      formatFencerName: { value: (f: unknown) => self.formatFencerName(f) },
      getArenaBlackCards: { value: (a: string) => self.getArenaBlackCards(a) },
      guestQueue: { value: (a: string) => self.guestQueue(a) },
      isMatchPlayable: { value: (m: Match | ArenaMatch) => self.isMatchPlayable(m) },
      isPendingMatch: { value: (m: ArenaMatch) => self.isPendingMatch(m) },
      resolvePoolReferee: { value: (id?: string | null) => self.resolvePoolReferee(id) },
      restorableStatus: { value: (st: FencerStatus | undefined) => self.restorableStatus(st) },
      sendDiag: { value: (msg: string) => self.sendDiag(msg) },
      updateMatchScore: {
        value: (id: string, u: RemoteScoreUpdate) => self.updateMatchScore(id, u),
      },
    }) as MatchRouteContext;
  }

  /** Contexte de l'API : contexte matchs + configuration de session (accesseurs). */
  private apiRouteContext(): ApiRouteContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return Object.defineProperties(this.matchRouteContext(), {
      session: {
        get: () => self.session,
        set: (value: RemoteSession | null) => {
          self.session = value;
        },
      },
      port: { get: () => self.port },
      currentLang: { get: () => self.currentLang },
      socketIoClientJs: { get: () => self.socketIoClientJs },
      sessionWeapon: { get: () => self.sessionWeapon },
      sessionKioskViews: { get: () => self.sessionKioskViews },
      orgNote: { get: () => self.orgNote },
      sessionLogo: { get: () => self.sessionLogo },
      sessionWallpaper: { get: () => self.sessionWallpaper },
      trainingCustomRules: { get: () => self.trainingCustomRules },
      ttsConfig: { get: () => self.ttsConfig },
      arenaCards: { get: () => self.arenaCards },
      arenaTouches: { get: () => self.arenaTouches },
      arenaSuddenDeath: { get: () => self.arenaSuddenDeath },
      arenaWaitingOvertime: { get: () => self.arenaWaitingOvertime },
      requireArenaAuth: { get: () => self.requireArenaAuth },
      requireLoopback: { get: () => self.requireLoopback },
      assignMatchToArena: {
        value: (a: string, m: ArenaMatch, fromReferee?: boolean) =>
          self.assignMatchToArena(a, m, fromReferee),
      },
      createSession: { value: (c: string, n: number) => self.createSession(c, n) },
      getAllArenas: { value: () => self.getAllArenas() },
      getArena: { value: (a: string) => self.getArena(a) },
      getLocalIPAddress: { value: () => self.getLocalIPAddress() },
      getServerUrl: { value: () => self.getServerUrl() },
      pauseArenaMatch: { value: (a: string) => self.pauseArenaMatch(a) },
      startArenaMatch: { value: (a: string) => self.startArenaMatch(a) },
      stopSession: { value: () => self.stopSession() },
      toPublicArena: { value: (a: Arena) => self.toPublicArena(a) },
      updateArenaScore: {
        value: (a: string, sa: number, sb: number) => self.updateArenaScore(a, sa, sb),
      },
    }) as ApiRouteContext;
  }

  private setupRoutes(): void {
    console.log('[RemoteScoreServer] Configuration des routes...');
    registerApiRoutes(this.apiRouteContext());
    registerPageRoutes(this.routeContext());
    registerRegistrationRoutes(this.registrationRouteContext());
    registerPoolRoutes(this.poolRouteContext());
    registerMatchRoutes(this.matchRouteContext());
    registerResultsRoutes(this.routeContext());
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: any) => {
      console.log('Client connected:', socket.id);

      // Toute exception d'un handler reste locale : sans ce garde, une donnée nulle
      // (ex. `join_arena` null) remonte en uncaughtException et gèle l'app (#993).
      const rawOn = socket.on.bind(socket);
      socket.on = (event: string, handler: (...args: unknown[]) => unknown) =>
        rawOn(event, (...args: unknown[]) => {
          try {
            return handler(...args);
          } catch (err) {
            this.sendDiag(
              `[Sécurité] Événement socket « ${event} » rejeté : ${(err as Error)?.message}`
            );
          }
        });
      socket.on('error', (err: Error) => {
        console.error('Socket.IO error', socket.id, err?.message);
      });

      // Plafond de connexions simultanées par IP
      const clientIp = RemoteScoreServer.normalizeIp(socket.handshake?.address);
      const count = (this.socketsPerIp.get(clientIp) ?? 0) + 1;
      if (count > this.MAX_SOCKETS_PER_IP && !RemoteScoreServer.isLoopbackAddress(clientIp)) {
        this.sendDiag(`[Sécurité] Trop de connexions socket depuis ${clientIp} — refusée`);
        socket.disconnect(true);
        return;
      }
      this.socketsPerIp.set(clientIp, count);
      socket.on('disconnect', () => {
        const n = (this.socketsPerIp.get(clientIp) ?? 1) - 1;
        if (n <= 0) this.socketsPerIp.delete(clientIp);
        else this.socketsPerIp.set(clientIp, n);
      });

      // Seau à jetons : rafale de SOCKET_EVENT_BURST, recharge SOCKET_EVENTS_PER_SEC/s
      let tokens = this.SOCKET_EVENT_BURST;
      let lastRefill = Date.now();
      socket.use?.((_packet: unknown, next: (err?: Error) => void) => {
        const now = Date.now();
        tokens = Math.min(
          this.SOCKET_EVENT_BURST,
          tokens + ((now - lastRefill) / 1000) * this.SOCKET_EVENTS_PER_SEC
        );
        lastRefill = now;
        if (tokens < 1) {
          this.sendDiag(`[Sécurité] Flood socket depuis ${clientIp} — déconnecté`);
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
          if (!this.checkArenaAuth(data.arenaId, socket.handshake.headers.cookie as string)) {
            socket.emit('auth_error', { message: 'Authentification requise' });
            socket.disconnect(true);
            return;
          }
        }
        socket.join(`arena:${data.arenaId}`);

        const arena = this.getArena(data.arenaId);
        if (!arena && this.session) {
          // Arène inconnue mais session active → débloquer l'arbitre
          socket.emit(`arena:${data.arenaId}:update`, {
            arenaId: data.arenaId,
            match: null,
            status: 'idle',
            showPhotos: this.sessionShowPhotos,
            cardAnnounce: this.sessionCardAnnounce,
            theme: this.sessionTheme,
            refereeFeatureEnabled: this.sessionRefereeFeatureEnabled,
            blackCardEnabled: this.sessionBlackCardEnabled,
            referees: this.getSessionReferees(),
          });
        }
        if (arena) {
          const override = this.arenaThemeOverrides.get(data.arenaId);

          // Replay des événements manqués si lastSeen fourni
          if (data.lastSeen && data.lastSeen > 0) {
            const buf = this.arenaEventBuffer.get(data.arenaId) ?? [];
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
            showPhotos: this.sessionShowPhotos,
            cardAnnounce: this.sessionCardAnnounce,
            theme: override?.theme ?? this.sessionTheme,
            customTheme: override?.customTheme,
            screenThemes: this.arenaScreenThemes.get(data.arenaId),
            fencerA: arena.currentMatch?.fencerA,
            fencerB: arena.currentMatch?.fencerB,
            refereeFeatureEnabled: this.sessionRefereeFeatureEnabled,
            blackCardEnabled: this.sessionBlackCardEnabled,
            referees: this.getSessionReferees(),
            refereeSelected: this.arenaRefereeSelected.get(data.arenaId) ?? false,
            timerDuration: isPoolMatch
              ? this.sessionPoolTimerSeconds
              : this.sessionTableTimerSeconds,
            ...(this.isTrainingMode && this.trainingCustomRules
              ? { trainingCustomRules: this.trainingCustomRules }
              : {}),
            ...(arena.status === 'finished' && {
              nextMatch: this.peekNextMatch(data.arenaId),
            }),
          });
        }
      });

      socket.on('join_pool', (data: { arenaId: string }) => {
        if (!data || typeof data.arenaId !== 'string' || !data.arenaId) return;
        socket.join(`pool:${data.arenaId}`);
        const poolTheme = this.arenaScreenThemes.get(data.arenaId)?.pool;
        if (poolTheme) {
          socket.emit('server:command', { type: 'pool:theme', variables: poolTheme.variables });
        }
      });

      socket.on('dashboard:subscribe', () => {
        socket.join('dashboard');
        // Envoyer l'état courant immédiatement
        const snapshot = this.buildDashboardSnapshot();
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
          if (data.action !== 'toggle_swap' && !this.checkSocketArenaAuth(socket, data.arenaId)) {
            return;
          }
          this.handleArenaControl(socket, data);
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
          const label = screenId ? this.screenLabels.get(screenId) : undefined;
          this.connectedClients.set(socket.id, {
            socketId: socket.id,
            clientType: data.clientType ?? 'arena',
            arenaId: data.arenaId,
            ip: RemoteScoreServer.normalizeIp(socket.handshake.address),
            userAgent: data.userAgent ?? '',
            connectedAt: now,
            lastSeen: now,
            label,
            screenId,
          });
          if (data.clientType === 'kiosk' && this.kioskThemeVariables) {
            socket.emit('server:command', {
              type: 'kiosk:theme',
              variables: this.kioskThemeVariables,
            });
          }
          if (data.arenaId && (data.clientType === 'referee' || data.clientType === 'public')) {
            const screenTheme = this.arenaScreenThemes.get(data.arenaId)?.[data.clientType];
            if (screenTheme) {
              socket.emit('server:command', {
                type: `${data.clientType}:theme`,
                variables: screenTheme.variables,
              });
            }
          }
          this.broadcastClientList();
        }
      );

      socket.on('client:pong', () => {
        const client = this.connectedClients.get(socket.id);
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
          !this.checkArenaAuth(data.arenaId, socket.handshake.headers.cookie as string)
        ) {
          socket.emit('auth_error', { message: 'Authentification requise' });
          socket.disconnect(true);
          return;
        }
        socket.join(`team-arena:${data.arenaId}`);
        socket.emit('team_arena_state', this.getPublicTeamArenaState(data.arenaId));
      });

      const broadcastTeamArena = (arenaId: string) => {
        this.io
          .to(`team-arena:${arenaId}`)
          .emit('team_arena_state', this.getPublicTeamArenaState(arenaId));
      };

      // Touche (simple, ou zone A/B/C = 1/3/5 en mode points) — assaut plafonné
      // à 5 touches valides cumulées, vérifié après chaque saisie.
      socket.on('team_touch', (data: { arenaId: string; side: 'A' | 'B'; points: number }) => {
        if (!this.checkSocketArenaAuth(socket, data?.arenaId)) return;
        if (data.side !== 'A' && data.side !== 'B') return;
        if (![1, 3, 5].includes(data.points)) return;
        const state = this.teamArenaState.get(data.arenaId);
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
        if (!this.checkSocketArenaAuth(socket, data?.arenaId)) return;
        const state = this.teamArenaState.get(data.arenaId);
        if (!state) return;
        state.liveScoreA = 0;
        state.liveScoreB = 0;
        state.elapsedAccumulatedSec = 0;
        state.timerStartedAt = null;
        broadcastTeamArena(data.arenaId);
      });

      socket.on('team_timer_start', (data: { arenaId: string }) => {
        if (!this.checkSocketArenaAuth(socket, data?.arenaId)) return;
        const state = this.teamArenaState.get(data.arenaId);
        if (!state || state.timerStartedAt !== null) return;
        state.timerStartedAt = Date.now();
        broadcastTeamArena(data.arenaId);
      });

      socket.on('team_timer_pause', (data: { arenaId: string }) => {
        if (!this.checkSocketArenaAuth(socket, data?.arenaId)) return;
        const state = this.teamArenaState.get(data.arenaId);
        if (!state || state.timerStartedAt === null) return;
        state.elapsedAccumulatedSec = this.teamArenaElapsedSec(state);
        state.timerStartedAt = null;
        broadcastTeamArena(data.arenaId);
      });

      // Termine l'assaut en cours (persiste le score), avance au suivant s'il en reste.
      socket.on('team_advance_bout', (data: { arenaId: string }) => {
        if (!this.checkSocketArenaAuth(socket, data?.arenaId)) return;
        const state = this.teamArenaState.get(data.arenaId);
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
        this.db.updateTeamBout(bout.id, scoreA, scoreB, 'finished', winnerId);
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
          if (!this.checkSocketArenaAuth(socket, data?.arenaId)) return;
          if (!['white', 'yellow', 'red', 'black'].includes(data.type)) return;
          const state = this.teamArenaState.get(data.arenaId);
          if (!state) return;
          if (
            data.type === 'black' &&
            this.db.getCompetition(state.competitionId)?.settings?.blackCardEnabled !== true
          ) {
            return; // carton noir désactivé sur cette compétition
          }
          const { id } = this.db.createTeamMatchCard(
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
          if (!this.checkSocketArenaAuth(socket, data?.arenaId)) return;
          if (data.side !== 'A' && data.side !== 'B') return;
          const state = this.teamArenaState.get(data.arenaId);
          if (!state) return;
          if (!getAvailableReasons(state.weapon).includes(data.reason)) return;
          const bout = state.bouts[state.currentBoutIndex];
          if (!bout) return;
          const fencerId = data.side === 'A' ? bout.fencerAId : bout.fencerBId;
          const previous = this.db
            .getTeamBoutCards(state.matchId)
            .map(c => c.card)
            .filter(c => c.fencerId === fencerId);
          const card = createCard(state.matchId, fencerId, data.reason, previous, state.weapon);
          this.db.createTeamBoutCard(bout.id, card);
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
        const client = this.connectedClients.get(socket.id);
        if (!client) return;
        client.battery = {
          level: Math.max(0, Math.min(1, data.level)),
          charging: !!data.charging,
          updatedAt: new Date().toISOString(),
        };
        this.broadcastClientList();
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        this.connectedClients.delete(socket.id);
        this.broadcastClientList();
        this.handleDisconnect(socket);
      });
    });
  }

  /** Annonce carton/sortie relayée aux écrans : champs connus seulement, textes neutralisés (#995). */
  static sanitizeAnnouncement(raw: unknown): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'object') return null;
    const a = raw as Record<string, unknown>;
    const CARDS = ['white', 'yellow', 'red', 'black'];
    const text = (v: unknown, max = 80): string =>
      typeof v === 'string'
        ? v
            // eslint-disable-next-line no-control-regex
            .replace(/[<>\u0000-\u001f]/g, '')
            .slice(0, max)
            .trim()
        : '';
    const card = (v: unknown): string | null =>
      typeof v === 'string' && CARDS.includes(v) ? v : null;
    return {
      fencer: a.fencer === 'B' ? 'B' : 'A',
      fencerName: text(a.fencerName),
      cardType: card(a.cardType) ?? 'yellow',
      isRevalorisation: a.isRevalorisation === true,
      fromCard: card(a.fromCard),
      toCard: card(a.toCard),
      reason: text(a.reason, 120) || null,
      points: typeof a.points === 'number' && Number.isFinite(a.points) ? Math.trunc(a.points) : 0,
    };
  }

  private handleDisconnect(socket: any): void {
    console.log(`Client ${socket.id} disconnected`);
  }

  private broadcastClientList(): void {
    const mainWin = (global as any).mainWindow;
    if (mainWin) {
      mainWin.webContents.send('remote:clientListUpdate', this.getConnectedClients());
    }
  }

  getConnectedClients() {
    return Array.from(this.connectedClients.values());
  }

  sendClientCommand(
    socketId: string,
    command: { type: string; url?: string; text?: string; duration?: number }
  ): void {
    this.io.to(socketId).emit('server:command', command);
  }

  broadcastCommand(command: {
    type: string;
    url?: string;
    text?: string;
    duration?: number;
  }): void {
    this.io.emit('server:command', command);
  }

  renameClient(socketId: string, label: string): void {
    const client = this.connectedClients.get(socketId);
    if (client) {
      client.label = label;
      if (client.screenId) this.screenLabels.set(client.screenId, label);
      this.broadcastClientList();
      // Notifier l'écran de son nouveau nom
      this.io
        .to(socketId)
        .emit('server:command', { type: 'identify', screenLabel: label, duration: 3000 });
    }
  }

  identifyClient(socketId: string): void {
    const client = this.connectedClients.get(socketId);
    const label = client?.label ?? client?.screenId ?? socketId.slice(0, 8);
    this.io
      .to(socketId)
      .emit('server:command', { type: 'identify', screenLabel: label, duration: 5000 });
  }

  setClientKioskMode(
    socketId: string,
    config: {
      poules: boolean;
      classement: boolean;
      direct: boolean;
      suivants: boolean;
      tableau: boolean;
      rotationSec: number;
      eta?: boolean;
    }
  ): void {
    this.io.to(socketId).emit('server:command', { type: 'kiosk:config', kioskConfig: config });
    this.io.to(socketId).emit('server:command', { type: 'navigate', url: '/kiosk' });
  }

  // Stockage des cartons par arène
  private arenaCards: Map<string, { cardsA: string[]; cardsB: string[] }> = new Map();
  // Stockage des touches par zone par arène (zones : 'A' | 'B' | 'C')
  private arenaTouches: Map<string, { touchesA: string[]; touchesB: string[] }> = new Map();
  // Stockage des sorties d'arène par arène
  private arenaExits: Map<string, Array<{ fencer: 'A' | 'B'; isVoluntary: boolean }>> = new Map();
  private arenaSuddenDeath: Map<string, boolean> = new Map();
  private arenaOvertimeType: Map<string, string | null> = new Map();
  private arenaWaitingOvertime: Map<string, boolean> = new Map();
  // Vrai quand l'arbitre a explicitement sélectionné le match depuis sa tablette
  private arenaRefereeSelected: Map<string, boolean> = new Map();
  // Debounce par socket pour update_score : clé = socketId:arenaId, valeur = timestamp dernier envoi
  private scoreUpdateDebounce: Map<string, number> = new Map();
  private readonly SCORE_UPDATE_DEBOUNCE_MS = 200;

  /** Purge l'état de combat par arène (cartons, touches, mort subite…) — fin de session ou réinit des arènes. */
  private clearArenaCombatState(): void {
    this.arenaCards.clear();
    this.arenaTouches.clear();
    this.arenaExits.clear();
    this.arenaSuddenDeath.clear();
    this.arenaOvertimeType.clear();
    this.arenaWaitingOvertime.clear();
    this.arenaRefereeSelected.clear();
    this.scoreUpdateDebounce.clear();
    this.arenaPhotoSentForMatch.clear();
  }

  private handleArenaControl(
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
    const arena = this.getArena(data.arenaId);
    if (!arena) {
      socket.emit('error', { message: 'Arène non trouvée' });
      return;
    }

    switch (data.action) {
      case 'select_match':
        // Sélection d'un match par l'arbitre (depuis sa tablette)
        if (data.match) {
          const m = data.match;
          this.sendDiag(
            `[select_match] arena=${data.arenaId} matchId=${m.id} isTableau=${(m as any).isTableau}`
          );
          // Restaurer isTableau depuis sessionMatches car la tablette ne le transmet pas
          const sessionMatch = this.sessionMatches.find(sm => sm.id === m.id);
          this.assignMatchToArena(
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
          this.arenaCards.set(data.arenaId, { cardsA: [], cardsB: [] });
          this.arenaTouches.set(data.arenaId, { touchesA: [], touchesB: [] });
          this.arenaExits.set(data.arenaId, []);
        }
        break;
      case 'start':
        this.startArenaMatch(data.arenaId);
        break;
      case 'pause':
        this.pauseArenaMatch(data.arenaId);
        break;
      case 'finish':
        this.sendDiag(`[socket finish] arena=${data.arenaId}`);
        this.arenaSuddenDeath.set(data.arenaId, false);
        this.arenaOvertimeType.set(data.arenaId, null);
        this.arenaWaitingOvertime.set(data.arenaId, false);
        this.finishArenaMatch(data.arenaId);
        this.arenaCards.set(data.arenaId, { cardsA: [], cardsB: [] });
        this.arenaTouches.set(data.arenaId, { touchesA: [], touchesB: [] });
        this.arenaExits.set(data.arenaId, []);
        break;
      case 'waiting_overtime':
        this.arenaWaitingOvertime.set(data.arenaId, true);
        this.broadcastArenaUpdate(data.arenaId, {
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
          this.io.to(`arena:${data.arenaId}`).emit(`arena:${data.arenaId}:coin_flip`, {
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
            competitionId: this.session?.competitionId ?? null,
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
        this.loadNextMatch(data.arenaId);
        this.arenaCards.set(data.arenaId, { cardsA: [], cardsB: [] });
        this.arenaTouches.set(data.arenaId, { touchesA: [], touchesB: [] });
        this.arenaExits.set(data.arenaId, []);
        this.arenaSuddenDeath.set(data.arenaId, false);
        this.arenaOvertimeType.set(data.arenaId, null);
        this.arenaWaitingOvertime.set(data.arenaId, false);
        break;
      case 'update_score': {
        const debounceKey = `${socket.id}:${data.arenaId}`;
        const lastUpdate = this.scoreUpdateDebounce.get(debounceKey) ?? 0;
        if (Date.now() - lastUpdate < this.SCORE_UPDATE_DEBOUNCE_MS) break;
        this.scoreUpdateDebounce.set(debounceKey, Date.now());
        // Supprimer la mort subite si désactivée en entraînement
        const effectiveSuddenDeath =
          this.isTrainingMode && this.trainingCustomRules?.disableSuddenDeath
            ? false
            : data.suddenDeath;
        if (effectiveSuddenDeath !== undefined) {
          this.arenaSuddenDeath.set(data.arenaId, effectiveSuddenDeath);
        }
        if (data.overtimeType !== undefined) {
          this.arenaOvertimeType.set(data.arenaId, data.overtimeType);
        }
        if (data.scoreA !== undefined && data.scoreB !== undefined) {
          this.updateArenaScore(data.arenaId, data.scoreA, data.scoreB);
        }
        // Mettre à jour aussi les cartons si fournis
        if (data.cardsA !== undefined || data.cardsB !== undefined) {
          const currentCards = this.arenaCards.get(data.arenaId) || { cardsA: [], cardsB: [] };
          if (data.cardsA !== undefined) currentCards.cardsA = data.cardsA;
          if (data.cardsB !== undefined) currentCards.cardsB = data.cardsB;
          this.arenaCards.set(data.arenaId, currentCards);
          // Mettre à jour les touches par zone si fournies
          const currentTouches = this.arenaTouches.get(data.arenaId) || {
            touchesA: [],
            touchesB: [],
          };
          if (data.touchesA !== undefined) currentTouches.touchesA = data.touchesA;
          if (data.touchesB !== undefined) currentTouches.touchesB = data.touchesB;
          this.arenaTouches.set(data.arenaId, currentTouches);

          this.broadcastArenaUpdate(data.arenaId, {
            arenaId: data.arenaId,
            match: arena.currentMatch,
            scoreA: data.scoreA ?? arena.currentMatch?.scoreA,
            scoreB: data.scoreB ?? arena.currentMatch?.scoreB,
            cardsA: currentCards.cardsA,
            cardsB: currentCards.cardsB,
            touchesA: currentTouches.touchesA,
            touchesB: currentTouches.touchesB,
            suddenDeath: this.arenaSuddenDeath.get(data.arenaId) ?? false,
            overtimeType: this.arenaOvertimeType.get(data.arenaId) ?? null,
            waitingOvertime: this.arenaWaitingOvertime.get(data.arenaId) ?? false,
            status: arena.status,
          });
        }
        break;
      }
      case 'add_card':
        // Gestion des cartons
        if (data.fencer && data.cardType) {
          const currentCards = this.arenaCards.get(data.arenaId) || { cardsA: [], cardsB: [] };
          const targetCards = data.fencer === 'A' ? currentCards.cardsA : currentCards.cardsB;
          targetCards.push(data.cardType);
          this.arenaCards.set(data.arenaId, currentCards);
          this.broadcastArenaUpdate(data.arenaId, {
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
          const exits = this.arenaExits.get(data.arenaId) || [];
          exits.push({ fencer: data.fencer as 'A' | 'B', isVoluntary: !!data.isVoluntary });
          this.arenaExits.set(data.arenaId, exits);
        }
        break;
      case 'reset_scores':
        if (arena.currentMatch) {
          this.arenaSuddenDeath.set(data.arenaId, false);
          this.arenaOvertimeType.set(data.arenaId, null);
          this.arenaWaitingOvertime.set(data.arenaId, false);
          this.updateArenaScore(data.arenaId, 0, 0);
          this.arenaCards.set(data.arenaId, { cardsA: [], cardsB: [] });
          this.arenaTouches.set(data.arenaId, { touchesA: [], touchesB: [] });
          this.arenaExits.set(data.arenaId, []);
          this.broadcastArenaUpdate(data.arenaId, {
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
        const cards = this.arenaCards.get(data.arenaId) || { cardsA: [], cardsB: [] };
        this.broadcastArenaUpdate(data.arenaId, {
          arenaId: data.arenaId,
          match: arena.currentMatch,
          scoreA: arena.currentMatch?.scoreA,
          scoreB: arena.currentMatch?.scoreB,
          cardsA: cards.cardsA,
          cardsB: cards.cardsB,
          suddenDeath: this.arenaSuddenDeath.get(data.arenaId) ?? false,
          status: arena.status,
        });
        break;
      }
      case 'card_announcement': {
        const ann = RemoteScoreServer.sanitizeAnnouncement(data.announcement);
        if (ann) {
          this.io.to(`arena:${data.arenaId}`).emit(`arena:${data.arenaId}:card_announcement`, ann);
        }
        break;
      }
      case 'exit_announcement': {
        const ann = RemoteScoreServer.sanitizeAnnouncement(data.announcement);
        if (ann && this.sessionCardAnnounce) {
          this.io.to(`arena:${data.arenaId}`).emit(`arena:${data.arenaId}:exit_announcement`, ann);
        }
        break;
      }
      case 'update_timer':
      case 'pause_timer':
      case 'reset_timer': {
        const timerSuddenDeath =
          this.isTrainingMode && this.trainingCustomRules?.disableSuddenDeath
            ? false
            : data.suddenDeath;
        if (timerSuddenDeath !== undefined) {
          this.arenaSuddenDeath.set(data.arenaId, timerSuddenDeath);
        }
        if (data.overtimeType !== undefined) {
          this.arenaOvertimeType.set(data.arenaId, data.overtimeType);
        }
        // Clear waiting state when sudden death actually starts
        if (timerSuddenDeath) {
          this.arenaWaitingOvertime.set(data.arenaId, false);
        }
        this.broadcastArenaUpdate(data.arenaId, {
          arenaId: data.arenaId,
          match: arena.currentMatch,
          time: data.time,
          timerStatus: data.timerStatus,
          suddenDeath: this.arenaSuddenDeath.get(data.arenaId) ?? false,
          overtimeType: this.arenaOvertimeType.get(data.arenaId) ?? null,
          waitingOvertime: this.arenaWaitingOvertime.get(data.arenaId) ?? false,
          status: arena.status,
        });
        break;
      }
      case 'change_referee': {
        if (!data.matchId || !data.refereeId || !arena.currentMatch) break;
        if (arena.currentMatch.id !== data.matchId) break;
        this.db.updateMatch(data.matchId, { refereeId: data.refereeId });
        // Mettre à jour sessionMatches en mémoire
        const idx = this.sessionMatches.findIndex((m: any) => m.id === data.matchId);
        if (idx >= 0)
          this.sessionMatches[idx] = { ...this.sessionMatches[idx], refereeId: data.refereeId };
        // Mettre à jour l'ArenaMatch courant
        const resolvedRef = this.resolveReferee(data.refereeId);
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
        this.broadcastArenaUpdate(data.arenaId, {
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

  private async createSession(competitionId: string, strips: number): Promise<RemoteSession> {
    console.log(
      `[RemoteScoreServer] Création d'une session pour la compétition ${competitionId} avec ${strips} pistes...`
    );

    const competition = this.db.getCompetition(competitionId);
    if (!competition) {
      console.error(`[RemoteScoreServer] ERREUR: Compétition ${competitionId} non trouvée`);
      throw new Error('Compétition non trouvée');
    }
    console.log(`[RemoteScoreServer] Compétition trouvée: ${competition.title}`);

    // Le nombre de pistes est déjà défini côté client en fonction du nombre de poules
    // On l'utilise directement pour configurer les arènes
    console.log(`[RemoteScoreServer] Configuration du nombre d'arènes: ${strips}`);
    this.setArenaCount(strips);

    // Récupérer les matchs en attente et les assigner aux arènes
    const pendingMatches = this.db.getPendingMatches(competitionId);
    console.log(`[RemoteScoreServer] ${pendingMatches.length} matchs en attente trouvés`);

    // Assigner les matchs en attente aux arènes
    pendingMatches.slice(0, strips).forEach((match, index) => {
      const arenaId = `arena${index + 1}`;
      const arenaMatch: ArenaMatch = {
        id: match.id,
        poolId: match.poolId || '',
        fencerA: match.fencerA!,
        fencerB: match.fencerB!,
        scoreA: match.scoreA?.value ?? 0,
        scoreB: match.scoreB?.value ?? 0,
        status: match.status === 'in_progress' ? 'in_progress' : 'pending',
        startTime: match.status === 'in_progress' ? new Date() : null,
        endTime: null,
      };
      this.assignMatchToArena(arenaId, arenaMatch);
      console.log(`[RemoteScoreServer] Match ${match.id} assigné à l'arène ${arenaId}`);
    });

    const session: RemoteSession = {
      competitionId,
      strips: Array.from({ length: strips }, (_, i) => ({
        number: i + 1,
        status: pendingMatches[i] ? 'occupied' : 'available',
      })),
      referees: this.loadSessionReferees(competitionId),
      activeMatches: [],
      isRunning: true,
      startTime: new Date(),
    };

    console.log(`[RemoteScoreServer] Session créée avec succès ✓`);
    console.log(
      `[RemoteScoreServer] Détails: ${strips} pistes, ${session.referees.length} arbitres`
    );
    return session;
  }

  private formatFencerName(f: any): string {
    return f ? `${f.lastName ?? ''} ${f.firstName ?? ''}`.trim() : '';
  }

  /** Statut à restaurer après annulation d'un carton noir (jamais un statut inactif) */
  private restorableStatus(status: FencerStatus | undefined): FencerStatus {
    return status === FencerStatus.QUALIFIED || status === FencerStatus.CHECKED_IN
      ? status
      : FencerStatus.CHECKED_IN;
  }

  private matchPoolId(m: any): string | null {
    if (!m || m.isTableau) return null;
    return m.poolId || m.pool?.id || (m.poolNumber ? `pool-${m.poolNumber}` : null);
  }

  /**
   * Cartons noirs annulables visibles depuis une arène : ceux donnés sur cette arène
   * ou dans la poule qu'elle affiche. Les exclusions persistées (redémarrage de session)
   * sont reconstituées depuis les matchs de poule de la session.
   */
  private getArenaBlackCards(arenaId: string): BlackCardRecord[] {
    // Reconstituer les cartons noirs absents de la mémoire (session relancée)
    for (const m of this.sessionMatches) {
      if (m.isTableau) continue;
      for (const f of [m.fencerA, m.fencerB]) {
        if (
          !f?.id ||
          f.status !== FencerStatus.EXCLUDED ||
          f.exclusionReason !== 'black_card' ||
          this.sessionBlackCards.has(f.id)
        )
          continue;
        const last = this.sessionMatches
          .filter(
            (x: any) =>
              !x.isTableau &&
              (x.fencerA?.id === f.id || x.fencerB?.id === f.id) &&
              (this.sessionMatchScores.get(x.id)?.status ?? x.status) === MatchStatus.FINISHED
          )
          .sort(
            (a: any, b: any) =>
              new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
          )[0];
        if (!last) continue;
        const opponent = last.fencerA?.id === f.id ? last.fencerB : last.fencerA;
        this.sessionBlackCards.set(f.id, {
          fencerId: f.id,
          matchId: last.id,
          arenaId: null,
          poolId: this.matchPoolId(last),
          previousStatus: FencerStatus.CHECKED_IN,
          fencerName: this.formatFencerName(f),
          opponentName: this.formatFencerName(opponent),
          timestamp: new Date(last.updatedAt ?? Date.now()).getTime(),
        });
      }
    }

    // Écarter les exclusions déjà levées ailleurs (ex. depuis le poste DT)
    for (const [fencerId] of this.sessionBlackCards) {
      const f = this.db.getFencer(fencerId);
      if (f && f.status !== FencerStatus.EXCLUDED) this.sessionBlackCards.delete(fencerId);
    }

    const arenaPoolId = this.arenas.get(arenaId)?.currentMatch?.poolId ?? null;
    return Array.from(this.sessionBlackCards.values())
      .filter(r => r.arenaId === arenaId || (arenaPoolId !== null && r.poolId === arenaPoolId))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Annule un carton noir : réintègre le combattant et rouvre le match interrompu */
  private cancelBlackCard(
    arenaId: string,
    fencerId: string
  ): { success: true; matchId: string } | { success: false; status: number; error: string } {
    const record = this.getArenaBlackCards(arenaId).find(r => r.fencerId === fencerId);
    if (!record) {
      return { success: false, status: 404, error: 'Carton noir introuvable pour cette arène' };
    }
    const { matchId } = record;
    const dbMatch = this.db.getMatch(matchId);
    const sessionMatch = this.sessionMatches.find((m: any) => m.id === matchId);
    if ((dbMatch && !dbMatch.poolId) || sessionMatch?.isTableau) {
      return {
        success: false,
        status: 409,
        error: 'Annulation impossible pour un match de tableau (à corriger depuis le poste DT)',
      };
    }

    const status = record.previousStatus;
    try {
      this.db.updateFencer(fencerId, { status, exclusionReason: null });
    } catch (e) {
      console.error('[RemoteScoreServer] Erreur réintégration combattant:', e);
      return { success: false, status: 500, error: 'Erreur lors de la réintégration' };
    }

    // Rouvrir le match interrompu par le carton noir avec le score atteint
    const current = this.sessionMatchScores.get(matchId);
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
      this.db.updateMatch(matchId, {
        scoreA: reopened(scoreA),
        scoreB: reopened(scoreB),
        status: MatchStatus.IN_PROGRESS,
      });
    }
    this.sessionMatchScores.set(matchId, {
      scoreA: reopened(scoreA),
      scoreB: reopened(scoreB),
      status: MatchStatus.IN_PROGRESS,
    });

    // Propager le statut dans les copies en mémoire : ses matchs suivants redeviennent jouables
    const patch = (f: any) => (f?.id === fencerId ? { ...f, status, exclusionReason: null } : f);
    this.sessionMatches = this.sessionMatches.map((m: any) =>
      m.fencerA?.id === fencerId || m.fencerB?.id === fencerId
        ? { ...m, fencerA: patch(m.fencerA), fencerB: patch(m.fencerB) }
        : m
    );
    for (const [qArenaId, queue] of this.arenaMatchQueue) {
      this.arenaMatchQueue.set(
        qArenaId,
        queue.map(m => ({ ...m, fencerA: patch(m.fencerA), fencerB: patch(m.fencerB) }))
      );
    }
    for (const [poolId, fencers] of this.poolFencersCache) {
      this.poolFencersCache.set(poolId, fencers.map(patch));
    }
    for (const arena of this.arenas.values()) {
      if (!arena.currentMatch) continue;
      arena.currentMatch = {
        ...arena.currentMatch,
        fencerA: patch(arena.currentMatch.fencerA),
        fencerB: patch(arena.currentMatch.fencerB),
      };
    }

    this.sessionBlackCards.delete(fencerId);
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

  private isMatchPlayable(m: Match | ArenaMatch): boolean {
    const inactive = new Set([FencerStatus.ABANDONED, FencerStatus.FORFAIT, FencerStatus.EXCLUDED]);
    return (
      !inactive.has(m.fencerA?.status as FencerStatus) &&
      !inactive.has(m.fencerB?.status as FencerStatus)
    );
  }

  private applySmartMatchOrder(matches: Match[]): Match[] {
    const pending = matches.filter(
      m => m.status !== MatchStatus.FINISHED && this.isMatchPlayable(m)
    );
    const finished = matches.filter(m => m.status === MatchStatus.FINISHED);

    if (pending.length === 0) return matches;

    const ordered: Match[] = [];
    const remaining = [...pending];
    let lastFencerIds: Set<string> = new Set();

    if (finished.length > 0) {
      const lastMatch = finished[finished.length - 1];
      if (lastMatch.fencerA) lastFencerIds.add(lastMatch.fencerA.id);
      if (lastMatch.fencerB) lastFencerIds.add(lastMatch.fencerB.id);
    }

    while (remaining.length > 0) {
      let bestIdx = -1;
      let bestScore = -1;

      for (let i = 0; i < remaining.length; i++) {
        const match = remaining[i];
        let score = 0;
        if (!lastFencerIds.has(match.fencerA?.id || '')) score++;
        if (!lastFencerIds.has(match.fencerB?.id || '')) score++;

        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
        if (score === 2) break;
      }

      const chosen = remaining.splice(bestIdx >= 0 ? bestIdx : 0, 1)[0];
      ordered.push(chosen);

      lastFencerIds = new Set();
      if (chosen.fencerA) lastFencerIds.add(chosen.fencerA.id);
      if (chosen.fencerB) lastFencerIds.add(chosen.fencerB.id);
    }

    return [...finished, ...ordered];
  }

  private async updateMatchScore(matchId: string, update: RemoteScoreUpdate): Promise<void> {
    const scoreA: Score = {
      value: update.scoreA,
      isVictory: update.winner === 'A',
      isAbstention: update.specialStatus === 'abandon' && update.winner !== 'A',
      isExclusion: update.specialStatus === 'exclusion' && update.winner !== 'A',
      isForfait: update.specialStatus === 'forfait' && update.winner !== 'A',
    };

    const scoreB: Score = {
      value: update.scoreB,
      isVictory: update.winner === 'B',
      isAbstention: update.specialStatus === 'abandon' && update.winner !== 'B',
      isExclusion: update.specialStatus === 'exclusion' && update.winner !== 'B',
      isForfait: update.specialStatus === 'forfait' && update.winner !== 'B',
    };

    const dbMatch = this.db.getMatch(matchId);
    if (dbMatch) {
      // Match en base de données : mise à jour directe
      this.db.updateMatch(matchId, {
        scoreA,
        scoreB,
        status: update.status === 'finished' ? MatchStatus.FINISHED : MatchStatus.IN_PROGRESS,
      });
    } else {
      // Match en mémoire uniquement (poule non persistée) : mettre à jour via Socket.IO
      const inMemory = this.sessionMatches.find((m: any) => m.id === matchId);
      if (!inMemory) {
        throw new Error('Match non trouvé');
      }
      // Synchroniser les scores dans l'arène en mémoire
      for (const [arenaId, arena] of this.arenas) {
        if (arena.currentMatch?.id === matchId) {
          this.updateArenaScore(arenaId, update.scoreA, update.scoreB);
          break;
        }
      }
      // Stocker dans sessionMatchScores pour cohérence
      this.sessionMatchScores.set(matchId, {
        scoreA,
        scoreB,
        status: update.status === 'finished' ? MatchStatus.FINISHED : MatchStatus.IN_PROGRESS,
      });
    }
  }

  private broadcastMessage(message: WebSocketMessage): void {
    // Envoyer à la fenêtre principale
    if ((global as any).mainWindow) {
      (global as any).mainWindow.webContents.send('remote:websocket_message', message);
    }
  }

  private initializeArenas(arenaCount: number = 4): void {
    this.arenaCount = arenaCount;
    console.log(`[RemoteScoreServer] Initialisation de ${arenaCount} arènes...`);
    // Sauvegarder les mots de passe avant de vider la map
    const savedPasswords = new Map<string, string>();
    this.arenas.forEach((arena, id) => {
      if (arena.password) savedPasswords.set(id, arena.password);
    });
    this.arenas.clear();
    this.arenaEventBuffer.clear();
    this.arenaMatchQueue.clear();
    this.arenaNextMatchIndex.clear();
    this.clearArenaCombatState();

    for (let i = 1; i <= arenaCount; i++) {
      const arena: Arena = {
        id: `arena${i}`,
        name: `Arène ${i}`,
        number: i,
        currentMatch: null,
        status: 'idle',
        startTime: null,
        settings: {
          matchDuration: 180, // 3 minutes par défaut
          breakDuration: 30, // 30 secondes entre les matchs
          autoAdvance: false,
        },
      };
      this.arenas.set(arena.id, arena);
      this.arenaMatchQueue.set(arena.id, []);
      console.log(`[RemoteScoreServer] Arène ${i} créée ✓`);
    }
    // Restaurer les mots de passe sauvegardés
    savedPasswords.forEach((pwd, id) => {
      const arena = this.arenas.get(id);
      if (arena) arena.password = pwd;
    });
    console.log(`[RemoteScoreServer] ${arenaCount} arènes initialisées avec succès ✓`);
  }

  // Méthode publique pour mettre à jour le nombre d'arènes
  public resetPoolMatch(matchId: string): void {
    this.sessionMatchScores.delete(matchId);
    this.io.emit('match:reset', { matchId });

    const match = this.sessionMatches.find((m: any) => m.id === matchId);
    const poolId = match?.poolId ?? match?.pool?.id;
    if (!poolId) return;

    const fencers = this.poolFencersCache.get(poolId) ?? this.db.getPoolFencers(poolId);
    const poolMatches = this.sessionMatches
      .filter((m: any) => !m.isTableau && (m.poolId ?? m.pool?.id) === poolId)
      .sort((a: any, b: any) => (a.number || 0) - (b.number || 0))
      .map((m: any) => {
        const u = this.sessionMatchScores.get(m.id);
        return u ? { ...m, ...u } : m;
      });
    const isComplete =
      poolMatches.length > 0 && poolMatches.every((m: any) => m.status === MatchStatus.FINISHED);
    for (const [aId, arena] of this.arenas) {
      if ((arena.currentMatch?.poolId ?? arena.activePoolId) === poolId) {
        this.io
          .to(`pool:${aId}`)
          .emit(`pool:${aId}:update`, { poolId, fencers, matches: poolMatches, isComplete });
      }
    }
  }

  // Marque un match de poule comme terminé depuis l'UI principale (ex: auto-fill).
  // Met à jour sessionMatchScores + sessionMatches, libère l'arène si nécessaire,
  // puis diffuse la mise à jour à la tablette.
  public finishPoolMatch(matchId: string, scoreA: number, scoreB: number): void {
    this.sessionMatchScores.set(matchId, {
      scoreA: { value: scoreA, isVictory: scoreA > scoreB },
      scoreB: { value: scoreB, isVictory: scoreB > scoreA },
      status: MatchStatus.FINISHED,
    });

    const matchIdx = (this.sessionMatches as any[]).findIndex((m: any) => m.id === matchId);
    if (matchIdx >= 0) {
      (this.sessionMatches as any[])[matchIdx].status = MatchStatus.FINISHED;
    }

    // Si le match est actif sur une arène, la marquer terminée
    for (const [arenaId, arena] of this.arenas) {
      if (arena.currentMatch?.id === matchId && arena.status !== 'finished') {
        arena.status = 'finished';
        arena.currentMatch.status = 'finished';
        this.broadcastArenaUpdate(arenaId, {
          arenaId,
          status: 'finished',
          match: arena.currentMatch,
          scoreA: arena.currentMatch.scoreA,
          scoreB: arena.currentMatch.scoreB,
          fencerA: arena.currentMatch.fencerA,
          fencerB: arena.currentMatch.fencerB,
        });
        break;
      }
    }

    this.io.emit('match:finished', { matchId });

    const match = matchIdx >= 0 ? (this.sessionMatches as any[])[matchIdx] : null;
    const poolId = match?.poolId ?? match?.pool?.id;
    if (!poolId) return;

    const fencers = this.poolFencersCache.get(poolId) ?? this.db.getPoolFencers(poolId);
    const poolMatches = (this.sessionMatches as any[])
      .filter((m: any) => !m.isTableau && (m.poolId ?? m.pool?.id) === poolId)
      .sort((a: any, b: any) => (a.number || 0) - (b.number || 0))
      .map((m: any) => {
        const u = this.sessionMatchScores.get(m.id);
        return u ? { ...m, ...u } : m;
      });
    const isComplete =
      poolMatches.length > 0 &&
      poolMatches.every((m: any) => m.status === MatchStatus.FINISHED || m.status === 'finished');
    for (const [aId, arena] of this.arenas) {
      if ((arena.currentMatch?.poolId ?? arena.activePoolId) === poolId) {
        this.io
          .to(`pool:${aId}`)
          .emit(`pool:${aId}:update`, { poolId, fencers, matches: poolMatches, isComplete });
      }
    }
  }

  public setLanguage(lang: string): void {
    this.currentLang = lang;
  }

  public setArenaCount(count: number): void {
    console.log(`[RemoteScoreServer] Mise à jour du nombre d'arènes: ${count}`);
    this.initializeArenas(count);
    this.io?.emit(
      'arenas:updated',
      this.getAllArenas().map(a => this.toPublicArena(a))
    );
  }

  public getArenaCount(): number {
    return this.arenaCount;
  }

  // Méthodes publiques pour les arènes
  public getArena(arenaId: string): Arena | null {
    return this.arenas.get(arenaId) || null;
  }

  public getAllArenas(): Arena[] {
    return Array.from(this.arenas.values());
  }

  public updateArena(arenaId: string, update: Partial<Arena>): void {
    const arena = this.arenas.get(arenaId);
    if (!arena) return;

    Object.assign(arena, update);

    // Diffuser la mise à jour via WebSocket
    this.broadcastArenaUpdate(arenaId, {
      arenaId,
      match: arena.currentMatch,
      scoreA: arena.currentMatch?.scoreA,
      scoreB: arena.currentMatch?.scoreB,
      status: arena.status,
      fencerA: arena.currentMatch?.fencerA,
      fencerB: arena.currentMatch?.fencerB,
    });
  }

  /** Id du match en base : `${competitionId}-${id}` pour un match de tableau s'il existe */
  private resolveDbMatchId(match: ArenaMatch): string {
    if (match.poolId || !this.session) return match.id;
    const composite = `${this.session.competitionId}-${match.id}`;
    try {
      if (this.db.getMatch(composite)) return composite;
    } catch {
      /* id non UUID / DB indisponible : id brut */
    }
    return match.id;
  }

  /**
   * Match d'une autre poule réassigné manuellement sur cette piste (#1037) :
   * ne change pas la poule propre de la piste (activePoolId).
   */
  private isGuestMatch(arenaId: string, m: { id: string; poolId?: string }): boolean {
    const home = this.arenas.get(arenaId)?.activePoolId;
    return (
      !!m.poolId &&
      !!home &&
      m.poolId !== home &&
      this.poolMatchArenaOverrides.get(m.id) === arenaId
    );
  }

  /** Poule propre de la piste, même si un match réassigné d'une autre poule y est chargé */
  private arenaHomePoolId(arena: Arena): string | undefined {
    const cur = arena.currentMatch;
    if (!cur?.poolId) return undefined;
    if (arena.activePoolId && this.poolMatchArenaOverrides.has(cur.id)) return arena.activePoolId;
    return cur.poolId;
  }

  private isPendingMatch(m: ArenaMatch): boolean {
    const status = this.sessionMatchScores.get(m.id)?.status ?? m.status;
    return status !== MatchStatus.FINISHED && this.isMatchPlayable(m);
  }

  /** Matchs d'autres poules en file sur la piste (dernier réassigné en tête) */
  private guestQueue(arenaId: string): ArenaMatch[] {
    return (this.arenaMatchQueue.get(arenaId) || []).filter(
      m => this.isGuestMatch(arenaId, m) && this.isPendingMatch(m)
    );
  }

  public assignMatchToArena(arenaId: string, match: ArenaMatch, fromReferee = false): void {
    console.log(
      `[RemoteScoreServer] assignMatchToArena called: arenaId=${arenaId}, matchId=${match.id}, fromReferee=${fromReferee}`
    );
    const arena = this.arenas.get(arenaId);
    if (!arena) {
      console.error(`[RemoteScoreServer] ERREUR: Arène ${arenaId} n'existe pas!`);
      return;
    }

    // Mettre à jour le flag de sélection arbitre avant le broadcast
    this.arenaRefereeSelected.set(arenaId, fromReferee);

    // Arbitre par défaut : celui du match, sinon celui/ceux de la poule (#908)
    if (!match.referee) {
      const defaultRef =
        this.resolveTableauMatchReferees(match.poolId ? null : match.id) ??
        this.resolveReferee((match as any).refereeId) ??
        this.resolvePoolReferee(match.poolId);
      if (defaultRef) match = { ...match, referee: defaultRef };
    }

    arena.currentMatch = match;
    arena.status = 'ready';
    if (match.poolId && !this.isGuestMatch(arenaId, match)) arena.activePoolId = match.poolId;

    this.updateArena(arenaId, {
      status: 'ready',
      currentMatch: match,
    });

    this.persistArenaState(arenaId);
    console.log(`[RemoteScoreServer] Match assigné avec succès à l'arène ${arenaId}`);
  }

  public updateMatchArena(
    matchId: string,
    fromArena: number | null,
    toArena: number | null,
    fencerA?: any,
    fencerB?: any
  ): void {
    let matchToMove: ArenaMatch | undefined;

    // Overrides d'abord : la piste d'origine doit ignorer ce match en rechargeant sa poule
    if (toArena !== null) {
      this.poolMatchArenaOverrides.set(matchId, `arena${toArena}`);
    } else {
      this.poolMatchArenaOverrides.delete(matchId);
    }

    // 1. Retirer le match de TOUTES les arènes (files et currentMatch non démarré).
    //    startSession distribue les matchs DE en round-robin, donc le match peut se
    //    trouver dans n'importe quelle arène même si fromArena est null.
    for (const [arenaId, arena] of this.arenas) {
      // Chercher et supprimer tous les doublons dans les files d'attente
      const queue = this.arenaMatchQueue.get(arenaId) || [];
      const filtered = queue.filter(m => m.id !== matchId);
      if (filtered.length < queue.length) {
        // Au moins une occurrence trouvée dans cette file
        if (!matchToMove) matchToMove = queue.find(m => m.id === matchId);
        this.arenaMatchQueue.set(arenaId, filtered);
      }

      // Chercher dans le currentMatch (seulement si non démarré, on ne peut pas
      // retirer un match en cours)
      if (arena.currentMatch?.id === matchId && arena.currentMatch.status !== 'in_progress') {
        if (!matchToMove) matchToMove = arena.currentMatch;
        // Piste de poule : enchaîner sur le match suivant de sa poule (#1037)
        if (arena.currentMatch.poolId) {
          this.loadNextMatch(arenaId);
          continue;
        }
        // Promouvoir le premier match en file comme nouveau currentMatch
        const nextInQueue = this.arenaMatchQueue.get(arenaId) || [];
        if (nextInQueue.length > 0) {
          arena.currentMatch = nextInQueue[0];
          arena.status = 'ready';
          this.arenaMatchQueue.set(arenaId, nextInQueue.slice(1));
          this.updateArena(arenaId, { status: 'ready', currentMatch: arena.currentMatch });
        } else {
          arena.currentMatch = null;
          arena.status = 'idle';
          this.updateArena(arenaId, { status: 'idle', currentMatch: null });
        }
      }
    }

    // Si le match n'est dans aucune arène, le construire depuis sessionMatches ou les données passées
    if (!matchToMove) {
      const sm = this.sessionMatches.find((m: any) => m.id === matchId);
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
        this.sessionMatches.push({
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
    const toArenaObj = this.arenas.get(toArenaId);
    if (!toArenaObj) return;

    if (!toArenaObj.currentMatch) {
      // Arène libre → le match devient le currentMatch visible immédiatement
      this.assignMatchToArena(toArenaId, matchToMove);
    } else {
      // Arène occupée : un match réassigné manuellement passe en tête de file ;
      // les suivants se rajoutent par le haut (#1037)
      const toQueue = this.arenaMatchQueue.get(toArenaId) || [];
      this.arenaMatchQueue.set(toArenaId, [matchToMove, ...toQueue]);
      this.updateArena(toArenaId, { status: toArenaObj.status });
    }

    console.log(`[RemoteScoreServer] Match ${matchId} assigné à arena${toArena}`);
  }

  public startArenaMatch(arenaId: string): void {
    const arena = this.arenas.get(arenaId);
    if (!arena || !arena.currentMatch) return;

    arena.status = 'in_progress';
    arena.startTime = new Date();
    arena.currentMatch.status = 'in_progress';
    arena.currentMatch.startTime = new Date();

    this.updateArena(arenaId, {
      status: 'in_progress',
      startTime: arena.startTime,
      currentMatch: arena.currentMatch,
    });
    this.persistArenaState(arenaId);
  }

  public pauseArenaMatch(arenaId: string): void {
    const arena = this.arenas.get(arenaId);
    if (!arena) return;

    arena.status = 'ready';

    this.updateArena(arenaId, { status: 'ready' });
  }

  public updateArenaScore(arenaId: string, scoreA: number, scoreB: number): void {
    const arena = this.arenas.get(arenaId);
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
      const matchId = arena.currentMatch.id;
      if (this.db.getMatch(matchId)) {
        this.db.logScoreChange({
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
    this.broadcastArenaUpdate(arenaId, {
      arenaId,
      match: arena.currentMatch,
      scoreA,
      scoreB,
      suddenDeath: this.arenaSuddenDeath.get(arenaId) ?? false,
      overtimeType: this.arenaOvertimeType.get(arenaId) ?? null,
      status: arena.status,
    });

    // Vérifier si le match doit s'arrêter automatiquement en Laser Sabre
    this.checkAndAutoFinishMatch(arenaId, scoreA, scoreB, previousScoreA, previousScoreB);
  }

  private checkAndAutoFinishMatch(
    arenaId: string,
    scoreA: number,
    scoreB: number,
    previousScoreA: number,
    previousScoreB: number
  ): void {
    const arena = this.arenas.get(arenaId);
    if (!arena || arena.status === 'finished' || !arena.currentMatch) return;

    // Notifier la tablette arbitre uniquement quand un tireur franchit le seuil de 15 points
    const SCORE_LIMIT = 15;
    const justCrossed =
      (scoreA >= SCORE_LIMIT && previousScoreA < SCORE_LIMIT) ||
      (scoreB >= SCORE_LIMIT && previousScoreB < SCORE_LIMIT);
    if (justCrossed) {
      console.log(
        `[RemoteScoreServer] Score limite (${SCORE_LIMIT}) atteint - notification arbitre pour l'arène ${arenaId}`
      );
      this.io.to(`arena:${arenaId}`).emit(`arena:${arenaId}:score_limit_reached`);
    }
  }

  // DIAGNOSTIC : envoie un message visible dans la console DevTools du renderer
  // (les console.log serveur ne sont pas visibles dans l'app packagée).
  private sendDiag(msg: string): void {
    try {
      const w = (global as any).mainWindow;
      if (w) w.webContents.send('remote:diag', msg);
    } catch {
      /* non bloquant */
    }
  }

  public finishArenaMatch(arenaId: string): void {
    const arena = this.arenas.get(arenaId);
    this.sendDiag(
      `[finishArenaMatch] arena=${arenaId} hasCurrent=${!!arena?.currentMatch} status=${arena?.status} matchId=${arena?.currentMatch?.id} isTableau=${(arena?.currentMatch as any)?.isTableau}`
    );
    if (!arena || !arena.currentMatch) return;
    // Éviter le double-déclenchement (REST + Socket.IO)
    if (arena.status === 'finished') return;

    // Réinitialiser le flag de sélection arbitre (match terminé)
    this.arenaRefereeSelected.set(arenaId, false);

    const finishedMatch = { ...arena.currentMatch };

    arena.status = 'finished';
    arena.currentMatch.status = 'finished';
    arena.currentMatch.endTime = new Date();

    if (arena.startTime) {
      const wallMs = new Date().getTime() - arena.startTime.getTime();
      arena.currentMatch.duration = Math.floor(wallMs / 1000);
      // Durées réelles pour l'estimation de fin de phase (#1077)
      this.recentMatchDurationsMs.push(wallMs);
      if (this.recentMatchDurationsMs.length > 50) this.recentMatchDurationsMs.shift();
    }

    // Persistance secondaire (timing / cartons / touches / sorties) : ces écritures
    // utilisent arena.currentMatch.id qui, pour un match de tableau, n'est PAS l'id DB
    // (stocké en composite). Une éventuelle exception (ex: contrainte FK) NE DOIT PAS
    // empêcher l'émission de match:finished vers le renderer (sinon : vainqueur jamais
    // remonté, pas de passage au tour suivant). On isole donc tout ce bloc.
    if (!this.isTrainingMode)
      try {
        // Id DB du match : composite pour un match de tableau (sinon FK rejetée → journal vide, #1031)
        const matchId = this.resolveDbMatchId(arena.currentMatch);
        // Persister le timing en DB
        if (matchId && arena.startTime) {
          const durationSec = arena.currentMatch.duration ?? 0;
          this.db.updateMatchTiming(
            matchId,
            arena.startTime.toISOString(),
            arena.currentMatch.endTime!.toISOString(),
            durationSec
          );
        }

        // Persister les cartons accumulés en mémoire
        const cards = this.arenaCards.get(arenaId) ?? { cardsA: [], cardsB: [] };
        const now = new Date().toISOString();
        if (matchId) {
          const persistCards = (list: string[], fencerId: string | undefined) => {
            if (!fencerId) return;
            for (const cardType of list) {
              this.db.saveCard({
                id: `${matchId}-${fencerId}-${cardType}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                matchId,
                fencerId,
                cardType,
                reason: 'unknown',
                cardGroup: 1,
                timestamp: now,
                pointsAwarded: 0,
                resultingExclusion: false,
              });
            }
          };
          persistCards(cards.cardsA, arena.currentMatch.fencerA?.id);
          persistCards(cards.cardsB, arena.currentMatch.fencerB?.id);

          // Persister les touches par zone
          const touches = this.arenaTouches.get(arenaId) ?? { touchesA: [], touchesB: [] };
          const persistTouches = (zoneList: string[], fencerId: string | undefined) => {
            if (!fencerId) return;
            const ZONE_POINTS: Record<string, number> = { A: 1, B: 3, C: 5 };
            for (const zone of zoneList) {
              this.db.saveTouch({
                id: `${matchId}-${fencerId}-${zone}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                matchId,
                fencerId,
                zone,
                points: ZONE_POINTS[zone] ?? 1,
                timestamp: now,
                isValidInSuddenDeath: false,
                isReversed: false,
              });
            }
          };
          persistTouches(touches.touchesA, arena.currentMatch.fencerA?.id);
          persistTouches(touches.touchesB, arena.currentMatch.fencerB?.id);

          // Persister les sorties d'arène
          const exits = this.arenaExits.get(arenaId) ?? [];
          for (const exit of exits) {
            const fencerId =
              exit.fencer === 'A' ? arena.currentMatch.fencerA?.id : arena.currentMatch.fencerB?.id;
            if (!fencerId) continue;
            this.db.saveArenaExit({
              id: `${matchId}-${fencerId}-exit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              matchId,
              fencerId,
              exitType: exit.isVoluntary ? 'arena_exit_voluntary' : 'arena_exit',
              timestamp: now,
              // Escrime olympique : une touche ; Sabre Laser : 3 points (#1027)
              pointsAwarded: ['E', 'F', 'S'].includes(this.sessionWeapon ?? '') ? 1 : 3,
            });
          }
        }
      } catch (e) {
        this.sendDiag(
          `[finishArenaMatch] persistance secondaire échouée (non bloquant): ${(e as Error)?.message}`
        );
        console.warn(
          '[RemoteScoreServer] Persistance secondaire (timing/cartons/touches) échouée:',
          e
        );
      }

    // Enregistrement mode entraînement (pas de DB)
    if (this.isTrainingMode) {
      this.trainingHistory.push({
        id: finishedMatch.id,
        arenaId,
        arenaNumber: arena.number,
        weapon: this.sessionWeapon ?? '',
        scoreA: finishedMatch.scoreA,
        scoreB: finishedMatch.scoreB,
        durationSec: finishedMatch.duration ?? 0,
        finishedAt: new Date().toISOString(),
      });
      // Pré-charger le prochain match entraînement dans la file
      const queue = this.arenaMatchQueue.get(arenaId) ?? [];
      this.arenaMatchQueue.set(arenaId, [...queue, this.createTrainingMatch()]);
    }

    const nextMatch = this.peekNextMatch(arenaId);

    // Mettre à jour l'état en mémoire sans broadcaster (on fait le broadcast manuellement
    // pour pouvoir inclure nextMatch, absent de Arena)
    const arenaRef = this.arenas.get(arenaId)!;
    Object.assign(arenaRef, { status: 'finished', currentMatch: arena.currentMatch });

    this.broadcastArenaUpdate(arenaId, {
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
    this.fireWebhook({
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
      text: `Match terminé — ${finishedMatch.fencerA ? `${finishedMatch.fencerA.lastName} ${finishedMatch.fencerA.firstName}` : '?'} ${finishedMatch.scoreA} – ${finishedMatch.scoreB} ${finishedMatch.fencerB ? `${finishedMatch.fencerB.lastName} ${finishedMatch.fencerB.firstName}` : '?'}`,
    });

    // Persister le score final dans la DB et dans l'audit log (pas en mode entraînement)
    if (!this.isTrainingMode)
      try {
        const finalMatchId = finishedMatch.id;
        const dbMatch = this.db.getMatch(finalMatchId);
        // Pour les matchs TED, l'ID en base est "${competitionId}-${matchId}"
        const compositeId = this.session?.competitionId
          ? `${this.session.competitionId}-${finalMatchId}`
          : null;
        const dbTableauMatch =
          !dbMatch && !finishedMatch.poolId && compositeId ? this.db.getMatch(compositeId) : null;
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
            const mem = this.sessionMatchScores.get(finishedMatch.id);
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
          this.db.updateMatch(effectiveDbId, {
            scoreA: scoreAObj,
            scoreB: scoreBObj,
            status: MatchStatus.FINISHED,
          });
          this.db.logScoreChange({
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
    if (mainWindow && !this.isTrainingMode) {
      // Dériver le vainqueur depuis la DB pour gérer le cas tirage au sort (scores égaux)
      let winnerForRenderer: 'A' | 'B' | null =
        finishedMatch.scoreA > finishedMatch.scoreB
          ? 'A'
          : finishedMatch.scoreB > finishedMatch.scoreA
            ? 'B'
            : null;
      if (!winnerForRenderer) {
        try {
          const dbM = this.db.getMatch(finishedMatch.id) as any;
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
        const memScore = this.sessionMatchScores.get(finishedMatch.id);
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
    if (mainWindow && this.isTrainingMode) {
      mainWindow.webContents.send('training:match_finished', {
        record: this.trainingHistory[this.trainingHistory.length - 1] ?? null,
      });
    }

    this.persistArenaState(arenaId);
    this.broadcastDashboardUpdate();

    // Charger automatiquement le prochain match après un délai
    // (loadNextMatch gère aussi le cas "plus de matchs" → arène idle)
    setTimeout(() => {
      const a = this.arenas.get(arenaId);
      if (a && a.status === 'finished') {
        this.loadNextMatch(arenaId);
      }
    }, 3000);
  }

  /** Arbitres de la compétition au format session (lus en base). */
  private loadSessionReferees(competitionId: string): RemoteSession['referees'] {
    return this.db.getRefereesByCompetition(competitionId).map(r => ({
      id: r.id,
      name: `${r.firstName} ${r.lastName}`.trim(),
      code: r.license ?? r.ref.toString(),
      isActive: r.status !== 'unavailable',
      lastActivity: r.updatedAt,
    }));
  }

  /**
   * Liste des arbitres de la session, rafraîchie depuis la base : les arbitres
   * ajoutés/importés après le démarrage de la session doivent apparaître sur la tablette.
   */
  private getSessionReferees(): RemoteSession['referees'] {
    if (!this.session) return [];
    const competitionId = this.session.competitionId;
    if (competitionId && competitionId !== '__training__') {
      try {
        this.session.referees = this.loadSessionReferees(competitionId);
      } catch {
        // base indisponible → garder la dernière liste connue
      }
    }
    return this.session.referees ?? [];
  }

  private resolveReferee(refereeId?: string | null): { id: string; name: string } | null {
    if (!refereeId || !this.session) return null;
    const ref =
      (this.session.referees ?? []).find(r => r.id === refereeId) ??
      this.getSessionReferees().find(r => r.id === refereeId);
    return ref ? { id: ref.id, name: ref.name } : null;
  }

  /**
   * Arbitre(s) assigné(s) à la poule (session_state), pour pré-remplir la tablette (#908).
   * id = arbitre principal ; name = tous les arbitres de la poule.
   */
  private resolvePoolReferee(poolId?: string | null): { id: string; name: string } | null {
    if (!poolId || !this.session) return null;
    try {
      const state = this.db.getSessionState(this.session.competitionId);
      const pool = (state?.pools || []).find((p: any) => p?.id === poolId);
      const refs: any[] = Array.isArray(pool?.referees)
        ? pool.referees.filter((r: any) => r?.id)
        : [];
      if (refs.length === 0) return null;
      const names = refs.map(
        r =>
          this.resolveReferee(r.id)?.name ??
          ([r.lastName, r.firstName].filter(Boolean).join(' ') || r.name || '')
      );
      return { id: refs[0].id, name: names.filter(Boolean).join(' / ') };
    } catch {
      return null;
    }
  }

  /**
   * Arbitres multiples d'un match de tableau (session_state, mode expert, #908).
   * Ne renvoie qu'avec ≥ 2 arbitres ; sinon le refereeId du match suffit.
   */
  private resolveTableauMatchReferees(
    matchId?: string | null
  ): { id: string; name: string } | null {
    if (!matchId || !this.session) return null;
    try {
      const state = this.db.getSessionState(this.session.competitionId);
      const all: any[] = [
        ...(Array.isArray(state?.tableauMatches) ? state.tableauMatches : []),
        ...(Array.isArray(state?.consolationBrackets)
          ? state.consolationBrackets.flatMap((b: any) =>
              Array.isArray(b?.matches) ? b.matches : []
            )
          : []),
      ];
      const m = all.find((x: any) => x?.id === matchId);
      const refs: any[] = Array.isArray(m?.referees) ? m.referees.filter((r: any) => r?.id) : [];
      if (refs.length < 2) return null;
      const names = refs.map(
        r =>
          this.resolveReferee(r.id)?.name ??
          ([r.lastName, r.firstName].filter(Boolean).join(' ') || r.name || '')
      );
      return { id: refs[0].id, name: names.filter(Boolean).join(' / ') };
    } catch {
      return null;
    }
  }

  /**
   * Arbitre(s) d'un match de tableau envoyé par l'appli (referees mode expert, sinon referee).
   * id = arbitre principal ; name = tous les arbitres (#977).
   */
  private resolveDeMatchReferee(m: any): { id: string; name: string } | null {
    const refs: any[] = Array.isArray(m?.referees) ? m.referees.filter((r: any) => r?.id) : [];
    if (refs.length === 0 && m?.referee?.id) refs.push(m.referee);
    if (refs.length === 0) return this.resolveReferee(m?.refereeId);
    const names = refs.map(
      r =>
        this.resolveReferee(r.id)?.name ??
        ([r.lastName, r.firstName].filter(Boolean).join(' ') || r.name || '')
    );
    return { id: refs[0].id, name: names.filter(Boolean).join(' / ') };
  }

  private isDeMatchBlocked(matchId: string): boolean {
    const sm = this.sessionMatches.find((m: any) => m.id === matchId);
    if (!sm?.round) return false;
    return this.sessionMatches.some((m: any) => {
      if (m.poolId || m.round === undefined || m.round <= sm.round) return false;
      const scoreUpdate = this.sessionMatchScores.get(m.id);
      const effectiveStatus = scoreUpdate?.status ?? m.status;
      return effectiveStatus !== MatchStatus.FINISHED && effectiveStatus !== 'finished';
    });
  }

  private peekNextMatch(arenaId: string): ArenaMatch | null {
    const arena = this.arenas.get(arenaId);
    if (!arena || !this.session) return null;

    const currentMatchId = arena.currentMatch?.id;
    const currentPoolId = this.arenaHomePoolId(arena);

    // Match réassigné sur cette piste : joué en priorité (#1037)
    const guest = this.guestQueue(arenaId).find(m => m.id !== currentMatchId);
    if (guest) return guest;

    if (currentPoolId && this.sessionMatches.length > 0) {
      const rawPoolMatches = this.sessionMatches
        .filter((m: any) => {
          const matchPoolId = m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`;
          return matchPoolId === currentPoolId;
        })
        .map((m: any) => {
          const scoreUpdate = this.sessionMatchScores.get(m.id);
          return scoreUpdate ? { ...m, ...scoreUpdate } : m;
        });
      const poolMatches = this.applySmartMatchOrder(rawPoolMatches as Match[]).filter(
        m => m.status !== MatchStatus.FINISHED && this.isMatchPlayable(m)
      );
      const nextMatch = poolMatches.find(m => {
        if (m.id === currentMatchId) return false;
        const override = this.poolMatchArenaOverrides.get(m.id);
        return !override || override === arenaId;
      });
      if (nextMatch) {
        const nextReferee = this.resolveReferee(
          (nextMatch as any).refereeId ?? nextMatch.referee?.id
        );
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

    const deQueue = this.arenaMatchQueue.get(arenaId) || [];
    if (deQueue.length > 0) {
      const nextDeMatch = deQueue[0];
      return nextDeMatch;
    }

    return null;
  }

  private loadNextMatch(arenaId: string): void {
    const arena = this.arenas.get(arenaId);
    if (!arena || !this.session) {
      console.log(
        `[RemoteScoreServer] Impossible de charger le match suivant: arène ou session invalide`
      );
      return;
    }

    const currentMatchId = arena.currentMatch?.id;
    const currentPoolId = this.arenaHomePoolId(arena);
    let completedPoolId: string | null = null;

    console.log(
      `[RemoteScoreServer] loadNextMatch: arena=${arenaId}, pool=${currentPoolId}, total=${this.sessionMatches.length}`
    );

    // Si pas de matches en mémoire, essayer la DB (sauf mode entraînement)
    if (this.sessionMatches.length === 0 && !this.isTrainingMode) {
      console.log('[RemoteScoreServer] Pas de matches en mémoire, recherche dans la DB...');
      const pendingMatches = this.db.getPendingMatches(this.session.competitionId);
      if (pendingMatches.length === 0) {
        console.log('[RemoteScoreServer] Pas de matches non plus en DB');
        arena.currentMatch = null;
        arena.status = 'idle';
        this.updateArena(arenaId, { currentMatch: null, status: 'idle' });
        return;
      }
      // Ajouter les matches de la DB à sessionMatches
      this.sessionMatches = pendingMatches;
    }

    // Match réassigné sur cette piste : joué en priorité (#1037)
    const guest = this.guestQueue(arenaId).find(m => m.id !== currentMatchId);
    if (guest) {
      this.arenaMatchQueue.set(
        arenaId,
        (this.arenaMatchQueue.get(arenaId) || []).filter(m => m.id !== guest.id)
      );
      this.assignMatchToArena(arenaId, guest);
      return;
    }

    // Chercher le prochain match dans le même pool (ordre smart = même ordre que l'affichage)
    if (currentPoolId) {
      const rawPoolMatches = this.sessionMatches
        .filter(m => {
          const matchPoolId = m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`;
          return matchPoolId === currentPoolId;
        })
        .map((m: any) => {
          const scoreUpdate = this.sessionMatchScores.get(m.id);
          return scoreUpdate ? { ...m, ...scoreUpdate } : m;
        });
      const poolMatches = this.applySmartMatchOrder(rawPoolMatches as Match[]).filter(
        m => m.status !== MatchStatus.FINISHED && this.isMatchPlayable(m)
      );

      console.log(
        `[RemoteScoreServer] ${poolMatches.length} matches en attente dans le pool ${currentPoolId} (ordre smart)`
      );

      // Respecter les overrides de piste : ignorer les matchs pré-assignés à une autre arène
      let nextMatch = poolMatches.find(m => {
        if (m.id === currentMatchId) return false;
        const override = this.poolMatchArenaOverrides.get(m.id);
        return !override || override === arenaId;
      });
      // Si rien de dispo pour cette arène, chercher un match explicitement redirigé ici
      if (!nextMatch) {
        nextMatch = poolMatches.find(
          m => m.id !== currentMatchId && this.poolMatchArenaOverrides.get(m.id) === arenaId
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

        this.assignMatchToArena(arenaId, arenaMatch);
        return;
      }

      console.log(
        `[RemoteScoreServer] Plus de matches dans le pool ${currentPoolId} pour l'arène ${arenaId}`
      );

      // Vérifier si la poule est entièrement terminée (tous matchs FINISHED en DB)
      if (!this.isTrainingMode)
        try {
          const allPoolMatches = this.db.getMatchesByPool(currentPoolId);
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
    const deQueue = this.arenaMatchQueue.get(arenaId) || [];
    if (deQueue.length > 0) {
      const nextDeMatch = deQueue[0];

      this.arenaMatchQueue.set(arenaId, deQueue.slice(1));
      console.log(
        `[RemoteScoreServer] Match DE suivant ${nextDeMatch.id} chargé depuis la file sur arène ${arenaId}`
      );
      this.assignMatchToArena(arenaId, nextDeMatch);
      return;
    }

    // Plus aucun match - marquer l'arène comme vide
    arena.currentMatch = null;
    arena.status = 'idle';
    arena.startTime = null;

    this.updateArena(arenaId, {
      currentMatch: null,
      status: 'idle',
      startTime: null,
      ...(completedPoolId ? { poolComplete: true, completedPoolId } : {}),
    });
    this.persistArenaState(arenaId);
    console.log(`[RemoteScoreServer] Arène ${arenaId} marquée comme vide`);
  }

  private buildDashboardSnapshot(): {
    rankings: any[];
    pools: any[];
    liveMatches: any[];
    eta?: { finishAt: string; basis: string; remainingMatches: number; perMatchMinutes: number };
  } | null {
    if (!this.session) return null;
    if (this.isTrainingMode) return { rankings: [], pools: [], liveMatches: [] };
    const { competitionId } = this.session;

    // Classement global (depuis les poules terminées)
    let rankings: any[] = [];
    try {
      const fencers = this.db.getFencersByCompetition(competitionId);
      rankings = fencers
        .filter((f: any) => f.poolStats)
        .map((f: any) => {
          const stats = typeof f.poolStats === 'string' ? JSON.parse(f.poolStats) : f.poolStats;
          return {
            lastName: f.lastName,
            firstName: f.firstName,
            club: f.club || '',
            victories: stats?.victories ?? 0,
            quest: stats?.questPoints ?? stats?.touchesScored ?? 0,
          };
        })
        .sort((a: any, b: any) => b.victories - a.victories || b.quest - a.quest);
    } catch {
      /* */
    }

    // État des poules
    const pools: any[] = [];
    try {
      const matchesByPool = new Map<string, any[]>();
      for (const m of this.sessionMatches) {
        const pid = m.poolId || m.pool?.id;
        if (!pid) continue;
        if (!matchesByPool.has(pid)) matchesByPool.set(pid, []);
        matchesByPool.get(pid)!.push(m);
      }
      let poolNum = 1;
      for (const [pid, pMatches] of matchesByPool) {
        const isComplete = pMatches.every((m: any) => {
          const u = this.sessionMatchScores.get(m.id);
          return u ? u.status === 'finished' : m.status === 'finished';
        });
        pools.push({ id: pid, number: poolNum++, isComplete, ranking: [] });
      }
    } catch {
      /* */
    }

    // Matchs en direct (arènes actives)
    const liveMatches: any[] = [];
    for (const arena of this.arenas.values()) {
      if (arena.currentMatch && arena.status === 'in_progress') {
        const m = arena.currentMatch;
        liveMatches.push({
          number: arena.number,
          poolNumber: m.poolId || null,
          fencerA: `${m.fencerA?.lastName ?? ''} ${m.fencerA?.firstName ?? ''}`.trim(),
          fencerB: `${m.fencerB?.lastName ?? ''} ${m.fencerB?.firstName ?? ''}`.trim(),
          clubA: m.fencerA?.club || '',
          clubB: m.fencerB?.club || '',
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          winner: m.status === 'finished' ? (m.scoreA > m.scoreB ? 'A' : 'B') : null,
        });
      }
    }

    const eta = this.computePhaseEta();

    return { rankings, pools, liveMatches, eta };
  }

  /** Fin estimée de la phase en cours, d'après les durées réelles des matchs (#1077). */
  private computePhaseEta(): {
    finishAt: string;
    basis: string;
    remainingMatches: number;
    perMatchMinutes: number;
  } {
    const remainingMatches = this.sessionMatches.filter(m => {
      const u = this.sessionMatchScores.get(m.id);
      return (u ? u.status : m.status) !== 'finished';
    }).length;
    const estimate = estimatePhaseEta({
      durationsMs: this.recentMatchDurationsMs,
      remainingMatches,
      activeArenas: this.arenas.size,
      now: Date.now(),
    });
    return {
      finishAt: new Date(estimate.finishAt).toISOString(),
      basis: estimate.basis,
      remainingMatches: estimate.remainingMatches,
      perMatchMinutes: Math.round(estimate.perMatchMs / 60_000),
    };
  }

  public broadcastDashboardUpdate(): void {
    // Aucun dashboard abonné : inutile de relire la base (le snapshot est envoyé
    // à l'abonnement, cf. dashboard:subscribe)
    const rooms = this.io?.sockets?.adapter?.rooms;
    if (rooms && !rooms.get('dashboard')?.size) return;
    const snapshot = this.buildDashboardSnapshot();
    if (!snapshot) return;
    this.io.to('dashboard').emit('rankings:update', { rankings: snapshot.rankings });
    this.io.to('dashboard').emit('pools:update', { pools: snapshot.pools });
    this.io.to('dashboard').emit('matches:update', { matches: snapshot.liveMatches });
    if (snapshot.eta) this.io.to('dashboard').emit('eta:update', snapshot.eta);
  }

  // matchId pour lequel les photos ont déjà été diffusées, par arène : les updates
  // suivants du même match sont envoyés sans photos (delta ~1 Ko au lieu de ~1 Mo)
  private arenaPhotoSentForMatch: Map<string, string> = new Map();

  /** Clone l'update sans les photos base64 (sans muter l'état partagé de l'arène). */
  private stripPhotosFromUpdate(update: ArenaUpdate): ArenaUpdate {
    const stripFencer = <T extends { photo?: string } | null | undefined>(f: T): T => {
      if (!f || !(f as any).photo) return f;
      const { photo: _photo, ...rest } = f as any;
      return rest as T;
    };
    const stripMatch = (m: ArenaUpdate['match']): ArenaUpdate['match'] =>
      m ? { ...m, fencerA: stripFencer(m.fencerA), fencerB: stripFencer(m.fencerB) } : m;
    return {
      ...update,
      match: stripMatch(update.match),
      nextMatch: update.nextMatch ? stripMatch(update.nextMatch) : update.nextMatch,
      fencerA: stripFencer(update.fencerA),
      fencerB: stripFencer(update.fencerB),
    };
  }

  private broadcastArenaUpdate(arenaId: string, update: ArenaUpdate): void {
    const arena = this.getArena(arenaId);
    const override = this.arenaThemeOverrides.get(arenaId);
    const isPoolMatch = !!arena?.currentMatch?.poolId;
    const updateWithPhotos: ArenaUpdate = {
      ...update,
      swapped: arena?.swapped ?? false,
      showPhotos: this.sessionShowPhotos,
      cardAnnounce: this.sessionCardAnnounce,
      theme: override?.theme ?? this.sessionTheme,
      customTheme: override?.customTheme,
      screenThemes: this.arenaScreenThemes.get(arenaId),
      refereeFeatureEnabled: this.sessionRefereeFeatureEnabled,
      blackCardEnabled: this.sessionBlackCardEnabled,
      referees: this.getSessionReferees(),
      timerDuration: isPoolMatch ? this.sessionPoolTimerSeconds : this.sessionTableTimerSeconds,
      refereeSelected: this.arenaRefereeSelected.get(arenaId) ?? false,
    };

    // Photos envoyées une seule fois par match : les updates suivants partent sans
    // (les clients qui rejoignent en cours de match reçoivent l'état complet au join_arena)
    const matchId = updateWithPhotos.match?.id;
    let payload = updateWithPhotos;
    if (matchId) {
      if (this.arenaPhotoSentForMatch.get(arenaId) === matchId) {
        payload = this.stripPhotosFromUpdate(updateWithPhotos);
      } else {
        this.arenaPhotoSentForMatch.set(arenaId, matchId);
      }
    }

    // Stocker dans le buffer de replay (TTL + max size)
    const now = Date.now();
    let buf = this.arenaEventBuffer.get(arenaId) ?? [];
    buf = buf.filter(e => now - e.timestamp < this.EVENT_BUFFER_TTL_MS);
    buf.push({ event: payload, timestamp: now });
    if (buf.length > this.EVENT_BUFFER_MAX) buf = buf.slice(-this.EVENT_BUFFER_MAX);
    this.arenaEventBuffer.set(arenaId, buf);

    // Émission limitée à la room de l'arène (les clients join_arena à la connexion) :
    // évite d'envoyer chaque update (photos base64 incluses) à tous les clients de toutes les arènes
    this.io.to(`arena:${arenaId}`).emit(`arena:${arenaId}:update`, payload);

    if ((global as any).mainWindow) {
      (global as any).mainWindow.webContents.send('arena:update', {
        arenaId,
        update: payload,
      });
    }
  }

  private persistArenaState(arenaId: string): void {
    if (!this.session) return;
    try {
      const arena = this.arenas.get(arenaId);
      if (!arena) return;
      this.db.saveArenaState(arenaId, {
        competitionId: this.session.competitionId,
        currentMatch: arena.currentMatch,
        matchQueue: this.arenaMatchQueue.get(arenaId) ?? [],
        settings: arena.settings,
        status: arena.status,
      });
    } catch (err) {
      console.error(`[RemoteScoreServer] Erreur persistance arène ${arenaId}:`, err);
    }
  }

  public setCheckinEnabled(enabled: boolean): void {
    this.checkinEnabled = enabled;
    console.log(`[RemoteScoreServer] Appel distant ${enabled ? 'activé' : 'désactivé'}`);
  }

  public setCheckinPassword(password: string): void {
    // Stocké hashé ; tout changement invalide les sessions ouvertes
    this.assertPasswordStrength(password);
    this.checkinPassword = password ? this.hashPassword(password) : null;
    this.checkinTokens.clear();
    console.log(`[RemoteScoreServer] Mot de passe appel ${password ? 'défini' : 'supprimé'}`);
  }

  private checkCheckinAuth(cookieHeader: string | undefined): boolean {
    if (!this.checkinPassword) return false;
    const token = this.parseCookies(cookieHeader)['bp_checkin_token'];
    return this.isTokenValid(this.checkinTokens, token);
  }

  /** Refus d'accès à l'API d'appel, ou null si autorisé. */
  private checkinGuard(
    cookieHeader: string | undefined
  ): { status: number; body: Record<string, unknown> } | null {
    if (!this.checkinEnabled) {
      return { status: 403, body: { closed: true, error: 'Appel fermé' } };
    }
    if (!this.checkinPassword) {
      return { status: 403, body: { notConfigured: true, error: 'Appel non configuré' } };
    }
    if (!this.checkCheckinAuth(cookieHeader)) {
      return { status: 401, body: { unauthorized: true, error: 'Authentification requise' } };
    }
    return null;
  }

  public setTrainerEnabled(enabled: boolean): void {
    this.trainerEnabled = enabled;
    if (!enabled) this.trainerTokens.clear();
  }

  public setTrainerPassword(password: string): void {
    this.assertPasswordStrength(password);
    this.trainerPassword = password ? this.hashPassword(password) : null;
    this.trainerTokens.clear();
    console.log(`[RemoteScoreServer] Mot de passe formateurs ${password ? 'défini' : 'supprimé'}`);
  }

  private checkTrainerAuth(cookieHeader: string | undefined): boolean {
    if (!this.trainerPassword) return false;
    const token = this.parseCookies(cookieHeader)['bp_trainer_token'];
    return this.isTokenValid(this.trainerTokens, token);
  }

  /** Refus d'accès à l'espace formateurs, ou null si autorisé. */
  private trainerGuard(
    cookieHeader: string | undefined
  ): { status: number; body: Record<string, unknown> } | null {
    if (!this.trainerEnabled || !this.trainerPassword) {
      return { status: 403, body: { notConfigured: true, error: 'Espace formateurs fermé' } };
    }
    if (!this.checkTrainerAuth(cookieHeader)) {
      return { status: 401, body: { unauthorized: true, error: 'Authentification requise' } };
    }
    return null;
  }

  /** Piste où l'arbitre officie actuellement (match assigné ou en cours). */
  private findArenaOfReferee(refereeId: string): Arena | undefined {
    return Array.from(this.arenas.values()).find(
      a =>
        (a.status === 'ready' || a.status === 'in_progress') &&
        a.currentMatch?.referee?.id === refereeId
    );
  }

  private arenaMatchLabel(arena: Arena): string {
    const m = arena.currentMatch;
    const names = [m?.fencerA?.lastName, m?.fencerB?.lastName].filter(Boolean).join(' / ');
    return `Piste ${arena.number}${names ? ` — ${names}` : ''}`;
  }

  /** Active la lecture de X-Forwarded-For (uniquement derrière un reverse proxy de confiance). */
  public setTrustProxy(trust: boolean): void {
    this.trustProxy = trust;
  }

  /** IP du client : adresse de la socket TCP, X-Forwarded-For ignoré sauf trustProxy. */
  private getClientIp(req: express.Request): string {
    const forwarded = this.trustProxy
      ? (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      : undefined;
    const ip = forwarded || req.socket?.remoteAddress || 'unknown';
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  }

  /** Contrôle avant tentative de connexion ; null si autorisé, sinon le délai en secondes. */
  private checkLoginAllowed(ip: string, target: string): { retryAfterSec: number } | null {
    return this.loginGuard.check(ip, target);
  }

  private sendLoginLimited = sendLoginLimited;

  private recordLoginFailure(ip: string, target: string): Promise<void> {
    return this.loginGuard.recordFailure(ip, target);
  }

  private recordLoginSuccess(ip: string): void {
    this.loginGuard.recordSuccess(ip);
  }

  public setRegistrationEnabled(enabled: boolean): void {
    this.registrationEnabled = enabled;
    console.log(`[RemoteScoreServer] Inscription distante ${enabled ? 'activée' : 'désactivée'}`);
  }

  private checkRegistrationRateLimit(ip: string): boolean {
    return this.registrationLimiter.hit(ip);
  }

  private checkScoreRateLimit(ip: string): boolean {
    return this.scoreLimiter.hit(ip);
  }

  public getLocalIPAddress(): string {
    const interfaces = os.networkInterfaces();
    // Adaptateurs virtuels courants sur Windows (Hyper-V, WSL, VirtualBox, VMware…)
    const VIRTUAL_KEYWORDS = [
      'virtual',
      'hyper-v',
      'vmware',
      'virtualbox',
      'vethernet',
      'loopback adapter',
      'pseudo',
      'teredo',
      'isatap',
    ];
    const candidates: string[] = [];

    for (const [name, addrs] of Object.entries(interfaces)) {
      const nameLower = name.toLowerCase();
      if (VIRTUAL_KEYWORDS.some(kw => nameLower.includes(kw))) continue;
      for (const iface of addrs || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          candidates.push(iface.address);
        }
      }
    }

    // Préférer une adresse LAN classique (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    const preferred = candidates.find(
      ip =>
        ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
    );
    return preferred ?? candidates[0] ?? 'localhost';
  }

  public getServerUrl(): string {
    const ip = this.host !== '0.0.0.0' ? this.host : this.getLocalIPAddress();
    const protocol = this.useHttps ? 'https' : 'http';
    return `${protocol}://${ip}:${this.port}`;
  }

  public start(): Promise<void> {
    console.log('[RemoteScoreServer] Démarrage du serveur...');
    console.log(`[RemoteScoreServer] Port: ${this.port}`);
    console.log(`[RemoteScoreServer] Interface: ${this.host}`);
    console.log(
      `[RemoteScoreServer] URL locale: ${this.useHttps ? 'https' : 'http'}://localhost:${this.port}`
    );
    console.log(`[RemoteScoreServer] URL réseau: ${this.getServerUrl()}`);

    return new Promise((resolve, reject) => {
      this.server.once('error', (err: any) => {
        console.error('[RemoteScoreServer] ERREUR DU SERVEUR:', err);
        if (err.code === 'EADDRINUSE') {
          console.error(`[RemoteScoreServer] Le port ${this.port} est déjà utilisé!`);
        }
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        const url = this.getServerUrl();
        console.log(`[RemoteScoreServer] ============================================`);
        console.log(`[RemoteScoreServer] SERVEUR DÉMARRÉ AVEC SUCCÈS ✓`);
        console.log(`[RemoteScoreServer] Port: ${this.port}`);
        console.log(`[RemoteScoreServer] URL: ${url}`);
        console.log(`[RemoteScoreServer] Arènes disponibles: ${this.arenaCount}`);
        console.log(`[RemoteScoreServer] ============================================`);
        console.log(`[RemoteScoreServer] Les arbitres peuvent se connecter sur: ${url}`);
        // Switch from one-shot 'once' error handler to persistent one for runtime errors
        this.server.on('error', (err: any) => {
          console.error('[RemoteScoreServer] ERREUR DU SERVEUR:', err);
        });
        resolve();
      });
    });
  }

  public stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.stopSession();
    // server.close() seul laisse vivre les sockets/connexions keep-alive ouvertes :
    // les tablettes restaient connectées après l'arrêt (#1009).
    this.io?.disconnectSockets?.(true);
    if (this.server) {
      this.server.close();
      (this.server as any).closeAllConnections?.();
      console.log('Remote score server stopped');
    }
  }

  public async startSession(
    competitionId: string,
    strips: number,
    matchesFromRenderer?: any[],
    showPhotos?: boolean,
    kioskViews?: { poules: boolean; classement: boolean; direct: boolean; suivants: boolean },
    cardAnnounce?: boolean
  ): Promise<RemoteSession> {
    if (this.session) {
      throw new Error('Session déjà active');
    }

    const competition = this.db.getCompetition(competitionId);
    if (!competition) {
      throw new Error('Compétition non trouvée');
    }

    // Stocker le réglage d'affichage des photos
    this.sessionShowPhotos = showPhotos ?? false;

    // Stocker le réglage d'annonce de carton
    this.sessionCardAnnounce = cardAnnounce ?? false;

    // Stocker l'activation de la gestion des arbitres
    this.sessionRefereeFeatureEnabled = competition.settings?.refereeFeatureEnabled ?? false;

    // Carton noir : désactivé par défaut, activable dans les propriétés de la compétition
    this.sessionBlackCardEnabled = competition.settings?.blackCardEnabled === true;

    // Stocker les vues kiosk activées
    this.sessionKioskViews = {
      tableau: true,
      ...(kioskViews ?? {
        poules: true,
        classement: true,
        direct: true,
        suivants: true,
      }),
    };

    // Stocker le type d'arme pour l'arrêt automatique à 15 points en Laser Sabre
    this.sessionWeapon = competition.weapon || null;
    this.sessionPoolTimerSeconds = competition.settings?.defaultPoolTimerSeconds ?? 180;
    this.sessionTableTimerSeconds = competition.settings?.defaultTableTimerSeconds ?? 180;
    console.log(`[RemoteScoreServer] Type d'arme de la compétition: ${this.sessionWeapon}`);

    // Auto-detect number of strips from pool count if not specified or too small.
    // Ne pas ajuster pour une session DE pure (uniquement des matchs tableau) car le nombre de
    // poules de la phase précédente ne doit pas gonfler le nombre d'arènes d'élimination.
    const poolCount = this.db.getPoolCount(competitionId);
    const isDeOnlySession =
      matchesFromRenderer &&
      matchesFromRenderer.length > 0 &&
      matchesFromRenderer.every((m: any) => m.isTableau || m.__poolFencers);
    if (!isDeOnlySession && strips <= 0) {
      const actualStrips = poolCount > 0 ? poolCount : 1;
      console.log(
        `[RemoteScoreServer] Strips invalide (${strips}), ajustement automatique: ${actualStrips} (basé sur ${poolCount} poules)`
      );
      strips = actualStrips;
    }

    // Pistes assignées aux poules (pool.strip) : poolId → n° de piste.
    // Le nombre d'arènes est étendu si une poule vise une piste au-delà du nombre configuré.
    const poolStripMap = new Map<string, number>();
    for (const m of matchesFromRenderer ?? []) {
      const s = Number((m as any).__poolFencers ? (m as any).strip : NaN);
      if (Number.isInteger(s) && s > 0 && s <= 20) poolStripMap.set(m.poolId, s);
    }
    const maxPoolStrip = Math.max(0, ...poolStripMap.values());
    if (maxPoolStrip > strips) {
      console.log(
        `[RemoteScoreServer] Nombre d'arènes étendu de ${strips} à ${maxPoolStrip} (piste assignée à une poule)`
      );
      strips = maxPoolStrip;
    }

    // Configurer le nombre d'arènes
    this.setArenaCount(strips);

    // Réinitialiser les caches pour éviter toute pollution d'une session précédente
    this.poolFencersCache.clear();
    this.poolSignaturesCache.clear();

    // Utiliser les matches passés depuis le renderer si disponibles, sinon chercher dans la DB
    let allMatches: any[] = [];
    const poolNumberMap = new Map<string, number>();
    if (matchesFromRenderer && matchesFromRenderer.length > 0) {
      console.log(`[RemoteScoreServer] ${matchesFromRenderer.length} matchs reçus du renderer`);

      // Extraire les marqueurs d'ordre des tireurs injectés par le renderer (__poolFencers)
      // Nécessaire car l'ordre FIE (ex: 4 tireurs: [1,4],[2,3],...) ne permet pas de reconstruire
      // l'ordre correct par simple extraction des paires de matchs.
      const fencerOrderMap = new Map<string, any[]>();
      const realMatches: any[] = [];
      for (const m of matchesFromRenderer) {
        if ((m as any).__poolFencers) {
          fencerOrderMap.set(m.poolId, m.fencers);
          if ((m as any).poolNumber != null) poolNumberMap.set(m.poolId, (m as any).poolNumber);
        } else {
          realMatches.push(m);
        }
      }
      // Pré-remplir le cache uniquement si la liste de tireurs est non vide
      for (const [poolId, fencers] of fencerOrderMap) {
        if (fencers && fencers.length > 0) {
          this.poolFencersCache.set(poolId, fencers);
          console.log(
            `[RemoteScoreServer] Cache tireurs pre-rempli pour pool ${poolId}: ${fencers.length} tireurs`
          );
        } else {
          console.warn(
            `[RemoteScoreServer] Marqueur __poolFencers vide pour pool ${poolId}, fallback DB`
          );
        }
      }

      allMatches = realMatches.filter(
        m =>
          m.isTableau
            ? (!m.status || m.status === 'not_started' || m.status === 'in_progress') &&
              m.fencerA &&
              m.fencerB
            : true // Tous les matchs de poule, y compris finished (nécessaires pour la grille)
      );
      console.log(`[RemoteScoreServer] ${allMatches.length} matchs après filtrage`);
    } else {
      // Récupérer les matchs en attente depuis la DB
      console.log('[RemoteScoreServer] Pas de matches reçus, recherche dans la DB...');
      const pendingMatches = this.db.getPendingMatches(competitionId);
      console.log(
        `[RemoteScoreServer] ${pendingMatches.length} matchs en attente trouvés pour la compétition ${competitionId}`
      );

      // Si pas de matchs trouvés via getPendingMatches (phases), essayer de récupérer via pool_fencers
      allMatches = pendingMatches;
      if (pendingMatches.length === 0) {
        console.log('[RemoteScoreServer] Tentative de récupération des matchs via pool_fencers...');
        allMatches = this.db.getAllPendingMatchesFromPools(competitionId);
        console.log(`[RemoteScoreServer] ${allMatches.length} matchs trouvés via fallback`);
      }
    }

    // Stocker les matches pour pouvoir les utiliser pour charger le match suivant
    this.sessionMatches = allMatches;
    console.log(`[RemoteScoreServer] ${this.sessionMatches.length} matches stockés en mémoire`);

    // Grouper les matches par pool
    const matchesByPool = new Map<string, any[]>();
    for (const match of allMatches) {
      if (match.isTableau) continue; // Les matchs DE sont traités séparément plus bas
      const poolId = match.poolId || match.pool?.id || `pool-${match.poolNumber || match.number}`;
      if (!matchesByPool.has(poolId)) {
        matchesByPool.set(poolId, []);
      }
      matchesByPool.get(poolId)!.push(match);
    }
    console.log(
      `[RemoteScoreServer] ${matchesByPool.size} pools trouvées:`,
      Array.from(matchesByPool.keys())
    );

    // Construire le cache des tireurs par pool depuis la DB (ordre par position)
    // Note: les pools déjà remplis via les marqueurs __poolFencers du renderer sont conservés.
    this.sessionMatchScores.clear();
    for (const [poolId, poolMatches] of matchesByPool) {
      // Déjà rempli par les marqueurs du renderer → ordre correct garanti
      if (this.poolFencersCache.has(poolId)) continue;
      const dbFencers = this.db.getPoolFencers(poolId);
      if (dbFencers.length > 0) {
        this.poolFencersCache.set(poolId, dbFencers);
      } else {
        // Fallback si poolId synthétique (pool-N) sans correspondance DB.
        // Trier par number avant d'extraire pour reconstruire l'ordre naturel du pool :
        // la première apparition de chaque tireur dans l'ordre des matchs FIE correspond
        // à sa position dans la poule (match 1 : pos1 vs pos4, match 2 : pos2 vs pos3…).
        const sortedMatches = [...poolMatches].sort(
          (a: any, b: any) => (a.number || 0) - (b.number || 0)
        );
        const fencerMap = new Map<string, any>();
        for (const match of sortedMatches) {
          if (match.fencerA?.id) fencerMap.set(match.fencerA.id, match.fencerA);
          if (match.fencerB?.id) fencerMap.set(match.fencerB.id, match.fencerB);
        }
        this.poolFencersCache.set(poolId, Array.from(fencerMap.values()));
      }
    }

    // Assigner les matchs aux arènes par pool (Pool 1 -> Arena 1, Pool 2 -> Arena 2, etc.)
    console.log(`[RemoteScoreServer] Assignation des matches par pool aux ${strips} arènes`);

    // Trier les poules par numéro pour garantir Poule 1 → Arène 1, Poule 2 → Arène 2, etc.
    // poolNumberMap est peuplé par les marqueurs __poolFencers du renderer ;
    // le fallback extrait les chiffres du poolId (ex: "pool-0" → 0, "pool-1" → 1).
    const sortedPoolEntries = Array.from(matchesByPool.entries()).sort((a, b) => {
      const numA = poolNumberMap.get(a[0]) ?? parseInt(a[0].replace(/\D/g, '') || '999', 10);
      const numB = poolNumberMap.get(b[0]) ?? parseInt(b[0].replace(/\D/g, '') || '999', 10);
      return numA - numB;
    });

    // Piste cible par poule : pool.strip si défini, sinon première piste libre (ordre des poules)
    const poolArenaMap = new Map<string, number>();
    const usedStrips = new Set(poolStripMap.values());
    let nextFreeStrip = 1;
    for (const [poolId] of sortedPoolEntries) {
      const assigned = poolStripMap.get(poolId);
      if (assigned) {
        poolArenaMap.set(poolId, assigned);
        continue;
      }
      while (usedStrips.has(nextFreeStrip)) nextFreeStrip++;
      if (nextFreeStrip > strips) continue;
      poolArenaMap.set(poolId, nextFreeStrip);
      usedStrips.add(nextFreeStrip);
    }

    for (const [poolId, poolMatches] of sortedPoolEntries) {
      const arenaNumber = poolArenaMap.get(poolId);
      if (!arenaNumber) continue;

      const arenaId = `arena${arenaNumber}`;

      // Premier match non terminé et non en cours (évite le curseur orange au démarrage)
      const firstMatch = poolMatches.find(
        m => m.status !== 'finished' && m.status !== 'in_progress'
      );

      if (!firstMatch) {
        // Tous les matchs sont terminés ou en cours : lier la pool à l'arène sans assigner de match
        const anyMatch = poolMatches[0];
        const arena = this.arenas.get(arenaId);
        if (anyMatch && arena && !arena.currentMatch) {
          arena.activePoolId = poolId;
          this.arenaNextMatchIndex.set(arenaId, poolMatches.length);
        }
        continue;
      }

      console.log(
        `[RemoteScoreServer] Pool ${poolId} -> Arène ${arenaId}, ${poolMatches.length} matches`
      );

      const arenaMatch: ArenaMatch = {
        id: firstMatch.id,
        poolId: poolId,
        fencerA: firstMatch.fencerA!,
        fencerB: firstMatch.fencerB!,
        scoreA: firstMatch.scoreA?.value ?? 0,
        scoreB: firstMatch.scoreB?.value ?? 0,
        status: 'not_started',
        startTime: null,
        endTime: null,
      };

      if (this.arenas.get(arenaId)?.currentMatch) {
        // Piste déjà occupée par une autre poule → cette poule enchaîne ensuite (file)
        const queue = this.arenaMatchQueue.get(arenaId) || [];
        this.arenaMatchQueue.set(arenaId, [...queue, arenaMatch]);
        console.log(
          `[RemoteScoreServer] Pool ${poolId} mise en file sur l'arène ${arenaId} (piste partagée)`
        );
        continue;
      }

      this.assignMatchToArena(arenaId, arenaMatch);

      // Index du prochain match = position de firstMatch + 1 dans la liste originale
      const firstMatchIndex = poolMatches.findIndex(m => m.id === firstMatch.id);
      this.arenaNextMatchIndex.set(arenaId, firstMatchIndex + 1);

      console.log(
        `[RemoteScoreServer] Match ${firstMatch.id} (Pool ${poolId}) assigné à l'arène ${arenaId}`
      );
    }

    // Distribuer les matchs d'élimination directe (sans poolId) dans les files par arène
    // Tri décroissant : 8ès en premier, finale en dernier → pistes chargées dans l'ordre logique
    const deMatches = allMatches
      .filter(m => !m.poolId && (m.round !== undefined || m.isTableau) && m.fencerA && m.fencerB)
      .sort((a: any, b: any) => (b.round || 0) - (a.round || 0));

    if (deMatches.length > 0) {
      console.log(
        `[RemoteScoreServer] ${deMatches.length} matchs DE à distribuer sur ${strips} arènes`
      );
      const queuesByArena = new Map<string, ArenaMatch[]>();
      for (let i = 1; i <= strips; i++) queuesByArena.set(`arena${i}`, []);

      for (const match of deMatches) {
        if (!match.arena) continue; // pas de piste assignée → ne pas distribuer
        const targetArenaId = `arena${match.arena}`;
        if (!queuesByArena.has(targetArenaId)) continue; // hors plage → ignorer
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
        });
      }

      for (const [arenaId, queue] of queuesByArena) {
        const arena = this.arenas.get(arenaId);
        if (!arena) continue;
        const firstPlayable = !arena.currentMatch && queue.length > 0 ? queue[0] : undefined;
        if (firstPlayable) {
          // Arène libre → charger le premier match non bloqué directement
          this.assignMatchToArena(arenaId, firstPlayable);
          this.arenaMatchQueue.set(
            arenaId,
            queue.filter(m => m.id !== firstPlayable.id)
          );
          console.log(
            `[RemoteScoreServer] Match DE ${firstPlayable.id} chargé sur arène ${arenaId}, ${queue.length - 1} en file`
          );
        } else {
          // Arène occupée ou tous les matchs bloqués → tout en file
          const existing = this.arenaMatchQueue.get(arenaId) || [];
          this.arenaMatchQueue.set(arenaId, [...existing, ...queue]);
          console.log(
            `[RemoteScoreServer] ${queue.length} matchs DE mis en file sur arène ${arenaId}`
          );
        }
      }
    }

    // Créer la session - utiliser allMatches au lieu de pendingMatches
    const assignedMatchCount = Math.min(allMatches.length, strips);
    const sessionReferees = this.loadSessionReferees(competitionId);
    this.session = {
      competitionId,
      strips: Array.from({ length: strips }, (_, i) => ({
        number: i + 1,
        status: i < assignedMatchCount ? 'occupied' : 'available',
      })),
      referees: sessionReferees,
      activeMatches: [],
      isRunning: true,
      startTime: new Date(),
    };

    console.log(`[RemoteScoreServer] Session créée avec ${assignedMatchCount} matchs assignés`);

    return this.session;
  }

  public launchCompetition(): void {
    if (!this.session) {
      console.log('[RemoteScoreServer] launchCompetition: aucune session active');
      return;
    }

    let launched = 0;
    for (const [arenaId, arena] of this.arenas) {
      if (arena.currentMatch && arena.currentMatch.status === 'not_started') {
        console.log(
          `[RemoteScoreServer] Lancement du match ${arena.currentMatch.id} sur arène ${arenaId}`
        );
        arena.currentMatch.status = 'ready';
        this.updateArena(arenaId, { status: 'ready', currentMatch: arena.currentMatch });
        launched++;
      }
    }
    console.log(`[RemoteScoreServer] ${launched} matchs lancés`);
  }

  public stopSession(): void {
    this.isTrainingMode = false;
    this.trainingCustomRules = null;
    this.session = null;
    this.sessionMatches = [];
    this.arenaMatchQueue.clear();
    this.arenaNextMatchIndex.clear();
    this.poolMatchArenaOverrides.clear();
    this.poolFencersCache.clear();
    this.poolSignaturesCache.clear();
    this.sessionMatchScores.clear();
    this.arenaTokens.clear();
    this.arenaEventBuffer.clear();
    this.clearArenaCombatState();
  }

  public async startTrainingSession(
    strips: number,
    weapon: string,
    customRules?: {
      matchDurationSeconds?: number;
      allowedZones?: string[];
      disableSuddenDeath?: boolean;
    }
  ): Promise<RemoteSession> {
    if (this.session) throw new Error('Session déjà active');
    const effectiveStrips = Math.max(1, Math.min(strips, 20));
    this.isTrainingMode = true;
    this.trainingHistory = [];
    this.sessionWeapon = weapon;
    const duration = customRules?.matchDurationSeconds ?? 180;
    this.sessionPoolTimerSeconds = duration;
    this.sessionTableTimerSeconds = duration;
    this.trainingCustomRules = {
      matchDurationSeconds: duration,
      allowedZones: customRules?.allowedZones ?? [],
      disableSuddenDeath: customRules?.disableSuddenDeath ?? false,
    };
    this.sessionShowPhotos = false;
    this.sessionCardAnnounce = false;
    this.sessionRefereeFeatureEnabled = false;
    this.sessionBlackCardEnabled = false;
    this.sessionBlackCards.clear();
    this.sessionKioskViews = {
      poules: false,
      classement: true,
      direct: true,
      suivants: false,
      tableau: false,
    };
    this.sessionMatchScores.clear();
    this.poolFencersCache.clear();
    this.poolSignaturesCache.clear();
    this.setArenaCount(effectiveStrips);
    this.sessionMatches = [];
    this.session = {
      competitionId: '__training__',
      strips: Array.from({ length: effectiveStrips }, (_, i) => ({
        number: i + 1,
        status: 'available' as const,
      })),
      referees: [],
      activeMatches: [],
      isRunning: true,
      startTime: new Date(),
    };
    for (let i = 1; i <= effectiveStrips; i++) {
      this.assignMatchToArena(`arena${i}`, this.createTrainingMatch());
    }
    console.log(
      `[RemoteScoreServer] Session entraînement démarrée: ${effectiveStrips} pistes, arme=${weapon}`
    );
    return this.session;
  }

  private createTrainingMatch(): ArenaMatch {
    return {
      id: `training-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      poolId: '__training__',
      fencerA: { id: 'training-A', firstName: '', lastName: 'Tireur A', club: '', ref: 0 } as any,
      fencerB: { id: 'training-B', firstName: '', lastName: 'Tireur B', club: '', ref: 0 } as any,
      scoreA: 0,
      scoreB: 0,
      status: 'not_started',
      startTime: null,
      endTime: null,
    };
  }

  public getTrainingHistory() {
    return [...this.trainingHistory];
  }

  public stopTrainingSession(): void {
    this.stopSession();
  }

  public updateStripCount(newCount: number): RemoteSession | null {
    if (!this.session) {
      throw new Error('Aucune session active');
    }

    const currentCount = this.session.strips.length;

    if (newCount > currentCount) {
      // Add new strips
      for (let i = currentCount; i < newCount; i++) {
        this.session.strips.push({
          number: i + 1,
          status: 'available',
        });
      }
    } else if (newCount < currentCount) {
      // Remove strips (only available ones)
      const availableStrips = this.session.strips.filter(s => s.status === 'available');
      const toRemove = currentCount - newCount;

      if (availableStrips.length < toRemove) {
        throw new Error(
          `Impossible de réduire à ${newCount} pistes: ${toRemove - availableStrips.length} pistes occupées`
        );
      }

      // Remove from the end (available ones)
      let removed = 0;
      for (let i = this.session.strips.length - 1; i >= 0 && removed < toRemove; i--) {
        if (this.session.strips[i].status === 'available') {
          this.session.strips.splice(i, 1);
          removed++;
        }
      }

      // Renumber strips
      this.session.strips.forEach((strip, idx) => {
        strip.number = idx + 1;
      });

      // Supprimer les arènes au-delà du nouveau count
      for (let i = newCount + 1; i <= currentCount; i++) {
        const arenaId = `arena${i}`;
        this.arenas.delete(arenaId);
        this.arenaMatchQueue.delete(arenaId);
        this.arenaEventBuffer.delete(arenaId);
        this.arenaNextMatchIndex.delete(arenaId);
      }
      this.arenaCount = newCount;
      this.io?.emit(
        'arenas:updated',
        this.getAllArenas().map(a => this.toPublicArena(a))
      );
    }

    return this.session;
  }

  public updateShowPhotos(value: boolean): void {
    if (!this.session) throw new Error('Aucune session active');
    this.sessionShowPhotos = value;
    // Re-broadcast à toutes les pistes pour propager le nouveau réglage
    for (const [arenaId, arena] of this.arenas.entries()) {
      this.broadcastArenaUpdate(arenaId, {
        arenaId,
        match: arena.currentMatch,
        scoreA: arena.currentMatch?.scoreA,
        scoreB: arena.currentMatch?.scoreB,
        status: arena.status,
        fencerA: arena.currentMatch?.fencerA,
        fencerB: arena.currentMatch?.fencerB,
      });
    }
  }

  /** Active/désactive le carton noir à chaud (propriétés compétition modifiées en cours de session) */
  public updateBlackCardEnabled(value: boolean): void {
    if (!this.session || this.sessionBlackCardEnabled === value) return;
    this.sessionBlackCardEnabled = value;
    for (const [arenaId, arena] of this.arenas.entries()) {
      this.broadcastArenaUpdate(arenaId, {
        arenaId,
        match: arena.currentMatch,
        scoreA: arena.currentMatch?.scoreA,
        scoreB: arena.currentMatch?.scoreB,
        status: arena.status,
      });
    }
  }

  public updateCardAnnounce(value: boolean): void {
    if (!this.session) throw new Error('Aucune session active');
    this.sessionCardAnnounce = value;
    for (const [arenaId, arena] of this.arenas.entries()) {
      this.broadcastArenaUpdate(arenaId, {
        arenaId,
        match: arena.currentMatch,
        scoreA: arena.currentMatch?.scoreA,
        scoreB: arena.currentMatch?.scoreB,
        status: arena.status,
      });
    }
  }

  public updateTheme(theme: DisplayTheme): void {
    if (!this.session) throw new Error('Aucune session active');
    this.sessionTheme = theme;
    for (const [arenaId, arena] of this.arenas.entries()) {
      this.broadcastArenaUpdate(arenaId, {
        arenaId,
        match: arena.currentMatch,
        scoreA: arena.currentMatch?.scoreA,
        scoreB: arena.currentMatch?.scoreB,
        status: arena.status,
        fencerA: arena.currentMatch?.fencerA,
        fencerB: arena.currentMatch?.fencerB,
      });
    }
  }

  public updateArenaTheme(arenaId: string, theme: DisplayTheme, customTheme?: CustomTheme): void {
    if (!this.session) throw new Error('Aucune session active');
    const fullId = arenaId.startsWith('arena') ? arenaId : `arena${arenaId}`;
    this.arenaThemeOverrides.set(fullId, { theme, customTheme });
    const arena = this.arenas.get(fullId);
    if (arena) {
      this.broadcastArenaUpdate(fullId, {
        arenaId: fullId,
        match: arena.currentMatch,
        scoreA: arena.currentMatch?.scoreA,
        scoreB: arena.currentMatch?.scoreB,
        status: arena.status,
        fencerA: arena.currentMatch?.fencerA,
        fencerB: arena.currentMatch?.fencerB,
      });
    }
  }

  public clearArenaThemeOverride(arenaId: string): void {
    if (!this.session) throw new Error('Aucune session active');
    const fullId = arenaId.startsWith('arena') ? arenaId : `arena${arenaId}`;
    this.arenaThemeOverrides.delete(fullId);
    const arena = this.arenas.get(fullId);
    if (arena) {
      this.broadcastArenaUpdate(fullId, {
        arenaId: fullId,
        match: arena.currentMatch,
        scoreA: arena.currentMatch?.scoreA,
        scoreB: arena.currentMatch?.scoreB,
        status: arena.status,
        fencerA: arena.currentMatch?.fencerA,
        fencerB: arena.currentMatch?.fencerB,
      });
    }
  }

  public updateArenaScreenTheme(
    arenaId: string,
    targetType: ThemeTargetType,
    customTheme?: CustomTheme
  ): void {
    if (!this.session) throw new Error('Aucune session active');
    const fullId = arenaId.startsWith('arena') ? arenaId : `arena${arenaId}`;
    const existing = this.arenaScreenThemes.get(fullId) ?? {};
    if (customTheme) existing[targetType] = customTheme;
    else delete existing[targetType];
    this.arenaScreenThemes.set(fullId, existing);

    if (targetType === 'arena') {
      this.updateArenaTheme(arenaId, customTheme ? 'custom' : 'dark', customTheme);
      return;
    }

    // Envoyer le thème immédiatement aux clients connectés du bon type
    for (const [, client] of this.connectedClients) {
      if (client.arenaId !== fullId) continue;
      if (client.clientType === targetType) {
        this.io.to(client.socketId).emit('server:command', {
          type: `${targetType}:theme`,
          variables: customTheme?.variables ?? null,
        });
      }
    }

    // Pour pool : diffuser aussi via la room pool
    if (targetType === 'pool') {
      this.io.to(`pool:${fullId}`).emit('server:command', {
        type: 'pool:theme',
        variables: customTheme?.variables ?? null,
      });
    }
  }

  public updateKioskViews(views: {
    poules: boolean;
    classement: boolean;
    direct: boolean;
    suivants: boolean;
    tableau?: boolean;
  }): void {
    if (!this.session) throw new Error('Aucune session active');
    this.sessionKioskViews = { tableau: true, ...views };
  }

  public updateKioskTheme(variables: Record<string, string>): void {
    if (!this.session) throw new Error('Aucune session active');
    this.kioskThemeVariables = variables;
    for (const [, client] of this.connectedClients) {
      if (client.clientType === 'kiosk') {
        this.io.to(client.socketId).emit('server:command', { type: 'kiosk:theme', variables });
      }
    }
  }

  public updatePoolFencers(updates: Array<{ poolId: string; fencers: any[] }>): void {
    for (const { poolId, fencers } of updates) {
      if (fencers && fencers.length > 0) {
        this.poolFencersCache.set(poolId, fencers);
      }
    }
    // Notifier les tablettes connectées sur une arène affichant une poule modifiée
    for (const { poolId } of updates) {
      for (const [aId, arena] of this.arenas) {
        if (arena.currentMatch?.poolId !== poolId) continue;
        const updatedFencers = this.poolFencersCache.get(poolId) ?? [];
        const inMemory = this.sessionMatches
          .filter(m => (m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`) === poolId)
          .sort((a: any, b: any) => (a.number || 0) - (b.number || 0));
        const matches =
          inMemory.length > 0
            ? inMemory.map(m => {
                const u = this.sessionMatchScores.get(m.id);
                return u ? { ...m, ...u } : m;
              })
            : this.db.getMatchesByPool(poolId);
        const isComplete = matches.every((m: any) => m.status === MatchStatus.FINISHED);
        this.io
          .to(`pool:${aId}`)
          .emit(`pool:${aId}:update`, { poolId, fencers: updatedFencers, matches, isComplete });
        break;
      }
    }
  }

  public syncPoolMatches(poolsData: Array<{ poolId: string; matches: any[] }>): void {
    const updatedPoolIds = new Set<string>();

    for (const { poolId, matches } of poolsData) {
      this.sessionMatches = [
        ...this.sessionMatches.filter(
          (m: any) =>
            m.isTableau || (m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`) !== poolId
        ),
        ...matches,
      ];
      updatedPoolIds.add(poolId);
    }

    for (const poolId of updatedPoolIds) {
      const fencers = this.poolFencersCache.get(poolId) ?? this.db.getPoolFencers(poolId);
      const inMemory = this.sessionMatches
        .filter(
          (m: any) =>
            !m.isTableau &&
            (m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`) === poolId
        )
        .sort((a: any, b: any) => (a.number || 0) - (b.number || 0));
      const poolMatches =
        inMemory.length > 0
          ? inMemory.map((m: any) => {
              const u = this.sessionMatchScores.get(m.id);
              return u ? { ...m, ...u } : m;
            })
          : this.db.getMatchesByPool(poolId);
      const isComplete =
        poolMatches.length > 0 && poolMatches.every((m: any) => m.status === MatchStatus.FINISHED);
      for (const [aId, arena] of this.arenas) {
        if ((arena.currentMatch?.poolId ?? arena.activePoolId) !== poolId) continue;
        if (arena.currentMatch) {
          const currentMatch = arena.currentMatch;
          const updatedMatch = this.sessionMatches.find((m: any) => m.id === currentMatch.id);
          if (updatedMatch?.refereeId && updatedMatch.refereeId !== currentMatch.referee?.id) {
            const resolvedRef = this.resolveReferee(updatedMatch.refereeId);
            arena.currentMatch = {
              ...currentMatch,
              ...(resolvedRef ? { referee: resolvedRef } : {}),
            };
            this.broadcastArenaUpdate(aId, {
              arenaId: aId,
              match: arena.currentMatch,
              scoreA: arena.currentMatch.scoreA,
              scoreB: arena.currentMatch.scoreB,
              status: arena.status,
            });
          }
        }
        this.io
          .to(`pool:${aId}`)
          .emit(`pool:${aId}:update`, { poolId, fencers, matches: poolMatches, isComplete });
      }
    }
  }

  /**
   * Réassigne les poules aux pistes pendant une session active (#1037) :
   * poules générées après le démarrage de la saisie distante, ou piste modifiée
   * en préparation. Un match en cours n'est jamais retiré ; une poule envoyée sur
   * une piste déjà occupée par une autre poule est mise en file (pas de remplacement).
   */
  public assignPools(
    poolsData: Array<{
      poolId: string;
      poolNumber?: number;
      strip?: number | null;
      fencers?: any[];
      matches: any[];
    }>
  ): void {
    if (!this.session) return;
    const poolKey = (m: any) => m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`;
    const poolIds = new Set(poolsData.map(p => p.poolId));

    // 1. Matchs de poule en mémoire remplacés par ceux du renderer (poules obsolètes retirées)
    this.sessionMatches = [
      ...this.sessionMatches.filter((m: any) => m.isTableau || !m.poolId),
      ...poolsData.flatMap(p => p.matches.map(m => ({ ...m, poolNumber: p.poolNumber }))),
    ];
    for (const p of poolsData) {
      if (p.fencers && p.fencers.length > 0) this.poolFencersCache.set(p.poolId, p.fencers);
    }

    // 2. Piste cible par poule : pool.strip si défini, sinon première piste libre
    const sorted = [...poolsData].sort((a, b) => (a.poolNumber ?? 0) - (b.poolNumber ?? 0));
    const target = new Map<string, string>();
    const used = new Set<number>();
    for (const p of sorted) {
      const s = Number(p.strip);
      if (Number.isInteger(s) && s > 0 && s <= this.arenaCount) {
        target.set(p.poolId, `arena${s}`);
        used.add(s);
      }
    }
    let nextFree = 1;
    for (const p of sorted) {
      if (target.has(p.poolId)) continue;
      while (used.has(nextFree)) nextFree++;
      if (nextFree > this.arenaCount) break;
      target.set(p.poolId, `arena${nextFree}`);
      used.add(nextFree);
    }

    // 3. Libérer les pistes dont la poule a changé de piste ou n'existe plus
    for (const [arenaId, arena] of this.arenas) {
      const queue = this.arenaMatchQueue.get(arenaId) || [];
      const keptQueue = queue.filter(
        m =>
          !m.poolId ||
          this.isGuestMatch(arenaId, m) ||
          (poolIds.has(m.poolId) && target.get(m.poolId) === arenaId)
      );
      if (keptQueue.length !== queue.length) this.arenaMatchQueue.set(arenaId, keptQueue);

      const current = arena.currentMatch;
      const currentPool = current ? this.arenaHomePoolId(arena) : arena.activePoolId;
      if (!currentPool) continue;
      if (poolIds.has(currentPool) && target.get(currentPool) === arenaId) continue;
      if (current?.status === 'in_progress') continue; // jamais interrompre un match en cours
      arena.activePoolId = undefined;
      if (current) {
        const next = keptQueue[0];
        if (next) {
          this.arenaMatchQueue.set(arenaId, keptQueue.slice(1));
          this.assignMatchToArena(arenaId, next);
        } else {
          arena.currentMatch = null;
          arena.status = 'idle';
          this.updateArena(arenaId, { status: 'idle', currentMatch: null });
          this.persistArenaState(arenaId);
        }
      }
    }

    // 4. Charger chaque poule sur sa piste (ou en file si la piste est occupée)
    for (const p of sorted) {
      const arenaId = target.get(p.poolId);
      const arena = arenaId ? this.arenas.get(arenaId) : undefined;
      if (!arenaId || !arena) continue;
      if ((this.arenaHomePoolId(arena) ?? arena.activePoolId) === p.poolId) continue;
      const queue = this.arenaMatchQueue.get(arenaId) || [];
      if (queue.some(m => m.poolId === p.poolId)) continue;

      const poolMatches = this.sessionMatches
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
        this.arenaMatchQueue.set(arenaId, [...queue, arenaMatch]);
        continue;
      }
      this.assignMatchToArena(arenaId, arenaMatch);
      this.arenaNextMatchIndex.set(arenaId, poolMatches.findIndex(m => m.id === first.id) + 1);
    }

    // 5. Rafraîchir les feuilles de poule affichées
    for (const [arenaId, arena] of this.arenas) {
      const poolId = arena.currentMatch?.poolId ?? arena.activePoolId;
      if (!poolId || !poolIds.has(poolId)) continue;
      const matches = this.sessionMatches
        .filter((m: any) => !m.isTableau && poolKey(m) === poolId)
        .sort((a: any, b: any) => (a.number || 0) - (b.number || 0))
        .map((m: any) => {
          const u = this.sessionMatchScores.get(m.id);
          return u ? { ...m, ...u } : m;
        });
      const isComplete =
        matches.length > 0 && matches.every((m: any) => m.status === MatchStatus.FINISHED);
      this.io?.to(`pool:${arenaId}`).emit(`pool:${arenaId}:update`, {
        poolId,
        fencers: this.poolFencersCache.get(poolId) ?? [],
        matches,
        isComplete,
      });
    }
  }

  public refreshDeMatches(matchesFromRenderer: any[]): void {
    if (!this.session) throw new Error('Aucune session active');

    const strips = this.session.strips.length;

    // Collect IDs of matches currently assigned to an arena (must not be disturbed)
    const activeMatchIds = new Set<string>();
    for (const arena of this.arenas.values()) {
      if (arena.currentMatch) activeMatchIds.add(arena.currentMatch.id);
    }

    // Build the new DE match list, excluding already-active matches
    const deMatches = matchesFromRenderer
      .filter(m => !m.__poolFencers && m.isTableau && m.fencerA && m.fencerB)
      .sort((a: any, b: any) => (b.round || 0) - (a.round || 0));

    // Replace DE entries in sessionMatches (keep pool matches intact)
    this.sessionMatches = this.sessionMatches.filter((m: any) => !m.isTableau);
    for (const m of deMatches) this.sessionMatches.push(m);

    // Rebuild DE queues (preserve any non-DE entries already queued)
    for (const [arenaId, queue] of this.arenaMatchQueue.entries()) {
      this.arenaMatchQueue.set(
        arenaId,
        queue.filter((m: ArenaMatch) => !m.isTableau)
      );
    }

    // Arbitre(s) assigné(s) depuis l'appli → match en cours sur la tablette (#977)
    for (const [arenaId, arena] of this.arenas) {
      const current = arena.currentMatch;
      if (!current?.isTableau || arena.status === 'finished') continue;
      const m = deMatches.find(x => x.id === current.id);
      if (!m) continue;
      const referee = this.resolveDeMatchReferee(m);
      if (referee?.id === current.referee?.id && referee?.name === current.referee?.name) continue;
      arena.currentMatch = { ...current, referee: referee ?? undefined };
      this.broadcastArenaUpdate(arenaId, {
        arenaId,
        match: arena.currentMatch,
        scoreA: arena.currentMatch.scoreA,
        scoreB: arena.currentMatch.scoreB,
        status: arena.status,
      });
      this.persistArenaState(arenaId);
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
      if (!this.arenas.has(targetArenaId)) continue; // hors plage → ignorer
      const referee = this.resolveDeMatchReferee(match);
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
      const arena = this.arenas.get(arenaId);
      if (!arena) continue;
      const existing = this.arenaMatchQueue.get(arenaId) || [];

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
            this.updateArena(arenaId, { currentMatch: null });
          } else {
            // Scoré manuellement depuis l'appli : libérer l'arène immédiatement.
            arena.status = 'idle';
            arenaEffectivelyFree = true;
            this.updateArena(arenaId, { status: 'idle', currentMatch: null });
          }
        } else {
          // Cas 2 : score remote ou fast-poule → vérifier le statut effectif
          const scoreUpdate = this.sessionMatchScores.get(arena.currentMatch.id);
          const inSession = this.sessionMatches.find((m: any) => m.id === arena.currentMatch!.id);
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
        this.assignMatchToArena(arenaId, firstPlayable);
        const rest = queue.filter(m => m.id !== firstPlayable.id);
        this.arenaMatchQueue.set(arenaId, [...existing, ...rest]);
      } else {
        this.arenaMatchQueue.set(arenaId, [...existing, ...queue]);
      }
    }

    console.log(
      `[RemoteScoreServer] refreshDeMatches: ${deMatches.length} matchs DE, ${pending.length} distribués`
    );

    // Notifier le kiosk que le bracket a changé
    this.io.emit('bracket:update');
  }

  public getSession(): RemoteSession | null {
    return this.session;
  }

  public setOrgNote(note: OrgNote): void {
    this.orgNote = note;
    this.io.emit('kiosk:note', note);
  }

  public clearOrgNote(): void {
    this.orgNote = null;
    this.io.emit('kiosk:note', null);
  }

  public acknowledgeDTCall(arenaId: string): void {
    this.io.to(`arena:${arenaId}`).emit(`arena:${arenaId}:dt_call_ack`);
  }

  /** Renvoie la demande de signature d'un match de tableau vers la tablette d'une piste */
  public requestMatchSignature(arenaId: string, request: MatchSignatureRequest): boolean {
    if (!this.getArena(arenaId)) return false;
    this.io.to(`arena:${arenaId}`).emit(`arena:${arenaId}:sign_request`, request);
    return true;
  }

  public setWebhookUrl(url: string | null): void {
    this.webhookUrl = url && url.startsWith('https://') ? url : null;
  }

  private fireWebhook(payload: Record<string, unknown>): void {
    if (!this.webhookUrl) return;
    fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      /* silencieux — ne pas bloquer le flux */
    });
  }

  public setLogo(logo: string | null): void {
    this.sessionLogo = logo;
    this.io.emit('logo:update', { logo });
  }

  public setTtsConfig(config: {
    voiceName?: string | null;
    rate?: number;
    announce?: Record<string, boolean>;
  }): void {
    if (config.voiceName !== undefined) this.ttsConfig.voiceName = config.voiceName;
    if (typeof config.rate === 'number' && config.rate > 0) this.ttsConfig.rate = config.rate;
    if (config.announce)
      this.ttsConfig.announce = { ...this.ttsConfig.announce, ...config.announce };
    this.io.emit('tts:update', this.ttsConfig);
  }

  public setWallpaper(wallpaper: string | null): void {
    this.sessionWallpaper = wallpaper;
    this.io.emit('wallpaper:update', { wallpaper });
  }

  public setArenaPassword(arenaId: string, password: string): void {
    const fullId = arenaId.startsWith('arena') ? arenaId : `arena${arenaId}`;
    const arena = this.arenas.get(fullId);
    if (!arena) throw new Error(`Arène ${arenaId} introuvable`);
    // Stocké hashé : jamais de mot de passe en clair en mémoire
    this.assertPasswordStrength(password);
    arena.password = password ? this.hashPassword(password) : undefined;
    // Invalider tous les tokens existants pour cette arène
    this.arenaTokens.delete(fullId);
    console.log(
      `[RemoteScoreServer] Mot de passe ${password ? 'défini' : 'supprimé'} pour ${fullId}`
    );
  }

  public assignRefereeToMatch(matchId: string, refereeId: string): void {
    if (!this.session) return;

    // Mettre à jour sessionMatches
    const idx = this.sessionMatches.findIndex((m: any) => m.id === matchId);
    if (idx >= 0) {
      this.sessionMatches[idx] = { ...this.sessionMatches[idx], refereeId };
    }

    const resolvedRef = this.resolveReferee(refereeId);

    // Mettre à jour les arènes ayant ce match en cours
    for (const [aId, arena] of this.arenas) {
      if (arena.currentMatch?.id === matchId) {
        arena.currentMatch = {
          ...arena.currentMatch,
          ...(resolvedRef ? { referee: resolvedRef } : {}),
        };
        this.broadcastArenaUpdate(aId, {
          arenaId: aId,
          match: arena.currentMatch,
          scoreA: arena.currentMatch.scoreA,
          scoreB: arena.currentMatch.scoreB,
          status: arena.status,
        });
      }
    }
  }
}
