/**
 * BellePoule Modern - Réglages Cyrano mémorisés (#1720, #1829)
 * Table des pistes, port, interface d'écoute, options, démarrage automatique ;
 * démarrage du serveur depuis ces réglages (panneau ou séance de saisie distante).
 * Licensed under GPL-3.0
 */
import type { CyranoFrameLogDTO, CyranoPisteConfigDTO } from '../../../shared/types/preload';

export const PISTES_KEY = 'bellepoule-cyrano-pistes';
export const PORT_KEY = 'bellepoule-cyrano-port';
export const HOST_KEY = 'bellepoule-cyrano-host';
export const OPTIONS_KEY = 'bellepoule-cyrano-options';
export const AUTOSTART_KEY = 'bellepoule-cyrano-autostart';
export const DEFAULT_PORT = 50100;

export interface CyranoOptions {
  nameLength: 10 | 12 | 15 | 20;
  natSource: 'auto' | 'country' | 'club' | 'region';
  international: boolean;
}

export const DEFAULT_OPTIONS: CyranoOptions = {
  nameLength: 10,
  natSource: 'auto',
  international: false,
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible */
  }
}

export function readPistes(): CyranoPisteConfigDTO[] {
  try {
    const parsed = JSON.parse(read(PISTES_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as CyranoPisteConfigDTO[]) : [];
  } catch {
    return [];
  }
}
export const writePistes = (p: CyranoPisteConfigDTO[]) => write(PISTES_KEY, JSON.stringify(p));

export const readPort = (): number => parseInt(read(PORT_KEY) ?? '', 10) || DEFAULT_PORT;
export const writePort = (p: number) => write(PORT_KEY, String(p));

/** Interface d'écoute : adresse IP locale, vide = toutes les interfaces */
export const readHost = (): string => read(HOST_KEY) ?? '';
export const writeHost = (h: string) => write(HOST_KEY, h);

export function readOptions(): CyranoOptions {
  try {
    return { ...DEFAULT_OPTIONS, ...(JSON.parse(read(OPTIONS_KEY) ?? '{}') as object) };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}
export const writeOptions = (o: CyranoOptions) => write(OPTIONS_KEY, JSON.stringify(o));

/** Démarrage automatique avec la séance de saisie distante */
export const readAutoStart = (): boolean => read(AUTOSTART_KEY) === 'true';
export const writeAutoStart = (v: boolean) => write(AUTOSTART_KEY, String(v));

/** Pistes complètes (identifiant + IP) envoyées au serveur */
export const usablePistes = (p: CyranoPisteConfigDTO[]) => p.filter(r => r.piste && r.ip);

/**
 * Démarre le serveur Cyrano avec les réglages mémorisés : port, interface, pistes, options.
 * Déjà démarré : pistes et options renvoyées quand même.
 */
export async function startCyranoFromSaved(): Promise<{ success: boolean; error?: string }> {
  const api = window.electronAPI?.cyrano;
  if (!api) return { success: false, error: 'electronAPI.cyrano indisponible' };
  const res = await api.start({ port: readPort(), host: readHost() });
  if (!res.success) return { success: false, error: res.error ?? 'start_failed' };
  await api.setPistes(usablePistes(readPistes()));
  await api.setOptions(readOptions());
  return { success: true };
}

/** Démarrage automatique (#1829) : seulement si activé et au moins une piste déclarée */
export async function autoStartCyrano(): Promise<boolean> {
  if (!readAutoStart() || usablePistes(readPistes()).length === 0) return false;
  try {
    return (await startCyranoFromSaved()).success;
  } catch {
    return false;
  }
}

/**
 * Journal des trames en texte : une trame par ligne,
 * `horodatage ISO <TAB> sens <TAB> ip:port <TAB> piste <TAB> trame [<TAB> rejet]`.
 * La trame brute reste en dernière colonne utile, pour être rejouée.
 */
export function formatCyranoLog(entries: CyranoFrameLogDTO[]): string {
  return entries
    .map(e =>
      [
        new Date(e.ts).toISOString(),
        e.dir === 'in' ? 'IN' : 'OUT',
        `${e.ip}:${e.port}`,
        e.piste ?? '-',
        e.raw.replace(/[\r\n]+/g, ''),
        ...(e.rejected ? [e.rejected] : []),
      ].join('\t')
    )
    .join('\n');
}
