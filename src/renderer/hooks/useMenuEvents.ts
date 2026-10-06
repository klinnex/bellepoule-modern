/**
 * BellePoule Modern - Menu Events Hook
 * Gestion des événements IPC du menu
 * Licensed under GPL-3.0
 */

import { useEffect, useCallback } from 'react';
import { PoolRanking } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { FinalResult } from '../components/tableau/tableauTypes';

type Phase =
  | 'checkin'
  | 'poolprep'
  | 'pools'
  | 'ranking'
  | 'quest'
  | 'tableau'
  | 'results'
  | 'remote'
  | 'logs'
  | 'referees';

interface UseMenuEventsProps {
  currentPhase: Phase;
  onShowProperties: () => void;
  onShowAddFencer: () => void;
  onExportFencers: (format: 'txt' | 'fff') => void;
  onExportFencersBpf: () => void;
  onExportPhotos: () => void;
  onExportRanking: (format: 'csv' | 'json') => void;
  onExportResults: (format: 'csv' | 'json') => void;
  onImport: (format: string, filepath: string, content: string) => void;
  onNextPhase: () => void;
  loadFencers: () => void;
  hasPools: boolean;
  overallRanking: PoolRanking[];
  finalResults: FinalResult[];
  isLaserSabre: boolean;
}

export const useMenuEvents = ({
  currentPhase,
  onShowProperties,
  onShowAddFencer,
  onExportFencers,
  onExportFencersBpf,
  onExportPhotos,
  onExportRanking,
  onExportResults,
  onImport,
  onNextPhase,
  loadFencers,
  hasPools,
  overallRanking,
  finalResults,
  isLaserSabre,
}: UseMenuEventsProps) => {
  // Gestionnaire d'export selon la phase
  const handleExport = useCallback(
    (format: string) => {
      // Export des tireurs disponible depuis toutes les phases
      if (format === 'fencers-txt') {
        onExportFencers('txt');
        return;
      }
      if (format === 'fencers-fff') {
        onExportFencers('fff');
        return;
      }
      if (format === 'fencers-bpf') {
        onExportFencersBpf();
        return;
      }
      if (format === 'photos') {
        onExportPhotos();
        return;
      }

      switch (currentPhase) {
        case 'ranking':
          // Export du classement après poules
          if (hasPools && overallRanking.length > 0) {
            if (format === 'csv') {
              onExportRanking('csv');
            } else if (format === 'json') {
              onExportRanking('json');
            }
          }
          break;
        case 'results':
          // Export des résultats finaux
          if (finalResults.length > 0) {
            if (format === 'csv') {
              onExportResults('csv');
            } else if (format === 'json') {
              onExportResults('json');
            }
          }
          break;
        default:
          logger.warn(LogCategory.UI, `Export ${format} non disponible en phase ${currentPhase}`);
      }
    },
    [
      currentPhase,
      hasPools,
      overallRanking,
      finalResults,
      onExportFencers,
      onExportFencersBpf,
      onExportPhotos,
      onExportRanking,
      onExportResults,
    ]
  );

  useEffect(() => {
    if (!window.electronAPI) return;

    // Enregistrer les listeners
    const removeListeners: (() => void)[] = [];

    if (window.electronAPI.onMenuCompetitionProperties) {
      window.electronAPI.onMenuCompetitionProperties(onShowProperties);
    }

    if (window.electronAPI.onMenuImport) {
      window.electronAPI.onMenuImport(onImport);
    }

    if (window.electronAPI.onMenuExport) {
      window.electronAPI.onMenuExport(handleExport);
    }

    if (window.electronAPI.onFileOpened) {
      window.electronAPI.onFileOpened(async (filepath: string) => {
        logger.debug(LogCategory.UI, 'Fichier ouvert', { filepath });
        await loadFencers();
      });
    }

    if (window.electronAPI.onMenuAddFencer) {
      window.electronAPI.onMenuAddFencer(onShowAddFencer);
    }

    if (window.electronAPI.onMenuNextPhase) {
      window.electronAPI.onMenuNextPhase(onNextPhase);
    }

    // Cleanup function
    return () => {
      if (window.electronAPI?.removeAllListeners) {
        window.electronAPI.removeAllListeners('menu:competition-properties');
        window.electronAPI.removeAllListeners('menu:import');
        window.electronAPI.removeAllListeners('menu:export');
        window.electronAPI.removeAllListeners('file:opened');
        window.electronAPI.removeAllListeners('menu:add-fencer');
        window.electronAPI.removeAllListeners('menu:next-phase');
      }
    };
  }, [onShowProperties, onImport, handleExport, loadFencers, onShowAddFencer, onNextPhase]);

  return {
    handleExport,
  };
};

export default useMenuEvents;
