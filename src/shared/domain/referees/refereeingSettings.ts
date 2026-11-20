/**
 * BellePoule Modern - Réglages d'affectation des arbitres d'une épreuve (docs/adr/0014)
 * Résolution des valeurs par défaut et fusion d'une modification : une seule règle pour
 * l'écran, le moteur et le MCP.
 * Licensed under GPL-3.0
 */
import type { RefereeingSettings } from '../../types';
import { DEFAULT_NEUTRALITY, type NeutralityRules } from './refereeMatching';

export interface ResolvedRefereeing {
  neutrality: NeutralityRules;
  balance: boolean;
  maxConsecutiveMatches: number;
  minRestTimeMinutes: number;
}

export const DEFAULT_REFEREEING: ResolvedRefereeing = {
  neutrality: DEFAULT_NEUTRALITY,
  balance: true,
  maxConsecutiveMatches: 3,
  minRestTimeMinutes: 15,
};

/** Réglages effectifs : enregistrés, sinon défauts */
export function resolveRefereeing(settings?: RefereeingSettings | null): ResolvedRefereeing {
  return {
    neutrality: { ...DEFAULT_REFEREEING.neutrality, ...(settings?.neutrality ?? {}) },
    balance: settings?.balance ?? DEFAULT_REFEREEING.balance,
    maxConsecutiveMatches:
      settings?.maxConsecutiveMatches ?? DEFAULT_REFEREEING.maxConsecutiveMatches,
    minRestTimeMinutes: settings?.minRestTimeMinutes ?? DEFAULT_REFEREEING.minRestTimeMinutes,
  };
}

/** Fusion d'une modification partielle (neutralité champ par champ) */
export function mergeRefereeing(
  current: RefereeingSettings | null | undefined,
  patch: RefereeingSettings
): RefereeingSettings {
  const out: RefereeingSettings = { ...(current ?? {}) };
  if (patch.neutrality) out.neutrality = { ...(current?.neutrality ?? {}), ...patch.neutrality };
  if (patch.balance !== undefined) out.balance = patch.balance;
  if (patch.maxConsecutiveMatches !== undefined)
    out.maxConsecutiveMatches = patch.maxConsecutiveMatches;
  if (patch.minRestTimeMinutes !== undefined) out.minRestTimeMinutes = patch.minRestTimeMinutes;
  return out;
}
