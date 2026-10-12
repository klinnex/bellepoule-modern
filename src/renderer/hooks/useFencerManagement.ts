/**
 * BellePoule Modern - Fencer Management Hook
 * Gestion des tireurs (CRUD, check-in, import)
 * Licensed under GPL-3.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Competition, Fencer, FencerStatus } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { useToast } from '../components/Toast';
import { importRankingFromFFF, RankingImportResult } from '../../shared/utils/fileParser';

interface UseFencerManagementProps {
  competition: Competition;
  onUpdate: (competition: Competition) => void;
}

export const useFencerManagement = ({ competition, onUpdate }: UseFencerManagementProps) => {
  const { showToast } = useToast();
  const [fencers, setFencers] = useState<Fencer[]>(competition.fencers || []);
  const competitionRef = useRef(competition);
  const onUpdateRef = useRef(onUpdate);
  competitionRef.current = competition;
  onUpdateRef.current = onUpdate;

  // Synchroniser avec la compétition parente
  useEffect(() => {
    setFencers(competition.fencers || []);
  }, [competition.fencers]);

  // Charger les tireurs depuis la base de données
  const loadFencers = useCallback(async () => {
    if (!window.electronAPI?.db?.getFencersByCompetition) return;

    try {
      const comp = competitionRef.current;
      const data = await window.electronAPI.db.getFencersByCompetition(comp.id);
      setFencers(data);
      onUpdateRef.current({ ...comp, fencers: data });
    } catch (error) {
      logger.error(LogCategory.UI, 'Failed to load fencers', error as Error);
      showToast('Erreur lors du chargement des tireurs', 'error');
    }
  }, [showToast]);

  // Ajouter un tireur
  const addFencer = useCallback(
    async (fencerData: Omit<Fencer, 'id' | 'createdAt' | 'updatedAt'>) => {
      logger.debug(LogCategory.UI, 'addFencer called', { fencerData });

      if (!window.electronAPI?.db?.addFencer) {
        logger.error(LogCategory.UI, 'electronAPI.db.addFencer is not available');
        showToast('Erreur: API non disponible', 'error');
        throw new Error('API non disponible');
      }

      try {
        const newFencer = await window.electronAPI.db.addFencer(competition.id, fencerData as any);

        const updatedFencers = [...fencers, newFencer];
        setFencers(updatedFencers);
        onUpdate({ ...competition, fencers: updatedFencers });
        showToast('Tireur ajouté avec succès', 'success');
        return newFencer;
      } catch (error) {
        logger.error(LogCategory.UI, 'Failed to add fencer', error as Error);
        showToast(
          "Erreur lors de l'ajout du tireur: " +
            (error instanceof Error ? error.message : 'Erreur inconnue'),
          'error'
        );
        throw error;
      }
    },
    [fencers, competition, onUpdate, showToast]
  );

  // Mettre à jour un tireur
  const updateFencer = useCallback(
    async (fencerId: string, updates: Partial<Fencer>) => {
      if (!window.electronAPI?.db?.updateFencer) return;

      try {
        await window.electronAPI.db.updateFencer(fencerId, updates);
        const updatedFencers = fencers.map(f =>
          f.id === fencerId ? { ...f, ...updates, updatedAt: new Date() } : f
        );
        setFencers(updatedFencers);
        onUpdate({ ...competition, fencers: updatedFencers });
        showToast('Tireur mis à jour', 'success');
      } catch (error) {
        logger.error(LogCategory.UI, 'Failed to update fencer', error as Error);
        showToast('Erreur lors de la mise à jour', 'error');
        throw error;
      }
    },
    [fencers, competition, onUpdate, showToast]
  );

  // Supprimer un tireur
  const deleteFencer = useCallback(
    async (fencerId: string) => {
      if (!window.electronAPI?.db?.deleteFencer) return;

      try {
        await window.electronAPI.db.deleteFencer(fencerId);
        const updatedFencers = fencers.filter(f => f.id !== fencerId);
        setFencers(updatedFencers);
        onUpdate({ ...competition, fencers: updatedFencers });
        showToast('Tireur supprimé', 'success');
      } catch (error) {
        logger.error(LogCategory.UI, 'Failed to delete fencer', error as Error);
        showToast('Erreur lors de la suppression', 'error');
        throw error;
      }
    },
    [fencers, competition, onUpdate, showToast]
  );

  // Supprimer tous les tireurs
  const deleteAllFencers = useCallback(async () => {
    if (!window.electronAPI?.db?.deleteAllFencers) return;

    try {
      await window.electronAPI.db.deleteAllFencers(competition.id);
      setFencers([]);
      onUpdate({ ...competition, fencers: [] });
      showToast('Tous les tireurs ont été supprimés', 'success');
    } catch (error) {
      logger.error(LogCategory.UI, 'Failed to delete all fencers', error as Error);
      showToast('Erreur lors de la suppression', 'error');
      throw error;
    }
  }, [competition, onUpdate, showToast]);

  // Pointer tous les tireurs
  const checkInAll = useCallback(async () => {
    const notCheckedIn = fencers.filter(f => f.status === FencerStatus.NOT_CHECKED_IN);
    if (notCheckedIn.length === 0) {
      showToast('Tous les tireurs sont déjà pointés', 'info');
      return;
    }

    const updatedFencers = fencers.map(f =>
      f.status === FencerStatus.NOT_CHECKED_IN ? { ...f, status: FencerStatus.CHECKED_IN } : f
    );

    setFencers(updatedFencers);
    onUpdate({ ...competition, fencers: updatedFencers });

    // Update database en arrière-plan
    const promises = notCheckedIn.map(f =>
      window.electronAPI?.db
        ?.updateFencer?.(f.id, { status: FencerStatus.CHECKED_IN })
        .catch(err =>
          logger.error(LogCategory.UI, `Failed to check in fencer ${f.id}`, err as Error)
        )
    );

    await Promise.allSettled(promises);
    showToast(`${notCheckedIn.length} tireur(s) pointé(s)`, 'success');
  }, [fencers, competition, onUpdate, showToast]);

  // Dépointer tous les tireurs
  const uncheckAll = useCallback(async () => {
    const checkedIn = fencers.filter(f => f.status === FencerStatus.CHECKED_IN);
    if (checkedIn.length === 0) {
      showToast("Aucun tireur n'est pointé", 'info');
      return;
    }

    const updatedFencers = fencers.map(f =>
      f.status === FencerStatus.CHECKED_IN ? { ...f, status: FencerStatus.NOT_CHECKED_IN } : f
    );

    setFencers(updatedFencers);
    onUpdate({ ...competition, fencers: updatedFencers });

    // Update database en arrière-plan
    const promises = checkedIn.map(f =>
      window.electronAPI?.db
        ?.updateFencer?.(f.id, { status: FencerStatus.NOT_CHECKED_IN })
        .catch(err =>
          logger.error(LogCategory.UI, `Failed to uncheck fencer ${f.id}`, err as Error)
        )
    );

    await Promise.allSettled(promises);
    showToast(`${checkedIn.length} tireur(s) dépointé(s)`, 'success');
  }, [fencers, competition, onUpdate, showToast]);

  // Obtenir les tireurs pointés
  const getCheckedInFencers = useCallback(() => {
    return fencers.filter(f => f.status === FencerStatus.CHECKED_IN);
  }, [fencers]);

  // Importer plusieurs tireurs en une seule opération (évite N re-renders)
  const bulkAddFencers = useCallback(
    async (fencersData: Omit<Fencer, 'id' | 'createdAt' | 'updatedAt'>[]) => {
      if (!window.electronAPI?.db?.addFencer) {
        showToast('Erreur: API non disponible', 'error');
        throw new Error('API non disponible');
      }

      const added: Fencer[] = [];
      for (const fencerData of fencersData) {
        const newFencer = await window.electronAPI.db.addFencer(competition.id, fencerData as any);
        added.push(newFencer);
      }

      const updatedFencers = [...fencers, ...added];
      setFencers(updatedFencers);
      onUpdate({ ...competition, fencers: updatedFencers });
      showToast(
        `${added.length} tireur${added.length !== 1 ? 's' : ''} importé${added.length !== 1 ? 's' : ''}`,
        'success'
      );
      return added;
    },
    [fencers, competition, onUpdate, showToast]
  );

  // Importer un classement depuis un fichier FFF
  const importRanking = useCallback(
    async (fileContent: string): Promise<RankingImportResult> => {
      if (!window.electronAPI?.db?.updateFencer) {
        showToast('Erreur: API non disponible', 'error');
        throw new Error('API non disponible');
      }

      try {
        // Importer le classement uniquement pour les tireurs existants
        const result = importRankingFromFFF(fileContent, fencers);

        if (result.updated === 0 && result.notFound > 0) {
          showToast(
            `Aucun tireur trouvé dans la liste d'appel (${result.notFound} non trouvés)`,
            'warning'
          );
          return result;
        }

        // Mettre à jour les tireurs en base de données
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

        // Mettre à jour l'état local
        const updatedFencers = fencers.map(f => {
          const detail = result.details.find(d => d.fencerId === f.id);
          if (detail) {
            return { ...f, ranking: detail.ranking, updatedAt: new Date() };
          }
          return f;
        });

        setFencers(updatedFencers);
        onUpdate({ ...competition, fencers: updatedFencers });

        // Message détaillé avec tous les compteurs
        let message = `Classement: ${result.updated}/${result.totalFencers} mis à jour`;
        if (result.notInFile > 0) {
          message += `, ${result.notInFile} sans classement`;
        }
        if (result.notFound > 0) {
          message += `, ${result.notFound} du fichier non trouvés`;
        }
        if (result.skipped > 0) {
          message += `, ${result.skipped} lignes ignorées`;
        }

        showToast(
          message,
          result.notInFile > 0 || result.notFound > 0 || result.errors.length > 0
            ? 'warning'
            : 'success'
        );

        return result;
      } catch (error) {
        logger.error(LogCategory.UI, 'Failed to import ranking', error as Error);
        showToast("Erreur lors de l'import du classement", 'error');
        throw error;
      }
    },
    [fencers, competition, onUpdate, showToast]
  );

  return {
    fencers,
    setFencers,
    loadFencers,
    addFencer,
    bulkAddFencers,
    updateFencer,
    deleteFencer,
    deleteAllFencers,
    checkInAll,
    uncheckAll,
    getCheckedInFencers,
    importRanking,
  };
};

export default useFencerManagement;
