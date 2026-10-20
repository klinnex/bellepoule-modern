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

/** Permission caméra (getUserMedia vidéo) depuis l'application uniquement */
export function isPermissionAllowed(
  permission: string,
  requestingUrl: string,
  isApp: (url: string) => boolean,
  mediaTypes?: string[]
): boolean {
  if (!isApp(requestingUrl)) return false;
  if (permission !== 'media' && permission !== 'camera') return false;
  // Jamais de micro : seule la vidéo est utile (photo tireur)
  return !mediaTypes || mediaTypes.every(t => t === 'video');
}
