/**
 * BellePoule Modern - Bibliothèque de logos (plusieurs logos, un seul actif)
 * Le logo actif reste stocké sous `bellepoule-logo` (+ logo.dat côté main) :
 * PDF, kiosque et écrans distants n'ont pas à connaître la bibliothèque.
 * Licensed under GPL-3.0
 */

export const LOGO_STORAGE_KEY = 'bellepoule-logo';
export const LOGO_LIBRARY_KEY = 'bellepoule-logos';
export const LOGO_LIBRARY_MAX = 20;

export interface LogoEntry {
  id: string;
  name: string;
  data: string;
}

function isLogoEntry(v: unknown): v is LogoEntry {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.name === 'string' &&
    typeof e.data === 'string' &&
    e.data.startsWith('data:image/')
  );
}

/** Filtre une valeur inconnue (JSON parsé) en liste de logos valides, sans doublon d'id. */
export function sanitizeLogoLibrary(raw: unknown): LogoEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LogoEntry[] = [];
  for (const v of raw) {
    if (!isLogoEntry(v) || seen.has(v.id)) continue;
    seen.add(v.id);
    out.push({ id: v.id, name: v.name.slice(0, 80), data: v.data });
    if (out.length >= LOGO_LIBRARY_MAX) break;
  }
  return out;
}

export function loadLogoLibrary(): LogoEntry[] {
  try {
    const raw = localStorage.getItem(LOGO_LIBRARY_KEY);
    return raw ? sanitizeLogoLibrary(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveLogoLibraryLocal(list: LogoEntry[]): void {
  try {
    localStorage.setItem(LOGO_LIBRARY_KEY, JSON.stringify(list));
  } catch {
    /* quota dépassé : la copie disque (logos.json) reste la référence */
  }
}

export function newLogoId(): string {
  return `logo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Nom par défaut à partir du nom de fichier (sans extension). */
export function logoNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  return (base || 'Logo').slice(0, 80);
}

/** Ajoute le logo actif hérité (avant bibliothèque) s'il n'y figure pas. */
export function ensureActiveInLibrary(
  list: LogoEntry[],
  active: string | null,
  defaultName = 'Logo'
): LogoEntry[] {
  if (!active || list.some(l => l.data === active)) return list;
  if (list.length >= LOGO_LIBRARY_MAX) return list;
  return [{ id: newLogoId(), name: defaultName, data: active }, ...list];
}

export function addLogo(list: LogoEntry[], entry: LogoEntry): LogoEntry[] {
  if (list.length >= LOGO_LIBRARY_MAX) return list;
  return [...list, entry];
}

export function renameLogo(list: LogoEntry[], id: string, name: string): LogoEntry[] {
  const clean = name.trim().slice(0, 80);
  if (!clean) return list;
  return list.map(l => (l.id === id ? { ...l, name: clean } : l));
}

/**
 * Supprime un logo. Si c'était le logo actif, renvoie le prochain actif
 * (premier logo restant ou null) ; sinon `nextActive` = actif inchangé.
 */
export function removeLogo(
  list: LogoEntry[],
  id: string,
  active: string | null
): { list: LogoEntry[]; nextActive: string | null } {
  const target = list.find(l => l.id === id);
  const next = list.filter(l => l.id !== id);
  if (target && target.data === active) {
    return { list: next, nextActive: next[0]?.data ?? null };
  }
  return { list: next, nextActive: active };
}
