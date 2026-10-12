/**
 * BellePoule Modern - Vérification d'intégrité des mises à jour
 * Licensed under GPL-3.0
 */

import crypto from 'crypto';
import fs from 'fs';

// Hôtes autorisés pour le téléchargement des installeurs (GitHub + CDN des assets)
const TRUSTED_DOWNLOAD_HOSTS = [
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
];

/**
 * Extrait le SHA-256 hexadécimal d'un digest d'asset GitHub (format "sha256:<hex>").
 * Retourne null si absent ou invalide.
 */
export function parseSha256Digest(digest: unknown): string | null {
  if (typeof digest !== 'string') return null;
  const match = digest.trim().match(/^sha256:([0-9a-f]{64})$/i);
  return match ? match[1].toLowerCase() : null;
}

/** Vérifie qu'une URL de téléchargement est en HTTPS vers un hôte GitHub de confiance. */
export function isTrustedDownloadUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && TRUSTED_DOWNLOAD_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

/** Calcule le SHA-256 (hex minuscule) d'un fichier. */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** Vérifie que le fichier correspond au SHA-256 attendu. */
export async function verifyFileSha256(filePath: string, expectedSha256: string): Promise<boolean> {
  const expected = parseSha256Digest(`sha256:${expectedSha256}`);
  if (!expected) return false;
  const actual = await sha256File(filePath);
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
