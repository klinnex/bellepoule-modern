/**
 * BellePoule Modern - useAutoFitHeight
 * Agrandit une modale redimensionnable quand son contenu déborde
 * (ex. égalité à départager, panneau abandon/forfait) (#1826).
 * Ne réduit jamais la taille choisie par l'utilisateur.
 * Licensed under GPL-3.0
 */

import { useLayoutEffect } from 'react';

/** Agrandit l'élément jusqu'à la hauteur de son contenu (plafond : 90 % de la fenêtre) */
export function fitHeightToContent(el: HTMLElement): void {
  const overflow = el.scrollHeight - el.clientHeight;
  if (overflow <= 1) return;
  const max = Math.floor(window.innerHeight * 0.9);
  const target = Math.min(el.offsetHeight + overflow, max);
  if (target > el.offsetHeight) el.style.height = `${target}px`;
}

export function useAutoFitHeight(ref: React.RefObject<HTMLElement | null>, active: boolean): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    fitHeightToContent(el);
    const observer = new MutationObserver(() => fitHeightToContent(el));
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [ref, active]);
}
