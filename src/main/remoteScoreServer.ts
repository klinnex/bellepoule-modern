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
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import {
  RemoteSession,
  RemoteScoreUpdate,
  WebSocketMessage,
  Arena,
  ArenaMatch,
  ArenaSettings,
  ArenaUpdate,
  OrgNote,
  DisplayTheme,
  CustomTheme,
  ThemeTargetType,
} from '../shared/types/remote';
import { Competition, Match, Fencer, MatchStatus, FencerStatus, Score } from '../shared/types';
import { DatabaseManager } from '../database';
import {
  getLaserArenaBoutCap,
  isLaserArenaBoutComplete,
} from '../features/teams/utils/laserArenaCalculations';

// Format arène Sabre Laser équipe : état de saisie temps réel pour une
// rencontre assignée à une arène. Distinct de `Arena`/`ArenaMatch`
// (scoring individuel) — aucun champ ni logique partagée.
interface TeamArenaBout {
  id: string;
  boutOrder: number;
  fencerAId: string;
  fencerAName: string;
  fencerBId: string;
  fencerBName: string;
  scoreA: number;
  scoreB: number;
  maxScore: number;
  status: string;
  winnerId: string | null;
}

interface TeamArenaCard {
  id: string;
  teamId: string;
  type: 'white' | 'yellow' | 'red' | 'black';
  createdAt: string;
}

interface TeamArenaState {
  matchId: string;
  competitionId: string;
  teamAId: string;
  teamAName: string;
  teamBId: string;
  teamBName: string;
  isLaserPoints: boolean; // saisie par zones A/B/C (1/3/5) ou touche simple
  bouts: TeamArenaBout[];
  currentBoutIndex: number; // index dans `bouts`
  liveScoreA: number; // score de l'assaut en cours, pas encore persisté
  liveScoreB: number;
  elapsedAccumulatedSec: number; // temps déjà écoulé (assaut en pause)
  timerStartedAt: number | null; // epoch ms, null = chrono à l'arrêt
  cards: TeamArenaCard[];
}

/**
 * Vérifie qu'une origine HTTP appartient au réseau local (localhost + plages LAN privées).
 * Centralise la logique CORS partagée entre Socket.IO et le middleware Express.
 */
function isLocalNetworkOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  try {
    const h = new URL(origin).hostname;
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '::1' ||
      /^10\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      /^192\.168\./.test(h)
    );
  } catch {
    // Origine invalide / non analysable : refuser
    return false;
  }
}

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
  private arenaNextMatchIndex: Map<string, number> = new Map(); // Index du prochain match par arène
  private arenaMatchQueue: Map<string, ArenaMatch[]> = new Map(); // File d'attente DE par arène
  private poolMatchArenaOverrides: Map<string, string> = new Map(); // matchId → arenaId (réassignation piste poule)
  private poolFencersCache: Map<string, any[]> = new Map(); // Tireurs par poolId (depuis le renderer)
  private sessionMatchScores: Map<string, { scoreA: any; scoreB: any; status: string }> = new Map(); // Scores en mémoire
  private sessionShowPhotos: boolean = false; // Afficher les photos des combattants avant le combat
  private sessionCardAnnounce: boolean = false; // Annoncer les cartons avec raison sur les affichages
  private sessionRefereeFeatureEnabled: boolean = false; // Fonctionnalité gestion arbitres activée
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
  private registrationEnabled: boolean = true;

  // Stocker le contenu des fichiers HTML en mémoire pour éviter les problèmes de chemin
  private htmlFiles: Map<string, string> = new Map();

  // Client socket.io chargé en mémoire au démarrage (injecté inline dans le HTML)
  private socketIoClientJs: string | null = null;

  // Tokens d'authentification par arène (password protection)
  private arenaTokens: Map<string, Set<string>> = new Map();

  // Rate limiting pour le login : { ip → { count, resetAt } }
  private loginAttempts: Map<string, { count: number; resetAt: number }> = new Map();
  private readonly LOGIN_ATTEMPTS_MAX_ENTRIES = 1000;
  private cleanupInterval: NodeJS.Timeout | null = null;
  // Rate limiting pour les soumissions de score : { ip → { count, resetAt } }
  private scoreRateLimiter: Map<string, { count: number; resetAt: number }> = new Map();
  private readonly SCORE_RATE_LIMIT = 30; // soumissions par minute par IP
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
      for (const [ip, attempt] of this.loginAttempts) {
        if (now >= attempt.resetAt) this.loginAttempts.delete(ip);
      }
      for (const [ip, entry] of this.scoreRateLimiter) {
        if (now >= entry.resetAt) this.scoreRateLimiter.delete(ip);
      }
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
        // Nouvelle instance de regex à chaque itération (évite l'état lastIndex partagé)
        const updated = content.replace(
          /<script\s+src=["'](?:\/socket\.io\.min\.js|\/bp-sio\.js|\/socket\.io\/socket\.io\.js)["']><\/script>/g,
          inlineTag
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
    this.teamArenaState.set(arenaId, {
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
    this.io.to(`team-arena:${arenaId}`).emit('team_arena_state', this.getPublicTeamArenaState(arenaId));
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
    const cap = getLaserArenaBoutCap();
    const currentBout = state.bouts[state.currentBoutIndex] ?? null;
    const elapsedSec = this.teamArenaElapsedSec(state);
    return {
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
      boutComplete: currentBout
        ? isLaserArenaBoutComplete(state.liveScoreA, state.liveScoreB, elapsedSec, cap)
        : false,
      matchComplete: !currentBout,
      cards: state.cards,
    };
  }

  private parseCookies(header: string | undefined): Record<string, string> {
    if (!header) return {};
    const result: Record<string, string> = {};
    for (const part of header.split(';')) {
      const idx = part.indexOf('=');
      if (idx < 0) continue;
      try {
        const key = decodeURIComponent(part.slice(0, idx).trim());
        const val = decodeURIComponent(part.slice(idx + 1).trim());
        if (key) result[key] = val;
      } catch {
        // Ignore malformed cookie parts
      }
    }
    return result;
  }

  /** Le mot de passe n'est jamais stocké ni comparé en clair. */
  private hashPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }

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
    return !!token && (this.arenaTokens.get(fullId)?.has(token) ?? false);
  }

  /** Vérifie qu'au moins un token d'arène valide est présent dans le cookie.
   *  Si aucune arène n'a de mot de passe, accès libre (comportement par défaut). */
  private hasAnyValidToken(cookieHeader: string | undefined): boolean {
    const hasPasswordProtection = Array.from(this.arenas.values()).some(a => !!a.password);
    if (!hasPasswordProtection) return true;
    if (!cookieHeader) return false;
    const cookies = this.parseCookies(cookieHeader);
    for (const [arenaId, tokens] of this.arenaTokens) {
      const token = cookies[`bp_token_${arenaId}`];
      if (token && tokens.has(token)) return true;
    }
    return false;
  }

  private setupMiddleware(): void {
    console.log('[RemoteScoreServer] Configuration du middleware...');
    // Limite de taille : les photos d'inscription (base64 ~700KB) sont le plus gros payload légitime
    this.app.use(express.json({ limit: '1mb' }));

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

  private setupRoutes(): void {
    console.log('[RemoteScoreServer] Configuration des routes...');

    // Fallback /bp-sio.js : sert le client socket.io déjà chargé en mémoire au
    // démarrage. Normalement inutile (le client est injecté inline dans le HTML),
    // mais couvre le cas d'un HTML mis en cache par le service worker.
    this.app.get('/bp-sio.js', (_req, res) => {
      if (this.socketIoClientJs) {
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Cache-Control', 'no-store');
        res.send(this.socketIoClientJs);
      } else {
        console.error('[RemoteScoreServer] /bp-sio.js demandé mais client non chargé');
        res.status(500).send('// socket.io client not loaded');
      }
    });

    // Redirect racine vers le lobby
    this.app.get('/', (_req, res) => {
      res.redirect('/lobby');
    });

    // API endpoints
    this.app.get('/api/config', (req, res) => {
      res.json({ lang: this.currentLang });
    });

    this.app.get('/api/server-info', (req, res) => {
      res.json({
        url: this.getServerUrl(),
        ip: this.getLocalIPAddress(),
        port: this.port,
      });
    });

    // Get pending matches for a competition
    this.app.get('/api/competitions/:competitionId/pending-matches', (req, res) => {
      try {
        const { competitionId } = req.params;

        const pendingMatches = this.db.getPendingMatches(competitionId);
        res.json(pendingMatches);
      } catch (error) {
        console.error('Error getting pending matches:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des matchs' });
      }
    });

    this.app.get('/api/debug', (req, res) => {
      res.json({
        status: 'ok',
        session: this.session ? 'active' : 'inactive',
        serverTime: new Date().toISOString(),
        refereesCount: this.session?.referees.length || 0,
      });
    });

    this.app.get('/api/session', (req, res) => {
      console.log(
        '[RemoteScoreServer] GET /api/session - Session:',
        this.session ? 'active' : 'inactive'
      );
      if (!this.session) {
        return res.status(404).json({ error: 'Aucune session active' });
      }
      res.json({
        ...this.session,
        weapon: this.sessionWeapon,
        kioskViews: this.sessionKioskViews,
        orgNote: this.orgNote,
        ...(this.isTrainingMode
          ? {
              competitionName: 'Entraînement',
              isTrainingMode: true,
              trainingCustomRules: this.trainingCustomRules,
            }
          : {}),
      });
    });

    this.app.post('/api/session/start', async (req, res) => {
      try {
        const { competitionId, strips } = req.body;
        const competition = this.db.getCompetition(competitionId);

        if (!competition) {
          return res.status(404).json({ error: 'Compétition non trouvée' });
        }

        this.session = await this.createSession(competitionId, strips);
        res.json(this.session);
      } catch (error) {
        console.error('Error starting session:', error);
        res.status(500).json({ error: 'Erreur lors du démarrage de la session' });
      }
    });

    this.app.post('/api/session/stop', (req, res) => {
      this.stopSession();
      res.json({ success: true });
    });

    // Logo organisateur
    this.app.get('/api/logo', (req, res) => {
      res.json({ logo: this.sessionLogo });
    });

    this.app.get('/api/wallpaper', (req, res) => {
      res.json({ wallpaper: this.sessionWallpaper });
    });

    // Config TTS (minuteur vocal) pour les tablettes d'arbitrage
    this.app.get('/api/tts-config', (req, res) => {
      res.json(this.ttsConfig);
    });

    // Arena routes
    this.app.get('/api/arenas', (req, res) => {
      res.json(this.getAllArenas().map(a => this.toPublicArena(a)));
    });

    this.app.get('/api/arenas/:arenaId', (req, res) => {
      const arena = this.getArena(req.params.arenaId);
      if (!arena) {
        return res.status(404).json({ error: 'Arène non trouvée' });
      }
      res.json(this.toPublicArena(arena));
    });

    // Rapport de rotation des arbitres
    this.app.get('/api/referees/rotation-report', (req, res) => {
      if (!this.session) return res.status(404).json({ error: 'Pas de session active' });

      const competitionId = this.session.competitionId;
      const referees = this.db.getRefereesByCompetition(competitionId);
      const allMatches = this.db.getMatchesWithReferees(competitionId);

      const MAX_CONSECUTIVE = 3;
      const MIN_REST_MINUTES = 15;

      const report = referees.map(ref => {
        const refMatches = allMatches.filter(
          m => m.refereeId === ref.id && m.status === 'finished'
        );
        const total = refMatches.length;

        // Approximer matchs consécutifs sur les derniers matchs (ordre du tableau)
        let consecutive = 0;
        for (let i = refMatches.length - 1; i >= 0; i--) {
          consecutive++;
          if (consecutive >= MAX_CONSECUTIVE) break;
          // Sans timestamp précis, on compte les derniers matchs du tableau
        }

        // Vérifier si l'arbitre est actuellement sur une piste
        const isActive = Array.from(this.arenas.values()).some(
          a => a.status === 'in_progress' && a.currentMatch?.referee?.id === ref.id
        );

        const fatigueScore = Math.min(100, Math.round((consecutive / MAX_CONSECUTIVE) * 100));

        return {
          refereeId: ref.id,
          refereeName: `${ref.firstName ?? ''} ${ref.lastName ?? ''}`.trim(),
          matchesTotal: total,
          consecutiveEstimate: consecutive,
          fatigueScore,
          isActive,
          needsRest: consecutive >= MAX_CONSECUTIVE || fatigueScore >= 80,
          category: (ref as any).category ?? null,
        };
      });

      // Trier par score de fatigue décroissant
      report.sort((a, b) => b.fatigueScore - a.fatigueScore);
      res.json({
        config: { maxConsecutive: MAX_CONSECUTIVE, minRestMinutes: MIN_REST_MINUTES },
        report,
      });
    });

    // Endpoint JSON structuré pour OBS Browser Source / intégrations externes
    this.app.get('/api/arenas/:arenaId/obs-json', (req, res) => {
      const { arenaId } = req.params;
      const arena = this.getArena(arenaId);
      if (!arena) return res.status(404).json({ error: 'Arène non trouvée' });

      const touches = this.arenaTouches.get(arenaId) || { touchesA: [], touchesB: [] };
      const cards = this.arenaCards.get(arenaId) || { cardsA: [], cardsB: [] };

      const countZones = (zones: string[]) => ({
        A: zones.filter(z => z === 'A').length,
        B: zones.filter(z => z === 'B').length,
        C: zones.filter(z => z === 'C').length,
      });

      res.json({
        arenaId,
        status: arena.status,
        weapon: this.sessionWeapon ?? null,
        match: arena.currentMatch
          ? {
              id: arena.currentMatch.id,
              fencerA: arena.currentMatch.fencerA,
              fencerB: arena.currentMatch.fencerB,
              scoreA: arena.currentMatch.scoreA,
              scoreB: arena.currentMatch.scoreB,
              referee: arena.currentMatch.referee,
            }
          : null,
        cards: { A: cards.cardsA, B: cards.cardsB },
        touches: {
          A: { raw: touches.touchesA, zones: countZones(touches.touchesA) },
          B: { raw: touches.touchesB, zones: countZones(touches.touchesB) },
        },
        suddenDeath: this.arenaSuddenDeath.get(arenaId) ?? false,
        waitingOvertime: this.arenaWaitingOvertime.get(arenaId) ?? false,
        swapped: arena.swapped ?? false,
        timestamp: new Date().toISOString(),
      });
    });

    this.app.post('/api/arenas/:arenaId/assign', (req, res) => {
      const { match } = req.body;
      try {
        this.assignMatchToArena(req.params.arenaId, match);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Erreur inconnue' });
      }
    });

    this.app.post('/api/arenas/:arenaId/start', (req, res) => {
      this.startArenaMatch(req.params.arenaId);
      res.json({ success: true });
    });

    this.app.post('/api/arenas/:arenaId/pause', (req, res) => {
      this.pauseArenaMatch(req.params.arenaId);
      res.json({ success: true });
    });

    this.app.post('/api/arenas/:arenaId/score', (req, res) => {
      const { scoreA, scoreB } = req.body;
      this.updateArenaScore(req.params.arenaId, scoreA, scoreB);
      res.json({ success: true });
    });

    this.app.post('/api/arenas/:arenaId/finish', (req, res) => {
      this.finishArenaMatch(req.params.arenaId);
      res.json({ success: true });
    });

    // Get all pools for current competition
    this.app.get('/api/pools', (req, res) => {
      if (!this.session) {
        return res.status(404).json({ error: 'Aucune session active' });
      }
      try {
        const pools = this.db.getCompetitionPools(this.session.competitionId);
        res.json(pools);
      } catch (error) {
        console.error('Error getting pools:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des poules' });
      }
    });

    // Get matches for a specific pool
    this.app.get('/api/pools/:poolId/matches', (req, res) => {
      const { poolId } = req.params;
      try {
        const matches = this.db.getMatchesByPool(poolId);
        res.json(matches);
      } catch (error) {
        console.error('Error getting pool matches:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des matchs' });
      }
    });

    // Get pending matches for a specific pool
    this.app.get('/api/pools/:poolId/pending-matches', (req, res) => {
      const { poolId } = req.params;
      try {
        const matches = this.db.getMatchesByPool(poolId);
        const pending = matches.filter(
          m => (m.status === 'not_started' || m.status === 'in_progress') && this.isMatchPlayable(m)
        );
        res.json(pending);
      } catch (error) {
        console.error('Error getting pending matches:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des matchs' });
      }
    });

    // Pages d'arène - Dynamiques
    const getRemotePath = (filename: string) => {
      const isDev = process.env.NODE_ENV === 'development';
      const fs = require('fs');

      const possiblePaths = isDev
        ? [
            path.join(__dirname, '../remote', filename),
            path.join(__dirname, '../../src/remote', filename),
          ]
        : [
            ...(process.resourcesPath
              ? [path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'remote', filename)]
              : []),
            path.join(__dirname, '..', 'remote', filename).replace('app.asar', 'app.asar.unpacked'),
            path.join(__dirname, '..', 'remote', filename),
            path.join(__dirname, '../../src/remote', filename),
          ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) return p;
      }
      return possiblePaths[possiblePaths.length - 1];
    };

    // Support both /arena1 and /arene1 formats
    this.app.get('/arena:arenaId', (req, res) => {
      const arenaId = req.params.arenaId;
      if (!this.arenas.has(`arena${arenaId}`)) {
        return res.status(404).send('Arène non trouvée');
      }
      console.log(`[RemoteScoreServer] Accès à l'arène ${arenaId}`);
      this.sendHtmlFromMemory('arena.html', res);
    });

    // Alias /arene pour compatibilité française
    this.app.get('/arene:arenaId', (req, res) => {
      const arenaId = req.params.arenaId;
      if (!this.arenas.has(`arena${arenaId}`)) {
        return res.status(404).send('Arène non trouvée');
      }
      console.log(`[RemoteScoreServer] Accès à l'arène (arene) ${arenaId}`);
      this.sendHtmlFromMemory('arena.html', res);
    });

    // Interface d'arbitrage - Dynamique (sans vérification d'existence)
    this.app.get('/arena:arenaId/referee', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(`[RemoteScoreServer] Accès à l'interface arbitre pour l'arène ${arenaId}`);
      if (!this.checkArenaAuth(arenaId, req.headers.cookie)) {
        return res.redirect(
          302,
          `/login?arena=arena${arenaId}&return=${encodeURIComponent(req.path)}`
        );
      }
      this.sendHtmlFromMemory('referee.html', res);
    });

    // Alias /arene pour l'interface d'arbitrage (français)
    this.app.get('/arene:arenaId/referee', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(
        `[RemoteScoreServer] Accès à l'interface arbitre pour l'arène ${arenaId} (arene)`
      );
      if (!this.checkArenaAuth(arenaId, req.headers.cookie)) {
        return res.redirect(
          302,
          `/login?arena=arena${arenaId}&return=${encodeURIComponent(req.path)}`
        );
      }
      this.sendHtmlFromMemory('referee.html', res);
    });

    // Alias /arbitre pour l'interface d'arbitrage
    this.app.get('/arbitre/:arenaId', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(
        `[RemoteScoreServer] Accès à l'interface arbitre (alias /arbitre) pour l'arène ${arenaId}`
      );
      if (!this.checkArenaAuth(arenaId, req.headers.cookie)) {
        return res.redirect(
          302,
          `/login?arena=arena${arenaId}&return=${encodeURIComponent(req.path)}`
        );
      }
      this.sendHtmlFromMemory('referee.html', res);
    });

    // Nouveau: Route /arbitre/areneX (format demandé par l'utilisateur)
    this.app.get('/arbitre/arene:arenaId', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(`[RemoteScoreServer] Accès à l'interface arbitre /arbitre/arene${arenaId}`);
      if (!this.checkArenaAuth(arenaId, req.headers.cookie)) {
        return res.redirect(
          302,
          `/login?arena=arena${arenaId}&return=${encodeURIComponent(req.path)}`
        );
      }
      this.sendHtmlFromMemory('referee.html', res);
    });

    // Route /areneX/arbitre (format français demandé)
    this.app.get('/arene:arenaId/arbitre', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(`[RemoteScoreServer] Accès à l'interface arbitre /arene${arenaId}/arbitre`);
      if (!this.checkArenaAuth(arenaId, req.headers.cookie)) {
        return res.redirect(
          302,
          `/login?arena=arena${arenaId}&return=${encodeURIComponent(req.path)}`
        );
      }
      this.sendHtmlFromMemory('referee.html', res);
    });

    // ── Format arène Sabre Laser équipe : affichage + tablette arbitre ──────────
    // Routes distinctes des arènes individuelles ci-dessus (aucun chemin partagé),
    // même modèle d'authentification par arène (checkArenaAuth).
    this.app.get('/equipe:arenaId', (req, res) => {
      console.log(`[RemoteScoreServer] Accès affichage équipe /equipe${req.params.arenaId}`);
      this.sendHtmlFromMemory('teamArena.html', res);
    });

    this.app.get('/equipe:arenaId/arbitre', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(`[RemoteScoreServer] Accès arbitre équipe /equipe${arenaId}/arbitre`);
      if (!this.checkArenaAuth(arenaId, req.headers.cookie)) {
        return res.redirect(
          302,
          `/login?arena=arena${arenaId}&return=${encodeURIComponent(req.path)}`
        );
      }
      this.sendHtmlFromMemory('teamReferee.html', res);
    });

    // Configurateur d'overlay (interface graphique pour générer l'URL OBS)
    this.app.get('/overlay-config', (req, res) => {
      this.sendHtmlFromMemory('overlay-config.html', res);
    });

    // Overlay de score pour streaming (OBS, vMix…) — lecture seule, aucune auth requise
    this.app.get('/arene:arenaId/overlay', (req, res) => {
      console.log(`[RemoteScoreServer] Accès overlay /arene${req.params.arenaId}/overlay`);
      this.sendHtmlFromMemory('overlay.html', res);
    });
    this.app.get('/arena:arenaId/overlay', (req, res) => {
      console.log(`[RemoteScoreServer] Accès overlay /arena${req.params.arenaId}/overlay`);
      this.sendHtmlFromMemory('overlay.html', res);
    });

    // Vue publique par arène (lecture seule, pas d'authentification requise)
    this.app.get('/arene:arenaId/public', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(`[RemoteScoreServer] Accès vue publique /arene${arenaId}/public`);
      this.sendHtmlFromMemory('public.html', res);
    });

    this.app.get('/arena:arenaId/public', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(`[RemoteScoreServer] Accès vue publique /arena${arenaId}/public`);
      this.sendHtmlFromMemory('public.html', res);
    });

    // Page saisie OCR feuille poule (pas d'authentification par arène nécessaire)
    this.app.get('/poule-ocr', (req, res) => {
      if (!this.hasAnyValidToken(req.headers.cookie)) {
        return res.redirect(302, `/login?return=${encodeURIComponent('/poule-ocr')}`);
      }
      this.sendHtmlFromMemory('pool-ocr.html', res);
    });

    // Vue de saisie de poule par arène
    this.app.get('/arene:arenaId/poule', (req, res) => {
      const arenaId = req.params.arenaId;
      console.log(`[RemoteScoreServer] Accès à la vue poule /arene${arenaId}/poule`);
      if (!this.checkArenaAuth(arenaId, req.headers.cookie)) {
        return res.redirect(
          302,
          `/login?arena=arena${arenaId}&return=${encodeURIComponent(req.path)}`
        );
      }
      this.sendHtmlFromMemory('pool.html', res);
    });

    // Affichage kiosk grand écran public
    this.app.get('/kiosk', (req, res) => {
      console.log('[RemoteScoreServer] Accès au mode kiosk');
      this.sendHtmlFromMemory('kiosk.html', res);
    });

    // Page d'attente sans arène assignée (lobby)
    this.app.get('/lobby', (_req, res) => {
      this.sendHtmlFromMemory('lobby.html', res);
    });

    // Page de connexion pour les pages protégées par mot de passe
    this.app.get('/login', (_req, res) => {
      this.sendHtmlFromMemory('login.html', res);
    });

    // ── Auto-inscription tireur (phase CHECKIN) ────────────────────────────
    this.app.get('/register', (_req, res) => {
      this.sendHtmlFromMemory('register.html', res);
    });

    this.app.get('/inscription', (_req, res) => {
      this.sendHtmlFromMemory('register.html', res);
    });

    this.app.get('/api/register/status', (_req, res) => {
      res.json({ open: this.registrationEnabled });
    });

    this.app.post('/api/register', (req, res) => {
      if (!this.registrationEnabled) {
        return res.status(403).json({ registrationClosed: true, error: 'Inscription fermée' });
      }

      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'unknown';

      // Rate limit : 5 inscriptions par IP par minute
      if (!this.checkRegistrationRateLimit(ip)) {
        return res.status(429).json({ error: 'Trop de demandes. Réessayez dans 1 minute.' });
      }

      const { lastName, firstName, gender, club, license, nationality, birthDate, photo } =
        req.body as Record<string, string | null | undefined>;

      if (!lastName || typeof lastName !== 'string' || lastName.trim() === '') {
        return res.status(400).json({ error: 'Nom obligatoire' });
      }
      if (!firstName || typeof firstName !== 'string' || firstName.trim() === '') {
        return res.status(400).json({ error: 'Prénom obligatoire' });
      }
      if (!gender || !['M', 'F', 'X'].includes(gender)) {
        return res.status(400).json({ error: 'Genre invalide' });
      }

      const competitionId = this.session?.competitionId;
      if (!competitionId) {
        return res.status(503).json({ error: 'Aucune compétition active' });
      }

      // Valider la taille de la photo (base64, max ~500 KB → ~667 KB en base64)
      if (photo && typeof photo === 'string' && photo.length > 700_000) {
        return res.status(400).json({ error: 'Photo trop volumineuse (max 500 KB)' });
      }

      try {
        const strip = (s: string | null | undefined, max = 100) =>
          s
            ? s
                .replace(/<[^>]*>/g, '')
                .replace(/&[a-z]+;/gi, '')
                .trim()
                .substring(0, max)
            : undefined;

        const strippedLast = strip(lastName, 100);
        const strippedFirst = strip(firstName, 100);
        if (!strippedLast) return res.status(400).json({ error: 'Nom invalide après nettoyage' });
        if (!strippedFirst)
          return res.status(400).json({ error: 'Prénom invalide après nettoyage' });

        const fencerData = {
          lastName: strippedLast.toUpperCase(),
          firstName: strippedFirst,
          gender,
          club: strip(club) || undefined,
          license: strip(license, 50) || undefined,
          nationality: strip(nationality, 3) || 'FRA',
          birthDate: birthDate ? new Date(birthDate) : undefined,
          photo:
            photo && typeof photo === 'string' && photo.startsWith('data:image/')
              ? photo
              : undefined,
          status: 'N', // NOT_CHECKED_IN
        };

        const newFencer = this.db.addFencer(competitionId, fencerData as any);
        console.log(
          `[RemoteScoreServer] Inscription tireur: ${fencerData.lastName} ${fencerData.firstName} (id=${newFencer.id})`
        );
        res.json({ success: true, fencerRef: newFencer.ref, fencerId: newFencer.id });
      } catch (err) {
        console.error('[RemoteScoreServer] Erreur inscription tireur:', err);
        res.status(500).json({ error: "Erreur lors de l'inscription" });
      }
    });

    // API: authentification par mot de passe pour une arène
    this.app.post('/api/auth/login/:arenaId', (req, res) => {
      // Rate limiting : 5 tentatives par IP par minute
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'unknown';
      const now = Date.now();
      const attempt = this.loginAttempts.get(ip);
      if (attempt) {
        if (now < attempt.resetAt) {
          if (attempt.count >= 5) {
            return res
              .status(429)
              .json({ success: false, error: 'Trop de tentatives. Réessayez dans 1 minute.' });
          }
          attempt.count++;
        } else {
          this.loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
        }
      } else {
        // Plafond : éviction de l'entrée la plus ancienne (ordre d'insertion des Map)
        if (this.loginAttempts.size >= this.LOGIN_ATTEMPTS_MAX_ENTRIES) {
          const oldest = this.loginAttempts.keys().next().value;
          if (oldest !== undefined) this.loginAttempts.delete(oldest);
        }
        this.loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
      }

      const rawId = req.params.arenaId;
      const fullId = rawId.startsWith('arena') ? rawId : `arena${rawId}`;
      const arena = this.arenas.get(fullId);
      if (!arena?.password) {
        return res.json({ success: true });
      }
      const { password } = req.body as { password: string };
      // Comparaison résistante aux timing attacks
      let passwordOk = false;
      // Comparaison de hashs (longueur constante) résistante aux timing attacks,
      // sans fuite de la longueur du mot de passe.
      try {
        passwordOk =
          !!password &&
          timingSafeEqual(Buffer.from(this.hashPassword(password)), Buffer.from(arena.password));
      } catch {
        passwordOk = false;
      }
      if (!passwordOk) {
        return res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
      }
      // Login réussi : réinitialiser le compteur d'échecs
      this.loginAttempts.delete(ip);
      const token = randomBytes(32).toString('hex');
      if (!this.arenaTokens.has(fullId)) this.arenaTokens.set(fullId, new Set());
      this.arenaTokens.get(fullId)!.add(token);
      // Secure seulement en HTTPS : le serveur tourne en HTTP sur le LAN du gymnase
      res.setHeader(
        'Set-Cookie',
        `bp_token_${fullId}=${token}; HttpOnly; SameSite=Strict; Max-Age=${8 * 3600}; Path=/${req.secure ? '; Secure' : ''}`
      );
      res.json({ success: true });
    });

    // API: données complètes de la poule pour une arène
    this.app.get('/api/arenas/:arenaId/pool-data', (req, res) => {
      const rawId = req.params.arenaId;
      // Accepte "1" ou "arena1" comme arenaId
      const arenaId = rawId.startsWith('arena') ? rawId : `arena${rawId}`;
      // Même protection que la page /poule qui consomme cette API
      if (!this.checkArenaAuth(arenaId, req.headers.cookie)) {
        return res.status(401).json({ error: 'Non authentifié' });
      }
      try {
        const arena = this.arenas.get(arenaId);
        const poolId = arena?.currentMatch?.poolId ?? arena?.activePoolId;
        if (!poolId) {
          return res.status(404).json({ error: 'Aucune poule assignée à cette arène' });
        }

        // Priorité : cache en mémoire (matchs du renderer), fallback DB
        const fencers = this.poolFencersCache.get(poolId) ?? this.db.getPoolFencers(poolId);
        const matches = (() => {
          const inMemory = this.sessionMatches
            .filter(m => (m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`) === poolId)
            .sort((a: any, b: any) => (a.number || 0) - (b.number || 0));
          if (inMemory.length > 0) {
            return inMemory.map(m => {
              const update = this.sessionMatchScores.get(m.id);
              return update ? { ...m, ...update } : m;
            });
          }
          return this.db.getMatchesByPool(poolId);
        })();
        const isComplete =
          matches.length > 0 && matches.every((m: any) => m.status === MatchStatus.FINISHED);

        const poolName = (() => {
          if (!this.session) return 'Poule';
          const allPools = this.db.getCompetitionPools(this.session.competitionId);
          return allPools.find(p => p.id === poolId)?.name ?? 'Poule';
        })();

        const cachedSigs = this.poolSignaturesCache.get(poolId);
        const signatures: Record<string, string> = cachedSigs
          ? Object.fromEntries(cachedSigs)
          : Object.fromEntries(
              this.db.getPoolSignatures(poolId).map(s => [s.fencerId, s.signatureData])
            );
        if (!cachedSigs && Object.keys(signatures).length > 0) {
          this.poolSignaturesCache.set(poolId, new Map(Object.entries(signatures)));
        }

        res.json({ poolId, poolName, arenaId, fencers, matches, isComplete, signatures });
      } catch (err) {
        console.error('[RemoteScoreServer] Erreur pool-data:', err);
        res.status(500).json({ error: 'Erreur interne' });
      }
    });

    // API: saisir le score d'un match de poule
    this.app.post('/api/pools/:poolId/matches/:matchId/score', (req, res) => {
      if (!this.hasAnyValidToken(req.headers.cookie)) {
        return res.status(401).json({ error: 'Non authentifié' });
      }
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ??
        req.socket.remoteAddress ??
        'unknown';
      if (!this.checkScoreRateLimit(clientIp)) {
        return res.status(429).json({ error: 'Trop de soumissions, réessayez dans une minute' });
      }
      const { poolId, matchId } = req.params;
      if (!/^[0-9a-f-]{36}$/i.test(matchId) && !/^[0-9a-f-]{36}$/i.test(poolId)) {
        // Accepter aussi des IDs non-UUID (matchs en mémoire) - on valide le format souple
      }
      const {
        scoreA,
        scoreB,
        specialStatus,
        refereeId: bodyRefereeId,
      } = req.body as {
        scoreA: number;
        scoreB: number;
        specialStatus?: string;
        refereeId?: string;
      };
      // Validation des scores
      const sA = Number(scoreA);
      const sB = Number(scoreB);
      if (
        !Number.isInteger(sA) ||
        !Number.isInteger(sB) ||
        sA < 0 ||
        sB < 0 ||
        sA > 50 ||
        sB > 50
      ) {
        return res.status(400).json({ error: 'Scores invalides (entiers entre 0 et 50)' });
      }
      try {
        const winner = sA > sB ? 'A' : sB > sA ? 'B' : null;
        const scoreAObj: Score = {
          value: sA,
          isVictory: winner === 'A',
          isAbstention: specialStatus === 'abandon_A',
          isExclusion: specialStatus === 'exclusion_A',
          isForfait: specialStatus === 'forfait_A',
        };
        const scoreBObj: Score = {
          value: sB,
          isVictory: winner === 'B',
          isAbstention: specialStatus === 'abandon_B',
          isExclusion: specialStatus === 'exclusion_B',
          isForfait: specialStatus === 'forfait_B',
        };
        const previousMatch = this.db.getMatch(matchId);
        const resolvedRef = this.resolveReferee(
          bodyRefereeId ?? previousMatch?.referee?.id ?? null
        );

        // Détection conflit IP : alerte si une IP différente tente de modifier un score déjà saisi
        try {
          const existingLog = this.db.getScoreAuditLog(matchId);
          if (existingLog.length > 0) {
            const lastEntry = existingLog[existingLog.length - 1];
            if (lastEntry.ipAddress && lastEntry.ipAddress !== clientIp) {
              const mainWin = (global as any).mainWindow;
              if (mainWin) {
                mainWin.webContents.send('score:ip-conflict', {
                  matchId,
                  poolId,
                  matchNumber: lastEntry.matchNumber,
                  poolNumber: lastEntry.poolNumber,
                  originalIp: lastEntry.ipAddress,
                  originalReferee: lastEntry.refereeName ?? lastEntry.changedBy,
                  attemptIp: clientIp,
                  attemptReferee: resolvedRef?.name ?? 'inconnu',
                  timestamp: new Date().toISOString(),
                });
              }
            }
          }
        } catch {
          /* non bloquant */
        }

        this.db.updateMatch(matchId, {
          scoreA: scoreAObj,
          scoreB: scoreBObj,
          status: MatchStatus.FINISHED,
        });

        try {
          this.db.logScoreChange({
            matchId,
            poolId,
            previousScoreA: previousMatch?.scoreA ?? null,
            previousScoreB: previousMatch?.scoreB ?? null,
            newScoreA: scoreAObj,
            newScoreB: scoreBObj,
            changedBy: resolvedRef?.name ?? bodyRefereeId ?? 'referee',
            reason: 'pool_remote_entry',
            refereeId: resolvedRef?.id ?? bodyRefereeId,
            refereeName: resolvedRef?.name,
            ipAddress: clientIp,
          });
        } catch {
          /* non bloquant */
        }

        // Mettre à jour le score en mémoire (pour les matchs du renderer non persistés en DB)
        this.sessionMatchScores.set(matchId, {
          scoreA: scoreAObj,
          scoreB: scoreBObj,
          status: MatchStatus.FINISHED,
        });

        // Broadcaster la mise à jour vers toutes les vues /poule connectées
        const fencers = this.poolFencersCache.get(poolId) ?? this.db.getPoolFencers(poolId);
        const matches = (() => {
          const inMemory = this.sessionMatches
            .filter(m => (m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`) === poolId)
            .sort((a: any, b: any) => (a.number || 0) - (b.number || 0));
          if (inMemory.length > 0) {
            return inMemory.map(m => {
              const update = this.sessionMatchScores.get(m.id);
              return update ? { ...m, ...update } : m;
            });
          }
          return this.db.getMatchesByPool(poolId);
        })();
        const isComplete = matches.every((m: any) => m.status === MatchStatus.FINISHED);
        const sigMap = this.poolSignaturesCache.get(poolId);
        const signatures: Record<string, string> = sigMap ? Object.fromEntries(sigMap) : {};
        for (const [aId, arena] of this.arenas) {
          if ((arena.currentMatch?.poolId ?? arena.activePoolId) === poolId) {
            this.io
              .to(`pool:${aId}`)
              .emit(`pool:${aId}:update`, { poolId, fencers, matches, isComplete, signatures });
          }
        }

        // Notifier le renderer de la mise à jour du score (pour affichage dans le tableau poule)
        const mainWindow = (global as any).mainWindow;
        if (mainWindow) {
          mainWindow.webContents.send('match:finished', {
            matchId,
            scoreA: scoreAObj.value,
            scoreB: scoreBObj.value,
            poolId,
            isTableau: false,
          });
        }

        this.broadcastDashboardUpdate();
        res.json({ success: true, isComplete });
      } catch (err) {
        console.error('[RemoteScoreServer] Erreur score poule:', err);
        res.status(500).json({ error: 'Erreur enregistrement score' });
      }
    });

    // API: signature numérique d'un combattant pour une poule
    this.app.post('/api/pools/:poolId/fencers/:fencerId/signature', (req, res) => {
      if (!this.hasAnyValidToken(req.headers.cookie)) {
        return res.status(401).json({ error: 'Non authentifié' });
      }
      const { poolId, fencerId } = req.params;
      const { signatureData } = req.body as { signatureData: string };

      if (!signatureData || !signatureData.startsWith('data:image/png;base64,')) {
        return res.status(400).json({ error: 'Données de signature invalides' });
      }
      if (signatureData.length > 200_000) {
        return res.status(400).json({ error: 'Signature trop volumineuse (max 150 Ko)' });
      }

      // Vérifier que le combattant a terminé tous ses matchs
      const allMatches = (() => {
        const inMemory = this.sessionMatches.filter(
          m => (m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`) === poolId
        );
        if (inMemory.length > 0) {
          return inMemory.map(m => {
            const upd = this.sessionMatchScores.get(m.id);
            return upd ? { ...m, ...upd } : m;
          });
        }
        return this.db.getMatchesByPool(poolId);
      })();

      const fencerMatches = allMatches.filter(
        (m: any) =>
          m.fencerA?.id === fencerId ||
          m.fencerAId === fencerId ||
          m.fencerB?.id === fencerId ||
          m.fencerBId === fencerId
      );

      if (fencerMatches.length === 0) {
        return res.status(404).json({ error: 'Combattant introuvable dans cette poule' });
      }
      const allDone = fencerMatches.every((m: any) => m.status === MatchStatus.FINISHED);
      if (!allDone) {
        return res.status(403).json({ error: 'Matchs non terminés pour ce combattant' });
      }

      try {
        this.db.savePoolSignature(poolId, fencerId, signatureData);

        if (!this.poolSignaturesCache.has(poolId)) {
          this.poolSignaturesCache.set(poolId, new Map());
        }
        this.poolSignaturesCache.get(poolId)!.set(fencerId, signatureData);

        // Broadcaster la mise à jour avec signatures
        const fencers = this.poolFencersCache.get(poolId) ?? this.db.getPoolFencers(poolId);
        const signatures = Object.fromEntries(this.poolSignaturesCache.get(poolId)!);
        const isComplete = allMatches.every((m: any) => m.status === MatchStatus.FINISHED);
        for (const [aId, arena] of this.arenas) {
          if ((arena.currentMatch?.poolId ?? arena.activePoolId) === poolId) {
            this.io
              .to(`pool:${aId}`)
              .emit(`pool:${aId}:update`, {
                poolId,
                fencers,
                matches: allMatches,
                isComplete,
                signatures,
              });
          }
        }

        const mainWin = (global as any).mainWindow;
        if (mainWin) {
          const sigs = this.poolSignaturesCache.get(poolId)!;
          const poolFencers = this.poolFencersCache.get(poolId) ?? this.db.getPoolFencers(poolId);
          mainWin.webContents.send('pool:signature:updated', {
            poolId,
            signedFencerIds: Array.from(sigs.keys()),
            totalFencers: poolFencers.length,
          });
        }

        res.json({ success: true });
      } catch (err) {
        console.error('[RemoteScoreServer] Erreur signature:', err);
        res.status(500).json({ error: 'Erreur enregistrement signature' });
      }
    });

    // API : données d'une poule par son ID (pour OCR — sans arène)
    this.app.get('/api/pools/:poolId/data', (req, res) => {
      if (!this.hasAnyValidToken(req.headers.cookie)) {
        return res.status(401).json({ error: 'Non authentifié' });
      }
      const { poolId } = req.params;
      try {
        const fencers = this.poolFencersCache.get(poolId) ?? this.db.getPoolFencers(poolId);
        const matches = (() => {
          const inMemory = this.sessionMatches
            .filter((m: any) => (m.poolId || m.pool?.id) === poolId)
            .sort((a: any, b: any) => (a.number || 0) - (b.number || 0));
          if (inMemory.length > 0) {
            return inMemory.map((m: any) => {
              const upd = this.sessionMatchScores.get(m.id);
              return upd ? { ...m, ...upd } : m;
            });
          }
          return this.db.getMatchesByPool(poolId);
        })();
        const poolName = (() => {
          if (!this.session) return 'Poule';
          const all = this.db.getCompetitionPools(this.session.competitionId);
          return all.find((p: any) => p.id === poolId)?.name ?? 'Poule';
        })();
        res.json({ poolId, poolName, fencers, matches });
      } catch (err) {
        console.error('[RemoteScoreServer] Erreur /api/pools/:poolId/data:', err);
        res.status(500).json({ error: 'Erreur interne' });
      }
    });

    // API : reconnaissance OCR d'une image de feuille de poule
    this.app.post('/api/ocr/pool-sheet', async (req, res) => {
      if (!this.hasAnyValidToken(req.headers.cookie)) {
        return res.status(401).json({ error: 'Non authentifié' });
      }
      const { cells, n } = req.body as {
        cells: Array<{ row: number; col: number; data: string }>;
        n: number;
      };
      if (!Array.isArray(cells) || typeof n !== 'number' || n < 2 || n > 12) {
        return res.status(400).json({ error: 'Paramètres invalides' });
      }
      if (cells.length > 120) {
        return res.status(400).json({ error: 'Trop de cellules (max 120)' });
      }

      try {
        const Tesseract = await import('tesseract.js');
        const worker = await Tesseract.createWorker('eng', 1, {
          cachePath: path.join(os.tmpdir(), 'bp-tessdata'),
          logger: () => {},
        });
        await worker.setParameters({
          tessedit_char_whitelist: 'VD0123456789',
          tessedit_pageseg_mode: '13' as any, // PSM.RAW_LINE
        });

        const results: Array<{ row: number; col: number; text: string; confidence: number }> = [];
        for (const cell of cells) {
          if (!cell.data || !cell.data.startsWith('data:image/')) continue;
          const base64 = cell.data.replace(/^data:image\/\w+;base64,/, '');
          const buf = Buffer.from(base64, 'base64');
          const { data } = await worker.recognize(buf);
          const raw = data.text.trim().replace(/\s+/g, '').toUpperCase();
          results.push({
            row: cell.row,
            col: cell.col,
            text: raw,
            confidence: Math.round(data.confidence),
          });
        }

        await worker.terminate();
        res.json({ cells: results });
      } catch (err: any) {
        console.error('[RemoteScoreServer] Erreur OCR:', err);
        res.status(500).json({ error: `Erreur OCR: ${err?.message ?? 'inconnue'}` });
      }
    });

    // API : signature numérique d'un combattant pour un match de tableau (élimination directe)
    this.app.post('/api/matches/:matchId/fencers/:fencerId/signature', (req, res) => {
      if (!this.hasAnyValidToken(req.headers.cookie)) {
        return res.status(401).json({ error: 'Non authentifié' });
      }
      const { matchId, fencerId } = req.params;
      const { signatureData } = req.body as { signatureData: string };

      if (!signatureData || !signatureData.startsWith('data:image/png;base64,')) {
        return res.status(400).json({ error: 'Données de signature invalides' });
      }
      if (signatureData.length > 200_000) {
        return res.status(400).json({ error: 'Signature trop volumineuse (max 150 Ko)' });
      }

      const dbMatch = this.db.getMatch(matchId);
      if (!dbMatch) {
        return res.status(404).json({ error: 'Match non trouvé' });
      }
      // Réservé aux matchs de tableau (pas de poule)
      if ((dbMatch as any).poolId) {
        return res.status(400).json({ error: 'Signature de match réservée au tableau' });
      }

      try {
        this.db.saveDEMatchSignature(matchId, fencerId, signatureData);

        const mainWin = (global as any).mainWindow;
        if (mainWin) {
          mainWin.webContents.send('tableau:signature:updated', { matchId, fencerId });
        }

        res.json({ success: true });
      } catch (err) {
        console.error('[RemoteScoreServer] Erreur signature tableau:', err);
        res.status(500).json({ error: 'Erreur enregistrement signature' });
      }
    });

    // API pour récupérer les matchs d'une arène/poule
    this.app.get('/api/arenas/:arenaId/matches', (req, res) => {
      try {
        const { arenaId } = req.params;
        console.log(`[RemoteScoreServer] GET /api/arenas/${arenaId}/matches`);

        if (!this.session) {
          console.log('[RemoteScoreServer] Pas de session active');
          return res.status(404).json({ error: 'Aucune session active' });
        }

        const competitionId = this.session.competitionId;
        console.log(`[RemoteScoreServer] CompetitionId: ${competitionId}`);

        const arena = this.arenas.get(arenaId);

        // Si l'arène a un pool associé, retourner les matchs NON TERMINÉS du pool.
        // On exclut les matchs finis pour que, en fin de poule, le fallthrough
        // atteigne la file d'attente DE (Tier 3) au lieu de bloquer dessus.
        const currentPoolId = arena?.currentMatch?.poolId;
        if (currentPoolId && this.sessionMatches.length > 0) {
          const rawPoolMatches = this.sessionMatches
            .filter((m: any) => {
              const matchPoolId = m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`;
              if (matchPoolId !== currentPoolId) return false;
              const scoreUpdate = this.sessionMatchScores.get(m.id);
              const effectiveStatus = scoreUpdate?.status ?? m.status;
              if (effectiveStatus === MatchStatus.FINISHED) return false;
              // Exclure les matchs où un tireur est inactif (exclu/forfait/abandon)
              return this.isMatchPlayable(m as Match);
            })
            .map((m: any) => {
              const scoreUpdate = this.sessionMatchScores.get(m.id);
              return scoreUpdate ? { ...m, ...scoreUpdate } : m;
            });
          const poolMatches = this.applySmartMatchOrder(rawPoolMatches as Match[]);
          console.log(
            `[RemoteScoreServer] ${poolMatches.length} matchs de pool non terminés pour arène ${arenaId} (pool ${currentPoolId})`
          );
          if (poolMatches.length > 0) {
            return res.json({ matches: poolMatches, poolId: currentPoolId, poolName: null });
          }
        }

        // Fallback: match courant seul.
        // On utilise sessionMatches comme source de vérité pour le statut : en "fast poule",
        // les scores sont saisis via l'UI principale sans passer par finishArenaMatch, donc
        // arena.currentMatch.status reste 'not_started' en mémoire alors que le match est
        // réellement terminé dans sessionMatches.
        if (arena?.currentMatch) {
          const scoreUpdate = this.sessionMatchScores.get(arena.currentMatch.id);
          const inSession = this.sessionMatches.find((m: any) => m.id === arena.currentMatch!.id);
          const effectiveStatus =
            scoreUpdate?.status ?? inSession?.status ?? arena.currentMatch.status;
          if (
            effectiveStatus !== MatchStatus.FINISHED &&
            this.isMatchPlayable(arena.currentMatch)
          ) {
            console.log(
              `[RemoteScoreServer] Fallback match courant pour arène ${arenaId}: ${arena.currentMatch.id}`
            );
            const queueMatches = (this.arenaMatchQueue.get(arenaId) || [])
              .filter(m => m.fencerA && m.fencerB && this.isMatchPlayable(m))
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
                },
                ...queueMatches,
              ],
              poolId: null,
              poolName: null,
            });
          }
        }

        // File d'attente DE (currentMatch nul ou terminé)
        const arenaQueue = this.arenaMatchQueue.get(arenaId) || [];
        if (arenaQueue.length > 0) {
          console.log(
            `[RemoteScoreServer] ${arenaQueue.length} matchs en file DE pour arène ${arenaId}`
          );
          const queueMatches = arenaQueue
            .filter(m => m.fencerA && m.fencerB && this.isMatchPlayable(m))
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
        res.status(500).json({ error: 'Erreur lors de la récupération des matchs' });
      }
    });

    // API pour terminer un match avec enregistrement final
    this.app.post('/api/matches/:matchId/finish', async (req, res) => {
      if (!this.hasAnyValidToken(req.headers.cookie)) {
        return res.status(401).json({ error: 'Non authentifié' });
      }
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ??
        req.socket.remoteAddress ??
        'unknown';
      if (!this.checkScoreRateLimit(clientIp)) {
        return res.status(429).json({ error: 'Trop de soumissions, réessayez dans une minute' });
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
          return res.status(400).json({ error: 'Scores invalides (entiers entre 0 et 50)' });
        }

        console.log(`[RemoteScoreServer] POST /api/matches/${matchId}/finish`);
        console.log(`[RemoteScoreServer] Score final: ${scoreA}-${scoreB}`);

        // Vérifier que le match existe (en DB ou en mémoire)
        const dbMatch = this.db.getMatch(matchId);
        const inMemoryMatch = !dbMatch && this.sessionMatches.find((m: any) => m.id === matchId);
        this.sendDiag(
          `[REST /finish] matchId=${matchId} dbMatch=${!!dbMatch} poolId=${(dbMatch as any)?.poolId ?? '-'} inMemory=${!!inMemoryMatch} sessionMatchesIds=[${this.sessionMatches.map((m: any) => m.id).join(',')}]`
        );
        if (!dbMatch && !inMemoryMatch) {
          this.sendDiag(`[REST /finish] 404 match introuvable: ${matchId}`);
          return res.status(404).json({ error: 'Match non trouvé' });
        }

        // Déterminer le vainqueur : scores égaux + tirage au sort → utiliser winnerOverride
        const winner =
          scoreA > scoreB
            ? 'A'
            : scoreB > scoreA
              ? 'B'
              : winnerOverride === 'A' || winnerOverride === 'B'
                ? winnerOverride
                : null;

        // Carton noir : le combattant fautif est exclu de la compétition
        const blackCarded =
          blackCardFencer === 'A' || blackCardFencer === 'B' ? blackCardFencer : null;

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
          this.db.updateMatch(matchId, {
            scoreA: scoreAObj,
            scoreB: scoreBObj,
            status: MatchStatus.FINISHED,
          });
          // Synchroniser sessionMatchScores pour que peekNextMatch/loadNextMatch
          // puisse filtrer ce match comme terminé (sinon il réapparaît comme "prochain")
          this.sessionMatchScores.set(matchId, {
            scoreA: scoreAObj,
            scoreB: scoreBObj,
            status: MatchStatus.FINISHED,
          });
          // Mettre à jour le score en mémoire de l'arène pour que le broadcast
          // finishArenaMatch envoie le vrai score (pas 0-0) à l'affichage, puis
          // libérer l'arène exactement comme le fait la console arbitre.
          let arenaToFinish: string | null = null;
          for (const [arenaId, arena] of this.arenas) {
            if (arena.currentMatch && arena.currentMatch.id === matchId) {
              arena.currentMatch.scoreA = scoreA;
              arena.currentMatch.scoreB = scoreB;
              arenaToFinish = arenaId;
              break;
            }
          }
          if (arenaToFinish) {
            this.finishArenaMatch(arenaToFinish);
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
          this.sessionMatchScores.set(matchId, {
            scoreA: scoreAObj,
            scoreB: scoreBObj,
            status: MatchStatus.FINISHED,
          });
          // Mettre à jour les scores de l'arène puis terminer le match via l'IPC
          let arenaFoundForInMemory = false;
          for (const [arenaId, arena] of this.arenas) {
            if (arena.currentMatch && arena.currentMatch.id === matchId) {
              arena.currentMatch.scoreA = scoreA;
              arena.currentMatch.scoreB = scoreB;
              this.finishArenaMatch(arenaId);
              arenaFoundForInMemory = true;
              break;
            }
          }
          if (!arenaFoundForInMemory) {
            // Match en mémoire non trouvé dans une arène : notifier quand même le renderer
            const mainWin = (global as any).mainWindow;
            if (mainWin) {
              const sm = this.sessionMatches.find((m: any) => m.id === matchId);
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
              this.db.updateFencer(culpritId, { status: FencerStatus.EXCLUDED });
              console.log(`[RemoteScoreServer] Carton noir : combattant ${culpritId} exclu`);
              // Notifier le renderer pour mettre à jour le statut dans son store
              const mainWin = (global as any).mainWindow;
              if (mainWin) {
                mainWin.webContents.send('remote:fencer_excluded', {
                  fencerId: culpritId,
                  matchId,
                });
              }
            } catch (e) {
              console.error('[RemoteScoreServer] Erreur exclusion combattant:', e);
            }
          }
        }

        // Notifier tous les clients
        this.broadcastMessage({
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
        if (isTableauMatch && this.session) {
          try {
            const comp = this.db.getCompetition(this.session.competitionId);
            requireSignature = comp?.settings?.signTableauMatches === true;
          } catch {
            /* défaut: false */
          }
        }

        console.log(`[RemoteScoreServer] Match ${matchId} terminé et enregistré`);
        res.json({ success: true, winner, requireSignature });
      } catch (error) {
        console.error('[RemoteScoreServer] Erreur fin de match:', error);
        res.status(500).json({ error: 'Erreur lors de la fin du match' });
      }
    });

    this.app.get('/api/strips', (req, res) => {
      if (!this.session) {
        return res.status(404).json({ error: 'Aucune session active' });
      }
      res.json(this.session.strips);
    });

    this.app.post('/api/matches/:matchId/score', async (req, res) => {
      if (!this.hasAnyValidToken(req.headers.cookie)) {
        return res.status(401).json({ error: 'Non authentifié' });
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
            return res.status(400).json({ error: 'Scores invalides (entiers entre 0 et 50)' });
          }
        }

        // Mettre à jour le match dans la base de données
        await this.updateMatchScore(matchId, scoreUpdate);

        // Diffuser la mise à jour à tous les clients connectés
        this.broadcastMessage({
          type: 'score_update',
          data: { matchId, scoreUpdate },
          timestamp: new Date(),
          sender: 'server',
        });

        res.json({ success: true });
      } catch (error) {
        console.error('Error updating score:', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour du score' });
      }
    });

    // API : synchronisation des actions hors-ligne (tablettes arbitres)
    this.app.post('/api/sync', async (req, res) => {
      const actions: Array<{ id: string; type: string; payload: unknown }> =
        req.body?.actions || [];
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
              await this.updateMatchScore(p.matchId, {
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

    // API : données de résultats d'une compétition (classements de poules)
    this.app.get('/api/competitions/:competitionId/results-data', (req, res) => {
      try {
        const { competitionId } = req.params;
        const competition = this.db.getCompetition(competitionId);
        if (!competition) {
          return res.status(404).json({ error: 'Compétition introuvable' });
        }

        // Priorité : lire les poules depuis le session_state (elles ne sont pas dans les tables SQL)
        const sessionState = this.db.getSessionState(competitionId);
        const sessionPools: any[] = sessionState?.pools || [];
        if (sessionPools.length > 0) {
          const poolResults = sessionPools.map((pool: any) => {
            const rankings = (pool.ranking || []).map((r: any) => ({
              id: r.fencer?.id ?? '',
              lastName: r.fencer?.lastName ?? '',
              firstName: r.fencer?.firstName ?? '',
              club: r.fencer?.club ?? '',
              matchesPlayed: r.matchesPlayed ?? 0,
              victories: r.victories ?? 0,
              touchesFor: r.touchesScored ?? 0,
              touchesAgainst: r.touchesReceived ?? 0,
              index: r.index ?? 0,
            }));
            return {
              id: pool.id,
              number: pool.number,
              name: 'Poule ' + pool.number,
              rankings,
            };
          });
          const overallRanking = (sessionState?.overallRanking || []).map((r: any) => ({
            id: r.fencer?.id ?? '',
            lastName: r.fencer?.lastName ?? '',
            firstName: r.fencer?.firstName ?? '',
            club: r.fencer?.club ?? '',
            victories: r.victories ?? 0,
            index: r.index ?? 0,
            touchesFor: r.touchesScored ?? 0,
            touchesAgainst: r.touchesReceived ?? 0,
          }));
          return res.json({
            competition: {
              id: competition.id,
              title: competition.title,
              date: competition.date,
              weapon: competition.weapon,
            },
            pools: poolResults,
            overallRanking,
          });
        }

        // Fallback : tables SQL (cas import/legacy)
        const pools = this.db.getCompetitionPools(competitionId);
        const poolResults = pools.map(pool => {
          const fencers = this.db.getPoolFencers(pool.id);
          const matches = this.db.getMatchesByPool(pool.id);

          // Calcul des statistiques par tireur
          const stats: Record<
            string,
            { matchesPlayed: number; victories: number; touchesFor: number; touchesAgainst: number }
          > = {};
          for (const f of fencers) {
            stats[f.id] = { matchesPlayed: 0, victories: 0, touchesFor: 0, touchesAgainst: 0 };
          }

          for (const match of matches) {
            if (match.status !== MatchStatus.FINISHED) continue;
            const sA = match.scoreA;
            const sB = match.scoreB;
            if (!sA || !sB || !match.fencerA || !match.fencerB) continue;
            const idA = match.fencerA.id;
            const idB = match.fencerB.id;
            if (stats[idA]) {
              stats[idA].matchesPlayed += 1;
              stats[idA].touchesFor += sA.value ?? 0;
              stats[idA].touchesAgainst += sB.value ?? 0;
              if (sA.isVictory) stats[idA].victories += 1;
            }
            if (stats[idB]) {
              stats[idB].matchesPlayed += 1;
              stats[idB].touchesFor += sB.value ?? 0;
              stats[idB].touchesAgainst += sA.value ?? 0;
              if (sB.isVictory) stats[idB].victories += 1;
            }
          }

          const rankings = fencers
            .map(f => ({
              id: f.id,
              lastName: f.lastName,
              firstName: f.firstName,
              club: f.club ?? '',
              matchesPlayed: stats[f.id]?.matchesPlayed ?? 0,
              victories: stats[f.id]?.victories ?? 0,
              touchesFor: stats[f.id]?.touchesFor ?? 0,
              touchesAgainst: stats[f.id]?.touchesAgainst ?? 0,
              index: (stats[f.id]?.touchesFor ?? 0) - (stats[f.id]?.touchesAgainst ?? 0),
            }))
            .sort(
              (a, b) =>
                b.victories - a.victories || b.index - a.index || b.touchesFor - a.touchesFor
            );

          return { id: pool.id, name: pool.name, rankings };
        });

        res.json({
          competition: {
            id: competition.id,
            title: competition.title,
            date: competition.date,
            weapon: competition.weapon,
          },
          pools: poolResults,
        });
      } catch (error) {
        console.error('[RemoteScoreServer] Erreur résultats:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des résultats' });
      }
    });

    // API : historique combats entraînement
    this.app.get('/api/training/history', (req, res) => {
      if (!this.isTrainingMode) return res.status(404).json({ error: 'Mode non entraînement' });
      res.json({ history: this.trainingHistory });
    });

    // API : matchs à venir dans l'ordre de passage (kiosk vue suivants)
    this.app.get('/api/session/upcoming-matches', (req, res) => {
      if (!this.session) {
        return res.status(404).json({ error: 'Aucune session active' });
      }
      try {
        // Construire un index des matchs actuellement sur une piste
        const arenaByMatchId = new Map<string, string>();
        for (const [, arena] of this.arenas) {
          if (arena.currentMatch?.id) {
            arenaByMatchId.set(arena.currentMatch.id, arena.name);
          }
        }

        const upcoming: any[] = [];

        // Priorité : session_state (pools du renderer avec leurs matchs)
        const sessionState = this.db.getSessionState(this.session.competitionId);
        const sessionPools: any[] = sessionState?.pools || [];

        if (sessionPools.length > 0) {
          for (const pool of sessionPools) {
            const poolName = 'Poule ' + pool.number;
            const matches: any[] = (pool.matches || [])
              .filter((m: any) => m.status !== MatchStatus.FINISHED && m.status !== 'finished')
              .sort((a: any, b: any) => (a.number || 0) - (b.number || 0));
            for (const m of matches) {
              upcoming.push({
                id: m.id,
                number: m.number,
                poolName,
                poolNumber: pool.number,
                fencerA: m.fencerA
                  ? {
                      lastName: m.fencerA.lastName,
                      firstName: m.fencerA.firstName,
                      club: m.fencerA.club ?? '',
                    }
                  : null,
                fencerB: m.fencerB
                  ? {
                      lastName: m.fencerB.lastName,
                      firstName: m.fencerB.firstName,
                      club: m.fencerB.club ?? '',
                    }
                  : null,
                status: m.status,
                arenaName: arenaByMatchId.get(m.id) ?? null,
              });
            }
          }
        }

        // Matchs du tableau d'élimination directe (toutes phases confondues)
        const tableauMatches: any[] = sessionState?.tableauMatches || [];
        if (tableauMatches.length > 0) {
          const roundLabels: Record<number, string> = {
            2: 'Finale',
            3: 'Petite finale',
            4: 'Demi-finales',
            8: 'Quarts de finale',
            16: 'Tableau de 16',
            32: 'Tableau de 32',
            64: 'Tableau de 64',
            128: 'Tableau de 128',
          };
          const pendingTableau = tableauMatches
            .filter((m: any) => m.fencerA && m.fencerB && !m.isBye && !m.winner)
            .sort((a: any, b: any) => b.round - a.round || a.position - b.position);
          for (const m of pendingTableau) {
            const inArena = arenaByMatchId.has(m.id);
            upcoming.push({
              id: m.id,
              number: m.position,
              poolName: roundLabels[m.round] || `Tour de ${m.round}`,
              poolNumber: null,
              fencerA: {
                lastName: m.fencerA.lastName,
                firstName: m.fencerA.firstName,
                club: m.fencerA.club ?? '',
              },
              fencerB: {
                lastName: m.fencerB.lastName,
                firstName: m.fencerB.firstName,
                club: m.fencerB.club ?? '',
              },
              status: inArena ? 'in_progress' : 'not_started',
              arenaName: arenaByMatchId.get(m.id) ?? null,
              isTableau: true,
            });
          }
        }

        if (upcoming.length === 0 && this.sessionMatches.length > 0) {
          // Fallback : matchs en mémoire passés depuis le renderer
          const pending = (this.sessionMatches as any[])
            .filter(
              (m: any) =>
                m.status !== MatchStatus.FINISHED &&
                m.status !== 'finished' &&
                m.fencerA &&
                m.fencerB
            )
            .sort((a: any, b: any) => {
              const pA =
                a.poolNumber ?? parseInt(String(a.poolId || '').replace(/\D/g, '') || '0', 10);
              const pB =
                b.poolNumber ?? parseInt(String(b.poolId || '').replace(/\D/g, '') || '0', 10);
              return pA !== pB ? pA - pB : (a.number || 0) - (b.number || 0);
            });
          for (const m of pending) {
            const poolNum =
              m.poolNumber ?? parseInt(String(m.poolId || '').replace(/\D/g, '') || '0', 10);
            upcoming.push({
              id: m.id,
              number: m.number,
              poolName: 'Poule ' + (poolNum || '?'),
              poolNumber: poolNum,
              fencerA: m.fencerA
                ? {
                    lastName: m.fencerA.lastName,
                    firstName: m.fencerA.firstName,
                    club: m.fencerA.club ?? '',
                  }
                : null,
              fencerB: m.fencerB
                ? {
                    lastName: m.fencerB.lastName,
                    firstName: m.fencerB.firstName,
                    club: m.fencerB.club ?? '',
                  }
                : null,
              status: m.status,
              arenaName: arenaByMatchId.get(m.id) ?? null,
            });
          }
        }

        res.json({ upcoming });
      } catch (error) {
        console.error('[RemoteScoreServer] Erreur upcoming-matches:', error);
        res.status(500).json({ error: 'Erreur interne' });
      }
    });

    // Données du tableau d'élimination directe pour le kiosk
    this.app.get('/api/bracket', (req, res) => {
      try {
        if (!this.session) return res.status(404).json({ error: 'Aucune session active' });

        // Lire depuis la DB (inclut les matchs terminés) ; fallback sur sessionMatches (pending only)
        const sessionState = this.db.getSessionState(this.session.competitionId);
        const dbTableauMatches: any[] = sessionState?.tableauMatches || [];
        const deMatches =
          dbTableauMatches.length > 0
            ? dbTableauMatches
            : (this.sessionMatches as any[]).filter((m: any) => m.isTableau);

        if (deMatches.length === 0) {
          return res.json({ tableSize: 0, currentRound: null, rounds: [] });
        }

        const roundLabels: Record<number, string> = {
          2: 'Finale',
          3: 'Petite finale',
          4: 'Demi-finales',
          8: 'Quarts de finale',
          16: '1/8 de finale',
          32: '1/16 de finale',
          64: '1/32 de finale',
          128: '1/64 de finale',
        };

        // Arène par matchId pour l'affichage
        const arenaByMatchId = new Map<string, string>();
        for (const [arenaId, arena] of this.arenas.entries()) {
          if (arena.currentMatch) {
            const num = parseInt(arenaId.replace('arena', ''), 10);
            arenaByMatchId.set(arena.currentMatch.id, `Piste ${num}`);
          }
        }

        // Déterminer la taille du tableau (plus grande puissance de 2 couvrant tous les rounds)
        // maxRound (sans petite finale round=3) = taille du tableau (puissance de 2)
        const mainRounds = deMatches.filter((m: any) => m.round !== 3);
        const maxRound =
          mainRounds.length > 0 ? Math.max(...mainRounds.map((m: any) => m.round || 1)) : 4;
        const tableSize = maxRound;

        // Grouper par round, enrichir avec scores live
        const roundMap = new Map<number, any[]>();
        for (const m of deMatches) {
          const round = m.round || 1;
          if (!roundMap.has(round)) roundMap.set(round, []);
          const live = this.sessionMatchScores.get(m.id);
          const isFinished =
            (live?.status ?? m.status) === 'finished' ||
            (live?.status ?? m.status) === MatchStatus.FINISHED ||
            !!m.winner;
          const isLive =
            !isFinished &&
            ((live?.status ?? m.status) === 'in_progress' ||
              (live?.status ?? m.status) === MatchStatus.IN_PROGRESS ||
              arenaByMatchId.has(m.id));
          roundMap.get(round)!.push({
            id: m.id,
            position: m.position + 1,
            fencerA: m.fencerA
              ? {
                  lastName: m.fencerA.lastName,
                  firstName: m.fencerA.firstName,
                  club: m.fencerA.club ?? '',
                  id: m.fencerA.id,
                }
              : null,
            fencerB: m.fencerB
              ? {
                  lastName: m.fencerB.lastName,
                  firstName: m.fencerB.firstName,
                  club: m.fencerB.club ?? '',
                  id: m.fencerB.id,
                }
              : null,
            scoreA: (() => {
              const s = live?.scoreA ?? m.scoreA;
              if (s == null) return null;
              return typeof s === 'number' ? s : ((s as any)?.value ?? null);
            })(),
            scoreB: (() => {
              const s = live?.scoreB ?? m.scoreB;
              if (s == null) return null;
              return typeof s === 'number' ? s : ((s as any)?.value ?? null);
            })(),
            winnerId: m.winner?.id ?? null,
            status: isFinished ? 'finished' : isLive ? 'live' : 'pending',
            isBye: !!m.isBye,
            arenaName: arenaByMatchId.get(m.id) ?? null,
          });
        }

        // Trier les rounds du plus grand (tour initial) au plus petit (finale)
        const rounds = Array.from(roundMap.entries())
          .sort(([a], [b]) => b - a)
          .map(([round, matches]) => ({
            round,
            label: roundLabels[round] ?? `Tour de ${round}`,
            matches: matches.sort((a: any, b: any) => a.position - b.position),
          }));

        // Round actif = premier round non entièrement terminé (du plus grand au plus petit)
        const currentRound =
          rounds.find(r => r.matches.some((m: any) => m.status !== 'finished' && !m.isBye))
            ?.round ?? null;

        res.json({ tableSize, currentRound, rounds });
      } catch (error) {
        console.error('[RemoteScoreServer] Erreur /api/bracket:', error);
        res.status(500).json({ error: 'Erreur interne' });
      }
    });

    // Page HTML : résultats d'une compétition (pour les spectateurs)
    this.app.get('/competition/:competitionId/results', (req, res) => {
      const { competitionId } = req.params;
      const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Résultats – BellePoule</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 1rem; }
    header { text-align: center; padding: 1.5rem 0 1rem; }
    header h1 { font-size: 1.5rem; color: #f8fafc; }
    header p { color: #94a3b8; font-size: 0.875rem; margin-top: 0.25rem; }
    .pool { background: #1e293b; border-radius: 10px; margin: 1rem 0; overflow: hidden; }
    .pool-title { background: #3b82f6; color: white; padding: 0.6rem 1rem; font-weight: 600; font-size: 0.95rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { background: #0f172a; color: #94a3b8; padding: 0.5rem 0.75rem; text-align: left; font-weight: 500; }
    td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #334155; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: rgba(255,255,255,0.03); }
    .rank { color: #94a3b8; width: 2rem; }
    .name { font-weight: 600; }
    .club { color: #94a3b8; font-size: 0.8rem; }
    .num { text-align: center; }
    .pos { color: #4ade80; }
    .neg { color: #f87171; }
    .loading { text-align: center; padding: 3rem; color: #94a3b8; }
    .error { background: #450a0a; color: #fca5a5; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
    .refresh { position: fixed; bottom: 1rem; right: 1rem; background: #3b82f6; color: white;
      border: none; border-radius: 50%; width: 3rem; height: 3rem; font-size: 1.2rem;
      cursor: pointer; box-shadow: 0 4px 12px rgba(59,130,246,0.4); }
  </style>
</head>
<body>
  <div id="app"><div class="loading">Chargement des résultats…</div></div>
  <button class="refresh" onclick="load()" title="Actualiser">↻</button>
  <script>
    const competitionId = ${JSON.stringify(competitionId)};
    async function load() {
      try {
        const r = await fetch('/api/competitions/' + competitionId + '/results-data');
        if (!r.ok) throw new Error('Compétition introuvable');
        const data = await r.json();
        render(data);
      } catch(e) {
        const errEl = document.getElementById('app'); errEl.textContent = ''; const errDiv = document.createElement('div'); errDiv.className = 'error'; errDiv.textContent = 'Erreur : ' + e.message; errEl.appendChild(errDiv);
      }
    }
    function render(data) {
      const dateStr = data.competition.date
        ? new Date(data.competition.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
        : '';
      let html = '<header><h1>' + escHtml(data.competition.title) + '</h1>' +
        (dateStr ? '<p>' + dateStr + '</p>' : '') + '</header>';
      if (!data.pools || data.pools.length === 0) {
        html += '<p style="text-align:center;color:#94a3b8;padding:2rem">Aucune poule disponible</p>';
      } else {
        for (const pool of data.pools) {
          html += '<div class="pool"><div class="pool-title">' + escHtml(pool.name) + '</div><table>' +
            '<thead><tr><th class="rank">#</th><th>Tireur</th>' +
            '<th class="num">V</th><th class="num">TD</th><th class="num">TR</th><th class="num">Ind.</th></tr></thead><tbody>';
          pool.rankings.forEach((f, i) => {
            const ind = f.index >= 0 ? '+' + f.index : '' + f.index;
            const cls = f.index > 0 ? 'pos' : f.index < 0 ? 'neg' : '';
            html += '<tr><td class="rank">' + (i+1) + '</td>' +
              '<td><span class="name">' + escHtml(f.lastName.toUpperCase()) + ' ' + escHtml(f.firstName) + '</span>' +
              (f.club ? ' <span class="club">(' + escHtml(f.club) + ')</span>' : '') + '</td>' +
              '<td class="num">' + f.victories + '</td>' +
              '<td class="num">' + f.touchesFor + '</td>' +
              '<td class="num">' + f.touchesAgainst + '</td>' +
              '<td class="num ' + cls + '">' + ind + '</td></tr>';
          });
          html += '</tbody></table></div>';
        }
      }
      document.getElementById('app').innerHTML = html;
    }
    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    load();
    setInterval(load, 30000);
  </script>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    });

    // Journal du match en cours (tablette arbitre - lecture seule)
    this.app.get('/api/arena/:arenaId/current-match/events', (req, res) => {
      const arena = this.arenas.get(req.params.arenaId);
      if (!arena?.currentMatch?.id) {
        return res.json({ success: true, events: [], matchId: null });
      }
      try {
        const events = this.db.getMatchTimeline(arena.currentMatch.id);
        res.json({ success: true, events, matchId: arena.currentMatch.id });
      } catch (e) {
        res.status(500).json({ success: false, error: String(e) });
      }
    });

    // Page HTML journal (match en cours uniquement)
    this.app.get('/arene:arenaId/journal', (req, res) => {
      const arenaNum = req.params.arenaId;
      const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Journal – Piste ${arenaNum}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 1rem; font-size: 14px; }
    header { text-align: center; padding: 0.75rem 0 1rem; }
    header h1 { font-size: 1.1rem; color: #f8fafc; }
    #match-info { color: #94a3b8; font-size: 0.8rem; margin-top: 0.25rem; }
    #status { text-align: center; color: #94a3b8; padding: 2rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { background: #1e293b; color: #94a3b8; padding: 0.45rem 0.6rem; text-align: left; font-weight: 600; position: sticky; top: 0; }
    td { padding: 0.4rem 0.6rem; border-bottom: 1px solid #1e293b; }
    tr:nth-child(even) td { background: rgba(255,255,255,0.03); }
    .badge { padding: 0.1rem 0.4rem; border-radius: 999px; font-size: 0.7rem; font-weight: 700; }
    .badge-score_change { background: #4c1d95; color: #c4b5fd; }
    .badge-touch { background: #1e3a5f; color: #93c5fd; }
    .badge-card { background: #450a0a; color: #fca5a5; }
    .badge-arena_exit { background: #451a03; color: #fcd34d; }
    .side-a { color: #60a5fa; font-weight: 600; }
    .side-b { color: #f87171; font-weight: 600; }
    .ts { font-family: monospace; color: #64748b; white-space: nowrap; }
    #last-update { position: fixed; bottom: 0.5rem; right: 0.75rem; font-size: 0.7rem; color: #475569; }
  </style>
</head>
<body>
  <header>
    <h1>Journal — Piste ${arenaNum}</h1>
    <div id="match-info">Chargement…</div>
  </header>
  <div id="status"></div>
  <table id="log-table" style="display:none">
    <thead><tr><th>Heure</th><th>Type</th><th>Tireur</th><th>Description</th></tr></thead>
    <tbody id="log-body"></tbody>
  </table>
  <div id="last-update"></div>
  <script>
    const arenaId = 'arena${arenaNum}';
    let baseTs = null;

    function describeEvent(e) {
      switch (e.eventType) {
        case 'touch': return 'Zone ' + (e.zone || '?') + ' — ' + (e.points || 0) + ' pt(s)';
        case 'card': return 'Carton ' + (e.cardType || '') + ' — ' + (e.cardReason || '') + (e.resultingExclusion ? ' (exclusion)' : '');
        case 'arena_exit': return (e.exitType === 'arena_exit_voluntary' ? 'Sortie volontaire' : "Sortie d'arène") + ' — +' + (e.points || 0) + ' pts adv.';
        case 'score_change': {
          const pA = e.previousScoreA && e.previousScoreA.value != null ? e.previousScoreA.value : '?';
          const pB = e.previousScoreB && e.previousScoreB.value != null ? e.previousScoreB.value : '?';
          const nA = e.newScoreA && e.newScoreA.value != null ? e.newScoreA.value : '?';
          const nB = e.newScoreB && e.newScoreB.value != null ? e.newScoreB.value : '?';
          return pA + '/' + pB + ' → ' + nA + '/' + nB + ' (' + (e.refereeName || e.changedBy || '?') + ')';
        }
        default: return '';
      }
    }

    function formatTs(ts) {
      const d = new Date(ts);
      const abs = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (!baseTs) return abs;
      const diff = d.getTime() - new Date(baseTs).getTime();
      if (diff < 0) return abs;
      const s = Math.floor(diff / 1000) % 60;
      const m = Math.floor(diff / 60000);
      return abs + ' (+' + (m > 0 ? m + 'm' : '') + String(s).padStart(2,'0') + 's)';
    }

    async function refresh() {
      try {
        const r = await fetch('/api/arena/' + arenaId + '/current-match/events');
        const data = await r.json();
        const info = document.getElementById('match-info');
        const status = document.getElementById('status');
        const table = document.getElementById('log-table');
        const body = document.getElementById('log-body');

        if (!data.matchId || data.events.length === 0) {
          info.textContent = 'Aucun match en cours';
          status.textContent = data.matchId ? 'Aucun événement enregistré.' : '';
          table.style.display = 'none';
          baseTs = null;
          return;
        }

        baseTs = data.events[0].timestamp;
        info.textContent = 'Match en cours · ' + data.events.length + ' événement(s)';
        status.textContent = '';
        table.style.display = '';

        body.innerHTML = data.events.map(e => {
          const side = e.fencerSide ? ('<span class="side-' + e.fencerSide.toLowerCase() + '">' + e.fencerSide + ' — ' + (e.fencerLastName || '') + '</span>') : '<span style="color:#6b7280">Match</span>';
          return '<tr><td class="ts">' + formatTs(e.timestamp) + '</td><td><span class="badge badge-' + e.eventType + '">' + e.eventType + '</span></td><td>' + side + '</td><td>' + describeEvent(e) + '</td></tr>';
        }).reverse().join('');

        document.getElementById('last-update').textContent = 'MàJ ' + new Date().toLocaleTimeString('fr-FR');
      } catch(err) {
        document.getElementById('status').textContent = 'Erreur de connexion';
      }
    }

    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    });
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: any) => {
      console.log('Client connected:', socket.id);

      // Gestion des arènes
      socket.on('join_arena', (data: { arenaId: string; role?: string; lastSeen?: number }) => {
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
            referees: this.session?.referees ?? [],
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
            referees: this.session?.referees ?? [],
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
        }
      });

      socket.on(
        'arena_control',
        (data: { arenaId: string; action: string; scoreA?: number; scoreB?: number }) => {
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
          const now = new Date().toISOString();
          const screenId = data.screenId;
          const label = screenId ? this.screenLabels.get(screenId) : undefined;
          this.connectedClients.set(socket.id, {
            socketId: socket.id,
            clientType: data.clientType ?? 'arena',
            arenaId: data.arenaId,
            ip:
              (socket.handshake.headers['x-forwarded-for'] as string) ||
              socket.handshake.address ||
              '',
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
        if (data.role === 'referee' && !this.checkArenaAuth(data.arenaId, socket.handshake.headers.cookie as string)) {
          socket.emit('auth_error', { message: 'Authentification requise' });
          socket.disconnect(true);
          return;
        }
        socket.join(`team-arena:${data.arenaId}`);
        socket.emit('team_arena_state', this.getPublicTeamArenaState(data.arenaId));
      });

      const broadcastTeamArena = (arenaId: string) => {
        this.io.to(`team-arena:${arenaId}`).emit('team_arena_state', this.getPublicTeamArenaState(arenaId));
      };

      // Touche (simple, ou zone A/B/C = 1/3/5 en mode points) — assaut plafonné
      // à 5 touches valides cumulées, vérifié après chaque saisie.
      socket.on('team_touch', (data: { arenaId: string; side: 'A' | 'B'; points: number }) => {
        const state = this.teamArenaState.get(data.arenaId);
        if (!state) return;
        const bout = state.bouts[state.currentBoutIndex];
        if (!bout || bout.status === 'finished') return;
        if (data.side === 'A') state.liveScoreA += data.points;
        else state.liveScoreB += data.points;
        broadcastTeamArena(data.arenaId);
      });

      // Réinitialise l'assaut en cours (score et chrono), sans le terminer.
      socket.on('team_reset_bout', (data: { arenaId: string }) => {
        const state = this.teamArenaState.get(data.arenaId);
        if (!state) return;
        state.liveScoreA = 0;
        state.liveScoreB = 0;
        state.elapsedAccumulatedSec = 0;
        state.timerStartedAt = null;
        broadcastTeamArena(data.arenaId);
      });

      socket.on('team_timer_start', (data: { arenaId: string }) => {
        const state = this.teamArenaState.get(data.arenaId);
        if (!state || state.timerStartedAt !== null) return;
        state.timerStartedAt = Date.now();
        broadcastTeamArena(data.arenaId);
      });

      socket.on('team_timer_pause', (data: { arenaId: string }) => {
        const state = this.teamArenaState.get(data.arenaId);
        if (!state || state.timerStartedAt === null) return;
        state.elapsedAccumulatedSec = this.teamArenaElapsedSec(state);
        state.timerStartedAt = null;
        broadcastTeamArena(data.arenaId);
      });

      // Termine l'assaut en cours (persiste le score), avance au suivant s'il en reste.
      socket.on('team_advance_bout', (data: { arenaId: string }) => {
        const state = this.teamArenaState.get(data.arenaId);
        if (!state) return;
        const bout = state.bouts[state.currentBoutIndex];
        if (!bout || bout.status === 'finished') return;
        const scoreA = state.liveScoreA;
        const scoreB = state.liveScoreB;
        const winnerId =
          scoreA > scoreB ? bout.fencerAId : scoreB > scoreA ? bout.fencerBId : null;
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
          const state = this.teamArenaState.get(data.arenaId);
          if (!state) return;
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

      // Niveau de batterie remonté par les tablettes arbitre
      socket.on('client:battery', (data: { level: number; charging: boolean }) => {
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
      case 'card_announcement':
        if (data.announcement) {
          this.io
            .to(`arena:${data.arenaId}`)
            .emit(`arena:${data.arenaId}:card_announcement`, data.announcement);
        }
        break;
      case 'exit_announcement':
        if (data.announcement && this.sessionCardAnnounce) {
          this.io
            .to(`arena:${data.arenaId}`)
            .emit(`arena:${data.arenaId}:exit_announcement`, data.announcement);
        }
        break;
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
      referees: [],
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

    arena.currentMatch = match;
    arena.status = 'ready';
    if (match.poolId) arena.activePoolId = match.poolId;

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

    // Mettre à jour la map d'overrides pour les matchs de poule chargés on-demand
    if (toArena !== null) {
      this.poolMatchArenaOverrides.set(matchId, `arena${toArena}`);
    } else {
      this.poolMatchArenaOverrides.delete(matchId);
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
      // Arène occupée (match en cours ou non démarré) → ajouter en fin de file (FIFO)
      const toQueue = this.arenaMatchQueue.get(toArenaId) || [];
      this.arenaMatchQueue.set(toArenaId, [...toQueue, matchToMove]);
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
      arena.currentMatch.duration = Math.floor(
        (new Date().getTime() - arena.startTime.getTime()) / 1000
      );
    }

    // Persistance secondaire (timing / cartons / touches / sorties) : ces écritures
    // utilisent arena.currentMatch.id qui, pour un match de tableau, n'est PAS l'id DB
    // (stocké en composite). Une éventuelle exception (ex: contrainte FK) NE DOIT PAS
    // empêcher l'émission de match:finished vers le renderer (sinon : vainqueur jamais
    // remonté, pas de passage au tour suivant). On isole donc tout ce bloc.
    if (!this.isTrainingMode)
      try {
        // Persister le timing en DB
        if (arena.currentMatch.id && arena.startTime) {
          const durationSec = arena.currentMatch.duration ?? 0;
          this.db.updateMatchTiming(
            arena.currentMatch.id,
            arena.startTime.toISOString(),
            arena.currentMatch.endTime!.toISOString(),
            durationSec
          );
        }

        // Persister les cartons accumulés en mémoire
        const cards = this.arenaCards.get(arenaId) ?? { cardsA: [], cardsB: [] };
        const now = new Date().toISOString();
        const matchId = arena.currentMatch.id;
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
              pointsAwarded: 3,
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

  private resolveReferee(refereeId?: string | null): { id: string; name: string } | null {
    if (!refereeId || !this.session) return null;
    const ref = this.session.referees.find(r => r.id === refereeId);
    return ref ? { id: ref.id, name: ref.name } : null;
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
    const currentPoolId = arena.currentMatch?.poolId;

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
    const currentPoolId = arena.currentMatch?.poolId;
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

  private buildDashboardSnapshot(): { rankings: any[]; pools: any[]; liveMatches: any[] } | null {
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

    return { rankings, pools, liveMatches };
  }

  public broadcastDashboardUpdate(): void {
    const snapshot = this.buildDashboardSnapshot();
    if (!snapshot) return;
    this.io.to('dashboard').emit('rankings:update', { rankings: snapshot.rankings });
    this.io.to('dashboard').emit('pools:update', { pools: snapshot.pools });
    this.io.to('dashboard').emit('matches:update', { matches: snapshot.liveMatches });
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
      referees: this.session?.referees ?? [],
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

  public setRegistrationEnabled(enabled: boolean): void {
    this.registrationEnabled = enabled;
    console.log(`[RemoteScoreServer] Inscription distante ${enabled ? 'activée' : 'désactivée'}`);
  }

  private registrationRateLimiter: Map<string, { count: number; resetAt: number }> = new Map();

  private checkRegistrationRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = this.registrationRateLimiter.get(ip);
    if (!entry || now > entry.resetAt) {
      this.registrationRateLimiter.set(ip, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    if (entry.count >= 5) return false;
    entry.count++;
    return true;
  }

  private checkScoreRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = this.scoreRateLimiter.get(ip);
    if (!entry || now > entry.resetAt) {
      this.scoreRateLimiter.set(ip, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    if (entry.count >= this.SCORE_RATE_LIMIT) return false;
    entry.count++;
    return true;
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
    if (this.server) {
      this.server.close();
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

    let poolIndex = 0;
    for (const [poolId, poolMatches] of sortedPoolEntries) {
      if (poolIndex >= strips) break;

      const arenaId = `arena${poolIndex + 1}`;

      // Premier match non terminé et non en cours (évite le curseur orange au démarrage)
      const firstMatch = poolMatches.find(
        m => m.status !== 'finished' && m.status !== 'in_progress'
      );

      if (!firstMatch) {
        // Tous les matchs sont terminés ou en cours : lier la pool à l'arène sans assigner de match
        const anyMatch = poolMatches[0];
        if (anyMatch) {
          const arena = this.arenas.get(arenaId);
          if (arena) arena.activePoolId = poolId;
        }
        this.arenaNextMatchIndex.set(arenaId, poolMatches.length);
        poolIndex++;
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

      this.assignMatchToArena(arenaId, arenaMatch);

      // Index du prochain match = position de firstMatch + 1 dans la liste originale
      const firstMatchIndex = poolMatches.findIndex(m => m.id === firstMatch.id);
      this.arenaNextMatchIndex.set(arenaId, firstMatchIndex + 1);

      console.log(
        `[RemoteScoreServer] Match ${firstMatch.id} (Pool ${poolId}) assigné à l'arène ${arenaId}`
      );

      poolIndex++;
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
    const dbReferees = this.db.getRefereesByCompetition(competitionId);
    const sessionReferees = dbReferees.map(r => ({
      id: r.id,
      name: `${r.firstName} ${r.lastName}`.trim(),
      code: r.license ?? r.ref.toString(),
      isActive: r.status !== 'unavailable',
      lastActivity: r.updatedAt,
    }));
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
