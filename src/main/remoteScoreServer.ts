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
import type { BlackCardRecord, TeamArenaState } from './remote/types';
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
import { createPublicParser } from './remote/publicDto';
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
import { buildPoolScores } from './remote/poolScore';
import { readRemoteSharedFiles } from './remote/i18nBundle';

export { PASSWORD_MIN_LENGTH };
import { setupSocketHandlers, type SocketHandlersContext } from './remote/socketHandlers';
import { handleArenaControl, type ArenaControlContext } from './remote/arenaControl';
import { setupMiddleware, type MiddlewareContext } from './remote/middleware';
import { startSession, type SessionStartContext } from './remote/sessionStart';
import { liveContext } from './remote/liveContext';
import { syncPoolMatches, updatePoolFencers, type PoolSyncContext } from './remote/poolSync';
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
import { DemoPlayer } from './remote/demoMode';
import { finishArenaMatch, type MatchFinishContext } from './remote/matchFinish';
import {
  peekNextMatch,
  loadNextMatch,
  updateMatchArena,
  assignPools,
  refreshDeMatches,
  type ArenaQueueContext,
} from './remote/arenaQueue';
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
  private sessionMatches: any[] = []; // Matches passés depuis le renderer
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
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return (this._socketCtx ??= {
      get MAX_SOCKETS_PER_IP(): S['MAX_SOCKETS_PER_IP'] {
        return self.MAX_SOCKETS_PER_IP;
      },
      get SOCKET_EVENTS_PER_SEC(): S['SOCKET_EVENTS_PER_SEC'] {
        return self.SOCKET_EVENTS_PER_SEC;
      },
      get SOCKET_EVENT_BURST(): S['SOCKET_EVENT_BURST'] {
        return self.SOCKET_EVENT_BURST;
      },
      get arenaEventBuffer(): S['arenaEventBuffer'] {
        return self.arenaEventBuffer;
      },
      get arenaRefereeSelected(): S['arenaRefereeSelected'] {
        return self.arenaRefereeSelected;
      },
      get arenaScreenThemes(): S['arenaScreenThemes'] {
        return self.arenaScreenThemes;
      },
      get arenaThemeOverrides(): S['arenaThemeOverrides'] {
        return self.arenaThemeOverrides;
      },
      broadcastClientList: (...a: Parameters<S['broadcastClientList']>) =>
        self.broadcastClientList(...a),
      buildDashboardSnapshot: (...a: Parameters<S['buildDashboardSnapshot']>) =>
        self.buildDashboardSnapshot(...a),
      checkArenaAuth: (...a: Parameters<S['checkArenaAuth']>) => self.checkArenaAuth(...a),
      checkSocketArenaAuth: (...a: Parameters<S['checkSocketArenaAuth']>) =>
        self.checkSocketArenaAuth(...a),
      get connectedClients(): S['connectedClients'] {
        return self.connectedClients;
      },
      get db(): S['db'] {
        return self.db;
      },
      getArena: (...a: Parameters<S['getArena']>) => self.getArena(...a),
      getPublicTeamArenaState: (...a: Parameters<S['getPublicTeamArenaState']>) =>
        self.getPublicTeamArenaState(...a),
      getSessionReferees: (...a: Parameters<S['getSessionReferees']>) =>
        self.getSessionReferees(...a),
      handleArenaControl: (...a: Parameters<S['handleArenaControl']>) =>
        self.handleArenaControl(...a),
      handleDisconnect: (...a: Parameters<S['handleDisconnect']>) => self.handleDisconnect(...a),
      get io(): S['io'] {
        return self.io;
      },
      get isTrainingMode(): S['isTrainingMode'] {
        return self.isTrainingMode;
      },
      get kioskThemeVariables(): S['kioskThemeVariables'] {
        return self.kioskThemeVariables;
      },
      peekNextMatch: (...a: Parameters<S['peekNextMatch']>) => self.peekNextMatch(...a),
      get screenLabels(): S['screenLabels'] {
        return self.screenLabels;
      },
      sendDiag: (...a: Parameters<S['sendDiag']>) => self.sendDiag(...a),
      get session(): S['session'] {
        return self.session;
      },
      get sessionBlackCardEnabled(): S['sessionBlackCardEnabled'] {
        return self.sessionBlackCardEnabled;
      },
      get sessionCardAnnounce(): S['sessionCardAnnounce'] {
        return self.sessionCardAnnounce;
      },
      get sessionPoolTimerSeconds(): S['sessionPoolTimerSeconds'] {
        return self.sessionPoolTimerSeconds;
      },
      get sessionRefereeFeatureEnabled(): S['sessionRefereeFeatureEnabled'] {
        return self.sessionRefereeFeatureEnabled;
      },
      get sessionRestSeconds(): S['sessionRestSeconds'] {
        return self.sessionRestSeconds;
      },
      get sessionShowPhotos(): S['sessionShowPhotos'] {
        return self.sessionShowPhotos;
      },
      get sessionTableTimerSeconds(): S['sessionTableTimerSeconds'] {
        return self.sessionTableTimerSeconds;
      },
      get sessionTheme(): S['sessionTheme'] {
        return self.sessionTheme;
      },
      get socketsPerIp(): S['socketsPerIp'] {
        return self.socketsPerIp;
      },
      teamArenaElapsedSec: (...a: Parameters<S['teamArenaElapsedSec']>) =>
        self.teamArenaElapsedSec(...a),
      get teamArenaState(): S['teamArenaState'] {
        return self.teamArenaState;
      },
      get trainingCustomRules(): S['trainingCustomRules'] {
        return self.trainingCustomRules;
      },
    });
  }
  private _socketCtx?: SocketHandlersContext;

  /** Contexte de arenaControl.ts (#1240) */
  private get arenaControlCtx(): ArenaControlContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return (this._arenaControlCtx ??= {
      get SCORE_UPDATE_DEBOUNCE_MS(): S['SCORE_UPDATE_DEBOUNCE_MS'] {
        return self.SCORE_UPDATE_DEBOUNCE_MS;
      },
      get arenaCards(): S['arenaCards'] {
        return self.arenaCards;
      },
      get arenaEventTimes(): S['arenaEventTimes'] {
        return self.arenaEventTimes;
      },
      get arenaExits(): S['arenaExits'] {
        return self.arenaExits;
      },
      get arenaOvertimeType(): S['arenaOvertimeType'] {
        return self.arenaOvertimeType;
      },
      get arenaRefereeSelected(): S['arenaRefereeSelected'] {
        return self.arenaRefereeSelected;
      },
      get arenaSuddenDeath(): S['arenaSuddenDeath'] {
        return self.arenaSuddenDeath;
      },
      get arenaTouches(): S['arenaTouches'] {
        return self.arenaTouches;
      },
      get arenaWaitingOvertime(): S['arenaWaitingOvertime'] {
        return self.arenaWaitingOvertime;
      },
      assignMatchToArena: (...a: Parameters<S['assignMatchToArena']>) =>
        self.assignMatchToArena(...a),
      broadcastArenaUpdate: (...a: Parameters<S['broadcastArenaUpdate']>) =>
        self.broadcastArenaUpdate(...a),
      get db(): S['db'] {
        return self.db;
      },
      finishArenaMatch: (...a: Parameters<S['finishArenaMatch']>) => self.finishArenaMatch(...a),
      getArena: (...a: Parameters<S['getArena']>) => self.getArena(...a),
      get io(): S['io'] {
        return self.io;
      },
      get isTrainingMode(): S['isTrainingMode'] {
        return self.isTrainingMode;
      },
      loadNextMatch: (...a: Parameters<S['loadNextMatch']>) => self.loadNextMatch(...a),
      pauseArenaMatch: (...a: Parameters<S['pauseArenaMatch']>) => self.pauseArenaMatch(...a),
      resolveReferee: (...a: Parameters<S['resolveReferee']>) => self.resolveReferee(...a),
      get scoreUpdateDebounce(): S['scoreUpdateDebounce'] {
        return self.scoreUpdateDebounce;
      },
      sendDiag: (...a: Parameters<S['sendDiag']>) => self.sendDiag(...a),
      get session(): S['session'] {
        return self.session;
      },
      get sessionCardAnnounce(): S['sessionCardAnnounce'] {
        return self.sessionCardAnnounce;
      },
      get sessionMatches(): S['sessionMatches'] {
        return self.sessionMatches;
      },
      stampArenaEvents: (...a: Parameters<S['stampArenaEvents']>) => self.stampArenaEvents(...a),
      startArenaMatch: (...a: Parameters<S['startArenaMatch']>) => self.startArenaMatch(...a),
      get trainingCustomRules(): S['trainingCustomRules'] {
        return self.trainingCustomRules;
      },
      updateArenaScore: (...a: Parameters<S['updateArenaScore']>) => self.updateArenaScore(...a),
    });
  }
  private _arenaControlCtx?: ArenaControlContext;

  /** Contexte de middleware.ts (#1240) */
  private get middlewareCtx(): MiddlewareContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return (this._middlewareCtx ??= {
      get app(): S['app'] {
        return self.app;
      },
      get assets(): S['assets'] {
        return self.assets;
      },
      get htmlFiles(): S['htmlFiles'] {
        return self.htmlFiles;
      },
      isAllowedOrigin: (...a: Parameters<S['isAllowedOrigin']>) => self.isAllowedOrigin(...a),
      sendHtmlFromMemory: (...a: Parameters<S['sendHtmlFromMemory']>) =>
        self.sendHtmlFromMemory(...a),
      get staticFiles(): S['staticFiles'] {
        return self.staticFiles;
      },
    });
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
      ],
      ['assignMatchToArena', 'createTrainingMatch', 'notifyKioskData', 'setArenaCount']
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
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return (this._sessionStartCtx ??= {
      applyCompetitionSettings: (...a: Parameters<S['applyCompetitionSettings']>) =>
        self.applyCompetitionSettings(...a),
      get arenaMatchQueue(): S['arenaMatchQueue'] {
        return self.arenaMatchQueue;
      },
      get arenaNextMatchIndex(): S['arenaNextMatchIndex'] {
        return self.arenaNextMatchIndex;
      },
      get arenas(): S['arenas'] {
        return self.arenas;
      },
      assignMatchToArena: (...a: Parameters<S['assignMatchToArena']>) =>
        self.assignMatchToArena(...a),
      get db(): S['db'] {
        return self.db;
      },
      loadSessionReferees: (...a: Parameters<S['loadSessionReferees']>) =>
        self.loadSessionReferees(...a),
      notifyKioskData: (...a: Parameters<S['notifyKioskData']>) => self.notifyKioskData(...a),
      get poolFencersCache(): S['poolFencersCache'] {
        return self.poolFencersCache;
      },
      get poolSignaturesCache(): S['poolSignaturesCache'] {
        return self.poolSignaturesCache;
      },
      get session(): S['session'] {
        return self.session;
      },
      set session(v: S['session']) {
        self.session = v;
      },
      get sessionBlackCardEnabled(): S['sessionBlackCardEnabled'] {
        return self.sessionBlackCardEnabled;
      },
      set sessionBlackCardEnabled(v: S['sessionBlackCardEnabled']) {
        self.sessionBlackCardEnabled = v;
      },
      get sessionCardAnnounce(): S['sessionCardAnnounce'] {
        return self.sessionCardAnnounce;
      },
      set sessionCardAnnounce(v: S['sessionCardAnnounce']) {
        self.sessionCardAnnounce = v;
      },
      get sessionCustomScoring(): S['sessionCustomScoring'] {
        return self.sessionCustomScoring;
      },
      set sessionCustomScoring(v: S['sessionCustomScoring']) {
        self.sessionCustomScoring = v;
      },
      get sessionKioskViews(): S['sessionKioskViews'] {
        return self.sessionKioskViews;
      },
      set sessionKioskViews(v: S['sessionKioskViews']) {
        self.sessionKioskViews = v;
      },
      get sessionMatchScores(): S['sessionMatchScores'] {
        return self.sessionMatchScores;
      },
      get sessionMatches(): S['sessionMatches'] {
        return self.sessionMatches;
      },
      set sessionMatches(v: S['sessionMatches']) {
        self.sessionMatches = v;
      },
      get sessionPoolArenas(): S['sessionPoolArenas'] {
        return self.sessionPoolArenas;
      },
      set sessionPoolArenas(v: S['sessionPoolArenas']) {
        self.sessionPoolArenas = v;
      },
      get sessionRefereeFeatureEnabled(): S['sessionRefereeFeatureEnabled'] {
        return self.sessionRefereeFeatureEnabled;
      },
      set sessionRefereeFeatureEnabled(v: S['sessionRefereeFeatureEnabled']) {
        self.sessionRefereeFeatureEnabled = v;
      },
      get sessionShowPhotos(): S['sessionShowPhotos'] {
        return self.sessionShowPhotos;
      },
      set sessionShowPhotos(v: S['sessionShowPhotos']) {
        self.sessionShowPhotos = v;
      },
      get sessionWeapon(): S['sessionWeapon'] {
        return self.sessionWeapon;
      },
      set sessionWeapon(v: S['sessionWeapon']) {
        self.sessionWeapon = v;
      },
      setArenaCount: (...a: Parameters<S['setArenaCount']>) => self.setArenaCount(...a),
    });
  }
  private _sessionStartCtx?: SessionStartContext;

  /** Contexte de matchFinish.ts (#1240) */
  private get matchFinishCtx(): MatchFinishContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return (this._matchFinishCtx ??= {
      get arenaCards(): S['arenaCards'] {
        return self.arenaCards;
      },
      get arenaEventTimes(): S['arenaEventTimes'] {
        return self.arenaEventTimes;
      },
      get arenaExits(): S['arenaExits'] {
        return self.arenaExits;
      },
      get arenaMatchQueue(): S['arenaMatchQueue'] {
        return self.arenaMatchQueue;
      },
      get arenaRefereeSelected(): S['arenaRefereeSelected'] {
        return self.arenaRefereeSelected;
      },
      get arenaTouches(): S['arenaTouches'] {
        return self.arenaTouches;
      },
      get arenas(): S['arenas'] {
        return self.arenas;
      },
      broadcastArenaUpdate: (...a: Parameters<S['broadcastArenaUpdate']>) =>
        self.broadcastArenaUpdate(...a),
      broadcastDashboardUpdate: (...a: Parameters<S['broadcastDashboardUpdate']>) =>
        self.broadcastDashboardUpdate(...a),
      createTrainingMatch: (...a: Parameters<S['createTrainingMatch']>) =>
        self.createTrainingMatch(...a),
      get db(): S['db'] {
        return self.db;
      },
      fireWebhook: (...a: Parameters<S['fireWebhook']>) => self.fireWebhook(...a),
      get isTrainingMode(): S['isTrainingMode'] {
        return self.isTrainingMode;
      },
      loadNextMatch: (...a: Parameters<S['loadNextMatch']>) => self.loadNextMatch(...a),
      peekNextMatch: (...a: Parameters<S['peekNextMatch']>) => self.peekNextMatch(...a),
      persistArenaState: (...a: Parameters<S['persistArenaState']>) => self.persistArenaState(...a),
      get recentMatchDurationsMs(): S['recentMatchDurationsMs'] {
        return self.recentMatchDurationsMs;
      },
      resolveDbMatchId: (...a: Parameters<S['resolveDbMatchId']>) => self.resolveDbMatchId(...a),
      sendDiag: (...a: Parameters<S['sendDiag']>) => self.sendDiag(...a),
      get session(): S['session'] {
        return self.session;
      },
      get sessionMatchScores(): S['sessionMatchScores'] {
        return self.sessionMatchScores;
      },
      get sessionModernRules(): S['sessionModernRules'] {
        return self.sessionModernRules;
      },
      get sessionWeapon(): S['sessionWeapon'] {
        return self.sessionWeapon;
      },
      get trainingHistory(): S['trainingHistory'] {
        return self.trainingHistory;
      },
    });
  }
  private _matchFinishCtx?: MatchFinishContext;

  /** Contexte de arenaQueue.ts (#1240) */
  private get arenaQueueCtx(): ArenaQueueContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    type S = RemoteScoreServer;
    return (this._arenaQueueCtx ??= {
      applySmartMatchOrder: (...a: Parameters<S['applySmartMatchOrder']>) =>
        self.applySmartMatchOrder(...a),
      get arenaCount(): S['arenaCount'] {
        return self.arenaCount;
      },
      arenaHomePoolId: (...a: Parameters<S['arenaHomePoolId']>) => self.arenaHomePoolId(...a),
      get arenaMatchQueue(): S['arenaMatchQueue'] {
        return self.arenaMatchQueue;
      },
      get arenaNextMatchIndex(): S['arenaNextMatchIndex'] {
        return self.arenaNextMatchIndex;
      },
      get arenaRefereeSelected(): S['arenaRefereeSelected'] {
        return self.arenaRefereeSelected;
      },
      get arenas(): S['arenas'] {
        return self.arenas;
      },
      assignMatchToArena: (...a: Parameters<S['assignMatchToArena']>) =>
        self.assignMatchToArena(...a),
      broadcastArenaUpdate: (...a: Parameters<S['broadcastArenaUpdate']>) =>
        self.broadcastArenaUpdate(...a),
      get db(): S['db'] {
        return self.db;
      },
      guestQueue: (...a: Parameters<S['guestQueue']>) => self.guestQueue(...a),
      get io(): S['io'] {
        return self.io;
      },
      isGuestMatch: (...a: Parameters<S['isGuestMatch']>) => self.isGuestMatch(...a),
      isInActiveWave: (...a: Parameters<S['isInActiveWave']>) => self.isInActiveWave(...a),
      isMatchPlayable: (...a: Parameters<S['isMatchPlayable']>) => self.isMatchPlayable(...a),
      get isTrainingMode(): S['isTrainingMode'] {
        return self.isTrainingMode;
      },
      loadNextMatch: (...a: Parameters<S['loadNextMatch']>) => self.loadNextMatch(...a),
      persistArenaState: (...a: Parameters<S['persistArenaState']>) => self.persistArenaState(...a),
      get poolFencersCache(): S['poolFencersCache'] {
        return self.poolFencersCache;
      },
      get poolMatchArenaOverrides(): S['poolMatchArenaOverrides'] {
        return self.poolMatchArenaOverrides;
      },
      resolveDeMatchReferee: (...a: Parameters<S['resolveDeMatchReferee']>) =>
        self.resolveDeMatchReferee(...a),
      resolveReferee: (...a: Parameters<S['resolveReferee']>) => self.resolveReferee(...a),
      get session(): S['session'] {
        return self.session;
      },
      get sessionMatchScores(): S['sessionMatchScores'] {
        return self.sessionMatchScores;
      },
      get sessionMatches(): S['sessionMatches'] {
        return self.sessionMatches;
      },
      set sessionMatches(v: S['sessionMatches']) {
        self.sessionMatches = v;
      },
      updateArena: (...a: Parameters<S['updateArena']>) => self.updateArena(...a),
    });
  }
  private _arenaQueueCtx?: ArenaQueueContext;

  /** Contexte de sessionSettings.ts (#1240) */
  private get sessionSettingsCtx(): SessionSettingsContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    type S = RemoteScoreServer;
    return (this._sessionSettingsCtx ??= {
      applyCompetitionSettings: (...a: Parameters<S['applyCompetitionSettings']>) =>
        self.applyCompetitionSettings(...a),
      get arenaCount(): S['arenaCount'] {
        return self.arenaCount;
      },
      set arenaCount(v: S['arenaCount']) {
        self.arenaCount = v;
      },
      get arenaEventBuffer(): S['arenaEventBuffer'] {
        return self.arenaEventBuffer;
      },
      get arenaMatchQueue(): S['arenaMatchQueue'] {
        return self.arenaMatchQueue;
      },
      get arenaNextMatchIndex(): S['arenaNextMatchIndex'] {
        return self.arenaNextMatchIndex;
      },
      get arenaScreenThemes(): S['arenaScreenThemes'] {
        return self.arenaScreenThemes;
      },
      get arenaThemeOverrides(): S['arenaThemeOverrides'] {
        return self.arenaThemeOverrides;
      },
      get arenas(): S['arenas'] {
        return self.arenas;
      },
      broadcastArenaUpdate: (...a: Parameters<S['broadcastArenaUpdate']>) =>
        self.broadcastArenaUpdate(...a),
      get connectedClients(): S['connectedClients'] {
        return self.connectedClients;
      },
      createArena: (...a: Parameters<S['createArena']>) => self.createArena(...a),
      get db(): S['db'] {
        return self.db;
      },
      getAllArenas: (...a: Parameters<S['getAllArenas']>) => self.getAllArenas(...a),
      get io(): S['io'] {
        return self.io;
      },
      get isTrainingMode(): S['isTrainingMode'] {
        return self.isTrainingMode;
      },
      get kioskThemeVariables(): S['kioskThemeVariables'] {
        return self.kioskThemeVariables;
      },
      set kioskThemeVariables(v: S['kioskThemeVariables']) {
        self.kioskThemeVariables = v;
      },
      get session(): S['session'] {
        return self.session;
      },
      get sessionBlackCardEnabled(): S['sessionBlackCardEnabled'] {
        return self.sessionBlackCardEnabled;
      },
      set sessionBlackCardEnabled(v: S['sessionBlackCardEnabled']) {
        self.sessionBlackCardEnabled = v;
      },
      get sessionCardAnnounce(): S['sessionCardAnnounce'] {
        return self.sessionCardAnnounce;
      },
      set sessionCardAnnounce(v: S['sessionCardAnnounce']) {
        self.sessionCardAnnounce = v;
      },
      get sessionKioskViews(): S['sessionKioskViews'] {
        return self.sessionKioskViews;
      },
      set sessionKioskViews(v: S['sessionKioskViews']) {
        self.sessionKioskViews = v;
      },
      get sessionModernRules(): S['sessionModernRules'] {
        return self.sessionModernRules;
      },
      set sessionModernRules(v: S['sessionModernRules']) {
        self.sessionModernRules = v;
      },
      get sessionPoolMaxScore(): S['sessionPoolMaxScore'] {
        return self.sessionPoolMaxScore;
      },
      set sessionPoolMaxScore(v: S['sessionPoolMaxScore']) {
        self.sessionPoolMaxScore = v;
      },
      get sessionPoolTimerSeconds(): S['sessionPoolTimerSeconds'] {
        return self.sessionPoolTimerSeconds;
      },
      set sessionPoolTimerSeconds(v: S['sessionPoolTimerSeconds']) {
        self.sessionPoolTimerSeconds = v;
      },
      get sessionRestSeconds(): S['sessionRestSeconds'] {
        return self.sessionRestSeconds;
      },
      set sessionRestSeconds(v: S['sessionRestSeconds']) {
        self.sessionRestSeconds = v;
      },
      get sessionShowPhotos(): S['sessionShowPhotos'] {
        return self.sessionShowPhotos;
      },
      set sessionShowPhotos(v: S['sessionShowPhotos']) {
        self.sessionShowPhotos = v;
      },
      get sessionTableMaxScore(): S['sessionTableMaxScore'] {
        return self.sessionTableMaxScore;
      },
      set sessionTableMaxScore(v: S['sessionTableMaxScore']) {
        self.sessionTableMaxScore = v;
      },
      get sessionTableTimerSeconds(): S['sessionTableTimerSeconds'] {
        return self.sessionTableTimerSeconds;
      },
      set sessionTableTimerSeconds(v: S['sessionTableTimerSeconds']) {
        self.sessionTableTimerSeconds = v;
      },
      get sessionTheme(): S['sessionTheme'] {
        return self.sessionTheme;
      },
      set sessionTheme(v: S['sessionTheme']) {
        self.sessionTheme = v;
      },
      toPublicArena: (...a: Parameters<S['toPublicArena']>) => self.toPublicArena(...a),
      updateArenaTheme: (...a: Parameters<S['updateArenaTheme']>) => self.updateArenaTheme(...a),
    });
  }
  private _sessionSettingsCtx?: SessionSettingsContext;

  /** Contexte de blackCards.ts (#1240) */
  private get blackCardsCtx(): BlackCardsContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    type S = RemoteScoreServer;
    return (this._blackCardsCtx ??= {
      get arenaMatchQueue(): S['arenaMatchQueue'] {
        return self.arenaMatchQueue;
      },
      get arenas(): S['arenas'] {
        return self.arenas;
      },
      get db(): S['db'] {
        return self.db;
      },
      formatFencerName: (...a: Parameters<S['formatFencerName']>) => self.formatFencerName(...a),
      getArenaBlackCards: (...a: Parameters<S['getArenaBlackCards']>) =>
        self.getArenaBlackCards(...a),
      matchPoolId: (...a: Parameters<S['matchPoolId']>) => self.matchPoolId(...a),
      get poolFencersCache(): S['poolFencersCache'] {
        return self.poolFencersCache;
      },
      get sessionBlackCards(): S['sessionBlackCards'] {
        return self.sessionBlackCards;
      },
      get sessionMatchScores(): S['sessionMatchScores'] {
        return self.sessionMatchScores;
      },
      get sessionMatches(): S['sessionMatches'] {
        return self.sessionMatches;
      },
      set sessionMatches(v: S['sessionMatches']) {
        self.sessionMatches = v;
      },
    });
  }
  private _blackCardsCtx?: BlackCardsContext;

  /** Contexte de dashboard.ts (#1240) */
  private get dashboardCtx(): DashboardContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    type S = RemoteScoreServer;
    return (this._dashboardCtx ??= {
      get arenas(): S['arenas'] {
        return self.arenas;
      },
      computePhaseEta: (...a: Parameters<S['computePhaseEta']>) => self.computePhaseEta(...a),
      get db(): S['db'] {
        return self.db;
      },
      get isTrainingMode(): S['isTrainingMode'] {
        return self.isTrainingMode;
      },
      get recentMatchDurationsMs(): S['recentMatchDurationsMs'] {
        return self.recentMatchDurationsMs;
      },
      get session(): S['session'] {
        return self.session;
      },
      get sessionMatchScores(): S['sessionMatchScores'] {
        return self.sessionMatchScores;
      },
      get sessionMatches(): S['sessionMatches'] {
        return self.sessionMatches;
      },
    });
  }
  private _dashboardCtx?: DashboardContext;

  constructor(
    db: DatabaseManager,
    port: number = 8066,
    host: string = '0.0.0.0',
    tlsOptions?: { cert: string; key: string }
  ) {
    console.log('[RemoteScoreServer] Initialisation du serveur de saisie distante...');
    this.db = db;
    // Écritures en base => « données modifiées » poussé aux kiosques (plus de polling, #1152)
    this.unsubscribeDb = db.onChange?.(() => this.notifyKioskData()) ?? null;
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
      parser: createPublicParser(() => this.sessionShowPhotos), // sans données personnelles (#1194)
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
      console.error(`[RemoteScoreServer] ERREUR: Fichier ${filename} non trouvé en mémoire`);
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
      get sessionPoolArenas() {
        return self.sessionPoolArenas;
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
      verifyPassword: { value: verifyPasswordAsync },
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
      isInActiveWave: { value: (m: { id: string }) => self.isInActiveWave(m) },
      isArenaMatchOpened: { value: (a: string) => self.arenaRefereeSelected.get(a) === true },
      claimArenaSlot: { value: (a: string, k: string, c?: string) => self.claimArenaSlot(a, k, c) },
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
      sessionCustomScoring: { get: () => self.sessionCustomScoring },
      sessionModernRules: { get: () => self.sessionModernRules },
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
    return setupSocketHandlers(this.socketCtx);
  }

  static sanitizeAnnouncement = sanitizeAnnouncement;

  private handleDisconnect(socket: any): void {
    console.log(`Client ${socket.id} disconnected`);
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
    console.log(`[RemoteScoreServer] Arène ${i} créée ✓`);
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

    for (let i = 1; i <= arenaCount; i++) this.createArena(i);
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
  public finishPoolMatch(matchId: string, ...score: Parameters<typeof buildPoolScores>): void {
    this.sessionMatchScores.set(matchId, {
      ...buildPoolScores(...score),
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

  public updateMatchArena(...args: Tail<Parameters<typeof updateMatchArena>>): void {
    return updateMatchArena(this.arenaQueueCtx, ...args);
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
      // Id DB : composite pour un match de tableau (sinon aucun score_change → replay figé, #1074)
      const matchId = this.resolveDbMatchId(arena.currentMatch);
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

  /** Score max du match : paramètres de la compétition / formule (#1125 #1134), 15 en Laser Sabre */
  private getScoreLimit(match: ArenaMatch): number {
    if (this.sessionWeapon === Weapon.LASER) return 15;
    const sessionMatch = this.sessionMatches.find(m => m.id === match.id);
    const isTableau = match.isTableau || sessionMatch?.isTableau;
    const max = isTableau
      ? this.sessionTableMaxScore
      : (this.sessionPoolMaxScore ?? sessionMatch?.maxScore);
    if (typeof max !== 'number') return 15;
    return max <= 0 || max >= 999 ? Infinity : max;
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
    const SCORE_LIMIT = this.getScoreLimit(arena.currentMatch);
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
      restSeconds: this.sessionRestSeconds,
      modernRules: this.sessionModernRules,
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
    this.notifyKioskData();

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
      return { status: 403, body: { closed: true, error: 'checkin_closed' } };
    }
    if (!this.checkinPassword) {
      return { status: 403, body: { notConfigured: true, error: 'checkin_not_configured' } };
    }
    if (!this.checkCheckinAuth(cookieHeader)) {
      return { status: 401, body: { unauthorized: true, error: 'auth_required' } };
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
      return { status: 403, body: { notConfigured: true, error: 'trainer_closed' } };
    }
    if (!this.checkTrainerAuth(cookieHeader)) {
      return { status: 401, body: { unauthorized: true, error: 'auth_required' } };
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
    return localIPv4Address();
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

  /** Signale aux kiosques que les données ont changé (regroupé sur 300 ms) */
  public notifyKioskData(): void {
    if (this.kioskDataTimer || !this.io) return;
    this.kioskDataTimer = setTimeout(() => {
      this.kioskDataTimer = null;
      this.io?.emit('kiosk:data');
    }, 300);
  }

  public stop(): void {
    this.unsubscribeDb?.();
    this.unsubscribeDb = null;
    if (this.kioskDataTimer) {
      clearTimeout(this.kioskDataTimer);
      this.kioskDataTimer = null;
    }
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
    ...args: Tail<Parameters<typeof startSession>>
  ): Promise<RemoteSession> {
    return startSession(this.sessionStartCtx, ...args);
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
    this.demoPlayer?.stop();
    this.demoPlayer = null;
    this.isTrainingMode = false;
    this.trainingCustomRules = null;
    this.session = null;
    this.notifyKioskData();
    this.sessionMatches = [];
    this.sessionPoolArenas = new Map();
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
    ...args: Tail<Parameters<typeof startTrainingSession>>
  ): Promise<RemoteSession> {
    const [, weapon, customRules] = args;
    // Démo : l'arbitre virtuel est armé avant l'assignation des premiers matchs
    if (customRules?.demo) {
      this.demoPlayer = new DemoPlayer(
        {
          arenas: () => this.arenas,
          startArenaMatch: id => this.startArenaMatch(id),
          updateArenaScore: (id, a, b) => this.updateArenaScore(id, a, b),
          finishArenaMatch: id => this.finishArenaMatch(id),
          getScoreLimit: m => this.getScoreLimit(m),
        },
        Date.now(),
        { weapon, allowedZones: customRules.allowedZones ?? [] }
      );
    }
    const session = await startTrainingSession(this.trainingSessionCtx, ...args);
    this.demoPlayer?.start();
    return session;
  }

  private createTrainingMatch(): ArenaMatch {
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
