// Autorisation des chemins fichiers (#1146) : le renderer ne peut lire/écrire que des
// chemins renvoyés par une boîte de dialogue native (ou le menu) dans le main process.
import * as fs from 'fs';
import * as path from 'path';

export type PathAccess = 'read' | 'write';

/** Durée de validité d'une autorisation (ms) */
export const AUTH_TTL_MS = 10 * 60 * 1000;
/** Nombre max d'autorisations conservées */
export const AUTH_MAX_ENTRIES = 200;
/** Extensions jamais écrites (exécutables / scripts) */
export const FORBIDDEN_WRITE_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.msi',
  '.dll',
  '.lnk',
  '.ps1',
  '.vbs',
  '.vbe',
  '.js',
  '.jse',
  '.mjs',
  '.cjs',
  '.sh',
  '.bash',
  '.jar',
  '.app',
  '.desktop',
  '.command',
  '.reg',
  '.hta',
  '.cpl',
  '.pif',
  '.node',
]);

// Limites d'import ZIP (surchargeables par variables d'environnement)
const envInt = (name: string, def: number): number => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
};
export const ZIP_LIMITS = {
  maxFileBytes: envInt('BP_ZIP_MAX_FILE_BYTES', 50 * 1024 * 1024),
  maxEntries: envInt('BP_ZIP_MAX_ENTRIES', 5000),
  maxTotalUncompressedBytes: envInt('BP_ZIP_MAX_UNCOMPRESSED_BYTES', 200 * 1024 * 1024),
  maxEntryBytes: envInt('BP_ZIP_MAX_ENTRY_BYTES', 20 * 1024 * 1024),
  maxFencers: envInt('BP_IMPORT_MAX_FENCERS', 20000),
};

const grants = new Map<string, { access: PathAccess; expires: number }>();
let now: () => number = Date.now;

const keyOf = (p: string): string => {
  const r = path.resolve(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
};

/** Mémorise un chemin choisi par l'utilisateur dans une boîte de dialogue native */
export function authorizePath(filepath: unknown, access: PathAccess): void {
  if (typeof filepath !== 'string' || !filepath || !path.isAbsolute(filepath)) return;
  const t = now();
  for (const [k, v] of grants) if (v.expires <= t) grants.delete(k);
  while (grants.size >= AUTH_MAX_ENTRIES) {
    const oldest = grants.keys().next().value;
    if (oldest === undefined) break;
    grants.delete(oldest);
  }
  const k = keyOf(filepath);
  grants.delete(k);
  grants.set(k, { access, expires: t + AUTH_TTL_MS });
}

/** Vérifie qu'un chemin a été autorisé ; renvoie le chemin résolu ou lève une erreur */
export function assertAuthorizedPath(
  filepath: unknown,
  access: PathAccess,
  allowedExtensions?: readonly string[]
): string {
  if (typeof filepath !== 'string' || !filepath || !path.isAbsolute(filepath)) {
    throw new Error('Invalid file path');
  }
  if (filepath.includes('\0')) throw new Error('Invalid file path');
  const resolved = path.resolve(filepath);
  const grant = grants.get(keyOf(resolved));
  if (!grant || grant.expires <= now() || grant.access !== access) {
    throw new Error('Path not authorized: choose the file with a dialog');
  }
  const ext = path.extname(resolved).toLowerCase();
  if (access === 'write' && FORBIDDEN_WRITE_EXTENSIONS.has(ext)) {
    throw new Error(`Forbidden file extension: ${ext}`);
  }
  if (allowedExtensions && !allowedExtensions.includes(ext)) {
    throw new Error(`Unexpected file extension: ${ext || '(none)'}`);
  }
  try {
    if (fs.lstatSync(resolved).isSymbolicLink()) throw new Error('Symbolic links are not allowed');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  return resolved;
}

/** Test seulement */
export function _resetPathAuthorization(clock: () => number = Date.now): void {
  grants.clear();
  now = clock;
}

/** Nom d'entrée ZIP exploitable (pas de `..`, pas de chemin absolu, pas d'octet nul) */
export function isSafeZipEntryName(name: string): boolean {
  if (!name || name.includes('\0') || name.includes('\\')) return false;
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return false;
  return !name.split('/').some(seg => seg === '..');
}

interface ZipLike {
  files: Record<string, { dir: boolean; _data?: { uncompressedSize?: number } }>;
}

/** Contrôle le nombre d'entrées et les tailles déclarées ; renvoie les noms sûrs à traiter */
export function checkZipEntries(zip: ZipLike): string[] {
  const names = Object.keys(zip.files);
  if (names.length > ZIP_LIMITS.maxEntries) {
    throw new Error(
      `Archive trop volumineuse : ${names.length} entrées (max ${ZIP_LIMITS.maxEntries})`
    );
  }
  let total = 0;
  const safe: string[] = [];
  for (const name of names) {
    const entry = zip.files[name];
    if (entry.dir || !isSafeZipEntryName(name)) continue;
    const size = entry._data?.uncompressedSize ?? 0;
    if (size > ZIP_LIMITS.maxEntryBytes) {
      throw new Error(`Entrée trop volumineuse : ${name}`);
    }
    total += size;
    if (total > ZIP_LIMITS.maxTotalUncompressedBytes) {
      throw new Error('Archive trop volumineuse une fois décompressée');
    }
    safe.push(name);
  }
  return safe;
}

/** Lit un fichier ZIP en refusant les archives trop grosses (taille contrôlée avant lecture) */
export async function readBoundedFile(filepath: string): Promise<Buffer> {
  const st = await fs.promises.stat(filepath);
  if (st.size > ZIP_LIMITS.maxFileBytes) {
    throw new Error(`Fichier trop volumineux (max ${ZIP_LIMITS.maxFileBytes} octets)`);
  }
  return fs.promises.readFile(filepath);
}

const isStr = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max;

/** Valide la liste de tireurs d'un .bpf avant upsert : tableau borné d'objets à champs texte bornés */
export function validateImportedFencers(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data))
    throw new Error('Format .bpf invalide : fencers.json doit être un tableau');
  if (data.length > ZIP_LIMITS.maxFencers) {
    throw new Error(`Format .bpf invalide : trop de tireurs (max ${ZIP_LIMITS.maxFencers})`);
  }
  for (const f of data) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) {
      throw new Error('Format .bpf invalide : tireur mal formé');
    }
    const o = f as Record<string, unknown>;
    if (!isStr(o.lastName, 200) || !isStr(o.firstName, 200)) {
      throw new Error('Format .bpf invalide : nom/prénom manquant ou trop long');
    }
    for (const k of ['license', 'club', 'ligue', 'nation', 'email', 'phone']) {
      if (o[k] != null && !isStr(o[k], 500)) throw new Error(`Format .bpf invalide : champ ${k}`);
    }
    if (o.photo != null && !isStr(o.photo, 3 * 1024 * 1024)) {
      throw new Error('Format .bpf invalide : photo trop volumineuse');
    }
  }
  return data as Record<string, unknown>[];
}
