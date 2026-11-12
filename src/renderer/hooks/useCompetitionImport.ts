/**
 * BellePoule Modern - Import de tireurs et de classements (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { Competition, Fencer, Referee } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import type { ImportedReferee, RankingImportResult } from '../../shared/utils/fileParser';
import { useToast } from '../components/Toast';
import { useTranslation } from './useTranslation';
import type { useFencerManagement } from './useFencerManagement';

export interface ImportData {
  format: string;
  filepath: string;
  content: string;
}

interface UseCompetitionImportParams {
  competition: Competition;
  onUpdate: (competition: Competition) => void;
  bulkAddFencers: ReturnType<typeof useFencerManagement>['bulkAddFencers'];
  referees?: Referee[];
  setReferees?: Dispatch<SetStateAction<Referee[]>>;
}

const refereeKey = (lastName: string, firstName: string) =>
  `${lastName} ${firstName}`.trim().toUpperCase().replace(/\s+/g, ' ');

/** Fichier d'import en cours (modale) et gestionnaires d'import (tireurs, classement). */
export function useCompetitionImport({
  competition,
  onUpdate,
  bulkAddFencers,
  referees = [],
  setReferees,
}: UseCompetitionImportParams) {
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [importData, setImportData] = useState<ImportData | null>(null);

  const handleImportFencers = async (importedFencers: Partial<Fencer>[]) => {
    await bulkAddFencers(importedFencers as any);
    setImportData(null);
  };

  /** Arbitres du bloc <Arbitres> d'un XML (#1504) ; doublons nom + prénom ignorés */
  const handleImportReferees = async (imported: ImportedReferee[]) => {
    if (!window.electronAPI?.db?.createReferee) return;
    const known = new Set(referees.map(r => refereeKey(r.lastName, r.firstName)));
    const created: Referee[] = [];
    for (const ref of imported) {
      const key = refereeKey(ref.lastName, ref.firstName);
      if (known.has(key)) continue;
      known.add(key);
      try {
        created.push(
          await window.electronAPI.db.createReferee(competition.id, {
            name: `${ref.firstName} ${ref.lastName}`.trim(),
            club: ref.club,
            license: ref.license,
            category: ref.category,
            nationality: ref.nationality,
            gender: ref.gender,
          })
        );
      } catch (err) {
        logger.error(LogCategory.UI, 'Failed to import referee', err as Error);
      }
    }
    if (created.length > 0) setReferees?.(prev => [...prev, ...created]);
    showToast(t('plural.referees_imported', { count: created.length }), 'success');
    setImportData(null);
  };

  const handleOpenImportDialog = async (type: 'xml' | 'fff' | 'ranking' = 'fff') => {
    const configs = {
      xml: {
        title: 'Importer un fichier XML BellePoule',
        filters: [{ name: 'XML BellePoule', extensions: ['xml', 'cotcot'] }],
      },
      fff: {
        title: 'Importer une liste FFE (.fff, .csv, .txt, .xlsx)',
        filters: [
          { name: 'Fichiers FFE / CSV / Excel', extensions: ['fff', 'csv', 'txt', 'xlsx'] },
        ],
      },
      ranking: {
        title: 'Importer un classement (FFF ou CSV : NOM, PRENOM, CLASSEMENT)',
        filters: [{ name: 'Fichier classement', extensions: ['fff', 'csv', 'txt', 'xlsx'] }],
      },
    };
    const cfg = configs[type];
    const result = await window.electronAPI.dialog.openFile({
      title: cfg.title,
      filters: [...cfg.filters, { name: 'Tous les fichiers', extensions: ['*'] }],
      properties: ['openFile'],
    });

    if (result && result.filePath) {
      const filepath = result.filePath;
      const content = result.content || '';
      const extension = filepath.split('.').pop()?.toLowerCase();

      // TXT simple → parseur libre ; CSV/Excel → parseur FFE (modèle d'import : en-tête + colonnes)
      let format: string = type;
      if (type === 'fff' && extension === 'txt') {
        format = 'txt';
      }

      setImportData({ format, filepath, content });
    }
  };

  const handleImportRanking = async (result: RankingImportResult) => {
    if (!window.electronAPI?.db?.updateFencer) {
      showToast('Erreur: API non disponible', 'error');
      return;
    }

    try {
      const updatePromises = result.details
        .filter(d => d.matched && d.fencerId)
        .map(d =>
          window.electronAPI!.db!.updateFencer!(d.fencerId!, { ranking: d.ranking }).catch(err =>
            logger.error(
              LogCategory.UI,
              `Failed to update ranking for fencer ${d.fencerId}`,
              err as Error
            )
          )
        );
      await Promise.allSettled(updatePromises);

      onUpdate({
        ...competition,
        fencers: (competition.fencers || []).map(f => {
          const detail = result.details.find(d => d.fencerId === f.id);
          return detail?.matched ? { ...f, ranking: detail.ranking, updatedAt: new Date() } : f;
        }),
      });

      showToast(
        t('plural.ranking_imported', { count: result.updated }),
        result.errors.length > 0 ? 'warning' : 'success'
      );
      setImportData(null);
    } catch (error) {
      logger.error(LogCategory.UI, 'Failed to import ranking', error as Error);
      showToast("Erreur lors de l'import du classement", 'error');
    }
  };

  return {
    importData,
    setImportData,
    handleImportFencers,
    handleOpenImportDialog,
    handleImportRanking,
    handleImportReferees,
  };
}
