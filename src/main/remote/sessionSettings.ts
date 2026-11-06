/**
 * BellePoule Modern - Réglages de session en cours (pistes, photos, cartons, thèmes, kiosque) (#1240)
 * Extrait de RemoteScoreServer : l'état reste dans le serveur, exposé par accesseurs (contexte).
 * Licensed under GPL-3.0
 */
import {
  RemoteSession,
  DisplayTheme,
  CustomTheme,
  ThemeTargetType,
} from '../../shared/types/remote';
import { Competition } from '../../shared/types';
import {
  resolveCompetitionSettings,
  usesModernRules,
} from '../../shared/utils/customFormulaSettings';
import type { RemoteScoreServer } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module (accesseurs : valeurs toujours à jour). */
export interface SessionSettingsContext {
  readonly applyCompetitionSettings: S['applyCompetitionSettings'];
  arenaCount: S['arenaCount'];
  readonly arenaEventBuffer: S['arenaEventBuffer'];
  readonly arenaMatchQueue: S['arenaMatchQueue'];
  readonly arenaNextMatchIndex: S['arenaNextMatchIndex'];
  readonly arenaScreenThemes: S['arenaScreenThemes'];
  readonly arenaThemeOverrides: S['arenaThemeOverrides'];
  readonly arenas: S['arenas'];
  readonly broadcastArenaUpdate: S['broadcastArenaUpdate'];
  readonly connectedClients: S['connectedClients'];
  readonly createArena: S['createArena'];
  readonly db: S['db'];
  readonly getAllArenas: S['getAllArenas'];
  readonly io: S['io'];
  readonly isTrainingMode: S['isTrainingMode'];
  kioskThemeVariables: S['kioskThemeVariables'];
  readonly session: S['session'];
  sessionBlackCardEnabled: S['sessionBlackCardEnabled'];
  sessionCardAnnounce: S['sessionCardAnnounce'];
  sessionKioskViews: S['sessionKioskViews'];
  sessionModernRules: S['sessionModernRules'];
  sessionPoolMaxScore: S['sessionPoolMaxScore'];
  sessionPoolTimerSeconds: S['sessionPoolTimerSeconds'];
  sessionRestSeconds: S['sessionRestSeconds'];
  sessionShowPhotos: S['sessionShowPhotos'];
  sessionTableMaxScore: S['sessionTableMaxScore'];
  sessionTableTimerSeconds: S['sessionTableTimerSeconds'];
  sessionTheme: S['sessionTheme'];
  readonly toPublicArena: S['toPublicArena'];
  readonly updateArenaTheme: S['updateArenaTheme'];
}

export function updateStripCount(
  ctx: SessionSettingsContext,
  newCount: number
): RemoteSession | null {
  if (!ctx.session) throw new Error('Aucune session active');

  const currentCount = ctx.session.strips.length;

  if (newCount > currentCount) {
    // Add new strips
    for (let i = currentCount; i < newCount; i++) {
      ctx.session.strips.push({
        number: i + 1,
        status: 'available',
      });
      // Pistes ajoutées en cours de session : arènes correspondantes (#1077)
      if (!ctx.arenas.has(`arena${i + 1}`)) ctx.createArena(i + 1);
    }
    ctx.arenaCount = newCount;
    ctx.io?.emit(
      'arenas:updated',
      ctx.getAllArenas().map(a => ctx.toPublicArena(a))
    );
  } else if (newCount < currentCount) {
    // Remove strips (only available ones)
    const availableStrips = ctx.session.strips.filter(s => s.status === 'available');
    const toRemove = currentCount - newCount;

    if (availableStrips.length < toRemove) {
      throw new Error(
        `Impossible de réduire à ${newCount} pistes: ${toRemove - availableStrips.length} pistes occupées`
      );
    }

    // Remove from the end (available ones)
    let removed = 0;
    for (let i = ctx.session.strips.length - 1; i >= 0 && removed < toRemove; i--) {
      if (ctx.session.strips[i].status === 'available') {
        ctx.session.strips.splice(i, 1);
        removed++;
      }
    }

    // Renumber strips
    ctx.session.strips.forEach((strip, idx) => {
      strip.number = idx + 1;
    });

    // Supprimer les arènes au-delà du nouveau count
    for (let i = newCount + 1; i <= currentCount; i++) {
      const arenaId = `arena${i}`;
      ctx.arenas.delete(arenaId);
      ctx.arenaMatchQueue.delete(arenaId);
      ctx.arenaEventBuffer.delete(arenaId);
      ctx.arenaNextMatchIndex.delete(arenaId);
    }
    ctx.arenaCount = newCount;
    ctx.io?.emit(
      'arenas:updated',
      ctx.getAllArenas().map(a => ctx.toPublicArena(a))
    );
  }

  return ctx.session;
}

