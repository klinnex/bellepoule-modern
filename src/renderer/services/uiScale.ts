/**
 * BellePoule Modern - Taille du texte de l'interface (#1156) : variable CSS --ui-scale
 * (tokens.css), persistée en local. Les tailles en rem suivent l'échelle.
 * Licensed under GPL-3.0
 */

export const UI_SCALE_STORAGE_KEY = 'bellepoule-ui-scale';
export const UI_SCALES = [0.9, 1, 1.15, 1.3] as const;
export type UiScale = (typeof UI_SCALES)[number];

export function normalizeUiScale(value: unknown): UiScale {
  const n = typeof value === 'string' ? Number(value) : value;
  return (UI_SCALES as readonly unknown[]).includes(n) ? (n as UiScale) : 1;
}

export function loadUiScale(): UiScale {
  try {
    return normalizeUiScale(localStorage.getItem(UI_SCALE_STORAGE_KEY));
  } catch {
    return 1;
  }
}

export function applyUiScale(scale: UiScale, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--ui-scale', String(scale));
}

export function saveUiScale(scale: UiScale): void {
  applyUiScale(scale);
  try {
    localStorage.setItem(UI_SCALE_STORAGE_KEY, String(scale));
  } catch {
    /* stockage indisponible : réglage limité à la session */
  }
}
