/**
 * BellePoule Modern - Authentification et limitation de débit du serveur distant
 * (extraites de remoteScoreServer.ts, #1065) : cookies, mots de passe scrypt,
 * jetons de session, blocage progressif des connexions, fenêtres d'une minute.
 * Licensed under GPL-3.0
 */
import type express from 'express';
import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'crypto';
import { PASSWORD_MIN_LENGTH } from './network';

// Sessions : durée de vie serveur + plafond par arène / appel
export const TOKEN_TTL_MS = 8 * 3600_000;
export const MAX_TOKENS_PER_SCOPE = 50;
// Plafond mémoire des maps de limitation (éviction de la plus ancienne entrée)
export const LIMITER_MAX_ENTRIES = 1000;

export function parseCookies(header: string | undefined): Record<string, string> {
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

/** Le mot de passe n'est jamais stocké ni comparé en clair : scrypt salé `scrypt$sel$hash`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: unknown, stored: string | null | undefined): boolean {
  if (typeof password !== 'string' || !password || !stored) return false;
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N: 16384,
      r: 8,
      p: 1,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * Variante asynchrone de verifyPassword (#1154) : scrypt tourne dans le pool libuv,
 * la boucle d'événements du main n'est pas bloquée (~50 ms par tentative de connexion).
 */
export function verifyPasswordAsync(
  password: unknown,
  stored: string | null | undefined
): Promise<boolean> {
  if (typeof password !== 'string' || !password || !stored) return Promise.resolve(false);
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return Promise.resolve(false);
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length === 0) return Promise.resolve(false);
  return new Promise(resolve => {
    scrypt(
      password,
      Buffer.from(saltHex, 'hex'),
      expected.length,
      { N: 16384, r: 8, p: 1 },
      (err, actual) => {
        if (err) return resolve(false);
        try {
          resolve(timingSafeEqual(actual, expected));
        } catch {
          resolve(false);
        }
      }
    );
  });
}