export function updateShowPhotos(ctx: SessionSettingsContext, value: boolean): void {
  if (!ctx.session) throw new Error('Aucune session active');
  ctx.sessionShowPhotos = value;
  // Re-broadcast à toutes les pistes pour propager le nouveau réglage
  for (const [arenaId, arena] of ctx.arenas.entries()) {
    ctx.broadcastArenaUpdate(arenaId, {
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

/** Chronos, score max et repos issus des réglages effectifs de la compétition (#1134) */
export function applyCompetitionSettings(
  ctx: SessionSettingsContext,
  competition: Competition
): void {
  const settings = resolveCompetitionSettings(competition.weapon, competition.settings);
  ctx.sessionPoolTimerSeconds = settings?.defaultPoolTimerSeconds ?? 180;
  ctx.sessionTableTimerSeconds = settings?.defaultTableTimerSeconds ?? 180;
  ctx.sessionPoolMaxScore = settings?.defaultPoolMaxScore ?? null;
  ctx.sessionTableMaxScore = settings?.defaultTableMaxScore ?? null;
  ctx.sessionRestSeconds = Math.max(0, settings?.restTimeSeconds ?? 60);
  ctx.sessionModernRules = usesModernRules(competition.weapon, competition.settings);
}

/** Relit les réglages de la compétition à chaud (propriétés modifiées en cours de session) */
export function refreshCompetitionSettings(ctx: SessionSettingsContext): void {
  if (!ctx.session || ctx.isTrainingMode) return;
  const competition = ctx.db.getCompetition(ctx.session.competitionId);
  if (!competition) return;
  ctx.applyCompetitionSettings(competition);
  for (const [arenaId, arena] of ctx.arenas.entries()) {
    ctx.broadcastArenaUpdate(arenaId, {
      arenaId,
      match: arena.currentMatch,
      scoreA: arena.currentMatch?.scoreA,
      scoreB: arena.currentMatch?.scoreB,
      status: arena.status,
    });
  }
}

/** Active/désactive le carton noir à chaud (propriétés compétition modifiées en cours de session) */
export function updateBlackCardEnabled(ctx: SessionSettingsContext, value: boolean): void {
  if (!ctx.session || ctx.sessionBlackCardEnabled === value) return;
  ctx.sessionBlackCardEnabled = value;
  for (const [arenaId, arena] of ctx.arenas.entries()) {
    ctx.broadcastArenaUpdate(arenaId, {
      arenaId,
      match: arena.currentMatch,
      scoreA: arena.currentMatch?.scoreA,
      scoreB: arena.currentMatch?.scoreB,
      status: arena.status,
    });
  }
}

export function updateCardAnnounce(ctx: SessionSettingsContext, value: boolean): void {
  if (!ctx.session) throw new Error('Aucune session active');
  ctx.sessionCardAnnounce = value;
  for (const [arenaId, arena] of ctx.arenas.entries()) {
    ctx.broadcastArenaUpdate(arenaId, {
      arenaId,
      match: arena.currentMatch,
      scoreA: arena.currentMatch?.scoreA,
      scoreB: arena.currentMatch?.scoreB,
      status: arena.status,
    });
  }
}

export function updateTheme(ctx: SessionSettingsContext, theme: DisplayTheme): void {
  if (!ctx.session) throw new Error('Aucune session active');
  ctx.sessionTheme = theme;
  for (const [arenaId, arena] of ctx.arenas.entries()) {
    ctx.broadcastArenaUpdate(arenaId, {
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

export function updateArenaTheme(
  ctx: SessionSettingsContext,
  arenaId: string,
  theme: DisplayTheme,
  customTheme?: CustomTheme
): void {
  if (!ctx.session) throw new Error('Aucune session active');
  const fullId = arenaId.startsWith('arena') ? arenaId : `arena${arenaId}`;
  ctx.arenaThemeOverrides.set(fullId, { theme, customTheme });
  const arena = ctx.arenas.get(fullId);
  if (arena) {
    ctx.broadcastArenaUpdate(fullId, {
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

export function clearArenaThemeOverride(ctx: SessionSettingsContext, arenaId: string): void {
  if (!ctx.session) throw new Error('Aucune session active');
  const fullId = arenaId.startsWith('arena') ? arenaId : `arena${arenaId}`;
  ctx.arenaThemeOverrides.delete(fullId);
  const arena = ctx.arenas.get(fullId);
  if (arena) {
    ctx.broadcastArenaUpdate(fullId, {
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

export function updateArenaScreenTheme(
  ctx: SessionSettingsContext,
  arenaId: string,
  targetType: ThemeTargetType,
  customTheme?: CustomTheme
): void {
  if (!ctx.session) throw new Error('Aucune session active');
  const fullId = arenaId.startsWith('arena') ? arenaId : `arena${arenaId}`;
  const existing = ctx.arenaScreenThemes.get(fullId) ?? {};
  if (customTheme) existing[targetType] = customTheme;
  else delete existing[targetType];
  ctx.arenaScreenThemes.set(fullId, existing);

  if (targetType === 'arena') {
    ctx.updateArenaTheme(arenaId, customTheme ? 'custom' : 'dark', customTheme);
    return;
  }

  // Envoyer le thème immédiatement aux clients connectés du bon type
  for (const [, client] of ctx.connectedClients) {
    if (client.arenaId !== fullId) continue;
    if (client.clientType === targetType) {
      ctx.io.to(client.socketId).emit('server:command', {
        type: `${targetType}:theme`,
        variables: customTheme?.variables ?? null,
      });
    }
  }

  // Pour pool : diffuser aussi via la room pool
  if (targetType === 'pool') {
    ctx.io.to(`pool:${fullId}`).emit('server:command', {
      type: 'pool:theme',
      variables: customTheme?.variables ?? null,
    });
  }
}

export function updateKioskViews(
  ctx: SessionSettingsContext,
  views: {
    poules: boolean;
    classement: boolean;
    direct: boolean;
    suivants: boolean;
    tableau?: boolean;
  }
): void {
  if (!ctx.session) throw new Error('Aucune session active');
  ctx.sessionKioskViews = { tableau: true, ...views };
}

export function updateKioskTheme(
  ctx: SessionSettingsContext,
  variables: Record<string, string>
): void {
  if (!ctx.session) throw new Error('Aucune session active');
  ctx.kioskThemeVariables = variables;
  for (const [, client] of ctx.connectedClients) {
    if (client.clientType === 'kiosk') {
      ctx.io.to(client.socketId).emit('server:command', { type: 'kiosk:theme', variables });
    }
  }
}
