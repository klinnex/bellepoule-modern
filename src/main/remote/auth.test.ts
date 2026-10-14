import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  LoginGuard,
  MAX_TOKENS_PER_SCOPE,
  MinuteRateLimiter,
  TOKEN_TTL_MS,
  assertPasswordStrength,
  hashPassword,
  isTokenValid,
  issueToken,
  parseCookies,
  purgeExpiredTokens,
  verifyPassword,
} from './auth';

afterEach(() => vi.useRealTimers());

describe('parseCookies', () => {
  it('décode les paires et ignore les parties malformées', () => {
    expect(parseCookies('a=1; b=hello%20world; bad; c=%E0%A4%A')).toEqual({
      a: '1',
      b: 'hello world',
    });
    expect(parseCookies(undefined)).toEqual({});
  });
});

describe('mots de passe scrypt', () => {
  it('hash salé, vérification à temps constant', () => {
    const h = hashPassword('secret123');
    expect(h).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(hashPassword('secret123')).not.toBe(h);
    expect(verifyPassword('secret123', h)).toBe(true);
    expect(verifyPassword('secret124', h)).toBe(false);
    expect(verifyPassword(42, h)).toBe(false);
    expect(verifyPassword('secret123', 'md5$x$y')).toBe(false);
  });

  it('refuse un mot de passe trop court, accepte le vide (suppression)', () => {
    expect(() => assertPasswordStrength('court')).toThrow(/trop court/);
    expect(() => assertPasswordStrength('')).not.toThrow();
  });
});

describe('jetons de session', () => {
  it('valides jusqu’à expiration, puis supprimés', () => {
    vi.useFakeTimers();
    const store = new Map<string, number>();
    const t = issueToken(store);
    expect(isTokenValid(store, t)).toBe(true);
    vi.advanceTimersByTime(TOKEN_TTL_MS);
    expect(isTokenValid(store, t)).toBe(false);
    expect(store.has(t)).toBe(false);
  });

  it('plafond par portée : évince les plus anciens', () => {
    const store = new Map<string, number>();
    const first = issueToken(store);
    for (let i = 0; i < MAX_TOKENS_PER_SCOPE; i++) issueToken(store);
    expect(store.size).toBe(MAX_TOKENS_PER_SCOPE);
    expect(store.has(first)).toBe(false);
  });

  it('purge des jetons expirés', () => {
    const store = new Map([
      ['old', 10],
      ['new', 1000],
    ]);
    purgeExpiredTokens(store, 500);
    expect([...store.keys()]).toEqual(['new']);
  });
});

describe('LoginGuard', () => {
  it('5 tentatives par IP et par minute', () => {
    const g = new LoginGuard();
    for (let i = 0; i < 5; i++) expect(g.check('1.1.1.1', 'arena1')).toBeNull();
    expect(g.check('1.1.1.1', 'arena1')).toEqual({ retryAfterSec: 60 });
    expect(g.check('2.2.2.2', 'arena1')).toBeNull();
  });

  it('blocage exponentiel après 5 échecs, alerte opérateur, levé par un succès', async () => {
    const onLockout = vi.fn();
    const g = new LoginGuard(onLockout);
    g.failureDelayMs = 0;
    for (let i = 0; i < 5; i++) await g.recordFailure('1.1.1.1', 'arena1');
    expect(onLockout).toHaveBeenCalledOnce();
    g.attempts.clear();
    expect(g.check('1.1.1.1', 'arena1')?.retryAfterSec).toBeGreaterThan(0);
    g.recordSuccess('1.1.1.1');
    expect(g.check('1.1.1.1', 'arena1')).toBeNull();
  });
});

describe('MinuteRateLimiter', () => {
  it('limite par clé sur une minute', () => {
    vi.useFakeTimers();
    const l = new MinuteRateLimiter(2);
    expect(l.hit('ip')).toBe(true);
    expect(l.hit('ip')).toBe(true);
    expect(l.hit('ip')).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(l.hit('ip')).toBe(true);
  });
});
