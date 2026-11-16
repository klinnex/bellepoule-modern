/**
 * BellePoule Modern - Réglages RGPD persistés côté main (#1882)
 * Fichier `<userData>/privacy-settings.json` : affichage des noms sur le réseau,
 * durées de conservation, action et purge automatique au démarrage.
 * Licensed under GPL-3.0
 */
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_PRIVACY_SETTINGS,
  type NameMasking,
  type PrivacySettings,
  type RetentionAction,
} from '../shared/types/privacy';

const FILE = 'privacy-settings.json';
const MASKINGS: readonly NameMasking[] = ['full', 'initial', 'initials'];
const ACTIONS: readonly RetentionAction[] = ['anonymize', 'delete'];
/** 50 ans : borne haute d'une durée de conservation */
const MAX_MONTHS = 600;

const months = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_MONTHS ? v : fallback;

/** Fusionne une saisie partielle (non fiable) dans `base` ; champs invalides ignorés */
export function sanitizePrivacySettings(
  input: unknown,
  base: PrivacySettings = DEFAULT_PRIVACY_SETTINGS
): PrivacySettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    nameMasking: MASKINGS.includes(raw.nameMasking as NameMasking)
      ? (raw.nameMasking as NameMasking)
      : base.nameMasking,
    competitionRetentionMonths: months(
      raw.competitionRetentionMonths,
      base.competitionRetentionMonths
    ),
    memberRetentionMonths: months(raw.memberRetentionMonths, base.memberRetentionMonths),
    retentionAction: ACTIONS.includes(raw.retentionAction as RetentionAction)
      ? (raw.retentionAction as RetentionAction)
      : base.retentionAction,
    autoPurge: typeof raw.autoPurge === 'boolean' ? raw.autoPurge : base.autoPurge,
  };
}

export function readPrivacySettings(userDataDir: string): PrivacySettings {
  try {
    return sanitizePrivacySettings(
      JSON.parse(fs.readFileSync(path.join(userDataDir, FILE), 'utf8'))
    );
  } catch {
    return { ...DEFAULT_PRIVACY_SETTINGS };
  }
}

export function writePrivacySettings(userDataDir: string, settings: PrivacySettings): void {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(userDataDir, FILE),
    JSON.stringify(sanitizePrivacySettings(settings), null, 2)
  );
}

/** Date limite ISO : `now` moins `months` mois ; null si conservation illimitée */
export function retentionCutoff(monthsCount: number, now: Date = new Date()): string | null {
  if (!monthsCount) return null;
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() - monthsCount);
  return d.toISOString();
}
