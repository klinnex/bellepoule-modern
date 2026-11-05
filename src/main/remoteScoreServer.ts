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
import {
  Competition,
  CustomScoringConfig,
  Match,
  MatchStatus,
  FencerStatus,
  Score,
  Weapon,
} from '../shared/types';
import { DatabaseManager } from '../database';
import {
  PASSWORD_MIN_LENGTH,
  isLocalNetworkOrigin,
  isLoginPath,
  isLoopbackAddress,
  localIPv4Address,
  normalizeIp,
} from './remote/network';
import type { BlackCardRecord, SessionMatch, TeamArenaState } from './remote/types';
import type { PhaseEtaSummary, RouteContext } from './remote/routes/context';
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
  verifyPasswordAsync,
} from './remote/auth';
import { applyPageCsp, sendHtmlPage } from './remote/csp';
import { loadRemoteHtmlFiles, loadSocketIoClient } from './remote/htmlLoader';
import {
  resolveReferee,
  resolvePoolReferee,
  resolveTableauMatchReferees,
  resolveDeMatchReferee,
  type RefereeResolverContext,
  type StateEntry,
} from './remote/refereeResolver';
import { sanitizeAnnouncement } from './remote/announcement';
import * as slots from './remote/arenaSlots';
import { applySmartMatchOrder, isMatchPlayable } from './remote/matchOrder';
import { createHttpStack, startCleanupTimer, isAllowedOrigin } from './remote/serverSetup';
import {
  buildPage,
  sendStored,
  storeBody,
  type StoredBody,
  type StoredPage,
} from './remote/pageStore';
import { registerPageRoutes } from './remote/routes/pageRoutes';
import { registerResultsRoutes } from './remote/routes/resultsRoutes';
import {
  registerRegistrationRoutes,
  type RegistrationRouteContext,
} from './remote/routes/registrationRoutes';
import { registerPoolRoutes, type PoolRouteContext } from './remote/routes/poolRoutes';
import { registerMatchRoutes, type MatchRouteContext } from './remote/routes/matchRoutes';
import { registerApiRoutes, type ApiRouteContext } from './remote/routes/apiRoutes';
import { readRemoteSharedFiles } from './remote/i18nBundle';

export { PASSWORD_MIN_LENGTH };
import { setupSocketHandlers, type SocketHandlersContext } from './remote/socketHandlers';
import { handleArenaControl, type ArenaControlContext } from './remote/arenaControl';
import { setupMiddleware, type MiddlewareContext } from './remote/middleware';
import { startSession, type SessionStartContext } from './remote/sessionStart';
import { liveContext } from './remote/liveContext';
import {
  syncPoolMatches,
  updatePoolFencers,
  resetPoolMatch,
  finishPoolMatch,
  type PoolSyncContext,
} from './remote/poolSync';
import {
  setTeamArenaMatch,
  clearTeamArenaMatch,
  teamArenaElapsedSec,
  getPublicTeamArenaState,
  type TeamArenaContext,
} from './remote/teamArena';
import {
  startTrainingSession,
  createTrainingMatch,
  type TrainingSessionContext,
} from './remote/trainingSession';
import type { DemoPlayer } from './remote/demoMode';
import { finishArenaMatch, type MatchFinishContext } from './remote/matchFinish';
import {
  peekNextMatch,
  loadNextMatch,
  updateMatchArena,
  assignPools,
  refreshDeMatches,
  type ArenaQueueContext,
} from './remote/arenaQueue';
import { createSession, updateMatchScore, type SessionOpsContext } from './remote/sessionOps';
import {
  setCheckinEnabled,
  setCheckinPassword,
  checkCheckinAuth,
  checkinGuard,
  setTrainerEnabled,
  setTrainerPassword,
  checkTrainerAuth,
  trainerGuard,
  type AccessGuardsContext,
  type GuardRefusal,
} from './remote/accessGuards';
import {
  startServer,
  stopServer,
  notifyKioskData,
  launchCompetition,
  stopSession,
  type LifecycleContext,
} from './remote/lifecycle';
import {
  broadcastArenaUpdate,
  persistArenaState,
  type ArenaBroadcastContext,
} from './remote/arenaBroadcast';
import {
  assignMatchToArena,
  startArenaMatch,
  pauseArenaMatch,
  getScoreLimit,
  updateArenaScore,
  type ArenaOpsContext,
} from './remote/arenaOps';
import {
  updateStripCount,
  updateShowPhotos,
  applyCompetitionSettings,
  refreshCompetitionSettings,
  updateBlackCardEnabled,
  updateCardAnnounce,
  updateTheme,
  updateArenaTheme,
  clearArenaThemeOverride,
  updateArenaScreenTheme,
  updateKioskViews,
  updateKioskTheme,
  type SessionSettingsContext,
} from './remote/sessionSettings';
import { getArenaBlackCards, cancelBlackCard, type BlackCardsContext } from './remote/blackCards';
import { buildDashboardSnapshot, computePhaseEta, type DashboardContext } from './remote/dashboard';
import { getUiLanguage } from './menuLabels';
import { isWebhookUrlSafe } from '../shared/services/notificationService';
import { postWebhook } from './webhook';
import { sendClientListToWindow } from './remoteRegistry';
import { getSharedMainWindow } from './mainWindowRef';
import { logger, LogCategory } from '../shared/services/logger';
const NET = LogCategory.NETWORK;

export type ArenaEventList = 'touchesA' | 'touchesB' | 'cardsA' | 'cardsB' | 'exits';

