/**
 * BellePoule Modern - Densité d'affichage (#1541) : attribut data-density sur <html>
 * (tokens.css), persistée en local. Trois niveaux : confort, standard, compact.
 * Licensed under GPL-3.0
 */

export const UI_DENSITY_STORAGE_KEY = 'bellepoule-ui-density';
export const UI_DENSITIES = ['comfortable', 'standard', 'compact'] as const;
export type UiDensity = (typeof UI_DENSITIES)[number];

export function normalizeUiDensity(value: unknown): UiDensity {
  return (UI_DENSITIES as readonly unknown[]).includes(value) ? (value as UiDensity) : 'standard';
}

export function loadUiDensity(): UiDensity {
  try {
    return normalizeUiDensity(localStorage.getItem(UI_DENSITY_STORAGE_KEY));
  } catch {
    return 'standard';
  }
}

export function applyUiDensity(
  density: UiDensity,
  root: HTMLElement = document.documentElement
): void {
  root.setAttribute('data-density', density);
}

export function saveUiDensity(density: UiDensity): void {
  applyUiDensity(density);
  try {
    localStorage.setItem(UI_DENSITY_STORAGE_KEY, density);
  } catch {
    /* stockage indisponible : réglage limité à la session */
  }
}
