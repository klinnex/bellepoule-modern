/**
 * BellePoule Modern - Couche domaine : paramétrage global et salles (#1880)
 * Ordre de résolution : épreuve → journée → salle → app_settings → valeur par défaut du code.
 * Licensed under GPL-3.0
 */
import {
  APP_SETTINGS_DEFAULTS,
  type AppSettingKey,
  type AppSettings,
  type Venue,
  type VenueInput,
} from '../../shared/types/appSettings';
import type { DomainContext } from './context';
import { readSession } from './sessionView';

export interface SettingScope {
  competitionId?: string;
  eventDayId?: string;
}

/** Paramètres résolus hors app_settings */
export interface ScopedSettings {
  /** Nombre de pistes : journée → salle (de la journée, sinon par défaut) → 0 */
  stripCount: number;
}

export type ResolvableKey = AppSettingKey | keyof ScopedSettings;
export type ResolvedValue<K extends ResolvableKey> = K extends AppSettingKey
  ? AppSettings[K]
  : K extends keyof ScopedSettings
    ? ScopedSettings[K]
    : never;

const venueStripCount = (venue: Venue | null): number | null =>
  venue && venue.strips.length > 0 ? Math.max(...venue.strips.map(s => s.number)) : null;

/**
 * Valeur effective d'un paramètre pour une portée (épreuve, journée).
 * Une seule fonction pour l'écran, le mode --headless et le MCP.
 */
export function resolveSetting<K extends ResolvableKey>(
  ctx: DomainContext,
  key: K,
  scope: SettingScope = {}
): ResolvedValue<K> {
  if (key === 'stripCount') {
    const dayId =
      scope.eventDayId ??
      (scope.competitionId ? ctx.db.eventDays.getCompetitionDayId(scope.competitionId) : null);
    const day = dayId ? ctx.db.eventDays.getDay(dayId) : null;
    if (day && day.stripCount > 0) return day.stripCount as ResolvedValue<K>;
    const venue = day?.venueId
      ? ctx.db.settings.getVenue(day.venueId)
      : ctx.db.settings.getDefaultVenue();
    return (venueStripCount(venue) ?? 0) as ResolvedValue<K>;
  }
  const appKey = key as AppSettingKey;
  const stored = ctx.db.settings.getStoredSettings();
  return (appKey in stored ? stored[appKey] : APP_SETTINGS_DEFAULTS[appKey]) as ResolvedValue<K>;
}

/**
 * Nombre d'arènes du serveur distant, même règle que l'écran (useRemoteServerState) :
 * une par poule, sinon pistes de la journée ou de la salle, sinon 1.
 */
export function remoteArenaCount(ctx: DomainContext, competitionId: string): number {
  const { pools } = readSession(ctx, competitionId);
  if (Array.isArray(pools) && pools.length > 0) return pools.length;
  const strips = resolveSetting(ctx, 'stripCount', { competitionId });
  return strips > 0 ? strips : 1;
}

/** Paramètres du poste effectifs (aucun secret : le jeton MCP vit hors base, chiffré) */
export function getSettings(ctx: DomainContext): AppSettings {
  return ctx.db.settings.getSettings();
}

export function updateSettings(
  ctx: DomainContext,
  updates: Partial<Record<AppSettingKey, unknown>>
): AppSettings {
  const result = ctx.db.settings.updateSettings(updates);
  ctx.emitChange?.({ scope: 'settings', competitionIds: [] });
  return result;
}

export function listVenues(ctx: DomainContext): Venue[] {
  return ctx.db.settings.listVenues();
}

export function upsertVenue(ctx: DomainContext, input: VenueInput): Venue {
  const venue = ctx.db.settings.upsertVenue(input);
  ctx.emitChange?.({ scope: 'settings', competitionIds: [] });
  return venue;
}

export function setDefaultVenue(ctx: DomainContext, id: string): Venue {
  ctx.db.settings.setDefaultVenue(id);
  ctx.emitChange?.({ scope: 'settings', competitionIds: [] });
  return ctx.db.settings.getVenue(id)!;
}