/** Raccourcis de type pour les modules extraits (#1240) : état du serveur, paramètres hors contexte */
type S = RemoteScoreServer;
type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never;

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
  // Score max (paramètres / formule) : null = inconnu (15), 0 ou ≥ 999 = illimité (#1134)
  private sessionPoolMaxScore: number | null = null;
  private sessionTableMaxScore: number | null = null;
  private sessionRestSeconds: number = 0; // Repos entre périodes (escrime olympique, 0 = désactivé)
  private sessionModernRules = false; // Règles armes modernes (E/F/S ou formule personnalisée, #1125)
  private sessionMatches: SessionMatch[] = []; // Matches passés depuis le renderer
  /** Tournoi des rapières : seuls les matchs de la vague active sont proposés aux tablettes (#1118). `null` = pas de filtre. */
  private activeWaveMatchIds: Set<string> | null = null;
  /** Rapières : vagues terminées, plus aucun match de poule proposé aux tablettes (#1118) */
  private poolsClosed = false;
  private arenaSlots = new slots.ArenaSlotRegistry();
  private sessionPoolArenas = new Map<string, number>(); // poolId → piste prévue (#1078)
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
  // Système de score de la formule personnalisée (arme CUSTOM) : tablettes poules / tableau (#1125)
  private sessionCustomScoring: { pool?: CustomScoringConfig; de?: CustomScoringConfig } | null =
    null;
  private sessionBlackCardEnabled: boolean = false; // Carton noir activé (paramètre compétition)
  private sessionBlackCards: Map<string, BlackCardRecord> = new Map(); // fencerId → carton noir annulable
  private sessionTheme: DisplayTheme = 'dark'; // Thème visuel de l'affichage distant (global)
  private arenaThemeOverrides: Map<string, { theme: DisplayTheme; customTheme?: CustomTheme }> =
    new Map();
  private arenaScreenThemes: Map<string, Partial<Record<ThemeTargetType, CustomTheme>>> = new Map();
  private kioskThemeVariables: Record<string, string> | null = null; // Thème CSS vars pour le kiosk
  private orgNote: OrgNote | null = null; // Note d'organisation affichée sur le kiosk
  private isTrainingMode: boolean = false;
  /** Arbitre virtuel du mode démo (null hors démo) */
  private demoPlayer: DemoPlayer | null = null;
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
    demo?: boolean; // démo autonome (arbitre virtuel)
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
  private currentLang: string = getUiLanguage(); // Langue de l'application dès le lancement (#1213)
  private sessionKioskViews: Record<
    'poules' | 'classement' | 'direct' | 'suivants' | 'tableau',
    boolean
  > = {
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
  // Pages prêtes à servir (scripts extraits, pré-compressées, ETag) + assets versionnés /_a/<hash>.js (#1151)
  private pages: Map<string, StoredPage> = new Map();
  private assets: Map<string, StoredBody> = new Map();
  // Fichiers statiques JS/CSS communs (pré-compressés, revalidation par ETag)
  private staticFiles: Map<string, StoredBody> = new Map();
  private remoteBasePath: string | null = null;
  private unsubscribeDb: (() => void) | null = null;
  private kioskDataTimer: NodeJS.Timeout | null = null;

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

  /** Contexte de socketHandlers.ts (#1240) */
  private get socketCtx(): SocketHandlersContext {
    return (this._socketCtx ??= liveContext<SocketHandlersContext>(
      this,
      [
        'MAX_SOCKETS_PER_IP',
        'SOCKET_EVENTS_PER_SEC',
        'SOCKET_EVENT_BURST',
        'arenaEventBuffer',
        'arenaRefereeSelected',
        'arenaScreenThemes',
        'arenaThemeOverrides',
        'connectedClients',
        'db',
        'io',
        'isTrainingMode',
        'kioskThemeVariables',
        'screenLabels',
        'session',
        'sessionBlackCardEnabled',
        'sessionCardAnnounce',
        'sessionPoolTimerSeconds',
        'sessionRefereeFeatureEnabled',
        'sessionRestSeconds',
        'sessionShowPhotos',
        'sessionTableTimerSeconds',
        'sessionTheme',
        'socketsPerIp',
        'teamArenaState',
        'trainingCustomRules',
      ],
      [
        'broadcastClientList',
        'buildDashboardSnapshot',
        'checkArenaAuth',
        'checkSocketArenaAuth',
        'getArena',
        'getPublicTeamArenaState',
        'getSessionReferees',
        'handleArenaControl',
        'handleDisconnect',
        'peekNextMatch',
        'sendDiag',
        'teamArenaElapsedSec',
      ]
    ));
  }
  private _socketCtx?: SocketHandlersContext;

  /** Contexte de arenaControl.ts (#1240) */
  private get arenaControlCtx(): ArenaControlContext {
    return (this._arenaControlCtx ??= liveContext<ArenaControlContext>(
      this,
      [
        'SCORE_UPDATE_DEBOUNCE_MS',
        'arenaCards',
        'arenaEventTimes',
        'arenaExits',
        'arenaOvertimeType',
        'arenaRefereeSelected',
        'arenaSuddenDeath',
        'arenaTouches',
        'arenaWaitingOvertime',
        'db',
        'io',
        'isTrainingMode',
        'scoreUpdateDebounce',
        'session',
        'sessionCardAnnounce',
        'sessionMatches',
        'trainingCustomRules',
      ],
      [
        'assignMatchToArena',
        'broadcastArenaUpdate',
        'finishArenaMatch',
        'getArena',
        'loadNextMatch',
        'pauseArenaMatch',
        'resolveReferee',
        'sendDiag',
        'stampArenaEvents',
        'startArenaMatch',
        'updateArenaScore',
      ]
    ));
  }
  private _arenaControlCtx?: ArenaControlContext;

  /** Contexte de middleware.ts (#1240) */
  private get middlewareCtx(): MiddlewareContext {
    return (this._middlewareCtx ??= liveContext<MiddlewareContext>(
      this,
      ['app', 'assets', 'htmlFiles', 'staticFiles'],
      ['isAllowedOrigin', 'sendHtmlFromMemory']
    ));
  }
  private _middlewareCtx?: MiddlewareContext;

  /** Contexte de trainingSession.ts (#1240) */
  private get trainingSessionCtx(): TrainingSessionContext {
    return (this._trainingSessionCtx ??= liveContext<TrainingSessionContext>(
      this,
      [
        'poolFencersCache',
        'poolSignaturesCache',
        'sessionBlackCards',
        'sessionMatchScores',
        'isTrainingMode',
        'session',
        'sessionBlackCardEnabled',
        'sessionCardAnnounce',
        'sessionCustomScoring',
        'sessionKioskViews',
        'sessionMatches',
        'sessionModernRules',
        'sessionPoolMaxScore',
        'sessionPoolTimerSeconds',
        'sessionRefereeFeatureEnabled',
        'sessionRestSeconds',
        'sessionShowPhotos',
        'sessionTableMaxScore',
        'sessionTableTimerSeconds',
        'sessionWeapon',
        'trainingCustomRules',
        'trainingHistory',
        'arenas',
        'demoPlayer',
      ],
      [
        'assignMatchToArena',
        'createTrainingMatch',
        'notifyKioskData',
        'setArenaCount',
        'startArenaMatch',
        'updateArenaScore',
        'finishArenaMatch',
        'getScoreLimit',
        'broadcastArenaUpdate',
      ]
    ));
  }
  private _trainingSessionCtx?: TrainingSessionContext;

  /** Contexte de teamArena.ts (#1240) */
  private get teamArenaCtx(): TeamArenaContext {
    return (this._teamArenaCtx ??= liveContext<TeamArenaContext>(this, [
      'db',
      'io',
      'teamArenaState',
    ]));
  }
  private _teamArenaCtx?: TeamArenaContext;

  /** Contexte de poolSync.ts (#1240) */
  private get poolSyncCtx(): PoolSyncContext {
    return (this._poolSyncCtx ??= liveContext<PoolSyncContext>(
      this,
      ['arenas', 'db', 'io', 'poolFencersCache', 'sessionMatches', 'sessionMatchScores'],
      ['broadcastArenaUpdate', 'resolveReferee']
    ));
  }
  private _poolSyncCtx?: PoolSyncContext;

  /** Contexte de sessionStart.ts (#1240) */
  private get sessionStartCtx(): SessionStartContext {
    return (this._sessionStartCtx ??= liveContext<SessionStartContext>(
      this,
      [
        'arenaMatchQueue',
        'arenaNextMatchIndex',
        'arenas',
        'db',
        'poolFencersCache',
        'poolSignaturesCache',
        'session',
        'sessionBlackCardEnabled',
        'sessionCardAnnounce',
        'sessionCustomScoring',
        'sessionKioskViews',
        'sessionMatchScores',
        'sessionMatches',
        'sessionPoolArenas',
        'sessionRefereeFeatureEnabled',
        'sessionShowPhotos',
        'sessionWeapon',
      ],
      [
        'applyCompetitionSettings',
        'assignMatchToArena',
        'loadSessionReferees',
        'notifyKioskData',
        'setArenaCount',
      ]
    ));
  }
  private _sessionStartCtx?: SessionStartContext;

  /** Contexte de matchFinish.ts (#1240) */
  private get matchFinishCtx(): MatchFinishContext {
    return (this._matchFinishCtx ??= liveContext<MatchFinishContext>(
      this,
      [
        'arenaCards',
        'arenaEventTimes',
        'arenaExits',
        'arenaMatchQueue',
        'arenaRefereeSelected',
        'arenaTouches',
        'arenas',
        'db',
        'isTrainingMode',
        'recentMatchDurationsMs',
        'session',
        'sessionMatchScores',
        'sessionModernRules',
        'sessionWeapon',
        'trainingHistory',
      ],
      [
        'broadcastArenaUpdate',
        'broadcastDashboardUpdate',
        'createTrainingMatch',
        'fireWebhook',
        'loadNextMatch',
        'peekNextMatch',
        'persistArenaState',
        'resolveDbMatchId',
        'sendDiag',
      ]
    ));
  }
  private _matchFinishCtx?: MatchFinishContext;

  /** Contexte de arenaBroadcast.ts (#1240) */
  private get arenaBroadcastCtx(): ArenaBroadcastContext {
    return (this._arenaBroadcastCtx ??= liveContext<ArenaBroadcastContext>(
      this,
      [
        'arenaEventBuffer',
        'arenaMatchQueue',
        'arenaPhotoSentForMatch',
        'arenaRefereeSelected',
        'arenaScreenThemes',
        'arenaThemeOverrides',
        'arenas',
        'db',
        'EVENT_BUFFER_MAX',
        'EVENT_BUFFER_TTL_MS',
        'io',
        'session',
        'sessionBlackCardEnabled',
        'sessionCardAnnounce',
        'sessionModernRules',
        'sessionPoolTimerSeconds',
        'sessionRefereeFeatureEnabled',
        'sessionRestSeconds',
        'sessionShowPhotos',
        'sessionTableTimerSeconds',
        'sessionTheme',
      ],
      ['getArena', 'getSessionReferees', 'notifyKioskData']
    ));
  }
  private _arenaBroadcastCtx?: ArenaBroadcastContext;

  /** Contexte de lifecycle.ts (#1240) */
  private get lifecycleCtx(): LifecycleContext {
    return (this._lifecycleCtx ??= liveContext<LifecycleContext>(
      this,
      [
        'arenaCount',
        'arenaEventBuffer',
        'arenaMatchQueue',
        'arenaNextMatchIndex',
        'arenaTokens',
        'arenas',
        'cleanupInterval',
        'demoPlayer',
        'host',
        'io',
        'isTrainingMode',
        'kioskDataTimer',
        'poolFencersCache',
        'poolMatchArenaOverrides',
        'poolSignaturesCache',
        'port',
        'server',
        'session',
        'sessionMatchScores',
        'sessionMatches',
        'sessionPoolArenas',
        'trainingCustomRules',
        'unsubscribeDb',
        'useHttps',
      ],
      ['clearArenaCombatState', 'getServerUrl', 'notifyKioskData', 'stopSession', 'updateArena']
    ));
  }
  private _lifecycleCtx?: LifecycleContext;

  /** Contexte de sessionOps.ts (#1240) */
  private get sessionOpsCtx(): SessionOpsContext {
    return (this._sessionOpsCtx ??= liveContext<SessionOpsContext>(
      this,
      ['arenas', 'db', 'sessionMatchScores', 'sessionMatches'],
      ['assignMatchToArena', 'loadSessionReferees', 'setArenaCount', 'updateArenaScore']
    ));
  }
  private _sessionOpsCtx?: SessionOpsContext;

  /** Contexte de accessGuards.ts (#1240) */
  private get accessGuardsCtx(): AccessGuardsContext {
    return (this._accessGuardsCtx ??= liveContext<AccessGuardsContext>(this, [
      'checkinEnabled',
      'checkinPassword',
      'checkinTokens',
      'trainerEnabled',
      'trainerPassword',
      'trainerTokens',
    ]));
  }
  private _accessGuardsCtx?: AccessGuardsContext;

  /** Contexte de arenaOps.ts (#1240) */
  private get arenaOpsCtx(): ArenaOpsContext {
    return (this._arenaOpsCtx ??= liveContext<ArenaOpsContext>(
      this,
      [
        'arenaOvertimeType',
        'arenaRefereeSelected',
        'arenaSuddenDeath',
        'arenas',
        'db',
        'io',
        'sessionMatches',
        'sessionPoolMaxScore',
        'sessionTableMaxScore',
        'sessionWeapon',
      ],
      [
        'broadcastArenaUpdate',
        'isGuestMatch',
        'persistArenaState',
        'resolveDbMatchId',
        'resolvePoolReferee',
        'resolveReferee',
        'resolveTableauMatchReferees',
        'updateArena',
      ]
    ));
  }
  private _arenaOpsCtx?: ArenaOpsContext;

  /** Contexte de arenaQueue.ts (#1240) */
  private get arenaQueueCtx(): ArenaQueueContext {
    return (this._arenaQueueCtx ??= liveContext<ArenaQueueContext>(
      this,
      [
        'arenaCount',
        'arenaMatchQueue',
        'arenaNextMatchIndex',
        'arenaRefereeSelected',
        'arenas',
        'db',
        'io',
        'isTrainingMode',
        'poolFencersCache',
        'poolMatchArenaOverrides',
        'session',
        'sessionMatchScores',
        'sessionMatches',
      ],
      [
        'applySmartMatchOrder',
        'arenaHomePoolId',
        'assignMatchToArena',
        'broadcastArenaUpdate',
        'guestQueue',
        'isGuestMatch',
        'isInActiveWave',
        'isMatchPlayable',
        'loadNextMatch',
        'persistArenaState',
        'resolveDeMatchReferee',
        'resolveReferee',
        'updateArena',
      ]
    ));
  }
  private _arenaQueueCtx?: ArenaQueueContext;

  /** Contexte de sessionSettings.ts (#1240) */
  private get sessionSettingsCtx(): SessionSettingsContext {
    return (this._sessionSettingsCtx ??= liveContext<SessionSettingsContext>(
      this,
      [
        'arenaCount',
        'arenaEventBuffer',
        'arenaMatchQueue',
        'arenaNextMatchIndex',
        'arenaScreenThemes',
        'arenaThemeOverrides',
        'arenas',
        'connectedClients',
        'db',
        'io',
        'isTrainingMode',
        'kioskThemeVariables',
        'session',
        'sessionBlackCardEnabled',
        'sessionCardAnnounce',
        'sessionKioskViews',
        'sessionModernRules',
        'sessionPoolMaxScore',
        'sessionPoolTimerSeconds',
        'sessionRestSeconds',
        'sessionShowPhotos',
        'sessionTableMaxScore',
        'sessionTableTimerSeconds',
        'sessionTheme',
      ],
      [
        'applyCompetitionSettings',
        'broadcastArenaUpdate',
        'createArena',
        'getAllArenas',
        'toPublicArena',
        'updateArenaTheme',
      ]
    ));
  }
  private _sessionSettingsCtx?: SessionSettingsContext;

  /** Contexte de blackCards.ts (#1240) */
  private get blackCardsCtx(): BlackCardsContext {
    return (this._blackCardsCtx ??= liveContext<BlackCardsContext>(
      this,
      [
        'arenaMatchQueue',
        'arenas',
        'db',
        'poolFencersCache',
        'sessionBlackCards',
        'sessionMatchScores',
        'sessionMatches',
      ],
      ['formatFencerName', 'getArenaBlackCards', 'matchPoolId']
    ));
  }
  private _blackCardsCtx?: BlackCardsContext;

  /** Contexte de dashboard.ts (#1240) */
  private get dashboardCtx(): DashboardContext {
    return (this._dashboardCtx ??= liveContext<DashboardContext>(
      this,
      [
        'arenas',
        'db',
        'isTrainingMode',
        'recentMatchDurationsMs',
        'session',
        'sessionMatchScores',
        'sessionMatches',
      ],
      ['computePhaseEta']
    ));
  }
  private _dashboardCtx?: DashboardContext;

  constructor(
    db: DatabaseManager,
    port: number = 8066,
    host: string = '0.0.0.0',
    tlsOptions?: { cert: string; key: string }
  ) {
    logger.info(NET, '[RemoteScoreServer] Initialisation du serveur de saisie distante...');
    this.db = db;
    // Écritures en base => « données modifiées » poussé aux kiosques (plus de polling, #1152)
    this.unsubscribeDb = db.onChange?.(() => this.notifyKioskData()) ?? null;
    this.port = port;
    this.host = host;
    this.useHttps = !!tlsOptions;
    const stack = createHttpStack(tlsOptions, () => this.sessionShowPhotos);
    this.app = stack.app;
    this.server = stack.server;
    this.io = stack.io;

    this.cleanupInterval = startCleanupTimer({
      loginGuard: this.loginGuard,
      scoreLimiter: this.scoreLimiter,
      trainerTokens: this.trainerTokens,
      checkinTokens: this.checkinTokens,
      arenaTokens: this.arenaTokens,
      scoreUpdateDebounce: this.scoreUpdateDebounce,
    });

    // Charger le client socket.io AVANT le HTML (injection inline dans loadHtmlFiles)
    this.loadSocketIoClient();
    // Charger les fichiers HTML en mémoire au démarrage
    this.loadHtmlFiles();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
    this.initializeArenas();
    logger.info(NET, `[RemoteScoreServer] Serveur initialisé avec ${this.arenaCount} arènes`);
  }

  // Client socket.io + pages HTML en mémoire (src/main/remote/htmlLoader.ts)
  private loadSocketIoClient(): void {
    this.socketIoClientJs = loadSocketIoClient();
  }

  private loadHtmlFiles(): void {
    const { htmlFiles, remoteBasePath } = loadRemoteHtmlFiles(this.socketIoClientJs);
    for (const [name, html] of htmlFiles) this.htmlFiles.set(name, html);
    this.remoteBasePath = remoteBasePath;
    this.buildPageStore();
  }

  // Extrait les scripts inline en assets versionnés et pré-compresse pages + JS/CSS communs (#1151)
  private buildPageStore(): void {
    this.pages.clear();
    this.assets.clear();
    this.staticFiles.clear();
    for (const [name, html] of this.htmlFiles) {
      this.pages.set(name, buildPage(html, this.assets));
    }
    if (this.remoteBasePath) {
      const types: Record<string, string> = {
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
      };
      for (const [file, body] of readRemoteSharedFiles(this.remoteBasePath)) {
        this.staticFiles.set('/' + file, storeBody(body, types[path.extname(file)], 'no-cache'));
      }
    }
  }

  // Servir un fichier HTML depuis la mémoire
  private sendHtmlFromMemory(filename: string, res: express.Response): void {
    const page = this.pages.get(filename);
    const html = this.htmlFiles.get(filename);
    if (page && !page.hasInlineScript) {
      // Plus aucun script inline : CSP fixe script-src 'self', réponse pré-compressée + ETag
      applyPageCsp(res);
      sendStored(res.req, res, page);
    } else if (html) {
      sendHtmlPage(res, html);
    } else {
      logger.error(NET, `[RemoteScoreServer] ERREUR: Fichier ${filename} non trouvé en mémoire`);
      res.status(500).send(`Erreur: fichier ${filename} non trouvé`);
    }
  }

  // ── Format arène Sabre Laser équipe : saisie temps réel (src/main/remote/teamArena.ts) ──

  /** Assigne une rencontre d'équipe à une arène pour saisie temps réel. */
  public setTeamArenaMatch(...args: Tail<Parameters<typeof setTeamArenaMatch>>): boolean {
    return setTeamArenaMatch(this.teamArenaCtx, ...args);
  }

  /** Retire l'assignation d'une arène (fin de saisie temps réel pour cette arène). */
  public clearTeamArenaMatch(...args: Tail<Parameters<typeof clearTeamArenaMatch>>): void {
    clearTeamArenaMatch(this.teamArenaCtx, ...args);
  }

  private teamArenaElapsedSec(state: TeamArenaState): number {
    return teamArenaElapsedSec(state);
  }

  private getPublicTeamArenaState(
    ...args: Tail<Parameters<typeof getPublicTeamArenaState>>
  ): unknown {
    return getPublicTeamArenaState(this.teamArenaCtx, ...args);
  }

  // Délégués vers src/main/remote/auth.ts (noms conservés pour les routes existantes)
  private parseCookies = parseCookies;
  private hashPassword = hashPassword;
  private verifyPassword = verifyPasswordAsync;
  private assertPasswordStrength = assertPasswordStrength;
  private issueToken = issueToken;
  private isTokenValid = isTokenValid;

  /** Version d'une arène sans secret, seule forme autorisée vers les clients HTTP/Socket.IO. */
  private toPublicArena(arena: Arena): Omit<Arena, 'password'> & { hasPassword: boolean } {
    const { password, ...rest } = arena;
    return { ...rest, hasPassword: !!password };
  }

  private checkArenaAuth(arenaId: string, cookieHeader: string | undefined): boolean {
    // Sous-piste des rapières : mot de passe et jeton de la piste (#1118)
    const fullId = slots.baseArenaId(arenaId.startsWith('arena') ? arenaId : `arena${arenaId}`);
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

  /** Origine acceptée : même hôte que la page ou réseau local (voir remote/serverSetup.ts). */
  private isAllowedOrigin = isAllowedOrigin;

  /** Requête émise depuis la machine hôte (loopback uniquement, sans X-Forwarded-For). */
  private isLoopbackRequest(req: express.Request): boolean {
    return RemoteScoreServer.isLoopbackAddress(req.socket?.remoteAddress);
  }

  /** Middleware : exige l'auth de l'arène `:arenaId`. */
  private requireArenaAuth: express.RequestHandler<{ arenaId: string }> = (req, res, next) => {
    if (!this.checkArenaAuth(req.params.arenaId, req.headers.cookie)) {
      res.status(401).json({ error: 'auth_required' });
      return;
    }
    next();
  };

  /** Middleware : réservé à la machine hôte. */
  private requireLoopback: express.RequestHandler = (req, res, next) => {
    if (!this.isLoopbackRequest(req)) {
      res.status(403).json({ error: 'host_only' });
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
    return setupMiddleware(this.middlewareCtx);
  }

  /**
   * État exposé aux modules de routes (src/main/remote/routes/), en accesseurs : un seul contexte
   * pour tous les modules (chacun n'utilise que la partie de son interface).
   */
  private routeContext(): ApiRouteContext {
    return (this._routeCtx ??= Object.assign(
      liveContext<ApiRouteContext>(
        this,
        [
          'app',
          'db',
          'session',
          'isTrainingMode',
          'arenas',
          'sessionPoolArenas',
          'sessionMatches',
          'sessionMatchScores',
          'trainingHistory',
          'demoPlayer',
          'registrationEnabled',
          'checkinEnabled',
          'checkinPassword',
          'checkinTokens',
          'trainerEnabled',
          'trainerPassword',
          'trainerTokens',
          'io',
          'arenaTokens',
          'poolFencersCache',
          'poolSignaturesCache',
          'arenaMatchQueue',
          'poolMatchArenaOverrides',
          'sessionBlackCardEnabled',
          'sessionBlackCards',
          'port',
          'currentLang',
          'socketIoClientJs',
          'sessionWeapon',
          'sessionCustomScoring',
          'sessionModernRules',
          'sessionKioskViews',
          'orgNote',
          'sessionLogo',
          'sessionWallpaper',
          'trainingCustomRules',
          'ttsConfig',
          'arenaCards',
          'arenaTouches',
          'arenaSuddenDeath',
          'arenaWaitingOvertime',
          'requireArenaAuth',
          'requireLoopback',
        ],
        [
          'sendHtmlFromMemory',
          'checkArenaAuth',
          'hasAnyValidToken',
          'computePhaseEta',
          'getClientIp',
          'checkRegistrationRateLimit',
          'checkLoginAllowed',
          'recordLoginFailure',
          'recordLoginSuccess',
          'checkCheckinAuth',
          'checkTrainerAuth',
          'checkinGuard',
          'trainerGuard',
          'findArenaOfReferee',
          'arenaMatchLabel',
          'checkScoreRateLimit',
          'resolveReferee',
          'broadcastDashboardUpdate',
          'applySmartMatchOrder',
          'arenaHomePoolId',
          'broadcastMessage',
          'cancelBlackCard',
          'finishArenaMatch',
          'formatFencerName',
          'getArenaBlackCards',
          'guestQueue',
          'isInActiveWave',
          'claimArenaSlot',
          'isMatchPlayable',
          'isPendingMatch',
          'resolvePoolReferee',
          'restorableStatus',
          'sendDiag',
          'updateMatchScore',
          'assignMatchToArena',
          'createSession',
          'getAllArenas',
          'getArena',
          'getLocalIPAddress',
          'getServerUrl',
          'pauseArenaMatch',
          'startArenaMatch',
          'stopSession',
          'toPublicArena',
          'updateArenaScore',
        ]
      ),
      {
        sendLoginLimited,
        verifyPassword: verifyPasswordAsync,
        issueToken,
        isArenaMatchOpened: (a: string) => this.arenaRefereeSelected.get(a) === true,
      }
    ));
  }
  private _routeCtx?: ApiRouteContext;

  private setupRoutes(): void {
    logger.info(NET, '[RemoteScoreServer] Configuration des routes...');
    registerApiRoutes(this.routeContext());
    registerPageRoutes(this.routeContext());
    registerRegistrationRoutes(this.routeContext());
    registerPoolRoutes(this.routeContext());
    registerMatchRoutes(this.routeContext());
    registerResultsRoutes(this.routeContext());
  }

  private setupSocketHandlers(): void {
    return setupSocketHandlers(this.socketCtx);
  }

  static sanitizeAnnouncement = sanitizeAnnouncement;

  private handleDisconnect(socket: any): void {
    logger.info(NET, `Client ${socket.id} disconnected`);
  }

  private broadcastClientList(): void {
    sendClientListToWindow(this, this.getConnectedClients());
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
  // Horodatage réel de chaque touche / carton / sortie, aligné sur les listes ci-dessus (replay #1074)
  private arenaEventTimes: Map<string, Record<ArenaEventList, string[]>> = new Map();
  private arenaSuddenDeath: Map<string, boolean> = new Map();
  private arenaOvertimeType: Map<string, string | null> = new Map();
  private arenaWaitingOvertime: Map<string, boolean> = new Map();
  // Vrai quand l'arbitre a explicitement sélectionné le match depuis sa tablette
  private arenaRefereeSelected: Map<string, boolean> = new Map();
  // Debounce par socket pour update_score : clé = socketId:arenaId, valeur = timestamp dernier envoi
  private scoreUpdateDebounce: Map<string, number> = new Map();
  private readonly SCORE_UPDATE_DEBOUNCE_MS = 200;

  /** Aligne les horodatages d'une liste : préfixe conservé, nouveaux éléments datés maintenant. */
  private stampArenaEvents(arenaId: string, list: ArenaEventList, length: number): void {
    let times = this.arenaEventTimes.get(arenaId);
    if (!times) {
      times = { touchesA: [], touchesB: [], cardsA: [], cardsB: [], exits: [] };
      this.arenaEventTimes.set(arenaId, times);
    }
    const stamps = times[list].slice(0, length);
    const now = new Date().toISOString();
    while (stamps.length < length) stamps.push(now);
    times[list] = stamps;
  }

  /** Purge l'état de combat par arène (cartons, touches, mort subite…) — fin de session ou réinit des arènes. */
  private clearArenaCombatState(): void {
    this.arenaCards.clear();
    this.arenaTouches.clear();
    this.arenaExits.clear();
    this.arenaEventTimes.clear();
    this.arenaSuddenDeath.clear();
    this.arenaOvertimeType.clear();
    this.arenaWaitingOvertime.clear();
    this.arenaRefereeSelected.clear();
    this.scoreUpdateDebounce.clear();
    this.arenaPhotoSentForMatch.clear();
  }

  private handleArenaControl(...args: Tail<Parameters<typeof handleArenaControl>>): void {
    return handleArenaControl(this.arenaControlCtx, ...args);
  }

  private async createSession(competitionId: string, strips: number): Promise<RemoteSession> {
    return createSession(this.sessionOpsCtx, competitionId, strips);
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
    return getArenaBlackCards(this.blackCardsCtx, arenaId);
  }

  /** Annule un carton noir : réintègre le combattant et rouvre le match interrompu */
  private cancelBlackCard(
    arenaId: string,
    fencerId: string
  ): { success: true; matchId: string } | { success: false; status: number; error: string } {
    return cancelBlackCard(this.blackCardsCtx, arenaId, fencerId);
  }

  /** Match de la vague active (ou aucun filtre de vague) (#1118) */
  private isInActiveWave(m: { id: string }): boolean {
    if (this.poolsClosed) return false;
    return this.activeWaveMatchIds === null || this.activeWaveMatchIds.has(m.id);
  }

  /**
   * Définit les matchs de la vague active (`null` : tous les matchs, hors mode rapières).
   * `poolsClosed` : vagues terminées, les matchs de poule restants ne sont plus joués (#1118).
   */
  public setActiveWaveMatchIds(ids: string[] | null, poolsClosed = false): void {
    if (poolsClosed && !this.poolsClosed) this.dropPendingPoolMatches();
    this.poolsClosed = poolsClosed;
    const prev = this.activeWaveMatchIds;
    this.activeWaveMatchIds = ids === null ? null : new Set(ids);
    const same = prev && ids && prev.size === ids.length && ids.every(id => prev.has(id));
    if (!same) this.arenaSlots.release(this.arenas);
    // Fin des vagues : sous-pistes sans match en cours supprimées
    if (ids === null) {
      for (const [id, a] of this.arenas) {
        if (slots.isSlotArenaId(id) && a.status !== 'in_progress') this.arenas.delete(id);
      }
    }
  }

  /** Fin des vagues : match de poule non commencé retiré des pistes, place au tableau (#1118) */
  private dropPendingPoolMatches(): void {
    for (const [arenaId, arena] of this.arenas) {
      const cur = arena.currentMatch;
      if (!cur?.poolId || cur.isTableau || arena.status === 'in_progress') continue;
      this.arenaRefereeSelected.set(arenaId, false);
      const queue = (this.arenaMatchQueue.get(arenaId) || []).filter(m => !m.poolId || m.isTableau);
      const next = queue[0];
      this.arenaMatchQueue.set(arenaId, queue.slice(next ? 1 : 0));
      if (next) {
        this.assignMatchToArena(arenaId, next);
      } else {
        arena.currentMatch = null;
        arena.status = 'idle';
        arena.startTime = null;
        this.updateArena(arenaId, { status: 'idle', currentMatch: null, startTime: null });
        this.persistArenaState(arenaId);
      }
    }
  }

  /** Sous-piste attribuée à une tablette arbitre pendant les vagues, sinon la piste (#1118) */
  public claimArenaSlot(arenaId: string, deviceKey: string, current?: string): string {
    const base = slots.baseArenaId(arenaId.startsWith('arena') ? arenaId : `arena${arenaId}`);
    if (this.activeWaveMatchIds === null || !deviceKey) return base;
    const create = (parent: Arena, slot: number) => {
      const arena = slots.createSlotArena(parent, slot);
      this.arenas.set(arena.id, arena);
      this.arenaMatchQueue.set(arena.id, []);
      return arena;
    };
    return this.arenaSlots.claim(this.arenas, base, deviceKey, create, current) ?? base;
  }

  private isMatchPlayable(m: Match | ArenaMatch): boolean {
    return isMatchPlayable(m);
  }

  private applySmartMatchOrder(matches: Match[]): Match[] {
    return applySmartMatchOrder(matches);
  }

  private async updateMatchScore(matchId: string, update: RemoteScoreUpdate): Promise<void> {
    return updateMatchScore(this.sessionOpsCtx, matchId, update);
  }

  private broadcastMessage(message: WebSocketMessage): void {
    // Envoyer à la fenêtre principale
    getSharedMainWindow()?.webContents.send('remote:websocket_message', message);
  }

  private createArena(i: number): void {
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
    logger.info(NET, `[RemoteScoreServer] Arène ${i} créée ✓`);
  }

  private initializeArenas(arenaCount: number = 4): void {
    this.arenaCount = arenaCount;
    logger.info(NET, `[RemoteScoreServer] Initialisation de ${arenaCount} arènes...`);
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

    for (let i = 1; i <= arenaCount; i++) this.createArena(i);
    // Restaurer les mots de passe sauvegardés
    savedPasswords.forEach((pwd, id) => {
      const arena = this.arenas.get(id);
      if (arena) arena.password = pwd;
    });
    logger.info(NET, `[RemoteScoreServer] ${arenaCount} arènes initialisées avec succès ✓`);
  }

  public resetPoolMatch(...args: Tail<Parameters<typeof resetPoolMatch>>): void {
    return resetPoolMatch(this.poolSyncCtx, ...args);
  }

  public finishPoolMatch(...args: Tail<Parameters<typeof finishPoolMatch>>): void {
    return finishPoolMatch(this.poolSyncCtx, ...args);
  }

  public setLanguage(lang: string): void {
    this.currentLang = lang;
  }

  public setArenaCount(count: number): void {
    logger.info(NET, `[RemoteScoreServer] Mise à jour du nombre d'arènes: ${count}`);
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
    // Vagues des rapières : la piste et ses sous-pistes gardent la poule de la piste (#1118)
    if (!cur?.poolId && this.activeWaveMatchIds !== null) return this.wavePoolId(arena);
    if (!cur?.poolId) return undefined;
    if (arena.activePoolId && this.poolMatchArenaOverrides.has(cur.id)) return arena.activePoolId;
    return cur.poolId;
  }

  private wavePoolId(arena: Arena): string | undefined {
    const base = this.arenas.get(slots.baseArenaId(arena.id));
    if (base?.currentMatch?.poolId && base !== arena) return this.arenaHomePoolId(base);
    for (const [poolId, n] of this.sessionPoolArenas) if (n === arena.number) return poolId;
    return arena.activePoolId ?? base?.activePoolId;
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

  public assignMatchToArena(...args: Tail<Parameters<typeof assignMatchToArena>>): void {
    return assignMatchToArena(this.arenaOpsCtx, ...args);
  }

  public startArenaMatch(...args: Tail<Parameters<typeof startArenaMatch>>): void {
    return startArenaMatch(this.arenaOpsCtx, ...args);
  }

  public pauseArenaMatch(...args: Tail<Parameters<typeof pauseArenaMatch>>): void {
    return pauseArenaMatch(this.arenaOpsCtx, ...args);
  }

  public updateArenaScore(...args: Tail<Parameters<typeof updateArenaScore>>): void {
    return updateArenaScore(this.arenaOpsCtx, ...args);
  }

  private getScoreLimit(...args: Tail<Parameters<typeof getScoreLimit>>): number {
    return getScoreLimit(this.arenaOpsCtx, ...args);
  }

  public updateMatchArena(...args: Tail<Parameters<typeof updateMatchArena>>): void {
    return updateMatchArena(this.arenaQueueCtx, ...args);
  }

  // DIAGNOSTIC : envoie un message visible dans la console DevTools du renderer
  // (les console.log serveur ne sont pas visibles dans l'app packagée).
  private sendDiag(msg: string): void {
    try {
      const w = getSharedMainWindow();
      if (w) w.webContents.send('remote:diag', msg);
    } catch {
      /* non bloquant */
    }
  }

  public finishArenaMatch(arenaId: string): void {
    return finishArenaMatch(this.matchFinishCtx, arenaId);
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

  private get refereeResolverCtx(): RefereeResolverContext {
    return {
      getSession: () => this.session,
      getSessionReferees: () => this.getSessionReferees(),
      getSessionState: id => this.db.getSessionState(id),
    };
  }

  private resolveReferee(refereeId?: string | null): ReturnType<typeof resolveReferee> {
    return resolveReferee(this.refereeResolverCtx, refereeId);
  }

  private resolvePoolReferee(poolId?: string | null): ReturnType<typeof resolveReferee> {
    return resolvePoolReferee(this.refereeResolverCtx, poolId);
  }

  private resolveTableauMatchReferees(matchId?: string | null): ReturnType<typeof resolveReferee> {
    return resolveTableauMatchReferees(this.refereeResolverCtx, matchId);
  }

  private resolveDeMatchReferee(m: StateEntry | null): ReturnType<typeof resolveReferee> {
    return resolveDeMatchReferee(this.refereeResolverCtx, m);
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
    return peekNextMatch(this.arenaQueueCtx, arenaId);
  }

  private loadNextMatch(arenaId: string): void {
    return loadNextMatch(this.arenaQueueCtx, arenaId);
  }

  private buildDashboardSnapshot(
    ...args: Tail<Parameters<typeof buildDashboardSnapshot>>
  ): ReturnType<typeof buildDashboardSnapshot> {
    return buildDashboardSnapshot(this.dashboardCtx, ...args);
  }

  /**
   * Fin estimée de la phase en cours, d'après les durées réelles des matchs (#1077).
   * Tableau : seul le tour en cours compte (les tours suivants ne sont pas encore
   * connus, sinon l'estimation reculerait à chaque match terminé). Poules : chaque
   * poule s'enchaîne sur une piste ; parallélisme = nombre de pistes de la session.
   */
  private computePhaseEta(): PhaseEtaSummary {
    return computePhaseEta(this.dashboardCtx);
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

  private broadcastArenaUpdate(...args: Tail<Parameters<typeof broadcastArenaUpdate>>): void {
    return broadcastArenaUpdate(this.arenaBroadcastCtx, ...args);
  }

  private persistArenaState(...args: Tail<Parameters<typeof persistArenaState>>): void {
    return persistArenaState(this.arenaBroadcastCtx, ...args);
  }

  public setCheckinEnabled(enabled: boolean): void {
    return setCheckinEnabled(this.accessGuardsCtx, enabled);
  }

  public setCheckinPassword(password: string): void {
    return setCheckinPassword(this.accessGuardsCtx, password);
  }

  private checkCheckinAuth(cookieHeader: string | undefined): boolean {
    return checkCheckinAuth(this.accessGuardsCtx, cookieHeader);
  }

  /** Refus d'accès à l'API d'appel, ou null si autorisé. */
  private checkinGuard(cookieHeader: string | undefined): GuardRefusal {
    return checkinGuard(this.accessGuardsCtx, cookieHeader);
  }

  public setTrainerEnabled(enabled: boolean): void {
    return setTrainerEnabled(this.accessGuardsCtx, enabled);
  }

  public setTrainerPassword(password: string): void {
    return setTrainerPassword(this.accessGuardsCtx, password);
  }

  private checkTrainerAuth(cookieHeader: string | undefined): boolean {
    return checkTrainerAuth(this.accessGuardsCtx, cookieHeader);
  }

  /** Refus d'accès à l'espace formateurs, ou null si autorisé. */
  private trainerGuard(cookieHeader: string | undefined): GuardRefusal {
    return trainerGuard(this.accessGuardsCtx, cookieHeader);
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
    logger.info(NET, `Inscription distante ${enabled ? 'activée' : 'désactivée'}`);
  }

  private checkRegistrationRateLimit(ip: string): boolean {
    return this.registrationLimiter.hit(ip);
  }

  private checkScoreRateLimit(ip: string): boolean {
    return this.scoreLimiter.hit(ip);
  }

  public getLocalIPAddress(): string {
    return localIPv4Address();
  }

  public getServerUrl(): string {
    const ip = this.host !== '0.0.0.0' ? this.host : this.getLocalIPAddress();
    const protocol = this.useHttps ? 'https' : 'http';
    return `${protocol}://${ip}:${this.port}`;
  }

  public start(): Promise<void> {
    return startServer(this.lifecycleCtx);
  }

  /** Signale aux kiosques que les données ont changé (regroupé sur 300 ms) */
  public notifyKioskData(): void {
    return notifyKioskData(this.lifecycleCtx);
  }

  public stop(): void {
    return stopServer(this.lifecycleCtx);
  }

  public async startSession(
    ...args: Tail<Parameters<typeof startSession>>
  ): Promise<RemoteSession> {
    return startSession(this.sessionStartCtx, ...args);
  }

  public launchCompetition(): void {
    return launchCompetition(this.lifecycleCtx);
  }

  public stopSession(): void {
    return stopSession(this.lifecycleCtx);
  }

  public async startTrainingSession(
    ...args: Tail<Parameters<typeof startTrainingSession>>
  ): Promise<RemoteSession> {
    return startTrainingSession(this.trainingSessionCtx, ...args);
  }

  /** En démo, null tant qu'aucun duel n'est jouable */
  private createTrainingMatch(): ArenaMatch | null {
    return this.demoPlayer ? this.demoPlayer.createMatch() : createTrainingMatch();
  }

  public getTrainingHistory() {
    return [...this.trainingHistory];
  }

  public stopTrainingSession(): void {
    this.stopSession();
  }

  public updateStripCount(newCount: number): RemoteSession | null {
    return updateStripCount(this.sessionSettingsCtx, newCount);
  }

  public updateShowPhotos(value: boolean): void {
    return updateShowPhotos(this.sessionSettingsCtx, value);
  }

  /** Chronos, score max et repos issus des réglages effectifs de la compétition (#1134) */
  private applyCompetitionSettings(competition: Competition): void {
    return applyCompetitionSettings(this.sessionSettingsCtx, competition);
  }

  /** Relit les réglages de la compétition à chaud (propriétés modifiées en cours de session) */
  public refreshCompetitionSettings(): void {
    return refreshCompetitionSettings(this.sessionSettingsCtx);
  }

  /** Active/désactive le carton noir à chaud (propriétés compétition modifiées en cours de session) */
  public updateBlackCardEnabled(value: boolean): void {
    return updateBlackCardEnabled(this.sessionSettingsCtx, value);
  }

  public updateCardAnnounce(value: boolean): void {
    return updateCardAnnounce(this.sessionSettingsCtx, value);
  }

  public updateTheme(theme: DisplayTheme): void {
    return updateTheme(this.sessionSettingsCtx, theme);
  }

  public updateArenaTheme(arenaId: string, theme: DisplayTheme, customTheme?: CustomTheme): void {
    return updateArenaTheme(this.sessionSettingsCtx, arenaId, theme, customTheme);
  }

  public clearArenaThemeOverride(arenaId: string): void {
    return clearArenaThemeOverride(this.sessionSettingsCtx, arenaId);
  }

  public updateArenaScreenTheme(
    arenaId: string,
    targetType: ThemeTargetType,
    customTheme?: CustomTheme
  ): void {
    return updateArenaScreenTheme(this.sessionSettingsCtx, arenaId, targetType, customTheme);
  }

  public updateKioskViews(views: {
    poules: boolean;
    classement: boolean;
    direct: boolean;
    suivants: boolean;
    tableau?: boolean;
  }): void {
    return updateKioskViews(this.sessionSettingsCtx, views);
  }

  public updateKioskTheme(variables: Record<string, string>): void {
    return updateKioskTheme(this.sessionSettingsCtx, variables);
  }

  public updatePoolFencers(updates: Array<{ poolId: string; fencers: any[] }>): void {
    return updatePoolFencers(this.poolSyncCtx, updates);
  }

  public syncPoolMatches(poolsData: Array<{ poolId: string; matches: any[] }>): void {
    return syncPoolMatches(this.poolSyncCtx, poolsData);
  }

  /**
   * Réassigne les poules aux pistes pendant une session active (#1037) :
   * poules générées après le démarrage de la saisie distante, ou piste modifiée
   * en préparation. Un match en cours n'est jamais retiré ; une poule envoyée sur
   * une piste déjà occupée par une autre poule est mise en file (pas de remplacement).
   */
  public assignPools(...args: Tail<Parameters<typeof assignPools>>): void {
    return assignPools(this.arenaQueueCtx, ...args);
  }

  public refreshDeMatches(...args: Tail<Parameters<typeof refreshDeMatches>>): void {
    return refreshDeMatches(this.arenaQueueCtx, ...args);
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
    this.webhookUrl = url && isWebhookUrlSafe(url) ? url : null;
  }

  private fireWebhook(payload: Record<string, unknown>): void {
    if (!this.webhookUrl) return;
    // Silencieux : ne jamais bloquer le flux de match (#1269)
    void postWebhook(this.webhookUrl, payload);
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
    logger.info(NET, `Mot de passe ${password ? 'défini' : 'supprimé'} pour ${fullId}`);
  }

  public assignRefereeToMatch(matchId: string, refereeId: string): void {
    if (!this.session) return;

    // Mettre à jour sessionMatches
    const idx = this.sessionMatches.findIndex(m => m.id === matchId);
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