export function assertPasswordStrength(password: string): void {
  if (password && password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Mot de passe trop court (${PASSWORD_MIN_LENGTH} caractères minimum)`);
  }
}

/** Émet un jeton de session (TTL serveur), en évinçant le plus ancien au-delà du plafond. */
export function issueToken(store: Map<string, number>): string {
  const token = randomBytes(32).toString('hex');
  while (store.size >= MAX_TOKENS_PER_SCOPE) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  store.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

export function isTokenValid(
  store: Map<string, number> | undefined,
  token: string | undefined
): boolean {
  if (!store || !token) return false;
  const exp = store.get(token);
  if (exp === undefined) return false;
  if (Date.now() >= exp) {
    store.delete(token);
    return false;
  }
  return true;
}

/** Supprime les jetons expirés. */
export function purgeExpiredTokens(store: Map<string, number>, now = Date.now()): void {
  for (const [token, exp] of store) {
    if (now >= exp) store.delete(token);
  }
}

type Window = { count: number; resetAt: number };

/** Compteur fenêtre fixe d'une minute ; false si la limite est atteinte. */
export function hitWindow(map: Map<string, Window>, key: string, max: number): boolean {
  const now = Date.now();
  const attempt = map.get(key);
  if (attempt && now < attempt.resetAt) {
    if (attempt.count >= max) return false;
    attempt.count++;
    return true;
  }
  if (!attempt && map.size >= LIMITER_MAX_ENTRIES) {
    // Plafond : éviction de l'entrée la plus ancienne (ordre d'insertion des Map)
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, { count: 1, resetAt: now + 60_000 });
  return true;
}

/** Limite par clé (IP) sur une fenêtre fixe d'une minute (scores, inscriptions). */
export class MinuteRateLimiter {
  readonly entries = new Map<string, Window>();

  constructor(readonly max: number) {}

  /** true si autorisé (et compté), false si la limite de la minute est atteinte. */
  hit(key: string): boolean {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (!entry || now > entry.resetAt) {
      this.entries.set(key, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    if (entry.count >= this.max) return false;
    entry.count++;
    return true;
  }

  purge(now = Date.now()): void {
    for (const [key, entry] of this.entries) {
      if (now >= entry.resetAt) this.entries.delete(key);
    }
  }
}

/**
 * Protection des formulaires de connexion : limite par IP et par cible (arène,
 * appel…), blocage exponentiel après échecs consécutifs, délai fixe sur échec.
 */
export class LoginGuard {
  readonly attempts = new Map<string, Window>();
  readonly targetAttempts = new Map<string, Window>();
  readonly failures = new Map<string, { fails: number; lockedUntil: number; lastFailAt: number }>();
  readonly perIpPerMin = 5;
  readonly perTargetPerMin = 20;
  readonly lockoutThreshold = 5;
  readonly lockoutBaseMs = 30_000;
  readonly lockoutMaxMs = 15 * 60_000;
  /** Délai fixe avant réponse sur échec (freine l'automatisation). */
  failureDelayMs = 300;

  /** onLockout : alerte opérateur lors d'un blocage. */
  constructor(private readonly onLockout: (message: string) => void = () => {}) {}

  /** Retourne null si autorisé, sinon le délai d'attente en secondes. */
  check(ip: string, target: string): { retryAfterSec: number } | null {
    const now = Date.now();
    const failure = this.failures.get(ip);
    if (failure && now < failure.lockedUntil) {
      return { retryAfterSec: Math.ceil((failure.lockedUntil - now) / 1000) };
    }
    if (!hitWindow(this.attempts, ip, this.perIpPerMin)) {
      return { retryAfterSec: 60 };
    }
    if (!hitWindow(this.targetAttempts, target, this.perTargetPerMin)) {
      return { retryAfterSec: 60 };
    }
    return null;
  }

  /** Échec : délai fixe, blocage exponentiel au-delà du seuil, alerte opérateur. */
  async recordFailure(ip: string, target: string): Promise<void> {
    const now = Date.now();
    const f = this.failures.get(ip) ?? { fails: 0, lockedUntil: 0, lastFailAt: 0 };
    f.fails++;
    f.lastFailAt = now;
    if (f.fails >= this.lockoutThreshold) {
      const lockMs = Math.min(
        this.lockoutMaxMs,
        this.lockoutBaseMs * 2 ** (f.fails - this.lockoutThreshold)
      );
      f.lockedUntil = now + lockMs;
      const msg = `[Sécurité] ${f.fails} échecs de connexion depuis ${ip} (cible ${target}) — bloqué ${Math.round(lockMs / 1000)} s`;
      console.warn(`[RemoteScoreServer] ${msg}`);
      this.onLockout(msg);
    }
    // Réinsertion en fin de Map (ordre = récence) + plafond mémoire
    this.failures.delete(ip);
    if (this.failures.size >= LIMITER_MAX_ENTRIES) {
      const oldest = this.failures.keys().next().value;
      if (oldest !== undefined) this.failures.delete(oldest);
    }
    this.failures.set(ip, f);
    if (this.failureDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.failureDelayMs));
    }
  }

  recordSuccess(ip: string): void {
    this.attempts.delete(ip);
    this.failures.delete(ip);
  }

  /** Purge des fenêtres expirées et des blocages anciens (> 1 h sans échec). */
  purge(now = Date.now()): void {
    for (const [ip, attempt] of this.attempts) {
      if (now >= attempt.resetAt) this.attempts.delete(ip);
    }
    for (const [target, attempt] of this.targetAttempts) {
      if (now >= attempt.resetAt) this.targetAttempts.delete(target);
    }
    for (const [ip, f] of this.failures) {
      if (now >= f.lockedUntil && now - f.lastFailAt > 3600_000) this.failures.delete(ip);
    }
  }
}

export function sendLoginLimited(res: express.Response, limited: { retryAfterSec: number }) {
  res.setHeader('Retry-After', String(limited.retryAfterSec));
  return res.status(429).json({
    success: false,
    error: 'too_many_attempts',
    retryAfter: limited.retryAfterSec,
  });
}
