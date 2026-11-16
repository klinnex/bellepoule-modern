/**
 * BellePoule Modern - Menu Events Hook
 * Gestion des événements IPC du menu
 * Licensed under GPL-3.0
 */

import { useEffect, useCallback } from 'react';
import { PoolRanking } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { FinalResult } from '../components/tableau/tableauTypes';
import type { Phase } from './useCompetitionSession';

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
    const api = window.electronAPI;
    if (!api) return;

    // Chaque on* retourne son désabonnement (#1894) : removeAllListeners retirait aussi
    // les écouteurs des autres composants (cf. file:opened d'App, #1117)
    const unsubscribers: Array<(() => void) | void> = [
      api.onMenuCompetitionProperties?.(onShowProperties),
      api.onMenuImport?.(onImport),
      api.onMenuExport?.(handleExport),
      api.onMenuAddFencer?.(onShowAddFencer),
      api.onMenuNextPhase?.(onNextPhase),
    ];

    return () => {
      for (const off of unsubscribers) if (typeof off === 'function') off();
    };
  }, [onShowProperties, onImport, handleExport, loadFencers, onShowAddFencer, onNextPhase]);

  return {
    handleExport,
  };
};

export default useMenuEvents;
