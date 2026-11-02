/**
 * BellePoule Modern - Thèmes d'affichage des arènes et du kiosque (#1241)
 * Sort de RemoteScoreManager l'état des thèmes (globaux, par arène, par type d'écran)
 * et leurs actions : persistance côté serveur distant et thèmes sauvegardés.
 * Licensed under GPL-3.0
 */
import { useCallback, useEffect } from 'react';
import { useStateGroup } from '../../hooks/useStateGroup';
import type { CustomTheme, DisplayTheme } from '../../../shared/types/remote';

interface UseArenaThemesOptions {
  competitionId: string;
  /** Session distante active : les changements sont alors poussés au serveur */
  hasSession: boolean;
}

export function useArenaThemes({ competitionId, hasSession }: UseArenaThemesOptions) {
  // Thèmes, kiosque et éditeur de thème regroupés (#1241)
  const themeState = useStateGroup({
    displayTheme: 'dark' as 'dark' | 'light' | 'neon' | 'unicorn',
    arenaWallpaper: null as string | null,
    kioskViews: {
      poules: true,
      classement: true,
      direct: true,
      suivants: true,
    },
    arenaThemes: {} as Record<
      string,
      {
        theme: DisplayTheme;
        customTheme?: CustomTheme;
        screenThemes: Partial<Record<'public' | 'referee' | 'pool', CustomTheme>>;
      }
    >,
    arenaScreenTab: {} as Record<string, 'arena' | 'public' | 'referee' | 'pool'>,
    themeEditorTarget: null as string | null,
    themeEditorScreenType: 'arena' as 'arena' | 'public' | 'referee' | 'pool',
    showArenaQrModal: false,
    savedThemes: [] as CustomTheme[],
    globalThemeSection: 'arena' as 'arena' | 'kiosk' | 'public' | 'referee' | 'pool',
    globalThemeId: '',
  });
  const { setArenaThemes, setSavedThemes } = themeState;

  // Appliquer un thème (prédéfini ou custom) à une arène — affichage principal
  const handleArenaThemeChange = useCallback(
    async (arenaId: string, theme: DisplayTheme, customTheme?: CustomTheme) => {
      setArenaThemes(prev => ({
        ...prev,
        [arenaId]: { ...(prev[arenaId] ?? { screenThemes: {} }), theme, customTheme },
      }));
      if (hasSession) {
        await window.electronAPI.remote.updateArenaTheme(
          competitionId,
          arenaId,
          theme,
          customTheme
        );
      }
    },
    [hasSession]
  );

  // Appliquer un thème custom à un type d'écran spécifique d'une arène
  const handleArenaScreenThemeChange = useCallback(
    async (
      arenaId: string,
      screenType: 'public' | 'referee' | 'pool',
      customTheme?: CustomTheme
    ) => {
      setArenaThemes(prev => {
        const existing = prev[arenaId] ?? { theme: 'dark' as DisplayTheme, screenThemes: {} };
        return {
          ...prev,
          [arenaId]: {
            ...existing,
            screenThemes: { ...existing.screenThemes, [screenType]: customTheme },
          },
        };
      });
      if (hasSession) {
        await window.electronAPI.remote.updateArenaScreenTheme(
          competitionId,
          arenaId,
          screenType,
          customTheme
        );
      }
    },
    [hasSession]
  );

  // Supprimer le verrou de thème d'une arène (retour au thème global)
  const handleClearArenaThemeOverride = useCallback(
    async (arenaId: string) => {
      setArenaThemes(prev => {
        const next = { ...prev };
        delete next[arenaId];
        return next;
      });
      if (hasSession) {
        await window.electronAPI.remote.clearArenaThemeOverride(competitionId, arenaId);
      }
    },
    [hasSession, competitionId]
  );

  // Supprimer le verrou de thème d'écran d'une arène
  const handleClearArenaScreenTheme = useCallback(
    async (arenaId: string, screenType: 'public' | 'referee' | 'pool') => {
      await handleArenaScreenThemeChange(arenaId, screenType, undefined);
    },
    [handleArenaScreenThemeChange]
  );

  // Charger tous les thèmes depuis l'app (+ migration one-shot depuis localStorage)
  const refreshSavedThemes = useCallback(() => {
    window.electronAPI.themes
      .list()
      .then(setSavedThemes)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const MIGRATION_KEY = 'bp-themes-migrated-v1';
    if (!localStorage.getItem(MIGRATION_KEY)) {
      try {
        const raw = localStorage.getItem('bellepoule-custom-themes');
        if (raw) {
          const old: CustomTheme[] = JSON.parse(raw);
          Promise.all(
            old.map(t =>
              window.electronAPI.themes.save({ ...t, targetType: t.targetType ?? 'arena' })
            )
          )
            .then(() => {
              localStorage.setItem(MIGRATION_KEY, '1');
              refreshSavedThemes();
            })
            .catch(() => {});
        } else {
          localStorage.setItem(MIGRATION_KEY, '1');
        }
      } catch {
        localStorage.setItem(MIGRATION_KEY, '1');
      }
    }
    refreshSavedThemes();
  }, [refreshSavedThemes]);

  return {
    ...themeState,
    handleArenaThemeChange,
    handleArenaScreenThemeChange,
    handleClearArenaThemeOverride,
    handleClearArenaScreenTheme,
    refreshSavedThemes,
  };
}
