/**
 * BellePoule Modern - Effets globaux de l'application, extraits d'App.tsx (#1897) :
 * chargement initial des compétitions (après db:ready), Ctrl+K, molette sur un champ
 * numérique, logo synchronisé pour les exports PDF.
 * Licensed under GPL-3.0
 */

import { useEffect, useRef } from 'react';
import { logger, LogCategory } from '@shared/services/logger';
import { useCompetitionEvent } from './useCompetitionEvent';

interface AppGlobalEffectsParams {
  loadCompetitions: () => unknown;
  toggleCommandPalette: () => void;
}

export function useAppGlobalEffects(params: AppGlobalEffectsParams): void {
  // Dernières fonctions lues au moment de l'événement (effets montés une seule fois)
  const ref = useRef(params);
  ref.current = params;

  // Épreuve créée hors de l'écran (agent MCP, #1880) : liste rechargée
  useCompetitionEvent('competitions:changed', undefined, () => ref.current.loadCompetitions());

  // Load competitions on mount — attendre db:ready si la fenêtre s'ouvre avant la DB
  useEffect(() => {
    if (window.electronAPI?.onDbReady) {
      // Si la DB n'est pas encore prête, attendre l'event puis charger
      let loaded = false;
      const tryLoad = () => {
        if (!loaded) {
          loaded = true;
          ref.current.loadCompetitions();
        }
      };
      window.electronAPI.onDbReady(tryLoad);
      // Charger quand même après 1s au cas où db:ready est déjà passé
      const fallback = setTimeout(tryLoad, 1000);
      return () => clearTimeout(fallback);
    } else {
      ref.current.loadCompetitions();
    }
  }, []);

  // Ctrl+K → command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        ref.current.toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Un scroll (trackpad macOS notamment) sur un input number focus ne doit pas
  // en changer la valeur (comportement natif Chromium trompeur, ex: score max)
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement &&
        target.type === 'number' &&
        document.activeElement === target
      ) {
        target.blur();
      }
    };
    document.addEventListener('wheel', handler, { passive: true, capture: true });
    return () => document.removeEventListener('wheel', handler, { capture: true });
  }, []);

  // Sync logo from disk to localStorage so PDF exports always find it
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI
      .getLogo?.()
      .then((logo: string | null) => {
        if (logo) localStorage.setItem('bellepoule-logo', logo);
        else localStorage.removeItem('bellepoule-logo');
      })
      .catch((err: unknown) => {
        logger.warn(
          LogCategory.UI,
          'Impossible de charger le logo',
          err instanceof Error ? err : undefined
        );
      });
    const unsub = window.electronAPI.onLogoLoaded?.((logo: string | null) => {
      if (logo) localStorage.setItem('bellepoule-logo', logo);
      else localStorage.removeItem('bellepoule-logo');
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);
}
