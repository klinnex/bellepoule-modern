/**
 * BellePoule Modern - Onglet Club de l'accueil (#1872), extrait d'App.tsx (#1897)
 * Onglet ouvert et club affiché mémorisés localement ; logo et nom du club relus à
 * chaque changement de vue.
 * Licensed under GPL-3.0
 */

import { useCallback, useEffect, useState } from 'react';

/** Onglet Club ouvert, mémorisé localement */
export const CLUB_TAB_KEY = 'bp_club_tab_open';
/** Club affiché dans l'onglet Club (plusieurs clubs possibles) */
export const CLUB_ACTIVE_KEY = 'bp_club_active';

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null): void => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* stockage indisponible : valeur non mémorisée */
  }
};

export function useClubTab(view: string) {
  const [clubTabOpen, setClubTabOpenState] = useState<boolean>(() => read(CLUB_TAB_KEY) === '1');
  const setClubTabOpen = useCallback((open: boolean) => {
    setClubTabOpenState(open);
    write(CLUB_TAB_KEY, open ? '1' : null);
  }, []);

  const [activeClubId, setActiveClubIdState] = useState<string | null>(() => read(CLUB_ACTIVE_KEY));
  const setActiveClubId = useCallback((id: string | null) => {
    setActiveClubIdState(id);
    write(CLUB_ACTIVE_KEY, id);
  }, []);

  // Club affiché : logo (remplace le bouclier) et nom de l'onglet
  const [activeClub, setActiveClub] = useState<{ name: string; logo?: string } | null>(null);
  useEffect(() => {
    const api = window.electronAPI?.club;
    if (!api || !activeClubId) {
      setActiveClub(null);
      return;
    }
    let alive = true;
    void api
      .getClub(activeClubId)
      .then(c => alive && setActiveClub(c ? { name: c.name, logo: c.logo } : null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [activeClubId, view]);

  return { clubTabOpen, setClubTabOpen, activeClubId, setActiveClubId, activeClub };
}
