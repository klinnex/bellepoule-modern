/**
 * BellePoule Modern - Édition des pistes d'une salle (#1880) : libellé et appareil Cyrano
 * (adresse IPv4, port, mode). Fonctions pures, utilisées par VenueStripsEditor.
 * Licensed under GPL-3.0
 */
import type { VenueStrip } from '../../shared/types/appSettings';

export type StripMode = 'master' | 'display' | 'manual';
export const STRIP_MODES: readonly StripMode[] = ['master', 'display', 'manual'];

/** Même plafond que l'enregistrement côté main (libellé de piste) */
export const MAX_STRIP_LABEL = 40;

/** Saisie d'une piste : champs texte tels que tapés */
export interface StripEdit {
  label: string;
  ip: string;
  port: string;
  mode: StripMode;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export const isIpv4 = (value: string): boolean => IPV4.test(value.trim());

/** Port facultatif : vide ou entier 1…65535 */
export const isValidPort = (value: string): boolean => {
  const v = value.trim();
  if (!v) return true;
  const n = Number(v);
  return /^\d+$/.test(v) && n >= 1 && n <= 65535;
};

const isMode = (v: unknown): v is StripMode => STRIP_MODES.includes(v as StripMode);

/** Saisie initiale d'une piste existante */
export function stripToEdit(strip: VenueStrip): StripEdit {
  const cfg = strip.cyranoConfig;
  const ip = typeof cfg?.ip === 'string' ? cfg.ip : '';
  const port = typeof cfg?.port === 'number' ? String(cfg.port) : '';
  const mode = isMode(cfg?.mode) ? cfg.mode : 'master';
  return { label: strip.label ?? '', ip, port, mode };
}

/** Une adresse est facultative (pas d'appareil) ; si elle est saisie, IPv4 obligatoire */
export function stripEditError(edit: StripEdit): boolean {
  return (edit.ip.trim() !== '' && !isIpv4(edit.ip)) || !isValidPort(edit.port);
}

/**
 * Applique les saisies aux pistes : seules les pistes modifiées changent, les autres champs
 * de l'appareil (arène, protocole…) sont conservés ; sans adresse IP, l'appareil est retiré.
 */
export function applyStripEdits(
  strips: VenueStrip[],
  edits: Record<number, StripEdit>
): VenueStrip[] {
  return strips.map(strip => {
    const edit = edits[strip.number];
    if (!edit) return strip;
    const { label: _label, cyranoConfig: previous, ...rest } = strip;
    const label = edit.label.trim().slice(0, MAX_STRIP_LABEL);
    const ip = edit.ip.trim();
    const next: VenueStrip = { ...rest, ...(label ? { label } : {}) };
    if (!ip) return next;
    const port = edit.port.trim();
    const { port: _port, ...others } = previous ?? {};
    return {
      ...next,
      cyranoConfig: {
        ...others,
        ip,
        ...(port ? { port: Number(port) } : {}),
        mode: edit.mode,
      },
    };
  });
}
