/**
 * BellePoule Modern - Export Hook
 * Gestion des exports de données
 * Licensed under GPL-3.0
 */

import { useCallback } from 'react';
import { Competition, Fencer, Pool, PoolRanking, FencerStatus } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { FinalResult } from '../components/tableau/tableauTypes';
import { exportFencersToTXT, exportFencersToFFF } from '../../shared/utils/fencerExport';
import { usePdfTemplateStore } from '../../features/pdfTemplates/hooks/usePdfTemplateStore';
import { useToast } from '../components/Toast';
import { formatQuestPerMatch } from '../../shared/utils/poolCalculations';
import {
  exportResultsHTML,
  exportRankingCSV,
  exportResultsXMLFFE,
  exportDetailedStatsCSV,
} from '../../shared/utils/multiFormatExport';

interface UseExportProps {
  competition: Competition;
  showToast: ReturnType<typeof useToast>['showToast'];
}

export const useExport = ({ competition, showToast }: UseExportProps) => {
  const poolTemplate = usePdfTemplateStore(s => s.templates.pool);

  // Helper pour télécharger un fichier
  const downloadFile = useCallback((content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  // Export liste de tireurs (TXT ou FFF)
  const exportFencersList = useCallback(
    async (fencers: Fencer[], format: 'txt' | 'fff') => {
      try {
        const isFFF = format === 'fff';
        const extension = isFFF ? 'fff' : 'txt';
        const filterName = isFFF ? 'Fichier FFE' : 'Fichier texte';

        const result = await window.electronAPI?.dialog?.saveFile({
          title: `Exporter les tireurs (.${extension})`,
          defaultPath: `tireurs_${competition.title.replace(/[^a-z0-9]/gi, '_')}.${extension}`,
          filters: [
            { name: filterName, extensions: [extension] },
            { name: 'Tous les fichiers', extensions: ['*'] },
          ],
        });

        if (result && !result.canceled && result.filePath) {
          const content = isFFF
            ? exportFencersToFFF(fencers)
            : exportFencersToTXT(fencers, competition.title);
          await window.electronAPI?.file?.writeContent(result.filePath, content);
          showToast(`Export ${extension.toUpperCase()} des tireurs réussi`, 'success');
        }
      } catch (error) {
        logger.error(LogCategory.UI, 'Export fencers failed', error as Error);
        showToast('Export des tireurs échoué', 'error');
      }
    },
    [competition.title, showToast]
  );

  // Export classement (CSV ou JSON)
  const exportRanking = useCallback(
    (ranking: PoolRanking[], format: 'csv' | 'json', isLaserSabre: boolean) => {
      try {
        let content = '';
        let filename = '';
        let mimeType = '';

        switch (format) {
          case 'csv': {
            const headers = [
              'Rg',
              'Nom',
              'Prénom',
              'Club',
              'V',
              'M',
              'V/M',
              'TD',
              'TR',
              'Statut',
              'Indice',
            ];
            if (isLaserSabre) headers.push('Quest', 'Q/M');

            const getStatusLabel = (status: FencerStatus) => {
              switch (status) {
                case FencerStatus.ABANDONED:
                  return 'A';
                case FencerStatus.FORFAIT:
                  return 'F';
                case FencerStatus.EXCLUDED:
                  return 'X';
                default:
                  return '';
              }
            };

            const rows = ranking.map(r => [
              r.rank,
              r.fencer.lastName,
              r.fencer.firstName,
              r.fencer.club || '',
              r.victories,
              r.victories + r.defeats,
              ((r.victories / (r.victories + r.defeats)) * 100).toFixed(1) + '%',
              r.touchesScored,
              r.touchesReceived,
              getStatusLabel(r.fencer.status),
              r.index,
              ...(isLaserSabre ? [r.questPoints || '', formatQuestPerMatch(r)] : []),
            ]);

            content = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
            filename = `classement_${competition.title.replace(/[^a-z0-9]/gi, '_')}.csv`;
            mimeType = 'text/csv';
            break;
          }
          case 'json':
            content = JSON.stringify(
              {
                competition: competition.title,
                date: competition.date,
                ranking,
              },
              null,
              2
            );
            filename = `classement_${competition.title.replace(/[^a-z0-9]/gi, '_')}.json`;
            mimeType = 'application/json';
            break;
          default:
            showToast(`Format ${format} non supporté`, 'error');
            return;
        }

        downloadFile(content, filename, mimeType);
        showToast(`Export ${format.toUpperCase()} du classement réussi`, 'success');
      } catch (error) {
        logger.error(LogCategory.UI, 'Export ranking failed', error as Error);
        showToast(`Export ${format.toUpperCase()} échoué`, 'error');
      }
    },
    [competition.title, competition.date, downloadFile, showToast]
  );

  // Export résultats finaux (CSV ou JSON)
  const exportResults = useCallback(
    (finalResults: FinalResult[], format: 'csv' | 'json') => {
      try {
        let content = '';
        let filename = '';
        let mimeType = '';

        switch (format) {
          case 'csv': {
            const headers = ['Rang', 'Nom', 'Prénom', 'Club', 'Éliminé à'];
            const rows = finalResults.map(r => [
              r.rank,
              r.fencer.lastName,
              r.fencer.firstName,
              r.fencer.club || '',
              r.eliminatedAt || '',
            ]);

            content = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
            filename = `resultats_${competition.title.replace(/[^a-z0-9]/gi, '_')}.csv`;
            mimeType = 'text/csv';
            break;
          }
          case 'json':
            content = JSON.stringify(
              {
                competition: competition.title,
                date: competition.date,
                results: finalResults,
              },
              null,
              2
            );
            filename = `resultats_${competition.title.replace(/[^a-z0-9]/gi, '_')}.json`;
            mimeType = 'application/json';
            break;
          default:
            showToast(`Format ${format} non supporté`, 'error');
            return;
        }

        downloadFile(content, filename, mimeType);
        showToast(`Export ${format.toUpperCase()} des résultats réussi`, 'success');
      } catch (error) {
        logger.error(LogCategory.UI, 'Export results failed', error as Error);
        showToast(`Export ${format.toUpperCase()} échoué`, 'error');
      }
    },
    [competition.title, competition.date, downloadFile, showToast]
  );

  // Export PDF de toutes les poules — jsPDF chargé à la demande
  const exportPoolsPDF = useCallback(
    async (pools: Pool[], currentPoolRound: number) => {
      try {
        const { exportMultiplePoolsToPDF } = await import('../../shared/utils/pdfExport');
        const logo = localStorage.getItem('bellepoule-logo') ?? undefined;
        await exportMultiplePoolsToPDF(
          pools,
          `Toutes les Poules - ${competition.title} - Tour ${currentPoolRound}`,
          logo,
          poolTemplate,
          competition.title
        );
        showToast(`Export PDF de ${pools.length} poules généré avec succès`, 'success');
      } catch (error) {
        logger.error(LogCategory.UI, "Erreur lors de l'export PDF des poules", error as Error);
        showToast(
          `Erreur lors de la génération du PDF: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
          'error'
        );
      }
    },
    [competition.title, showToast, poolTemplate]
  );

  // Impression PDF de toutes les poules — dialogue d'impression natif
  const printPoolsPDF = useCallback(
    async (pools: Pool[], currentPoolRound: number) => {
      try {
        const { printMultiplePoolsHTML } = await import('../../shared/utils/pdfExport');
        const logo = localStorage.getItem('bellepoule-logo') ?? undefined;
        await printMultiplePoolsHTML(
          pools,
          `Toutes les Poules - ${competition.title} - Tour ${currentPoolRound}`,
          logo,
          poolTemplate,
          competition.title
        );
      } catch (error) {
        logger.error(LogCategory.UI, "Erreur lors de l'impression des poules", error as Error);
        showToast(
          `Erreur lors de l'impression: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
          'error'
        );
      }
    },
    [competition.title, showToast, poolTemplate]
  );

  // Export HTML des résultats
  const exportResultsHTMLFormat = useCallback(
    (poolRanking: PoolRanking[], finalResults: FinalResult[]) => {
      try {
        const content = exportResultsHTML(competition, poolRanking, finalResults);
        const filename = `resultats_${competition.title.replace(/[^a-z0-9]/gi, '_')}.html`;
        downloadFile(content, filename, 'text/html');
        showToast('Export HTML des résultats réussi', 'success');
      } catch (error) {
        logger.error(LogCategory.UI, 'Export HTML failed', error as Error);
        showToast('Export HTML échoué', 'error');
      }
    },
    [competition, downloadFile, showToast]
  );

  // Export CSV Excel avec formules
  const exportRankingExcelCSV = useCallback(
    (poolRanking: PoolRanking[]) => {
      try {
        const content = exportRankingCSV(poolRanking, true);
        const filename = `classement_${competition.title.replace(/[^a-z0-9]/gi, '_')}_excel.csv`;
        downloadFile(content, filename, 'text/csv');
        showToast('Export CSV Excel réussi', 'success');
      } catch (error) {
        logger.error(LogCategory.UI, 'Export CSV Excel failed', error as Error);
        showToast('Export CSV Excel échoué', 'error');
      }
    },
    [competition.title, downloadFile, showToast]
  );

  // Export XML FFE
  const exportResultsXML = useCallback(
    (poolRanking: PoolRanking[], finalResults: FinalResult[], pools?: Pool[]) => {
      try {
        const content = exportResultsXMLFFE(competition, poolRanking, finalResults, pools);
        const filename = `resultats_${competition.title.replace(/[^a-z0-9]/gi, '_')}.xml`;
        downloadFile(content, filename, 'application/xml');
        showToast('Export XML FFE réussi', 'success');
      } catch (error) {
        logger.error(LogCategory.UI, 'Export XML failed', error as Error);
        showToast('Export XML échoué', 'error');
      }
    },
    [competition, downloadFile, showToast]
  );

  // Export statistiques détaillées CSV
  const exportDetailedStats = useCallback(
    (pools: Pool[], poolRanking: PoolRanking[]) => {
      try {
        const content = exportDetailedStatsCSV(competition, pools, poolRanking);
        const filename = `stats_${competition.title.replace(/[^a-z0-9]/gi, '_')}.csv`;
        downloadFile(content, filename, 'text/csv');
        showToast('Export statistiques détaillées réussi', 'success');
      } catch (error) {
        logger.error(LogCategory.UI, 'Export stats failed', error as Error);
        showToast('Export statistiques échoué', 'error');
      }
    },
    [competition, downloadFile, showToast]
  );

  return {
    exportFencersList,
    exportRanking,
    exportResults,
    exportPoolsPDF,
    printPoolsPDF,
    downloadFile,
    exportResultsHTML: exportResultsHTMLFormat,
    exportRankingExcelCSV,
    exportResultsXML,
    exportDetailedStats,
  };
};

export default useExport;
