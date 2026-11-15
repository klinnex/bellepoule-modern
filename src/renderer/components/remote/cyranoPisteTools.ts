/**
 * BellePoule Modern - Outils de la table des pistes Cyrano (#1829) : profils constructeur,
 * ajout de pistes en lot, import / export de la liste. Fonctions pures, testées.
 * Licensed under GPL-3.0
 */
import type { CyranoPisteConfigDTO } from '../../../shared/types/preload';

export const MAX_PISTES = 64;
const PROTOCOLS = ['EFP1', 'EFP1.1', 'auto'] as const;
const MODES = ['master', 'display', 'manual'] as const;
export const EXPORT_FORMAT = 'bellepoule-cyrano-pistes';

/** Profils constructeur : port d'écoute et protocole selon l'appareil (50100 ou 50101) */
export interface CyranoProfile {
  id: 'standard' | 'efp11';
  port: number;
  protocol: 'EFP1' | 'EFP1.1' | 'auto';
}

export const CYRANO_PROFILES: readonly CyranoProfile[] = [
  { id: 'standard', port: 50100, protocol: 'auto' },
  { id: 'efp11', port: 50101, protocol: 'EFP1.1' },
];

/**
 * Lot de pistes : numéros consécutifs à partir de `from`, piste n ↔ arène n, IP vide à saisir.
 * Les numéros déjà présents sont ignorés ; la liste ne dépasse jamais MAX_PISTES.
 */
export function buildBatch(
  profile: CyranoProfile,
  from: number,
  count: number,
  existing: CyranoPisteConfigDTO[]
): CyranoPisteConfigDTO[] {
  const taken = new Set(existing.map(p => p.piste));
  const room = Math.max(0, MAX_PISTES - existing.length);
  const out: CyranoPisteConfigDTO[] = [];
  for (let n = from; out.length < Math.min(count, room) && n < from + 1000; n++) {
    const piste = String(n);
    if (taken.has(piste)) continue;
    out.push({ piste, ip: '', port: profile.port, arena: n, protocol: profile.protocol });
  }
  return out;
}

/** Fichier d'export : liste et version du format */
export function exportPistes(pistes: CyranoPisteConfigDTO[]): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: 1, pistes }, null, 2);
}

export type PistesImportResult =
  | { ok: true; pistes: CyranoPisteConfigDTO[]; rejected: number }
  | { ok: false; error: 'invalid_json' | 'invalid_format' | 'empty' };

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Lecture d'un fichier d'export ; les lignes invalides sont écartées et comptées */
export function parsePistesImport(text: string): PistesImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { pistes?: unknown }).pistes)
      ? (data as { pistes: unknown[] }).pistes
      : null;
  if (!list) return { ok: false, error: 'invalid_format' };

  const pistes: CyranoPisteConfigDTO[] = [];
  const seen = new Set<string>();
  let rejected = 0;
  for (const raw of list) {
    const r = raw as Record<string, unknown>;
    const piste = typeof r?.piste === 'string' ? r.piste.trim() : '';
    const ok =
      piste.length > 0 &&
      piste.length <= 16 &&
      !seen.has(piste) &&
      typeof (r.ip ?? '') === 'string' &&
      (r.port === undefined || isInt(r.port, 1, 65535)) &&
      (r.arena === undefined || isInt(r.arena, 0, 999)) &&
      (r.protocol === undefined || (PROTOCOLS as readonly unknown[]).includes(r.protocol)) &&
      (r.mode === undefined || (MODES as readonly unknown[]).includes(r.mode));
    if (!ok || pistes.length >= MAX_PISTES) {
      rejected++;
      continue;
    }
    seen.add(piste);
    pistes.push({
      piste,
      ip: typeof r.ip === 'string' ? r.ip.trim() : '',
      ...(r.port !== undefined ? { port: r.port as number } : {}),
      ...(r.arena !== undefined ? { arena: r.arena as number } : {}),
      ...(r.protocol !== undefined
        ? { protocol: r.protocol as CyranoPisteConfigDTO['protocol'] }
        : {}),
      ...(r.mode !== undefined ? { mode: r.mode as CyranoPisteConfigDTO['mode'] } : {}),
    });
  }
  if (pistes.length === 0) return { ok: false, error: 'empty' };
  return { ok: true, pistes, rejected };
}
