/**
 * BellePoule Modern - Diffusion des mises à jour d'arène et persistance d'état (#1240)
 * Extrait de RemoteScoreServer : l'état reste dans le serveur, exposé par accesseurs (contexte).
 * Licensed under GPL-3.0
 */
import type { Arena, ArenaUpdate } from '../../shared/types/remote';
import { getSharedMainWindow } from '../mainWindowRef';
import type { RemoteScoreServer } from '../remoteScoreServer';
import { logger, LogCategory, toError } from '../../shared/services/logger';
import { needsLeftHandedSwap } from '../../shared/utils/handedness';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module. */
export interface ArenaBroadcastContext {
  readonly arenaEventBuffer: S['arenaEventBuffer'];
  readonly arenaMatchQueue: S['arenaMatchQueue'];
  readonly arenaPhotoSentForMatch: S['arenaPhotoSentForMatch'];
  readonly arenaRefereeSelected: S['arenaRefereeSelected'];
  readonly arenaScreenThemes: S['arenaScreenThemes'];
  readonly arenaThemeOverrides: S['arenaThemeOverrides'];
  readonly arenas: S['arenas'];
  readonly db: S['db'];
  readonly EVENT_BUFFER_MAX: S['EVENT_BUFFER_MAX'];
  readonly EVENT_BUFFER_TTL_MS: S['EVENT_BUFFER_TTL_MS'];
  readonly getArena: S['getArena'];
  readonly getSessionReferees: S['getSessionReferees'];
  readonly io: S['io'];
  readonly notifyKioskData: S['notifyKioskData'];
  readonly session: S['session'];
  readonly sessionBlackCardEnabled: S['sessionBlackCardEnabled'];
  readonly sessionCardAnnounce: S['sessionCardAnnounce'];
  readonly sessionModernRules: S['sessionModernRules'];
  readonly sessionPoolTimerSeconds: S['sessionPoolTimerSeconds'];
  readonly sessionRefereeFeatureEnabled: S['sessionRefereeFeatureEnabled'];
  readonly sessionRestSeconds: S['sessionRestSeconds'];
  readonly sessionShowPhotos: S['sessionShowPhotos'];
  readonly sessionTableTimerSeconds: S['sessionTableTimerSeconds'];
  readonly sessionTheme: S['sessionTheme'];
  readonly sessionWeapon: S['sessionWeapon'];
  /** Rappel Cyrano : envoi DISP quand le match change (#1720). */
  readonly cyranoHook: S['cyranoHook'];
}

/** Clone l'update sans les photos base64 (sans muter l'état partagé de l'arène). */
export function stripPhotosFromUpdate(update: ArenaUpdate): ArenaUpdate {
  const stripFencer = <T extends { photo?: string } | null | undefined>(f: T): T => {
    if (!f || !f.photo) return f;
    const { photo: _photo, ...rest } = f;
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

/**
 * Gaucher contre droitier, armes olympiques (#1439) : le gaucher (A, premier appelé)
 * devient rouge et le droitier vert. Couleur réelle, indépendante de l'inversion de vue.
 */
export function arenaLeftHanded(
  match: ArenaUpdate['match'] | null | undefined,
  weapon: string | null | undefined
): boolean {
  return !!match && needsLeftHandedSwap(weapon, match.fencerA, match.fencerB);
}

export function broadcastArenaUpdate(
  ctx: ArenaBroadcastContext,
  arenaId: string,
  update: ArenaUpdate
): void {
  const arena = ctx.getArena(arenaId);
  if (arena && update.match !== undefined)
    arena.leftHanded = arenaLeftHanded(update.match, ctx.sessionWeapon);
  const override = ctx.arenaThemeOverrides.get(arenaId);
  const isPoolMatch = !!arena?.currentMatch?.poolId;
  const updateWithPhotos: ArenaUpdate = {
    ...update,
    swapped: arena?.swapped ?? false,
    leftHanded: arena?.leftHanded ?? false,
    showPhotos: ctx.sessionShowPhotos,
    cardAnnounce: ctx.sessionCardAnnounce,
    theme: override?.theme ?? ctx.sessionTheme,
    customTheme: override?.customTheme,
    screenThemes: ctx.arenaScreenThemes.get(arenaId),
    refereeFeatureEnabled: ctx.sessionRefereeFeatureEnabled,
    blackCardEnabled: ctx.sessionBlackCardEnabled,
    referees: ctx.getSessionReferees(),
    timerDuration: isPoolMatch ? ctx.sessionPoolTimerSeconds : ctx.sessionTableTimerSeconds,
    restSeconds: ctx.sessionRestSeconds,
    modernRules: ctx.sessionModernRules,
    refereeSelected: ctx.arenaRefereeSelected.get(arenaId) ?? false,
  };

  // Photos envoyées une seule fois par match : les updates suivants partent sans
  // (les clients qui rejoignent en cours de match reçoivent l'état complet au join_arena)
  const matchId = updateWithPhotos.match?.id;
  let payload = updateWithPhotos;
  if (matchId) {
    if (ctx.arenaPhotoSentForMatch.get(arenaId) === matchId) {
      payload = stripPhotosFromUpdate(updateWithPhotos);
    } else {
      ctx.arenaPhotoSentForMatch.set(arenaId, matchId);
    }
  }

  // Stocker dans le buffer de replay (TTL + max size)
  const now = Date.now();
  let buf = ctx.arenaEventBuffer.get(arenaId) ?? [];
  buf = buf.filter(e => now - e.timestamp < ctx.EVENT_BUFFER_TTL_MS);
  buf.push({ event: payload, timestamp: now });
  if (buf.length > ctx.EVENT_BUFFER_MAX) buf = buf.slice(-ctx.EVENT_BUFFER_MAX);
  ctx.arenaEventBuffer.set(arenaId, buf);

  // Émission limitée à la room de l'arène (les clients join_arena à la connexion) :
  // évite d'envoyer chaque update (photos base64 incluses) à tous les clients de toutes les arènes
  ctx.io.to(`arena:${arenaId}`).emit(`arena:${arenaId}:update`, payload);
  ctx.notifyKioskData();

  getSharedMainWindow()?.webContents.send('arena:update', { arenaId, update: payload });
  ctx.cyranoHook?.(arenaId, payload);
}

export function persistArenaState(ctx: ArenaBroadcastContext, arenaId: string): void {
  if (!ctx.session) return;
  try {
    const arena = ctx.arenas.get(arenaId);
    if (!arena) return;
    ctx.db.saveArenaState(arenaId, {
      competitionId: ctx.session.competitionId,
      currentMatch: arena.currentMatch,
      matchQueue: ctx.arenaMatchQueue.get(arenaId) ?? [],
      settings: arena.settings,
      status: arena.status,
    });
  } catch (err) {
    logger.error(
      LogCategory.NETWORK,
      `[RemoteScoreServer] Erreur persistance arène ${arenaId}:`,
      toError(err)
    );
  }
}
