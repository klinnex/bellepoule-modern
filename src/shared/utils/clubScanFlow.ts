/**
 * BellePoule Modern - Mode Club (#1872) : lancement d'un combat par scan webcam.
 * Séquence : QR de la piste (`BPC1:A:n`) puis cartes des deux tireurs (`BPC1:M:code`),
 * dans n'importe quel ordre. Logique pure : la vue résout les codes en membres.
 * Licensed under GPL-3.0
 */

export interface ScanState {
  strip: number | null;
  memberIds: string[];
}

export type ScanInput = { kind: 'arena'; number: number } | { kind: 'member'; id: string };

export type ScanError = 'strip_unknown' | 'same_member';

export interface ScanResult {
  state: ScanState;
  /** Piste + 2 tireurs : le combat peut être lancé */
  complete: boolean;
  error?: ScanError;
}

export const EMPTY_SCAN: ScanState = { strip: null, memberIds: [] };

export function applyScan(state: ScanState, input: ScanInput, stripCount: number): ScanResult {
  let next: ScanState;
  if (input.kind === 'arena') {
    if (input.number < 1 || input.number > stripCount) {
      return { state, complete: false, error: 'strip_unknown' };
    }
    next = { ...state, strip: input.number };
  } else {
    if (state.memberIds.includes(input.id)) {
      return { state, complete: false, error: 'same_member' };
    }
    // Troisième carte : remplace le second tireur (erreur de scan corrigée)
    const ids =
      state.memberIds.length < 2 ? [...state.memberIds, input.id] : [state.memberIds[0], input.id];
    next = { ...state, memberIds: ids };
  }
  return { state: next, complete: next.strip !== null && next.memberIds.length === 2 };
}

/** Évite de traiter en boucle le même QR resté devant la caméra */
export function isRepeatScan(
  last: { text: string; at: number } | null,
  text: string,
  now: number,
  delayMs = 2500
): boolean {
  return !!last && last.text === text && now - last.at < delayMs;
}
