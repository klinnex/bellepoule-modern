/**
 * BellePoule Modern - Contexte des routes HTTP du serveur distant (#1240)
 * Extrait de RemoteScoreServer : accesseurs vers l'état du serveur (valeurs toujours à jour),
 * partagés par tous les modules de routes (chacun n'utilise que sa part de l'interface).
 * Licensed under GPL-3.0
 */

import { liveContext } from './liveContext';
import { issueToken, sendLoginLimited, verifyPasswordAsync } from './auth';
import type { ApiRouteContext } from './routes/apiRoutes';

/** Propriétés d'état lues par les routes (lecture + écriture côté serveur). */
const ROUTE_STATE_KEYS = [
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
] as const;

/** Méthodes du serveur appelables par les routes. */
const ROUTE_METHOD_KEYS = [
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
  'logDiag',
  'updateMatchScore',
  'assignMatchToArena',
  'createSession',
  'getAllArenas',
  'getVisibleArenas',
  'stripPlan',
  'getArena',
  'getLocalIPAddress',
  'getServerUrl',
  'pauseArenaMatch',
  'startArenaMatch',
  'stopSession',
  'toPublicArena',
  'updateArenaScore',
] as const;

/**
 * @param self instance du serveur
 * @param isArenaMatchOpened vrai si la tablette de l'arène a ouvert la saisie du match en cours
 */
export function buildRouteContext(
  self: object,
  isArenaMatchOpened: (arenaId: string) => boolean
): ApiRouteContext {
  return Object.assign(liveContext<ApiRouteContext>(self, ROUTE_STATE_KEYS, ROUTE_METHOD_KEYS), {
    sendLoginLimited,
    verifyPassword: verifyPasswordAsync,
    issueToken,
    isArenaMatchOpened,
  });
}
