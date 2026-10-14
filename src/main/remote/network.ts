/**
 * BellePoule Modern - Helpers réseau du serveur distant (CORS, IP, routes de login)
 * (extraits de remoteScoreServer.ts, #1065).
 * Licensed under GPL-3.0
 */

/** Longueur minimale des mots de passe d'arène et d'appel. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Vérifie qu'une origine HTTP appartient au réseau local (localhost + plages LAN privées).
 * Centralise la logique CORS partagée entre Socket.IO et le middleware Express.
 */
export function isLocalNetworkOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  try {
    const h = new URL(origin).hostname;
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '::1' ||
      /^10\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      /^192\.168\./.test(h)
    );
  } catch {
    // Origine invalide / non analysable : refuser
    return false;
  }
}

/** Retire le préfixe IPv4-mappé (::ffff:) ; 'unknown' si absente. */
export function normalizeIp(ip: string | undefined): string {
  if (!ip) return 'unknown';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function isLoopbackAddress(addr: string | undefined): boolean {
  const ip = normalizeIp(addr);
  return ip === '127.0.0.1' || ip === '::1';
}

/** Routes de connexion : corps JSON limité à 4 Ko (anti brute-force volumineux). */
export function isLoginPath(path: string): boolean {
  return (
    path === '/api/checkin/login' ||
    path === '/api/trainer/login' ||
    path.startsWith('/api/auth/login/')
  );
}
