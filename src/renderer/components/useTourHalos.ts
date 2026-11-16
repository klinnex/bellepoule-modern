/**
 * BellePoule Modern - Halos pulsés des parcours guidés (compétition #1305, Mode Club #1872)
 * Licensed under GPL-3.0
 */
import { useEffect } from 'react';
import type { TourHalo } from './guidedTourFlags';

const HALO_CLASS = 'tour-halo';
const HALO_GREEN_CLASS = 'tour-halo-green';

/**
 * Entoure d'un halo pulsé les éléments de l'étape (suit les changements du DOM).
 * `halos` doit être stable (constante) : il sert de dépendance.
 */
export function useTourHalos(halos: readonly TourHalo[] | null): void {
  useEffect(() => {
    if (!halos || halos.length === 0) return;
    const marked = new Set<Element>();
    const apply = () => {
      const wanted = new Set<Element>();
      for (const h of halos) {
        const found = h.first
          ? [document.querySelector(h.selector)].filter((e): e is Element => e !== null)
          : Array.from(document.querySelectorAll(h.selector));
        for (const el of found) {
          wanted.add(el);
          if (!marked.has(el)) {
            el.classList.add(HALO_CLASS);
            if (h.green) el.classList.add(HALO_GREEN_CLASS);
            marked.add(el);
          }
        }
      }
      marked.forEach(el => {
        if (!wanted.has(el)) {
          el.classList.remove(HALO_CLASS, HALO_GREEN_CLASS);
          marked.delete(el);
        }
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      marked.forEach(el => el.classList.remove(HALO_CLASS, HALO_GREEN_CLASS));
    };
  }, [halos]);
}
