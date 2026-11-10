/**
 * BellePoule Modern - Actions du menu natif pour la vue compétition (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import type { Dispatch, SetStateAction } from 'react';
import type { Fencer, PoolRanking } from '../../shared/types';
import type { FinalResult } from '../components/tableau/tableauTypes';
import { useOperation } from '../components/common/OperationProgress';
import { useToast } from '../components/Toast';
import type { ImportData } from './useCompetitionImport';
import type { Phase } from './useCompetitionSession';
import type { useExport } from './useExport';
import { useMenuEvents } from './useMenuEvents';
import { useTranslation } from './useTranslation';

interface UseCompetitionMenuParams {
  competitionId: string;
  competitionTitle: string;
  currentPhase: Phase;
  fencers: Fencer[];
  hasPools: boolean;
  overallRanking: PoolRanking[];
  finalResults: FinalResult[];
  isLaserSabre: boolean;
  exports: ReturnType<typeof useExport>;
  loadFencers: () => void;
  setImportData: Dispatch<SetStateAction<ImportData | null>>;
  setShowPropertiesModal: Dispatch<SetStateAction<boolean>>;
  setShowAddFencerModal: Dispatch<SetStateAction<boolean>>;
}

/** Branche les commandes du menu natif (propriétés, exports, imports) sur la compétition. */
export function useCompetitionMenu({
  competitionId,
  competitionTitle,
  currentPhase,
  fencers,
  hasPools,
  overallRanking,
  finalResults,
  isLaserSabre,
  exports,
  loadFencers,
  setImportData,
  setShowPropertiesModal,
  setShowAddFencerModal,
}: UseCompetitionMenuParams) {
  const { showToast, showActionableError } = useToast();
  const { runOperation } = useOperation();
  const { t } = useTranslation();
  const { exportFencersList, exportRanking, exportResults } = exports;

  useMenuEvents({
    currentPhase,
    onShowProperties: () => setShowPropertiesModal(true),
    onShowAddFencer: () => setShowAddFencerModal(true),
    onExportFencers: format => exportFencersList(fencers, format),
    onExportFencersBpf: async () => {
      const result = await window.electronAPI.dialog.saveFile({
        title: t('dialogs.exportFencersArchive'),
        defaultPath: `tireurs-${competitionTitle}.bpf`,
        filters: [{ name: 'BellePoule Fencers', extensions: ['bpf'] }],
      });
      if (result && !result.canceled && result.filePath) {
        const { count } = await runOperation('export', () =>
          window.electronAPI.file.exportFencersArchive(competitionId, result.filePath!)
        );
        showToast(
          `${count} tireur${count !== 1 ? 's' : ''} exporté${count !== 1 ? 's' : ''} (.bpf)`,
          'success'
        );
      }
    },
    onExportPhotos: async () => {
      const result = await window.electronAPI.dialog.saveFile({
        title: t('dialogs.exportPhotos'),
        defaultPath: `photos-${competitionTitle}.zip`,
        filters: [{ name: 'Archive ZIP', extensions: ['zip'] }],
      });
      if (result && !result.canceled && result.filePath) {
        const { count } = await runOperation('export', () =>
          window.electronAPI.file.exportPhotos(competitionId, result.filePath!)
        );
        showToast(
          `${count} photo${count !== 1 ? 's' : ''} exportée${count !== 1 ? 's' : ''}`,
          'success'
        );
      }
    },
    onExportRanking: format => exportRanking(overallRanking, format, isLaserSabre),
    onExportResults: format => exportResults(finalResults, format),
    onImport: async (format, filepath, content) => {
      if (format === 'fencers-bpf') {
        try {
          await runOperation('import', () =>
            window.electronAPI.file.importFencersArchive(competitionId, filepath)
          );
          loadFencers();
        } catch (err) {
          showActionableError('messages.import_archive_failed', err);
        }
        return;
      }
      setImportData({ format, filepath, content });
    },
    onNextPhase: () => {},
    loadFencers,
    hasPools,
    overallRanking,
    finalResults,
    isLaserSabre,
  });
}
