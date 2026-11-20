// Garde-fous Electron (#1148) : navigation, ouverture de fenêtres, permissions.
import * as path from 'path';
import { pathToFileURL } from 'url';

/** Origine de l'application : file:// du bundle renderer, ou le serveur de dev */
export function isAppUrl(url: string, opts: { dev: boolean; rendererDir: string }): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (opts.dev) return u.origin === 'http://localhost:8066';
  if (u.protocol !== 'file:') return false;
  const base = pathToFileURL(path.resolve(opts.rendererDir)).href.replace(/\/?$/, '/');
  return u.href === base.slice(0, -1) || u.href.startsWith(base);
}

const PRIVATE_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/i;

/** URL ouvrable dans le navigateur système : https quelconque, http seulement sur le réseau local */
export function isAllowedExternalUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol === 'https:') return true;
  return u.protocol === 'http:' && PRIVATE_HOST.test(u.hostname);
}

/**
 * Permissions accordées à l'application uniquement : caméra (getUserMedia vidéo, photo tireur)
 * et écriture presse-papier (boutons « Copier », #1858). Lecture presse-papier refusée.
 */
export function isPermissionAllowed(
  permission: string,
  requestingUrl: string,
  isApp: (url: string) => boolean,
  mediaTypes?: string[]
): boolean {
  if (!isApp(requestingUrl)) return false;
  if (permission === 'clipboard-sanitized-write') return true;
  if (permission !== 'media' && permission !== 'camera') return false;
  // Jamais de micro : seule la vidéo est utile (photo tireur)
  return !mediaTypes || mediaTypes.every(t => t === 'video');
}

/**
 * Origine à contrôler dans setPermissionCheckHandler. En production le bundle est servi en
 * `file://` : Chromium rapporte alors `file://` (sans chemin), qui n'est pas une URL de page.
 * On retient l'URL de la page elle-même, sinon la caméra (Mode Club, photo tireur) est refusée
 * avant même la demande de permission.
 */
export function permissionCheckUrl(requestingOrigin: string | undefined, pageUrl: string): string {
  if (!requestingOrigin || /^file:\/\/\/?$/.test(requestingOrigin)) return pageUrl;
  return requestingOrigin;
}

/**
 * CSP de l'en-tête de session (#1343). `style-src 'self'` stricte par défaut ;
 * `'unsafe-inline'` réservé aux fenêtres d'impression / PDF (HTML avec <style>, JS désactivé).
 */
export function buildSessionCsp(allowInlineStyles: boolean): string {
  return (
    "default-src 'self'; " +
    "script-src 'self'; " +
    `style-src 'self'${allowInlineStyles ? " 'unsafe-inline'" : ''}; ` +
    "font-src 'self'; " +
    "img-src 'self' data: blob:; " +
    "media-src 'self' blob:; " +
    "connect-src 'self' http://localhost:* https://api.github.com https://api.ffe.fr; " +
    "frame-ancestors 'none';"
  );
}

/** Seule la fenêtre principale est servie en CSP stricte. */
export function allowsInlineStyles(
  webContentsId: number | undefined,
  mainId: number | undefined
): boolean {
  return webContentsId === undefined || mainId === undefined || webContentsId !== mainId;
}
