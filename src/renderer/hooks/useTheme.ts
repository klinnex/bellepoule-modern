/**
 * BellePoule Modern - Theme Hook
 * Licensed under GPL-3.0
 */

import { useState, useEffect, useCallback } from 'react';
import { logger, LogCategory } from '@shared/services/logger';

export type Theme = 'light' | 'dark' | 'default';

const applyTheme = (theme: Theme) => {
  document.body.classList.remove('theme-dark', 'theme-light', 'theme-default');

  if (theme !== 'default') {
    document.body.classList.add(`theme-${theme}`);
  }

  logger.debug(LogCategory.UI, `Applied theme: ${theme}`);
};

export const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>('default');

  useEffect(() => {
    const savedTheme = localStorage.getItem('bellepoule-theme') as Theme;
    const initialTheme = savedTheme || 'default';
    setThemeState(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    localStorage.setItem('bellepoule-theme', newTheme);
    logger.debug(LogCategory.UI, `Theme changed to ${newTheme}`);
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  }, [theme, setTheme]);

  const isDark = theme === 'dark';
  const isLight =
    theme === 'light' ||
    (theme === 'default' && !window.matchMedia('(prefers-color-scheme: dark)').matches);

  return {
    theme,
    setTheme,
    toggleTheme,
    isDark,
    isLight,
    availableThemes: [
      { code: 'default' as const, name: 'Système' },
      { code: 'light' as const, name: 'Clair' },
      { code: 'dark' as const, name: 'Sombre' },
    ],
  };
};
