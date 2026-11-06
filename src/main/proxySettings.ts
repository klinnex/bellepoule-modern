/**
 * BellePoule Modern - Proxy réseau (Paramètres → Réseau)
 * Licensed under GPL-3.0
 *
 * Fichier `<userData>/proxy-settings.json`, appliqué à la session par défaut au
 * démarrage : mises à jour (net.request), renderer (fetch, webhooks…).
 * - system : proxy du système (défaut, comme un navigateur)
 * - direct : aucun proxy
 * - manual : serveur saisi (`hôte:port`, `http://…`, `socks5://…`) + exclusions
 */

import fs from 'fs';
import path from 'path';

export type ProxyMode = 'system' | 'direct' | 'manual';

export interface ProxySettings {
  mode: ProxyMode;
  /** manual : serveur normalisé, ex. `http://proxy.club.fr:3128` */
  server?: string;
  /** manual : exclusions séparées par des virgules, ex. `*.local, 192.168.0.0/16` */
  bypass?: string;
}

/** Config passée à `session.setProxy` (sous-ensemble d'Electron.ProxyConfig). */
export interface ElectronProxyConfig {
  mode: 'system' | 'direct' | 'fixed_servers';
  proxyRules?: string;
  proxyBypassRules?: string;
}

const FILE = 'proxy-settings.json';
const DEFAULTS: ProxySettings = { mode: 'system' };
const SCHEMES = ['http', 'https', 'socks4', 'socks5'];

/**
 * Normalise un serveur proxy saisi. Accepte `hôte:port` (http implicite) ou
 * `schéma://hôte:port`. Refuse identifiants, chemin, espaces, port invalide.
 */
export function normalizeProxyServer(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const withScheme = raw.includes('://') ? raw : `http://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  const scheme = url.protocol.replace(/:$/, '');
  if (!SCHEMES.includes(scheme)) return null;
  if (url.username || url.password) return null;
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) return null;
  // Port explicite obligatoire (URL efface le port par défaut du schéma : https:443)
  const portMatch = withScheme.match(/^[a-z0-9]+:\/\/[^/?#]*:(\d+)\/?$/i);
  if (!url.hostname || !portMatch) return null;
  const port = Number(portMatch[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return `${scheme}://${url.hostname}:${port}`;
}

/** Exclusions : liste nettoyée (virgules / points-virgules / retours ligne). */
export function normalizeBypass(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .split(/[,;\n]/)
    .map(s => s.trim())
    .filter(s => s && /^[\w.*:/[\]<>-]+$/.test(s))
    .join(',');
}

/** Valide et normalise ; null si mode manuel sans serveur valide. */
export function sanitizeProxySettings(input: unknown): ProxySettings | null {
  const v = (input ?? {}) as Record<string, unknown>;
  if (v.mode === 'system' || v.mode === 'direct') return { mode: v.mode };
  if (v.mode !== 'manual') return null;
  const server = normalizeProxyServer(v.server);
  if (!server) return null;
  const bypass = normalizeBypass(v.bypass);
  return { mode: 'manual', server, ...(bypass ? { bypass } : {}) };
}

/** Machine locale toujours en direct (serveur d'arbitrage, tablettes). */
export function toElectronProxyConfig(settings: ProxySettings): ElectronProxyConfig {
  if (settings.mode === 'direct') return { mode: 'direct' };
  if (settings.mode === 'manual' && settings.server) {
    return {
      mode: 'fixed_servers',
      proxyRules: settings.server,
      proxyBypassRules: ['<local>', settings.bypass].filter(Boolean).join(','),
    };
  }
  return { mode: 'system' };
}

export function readProxySettings(userDataDir: string): ProxySettings {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(userDataDir, FILE), 'utf8'));
    return sanitizeProxySettings(raw) ?? { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeProxySettings(userDataDir: string, settings: ProxySettings): void {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(path.join(userDataDir, FILE), JSON.stringify(settings, null, 2));
}
