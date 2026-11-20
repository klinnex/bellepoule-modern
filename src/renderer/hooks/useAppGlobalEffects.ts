/**
 * BellePoule Modern - Effets globaux de l'application, extraits d'App.tsx (#1897) :
 * chargement initial des compétitions (après db:ready), Ctrl+K, molette sur un champ
 * numérique, logo synchronisé pour les exports PDF.
 * Licensed under GPL-3.0
 */

import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { logger, LogCategory } from '@shared/services/logger';
import type { Competition } from '../../shared/types';
import { installAppSettingsMirror } from '../services/appSettingsMirror';
import type { OpenCompetition } from './useAppState';

interface AppGlobalEffectsParams {
  loadCompetitions: () => unknown;
  toggleCommandPalette: () => void;
  /** Épreuves ouvertes : rechargées après un changement hors écran (MCP, #1880) */
  setCurrentCompetition?: Dispatch<SetStateAction<Competition | null>>;
  setOpenCompetitions?: Dispatch<SetStateAction<OpenCompetition[]>>;
}

export function useAppGlobalEffects(params: AppGlobalEffectsParams): void {
  // Dernières fonctions lues au moment de l'événement (effets montés une seule fois)
  const ref = useRef(params);
  ref.current = params;

  // Écriture hors de l'écran (agent MCP, #1880) : liste rechargée ; une épreuve ouverte dont
  // les réglages ont changé reprend la version en base (sinon l'écran régénérerait par
  // exemple le tableau avec l'ancien choix de petite finale)
  useEffect(() => {
    const subscribe = window.electronAPI?.onCompetitionEvent;
    if (!subscribe) return;
    return subscribe(event => {
      if (event.type !== 'competitions:changed') return;
      void ref.current.loadCompetitions();
      const id = event.competitionId;
      if (!id) return;
      void window.electronAPI.db.getCompetition(id).then(fresh => {
        if (!fresh) return;
        const merge = (c: Competition): Competition =>
          c.id === id ? { ...c, ...fresh, fencers: c.fencers, referees: c.referees } : c;
        ref.current.setCurrentCompetition?.(prev => (prev ? merge(prev) : prev));
        ref.current.setOpenCompetitions?.(prev =>
          prev.map(o => (o.competition.id === id ? { ...o, competition: merge(o.competition) } : o))
        );
      });
    });
  }, []);

  // Load competitions on mount — attendre db:ready si la fenêtre s'ouvre avant la DB
  useEffect(() => {
    if (window.electronAPI?.onDbReady) {
      // Si la DB n'est pas encore prête, attendre l'event puis charger
      let loaded = false;
      const tryLoad = () => {
        if (!loaded) {
          loaded = true;
          ref.current.loadCompetitions();
          // Réglages du poste repris en base (#1880) : lisibles en --headless et par le MCP
          installAppSettingsMirror();
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
