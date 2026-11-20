/**
 * BellePoule Modern - Thème du mode entraînement (#1500) : un seul choix appliqué à
 * tous les écrans (piste, kiosk, tablette d'arbitre ; le lobby lit `trainingTheme`).
 * Licensed under GPL-3.0
 */
import type { Arena, CustomTheme, DisplayTheme, ThemeTargetType } from '../../shared/types/remote';
import { resolveTrainingTheme, type TrainingTheme } from '../../shared/utils/trainingThemes';

/** Partie publique du serveur distant utilisée ici. */
export interface TrainingThemeHost {
  trainingTheme: string;
  getAllArenas(): Arena[];
  updateTheme(theme: DisplayTheme): void;
  updateArenaTheme(arenaId: string, theme: DisplayTheme, customTheme?: CustomTheme): void;
  clearArenaThemeOverride(arenaId: string): void;
  updateArenaScreenTheme(
    arenaId: string,
    targetType: ThemeTargetType,
    customTheme?: CustomTheme
  ): void;
  updateKioskTheme(variables: Record<string, string>): void;
}

export function applyTrainingTheme(server: TrainingThemeHost, theme: TrainingTheme): void {
  const targets = resolveTrainingTheme(theme);
  server.trainingTheme = theme;
  server.updateTheme(targets.arena.theme === 'custom' ? 'dark' : targets.arena.theme);
  for (const arena of server.getAllArenas()) {
    if (targets.arena.customTheme) {
      server.updateArenaTheme(arena.id, 'custom', targets.arena.customTheme);
    } else {
      server.clearArenaThemeOverride(arena.id);
    }
    server.updateArenaScreenTheme(arena.id, 'referee', targets.referee);
  }
  server.updateKioskTheme(targets.kiosk);
}
