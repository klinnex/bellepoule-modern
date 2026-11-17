/**
 * BellePoule Modern - Événements du menu natif et des fichiers pour l'App (#1897)
 * Extrait d'App.tsx : un seul abonnement au montage, désabonnement ciblé (#1894).
 * Les handlers sont lus via une ref : toujours la dernière version, sans réabonnement.
 * Licensed under GPL-3.0
 */

import { useEffect, useRef } from 'react';
import { logger, LogCategory } from '@shared/services/logger';
import type { ToastType } from '../components/Toast';

export interface AppMenuHandlers {
  onNewCompetition: () => void;
  onReportIssue: () => void;
  onAbout: () => void;
  onOpenSettings: () => void;
  /** Recharge la liste des compétitions (après ouverture d'un .bpm) */
  reloadCompetitions: () => Promise<void> | void;
  /** Ouvre une compétition importée avec son état sauvegardé (#1117) */
  openImportedCompetition: (competitionId: string) => Promise<void> | void;
  showToast: (message: string, type?: ToastType) => void;
}

export function useAppMenuHandlers(handlers: AppMenuHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const h = () => ref.current;
    const unsubscribers: Array<(() => void) | void> = [
      api.onMenuNewCompetition(() => h().onNewCompetition()),
      api.onMenuReportIssue(() => h().onReportIssue()),
      api.onShowAbout(() => h().onAbout()),
      api.onFileOpened(async (filepath: string, competitionIds?: string[]) => {
        logger.debug(LogCategory.UI, 'Fichier .BPM ouvert', { filepath, competitionIds });
        await h().reloadCompetitions();
        if (competitionIds?.length) {
          h().showToast(
            competitionIds.length === 1
              ? 'Compétition importée'
              : `${competitionIds.length} compétitions importées`,
            'success'
          );
        }
        // Une seule compétition : l'ouvrir avec son état sauvegardé (#1117)
        if (competitionIds?.length === 1) await h().openImportedCompetition(competitionIds[0]);
      }),
      api.onFileSaved(async (filepath: string) => {
        logger.debug(LogCategory.UI, 'Fichier sauvegardé', { filepath });
      }),
      api.onMenuSave(() => h().showToast('Sauvegarde effectuée', 'success')),
      api.onMenuOpenSettings(() => h().onOpenSettings()),
      api.onAutosaveCompleted(() => logger.debug(LogCategory.UI, 'Autosave OK')),
      api.onAutosaveFailed(() => h().showToast('Échec de la sauvegarde automatique', 'error')),
    ];
    return () => {
      for (const off of unsubscribers) if (typeof off === 'function') off();
    };
  }, []);
}
