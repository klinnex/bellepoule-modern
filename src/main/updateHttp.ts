/**
 * BellePoule Modern - Requêtes HTTP de l'updater via `net` (pile réseau Chromium)
 * Licensed under GPL-3.0
 *
 * Contrairement au module Node `https`, `net.request` suit le proxy de la session
 * (Paramètres → Réseau : système / aucun / manuel, cf. proxySettings.ts).
 */

import fs from 'fs';
import { net } from 'electron';
import { toTrustedDownloadUrl } from './updateIntegrity';

const USER_AGENT = 'BellePoule-Modern';

function headerValue(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

/** GET JSON (API GitHub). null si erreur réseau, HTTP ≠ 200 ou JSON invalide. */
export function getJson<T = unknown>(url: string, timeoutMs = 10000): Promise<T | null> {
  return new Promise(resolve => {
    let done = false;
    const finish = (v: T | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    };
    const req = net.request({ url, method: 'GET' });
    req.setHeader('User-Agent', USER_AGENT);
    req.setHeader('Accept', 'application/vnd.github.v3+json');
    const timer = setTimeout(() => {
      req.abort();
      finish(null);
    }, timeoutMs);
    req.on('response', res => {
      if (res.statusCode !== 200) {
        res.on('data', () => undefined);
        res.on('end', () => finish(null));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          finish(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T);
        } catch {
          finish(null);
        }
      });
      res.on('error', () => finish(null));
    });
    req.on('error', () => finish(null));
    req.end();
  });
}

/**
 * Télécharge `url` dans `dest` (mode 0600). Redirections suivies uniquement vers
 * des hôtes GitHub de confiance. Abandon si aucune donnée pendant `idleMs`.
 */
export function downloadToFile(
  url: string,
  dest: string,
  onProgress?: (downloaded: number, total: number) => void,
  idleMs = 30000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const safeUrl = toTrustedDownloadUrl(url);
    if (!safeUrl) {
      reject(new Error(`URL de téléchargement non autorisée: ${url}`));
      return;
    }
    const file = fs.createWriteStream(dest, { mode: 0o600 });
    let settled = false;
    let idle: NodeJS.Timeout | null = null;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      if (idle) clearTimeout(idle);
      req.abort();
      file.destroy();
      fs.rm(dest, { force: true }, () => reject(err));
    };
    const armIdle = () => {
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => fail(new Error('Download timeout')), idleMs);
    };

    const req = net.request({ url: safeUrl, method: 'GET', redirect: 'manual' });
    req.setHeader('User-Agent', USER_AGENT);
    req.on('redirect', (_status, _method, redirectUrl) => {
      if (!toTrustedDownloadUrl(redirectUrl)) {
        fail(new Error(`Redirection non autorisée: ${redirectUrl}`));
        return;
      }
      armIdle();
      req.followRedirect();
    });
    req.on('response', res => {
      if (res.statusCode !== 200) {
        fail(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }
      const total = parseInt(headerValue(res.headers['content-length']), 10) || 0;
      let downloaded = 0;
      armIdle();
      res.on('data', (chunk: Buffer) => {
        armIdle();
        downloaded += chunk.length;
        file.write(chunk); // disque plus rapide que le réseau : pas de contre-pression
        onProgress?.(downloaded, total);
      });
      res.on('end', () => {
        if (settled) return;
        if (idle) clearTimeout(idle);
        file.end(() => {
          if (total > 0 && downloaded !== total) {
            fail(new Error('Download incomplete - size mismatch'));
            return;
          }
          settled = true;
          resolve();
        });
      });
      res.on('error', (err: Error) => fail(err));
    });
    req.on('error', err => fail(err));
    armIdle();
    req.end();
  });
}
