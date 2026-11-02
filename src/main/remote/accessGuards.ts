/**
 * BellePoule Modern - Gardes d'accès des espaces appel (checkin) et formateurs (#1240)
 * Extrait de RemoteScoreServer : mots de passe hashés, jetons de session, refus HTTP typés.
 * Licensed under GPL-3.0
 */
import { assertPasswordStrength, hashPassword, isTokenValid, parseCookies } from './auth';
import type { RemoteScoreServer } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État du serveur utilisé par ce module (accesseurs : valeurs toujours à jour). */
export interface AccessGuardsContext {
  checkinEnabled: S['checkinEnabled'];
  checkinPassword: S['checkinPassword'];
  checkinTokens: S['checkinTokens'];
  trainerEnabled: S['trainerEnabled'];
  trainerPassword: S['trainerPassword'];
  trainerTokens: S['trainerTokens'];
}

/** Refus d'accès (statut HTTP + corps JSON), ou null si autorisé. */
export type GuardRefusal = { status: number; body: Record<string, unknown> } | null;

export function setCheckinEnabled(ctx: AccessGuardsContext, enabled: boolean): void {
  ctx.checkinEnabled = enabled;
  console.log(`[RemoteScoreServer] Appel distant ${enabled ? 'activé' : 'désactivé'}`);
}

export function setCheckinPassword(ctx: AccessGuardsContext, password: string): void {
  // Stocké hashé ; tout changement invalide les sessions ouvertes
  assertPasswordStrength(password);
  ctx.checkinPassword = password ? hashPassword(password) : null;
  ctx.checkinTokens.clear();
  console.log(`[RemoteScoreServer] Mot de passe appel ${password ? 'défini' : 'supprimé'}`);
}

export function checkCheckinAuth(ctx: AccessGuardsContext, cookieHeader?: string): boolean {
  if (!ctx.checkinPassword) return false;
  return isTokenValid(ctx.checkinTokens, parseCookies(cookieHeader)['bp_checkin_token']);
}

/** Refus d'accès à l'API d'appel, ou null si autorisé. */
export function checkinGuard(ctx: AccessGuardsContext, cookieHeader?: string): GuardRefusal {
  if (!ctx.checkinEnabled) {
    return { status: 403, body: { closed: true, error: 'checkin_closed' } };
  }
  if (!ctx.checkinPassword) {
    return { status: 403, body: { notConfigured: true, error: 'checkin_not_configured' } };
  }
  if (!checkCheckinAuth(ctx, cookieHeader)) {
    return { status: 401, body: { unauthorized: true, error: 'auth_required' } };
  }
  return null;
}

export function setTrainerEnabled(ctx: AccessGuardsContext, enabled: boolean): void {
  ctx.trainerEnabled = enabled;
  if (!enabled) ctx.trainerTokens.clear();
}

export function setTrainerPassword(ctx: AccessGuardsContext, password: string): void {
  assertPasswordStrength(password);
  ctx.trainerPassword = password ? hashPassword(password) : null;
  ctx.trainerTokens.clear();
  console.log(`[RemoteScoreServer] Mot de passe formateurs ${password ? 'défini' : 'supprimé'}`);
}

export function checkTrainerAuth(ctx: AccessGuardsContext, cookieHeader?: string): boolean {
  if (!ctx.trainerPassword) return false;
  return isTokenValid(ctx.trainerTokens, parseCookies(cookieHeader)['bp_trainer_token']);
}

/** Refus d'accès à l'espace formateurs, ou null si autorisé. */
export function trainerGuard(ctx: AccessGuardsContext, cookieHeader?: string): GuardRefusal {
  if (!ctx.trainerEnabled || !ctx.trainerPassword) {
    return { status: 403, body: { notConfigured: true, error: 'trainer_closed' } };
  }
  if (!checkTrainerAuth(ctx, cookieHeader)) {
    return { status: 401, body: { unauthorized: true, error: 'auth_required' } };
  }
  return null;
}
