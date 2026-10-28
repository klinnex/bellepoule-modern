/**
 * BellePoule Modern - Session d'entraînement (#1240)
 * Extrait de RemoteScoreServer : l'état reste dans le serveur, exposé par accesseurs (contexte).
 * Licensed under GPL-3.0
 */
import type { RemoteSession, ArenaMatch } from '../../shared/types/remote';
import type { RemoteScoreServer } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module (accesseurs : valeurs toujours à jour). */
export interface TrainingSessionContext {
  readonly assignMatchToArena: S['assignMatchToArena'];
  readonly notifyKioskData: S['notifyKioskData'];
  readonly poolFencersCache: S['poolFencersCache'];
  readonly poolSignaturesCache: S['poolSignaturesCache'];
  readonly sessionBlackCards: S['sessionBlackCards'];
  readonly sessionMatchScores: S['sessionMatchScores'];
  readonly setArenaCount: S['setArenaCount'];
  isTrainingMode: S['isTrainingMode'];
  session: S['session'];
  sessionBlackCardEnabled: S['sessionBlackCardEnabled'];
  sessionCardAnnounce: S['sessionCardAnnounce'];
  sessionCustomScoring: S['sessionCustomScoring'];
  sessionKioskViews: S['sessionKioskViews'];
  sessionMatches: S['sessionMatches'];
  sessionModernRules: S['sessionModernRules'];
  sessionPoolMaxScore: S['sessionPoolMaxScore'];
  sessionPoolTimerSeconds: S['sessionPoolTimerSeconds'];
  sessionRefereeFeatureEnabled: S['sessionRefereeFeatureEnabled'];
  sessionRestSeconds: S['sessionRestSeconds'];
  sessionShowPhotos: S['sessionShowPhotos'];
  sessionTableMaxScore: S['sessionTableMaxScore'];
  sessionTableTimerSeconds: S['sessionTableTimerSeconds'];
  sessionWeapon: S['sessionWeapon'];
  trainingCustomRules: S['trainingCustomRules'];
  trainingHistory: S['trainingHistory'];
}

export async function startTrainingSession(
  ctx: TrainingSessionContext,
  strips: number,
  weapon: string,
  customRules?: {
    matchDurationSeconds?: number;
    allowedZones?: string[];
    disableSuddenDeath?: boolean;
  }
): Promise<RemoteSession> {
  if (ctx.session) throw new Error('Session déjà active');
  const effectiveStrips = Math.max(1, Math.min(strips, 20));
  ctx.isTrainingMode = true;
  ctx.trainingHistory = [];
  ctx.sessionWeapon = weapon;
  ctx.sessionCustomScoring = null;
  const duration = customRules?.matchDurationSeconds ?? 180;
  ctx.sessionPoolTimerSeconds = duration;
  ctx.sessionTableTimerSeconds = duration;
  ctx.sessionPoolMaxScore = null;
  ctx.sessionTableMaxScore = null;
  ctx.sessionRestSeconds = 0;
  ctx.sessionModernRules = ['E', 'F', 'S'].includes(weapon ?? '');
  ctx.trainingCustomRules = {
    matchDurationSeconds: duration,
    allowedZones: customRules?.allowedZones ?? [],
    disableSuddenDeath: customRules?.disableSuddenDeath ?? false,
  };
  ctx.sessionShowPhotos = false;
  ctx.sessionCardAnnounce = false;
  ctx.sessionRefereeFeatureEnabled = false;
  ctx.sessionBlackCardEnabled = false;
  ctx.sessionBlackCards.clear();
  ctx.sessionKioskViews = {
    poules: false,
    classement: true,
    direct: true,
    suivants: false,
    tableau: false,
  };
  ctx.sessionMatchScores.clear();
  ctx.poolFencersCache.clear();
  ctx.poolSignaturesCache.clear();
  ctx.setArenaCount(effectiveStrips);
  ctx.sessionMatches = [];
  ctx.notifyKioskData();
  ctx.session = {
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
    ctx.assignMatchToArena(`arena${i}`, createTrainingMatch());
  }
  console.log(
    `[RemoteScoreServer] Session entraînement démarrée: ${effectiveStrips} pistes, arme=${weapon}`
  );
  return ctx.session;
}

export function createTrainingMatch(): ArenaMatch {
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
