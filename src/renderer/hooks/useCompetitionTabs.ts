/**
 * BellePoule Modern - Compétitions et onglets ouverts : création, ouverture, import .bpm,
 * export, fermeture d'onglet, suppression. Extrait d'App.tsx (#1897).
 * Licensed under GPL-3.0
 */

import React, { useCallback, useRef } from 'react';
import type { Competition } from '../../shared/types';
import type { CompetitionCreateData } from '../../shared/types/preload';
import { logger, LogCategory } from '@shared/services/logger';
import type { AppState, AppStateActions } from './useAppState';
import type { ToastType } from '../components/Toast';
import type { ConfirmOptions } from '../components/ConfirmDialog';
import type { FederalCreationPayload } from './useFederalImport';
import { applyFederalImport } from '../services/federalCreation';
import { translateStatic } from '../contexts/TranslationContext';

interface CompetitionTabsParams
  extends
    Pick<AppState, 'openCompetitions' | 'activeTabId' | 'currentCompetition'>,
    Pick<
      AppStateActions,
      | 'setCompetitions'
      | 'setOpenCompetitions'
      | 'setActiveTabId'
      | 'setCurrentCompetition'
      | 'setView'
      | 'setShowNewCompetitionModal'
    > {
  showToast: (message: string, type?: ToastType) => void;
  showActionableError: (baseKey: string, error: unknown) => void;
  runOperation: <T>(kind: 'export', task: () => Promise<T>) => Promise<T>;
  confirm: (messageOrOptions: string | ConfirmOptions) => Promise<boolean>;
}

export function useCompetitionTabs({
  openCompetitions,
  activeTabId,
  currentCompetition,
  setCompetitions,
  setOpenCompetitions,
  setActiveTabId,
  setCurrentCompetition,
  setView,
  setShowNewCompetitionModal,
  showToast,
  showActionableError,
  runOperation,
  confirm,
}: CompetitionTabsParams) {
  const handleCreateCompetition = useCallback(
    async (data: Partial<Competition>, imported?: FederalCreationPayload) => {
      try {
        if (window.electronAPI) {
          // Assurer que le titre est défini
          const competitionData = {
            title: data.title || 'Nouvelle compétition',
            date: data.date || new Date(),
            weapon: data.weapon || 'FOIL',
            gender: data.gender || 'M',
            category: data.category || 'SENIOR',
            ...data,
          };
          const newComp = await window.electronAPI.db.createCompetition(
            competitionData as unknown as CompetitionCreateData
          );
          setCompetitions(prev => [newComp, ...prev]);

          // Tireurs, équipes et arbitres des fichiers de l'extranet (#1938)
          if (imported) {
            const counts = await applyFederalImport(
              newComp.id,
              imported,
              newComp.settings?.minTeamSize ?? 3
            );
            showToast(translateStatic('federalImport.imported', { ...counts }), 'success');
          }

          // Ouvrir la compétition dans un nouvel onglet
          const fencers = await window.electronAPI.db.getFencersByCompetition(newComp.id);
          newComp.fencers = fencers;

          setOpenCompetitions(prev => [...prev, { competition: newComp, isDirty: false }]);
          setActiveTabId(newComp.id);
          setCurrentCompetition(newComp);
          setView('competition');
        }
      } catch (error) {
        logger.error(LogCategory.UI, 'Failed to create competition', error as Error);
      }
      setShowNewCompetitionModal(false);
    },
    [
      setActiveTabId,
      setCompetitions,
      setCurrentCompetition,
      setOpenCompetitions,
      setShowNewCompetitionModal,
      setView,
      showToast,
    ]
  );

  const handleSelectCompetition = useCallback(
    async (competition: Competition) => {
      logger.debug(LogCategory.UI, 'handleSelectCompetition', {
        id: competition.id,
        title: competition.title,
      });

      try {
        if (window.electronAPI) {
          const existingOpenComp = openCompetitions.find(
            open => open.competition.id === competition.id
          );

          if (existingOpenComp) {
            setActiveTabId(competition.id);
            setCurrentCompetition(existingOpenComp.competition);
            setView('competition');
          } else {
            const comp = await window.electronAPI.db.getCompetition(competition.id);

            if (comp) {
              const fencers = await window.electronAPI.db.getFencersByCompetition(competition.id);
              comp.fencers = fencers;

              setOpenCompetitions(prev => [...prev, { competition: comp, isDirty: false }]);
              setActiveTabId(comp.id);
              setCurrentCompetition(comp);
              setView('competition');
            } else {
              logger.error(LogCategory.UI, 'Compétition non trouvée dans la DB', undefined, {
                id: competition.id,
              });
              showToast('Erreur: Compétition non trouvée', 'error');
            }
          }
        }
      } catch (error) {
        logger.error(LogCategory.UI, 'Failed to load competition', error as Error);
        showToast('Erreur lors du chargement de la compétition', 'error');
      }
    },
    [
      openCompetitions,
      showToast,
      setActiveTabId,
      setCurrentCompetition,
      setOpenCompetitions,
      setView,
    ]
  );

  // Ouvrir une compétition par id (ex : compétition séparée créée après poules)
  const handleOpenCompetitionById = useCallback(
    async (competitionId: string) => {
      const comp = await window.electronAPI?.db.getCompetition(competitionId);
      if (!comp) {
        showToast('Erreur: Compétition non trouvée', 'error');
        return;
      }
      setCompetitions(prev => (prev.some(c => c.id === comp.id) ? prev : [comp, ...prev]));
      await handleSelectCompetition(comp);
    },
    [handleSelectCompetition, showToast, setCompetitions]
  );

  // Ouvre (ou recharge) une compétition fusionnée depuis un .bpm (#1117)
  const openImportedCompetition = useCallback(
    async (id: string) => {
      const comp = await window.electronAPI.db.getCompetition(id);
      if (!comp) return;
      comp.fencers = await window.electronAPI.db.getFencersByCompetition(id);
      // Onglet déjà ouvert : le démonter pour relire l'état importé
      setOpenCompetitions(prev => prev.filter(open => open.competition.id !== id));
      setCurrentCompetition(null);
      setActiveTabId(null);
      await new Promise(resolve => setTimeout(resolve, 0));
      setOpenCompetitions(prev => [
        ...prev.filter(open => open.competition.id !== id),
        { competition: comp, isDirty: false },
      ]);
      setActiveTabId(comp.id);
      setCurrentCompetition(comp);
      setView('competition');
    },
    [setOpenCompetitions, setCurrentCompetition, setActiveTabId, setView]
  );
  const openImportedCompetitionRef = useRef(openImportedCompetition);
  openImportedCompetitionRef.current = openImportedCompetition;

  const handleExportCompetition = useCallback(
    async (id: string) => {
      try {
        const res = await runOperation('export', async () =>
          window.electronAPI?.file?.exportCompetition?.(id)
        );
        if (res?.success) showToast('Compétition exportée', 'success');
      } catch (error) {
        logger.error(LogCategory.UI, 'Failed to export competition', error as Error);
        showActionableError('messages.export_competition_failed', error);
      }
    },
    [showToast, showActionableError, runOperation]
  );

  const handleTabClose = useCallback(
    async (competitionId: string, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
      }

      const openComp = openCompetitions.find(open => open.competition.id === competitionId);
      if (openComp && openComp.isDirty) {
        const ok = await confirm(
          'Des modifications ne sont pas sauvegardées. Voulez-vous vraiment fermer cette compétition ?'
        );
        if (!ok) {
          return;
        }
      }

      localStorage.removeItem(`bellepoule-remote-launched-${competitionId}`);
      localStorage.removeItem(`bellepoule-remote-port-${competitionId}`);
      // Fermer la saisie distante restée active (#1009) ; erreur ignorée si non démarrée
      window.electronAPI?.remote?.stopServer(competitionId).catch(() => undefined);

      const newOpenCompetitions = openCompetitions.filter(
        open => open.competition.id !== competitionId
      );
      setOpenCompetitions(newOpenCompetitions);

      if (activeTabId === competitionId) {
        if (newOpenCompetitions.length > 0) {
          const nextComp = newOpenCompetitions[newOpenCompetitions.length - 1];
          setActiveTabId(nextComp.competition.id);
          setCurrentCompetition(nextComp.competition);
        } else {
          setActiveTabId(null);
          setCurrentCompetition(null);
          setView('home');
        }
      }
    },
    [
      openCompetitions,
      activeTabId,
      confirm,
      setActiveTabId,
      setCurrentCompetition,
      setOpenCompetitions,
      setView,
    ]
  );

  const handleDeleteCompetition = useCallback(
    async (id: string) => {
      try {
        if (window.electronAPI) {
          await window.electronAPI.db.deleteCompetition(id);
          localStorage.removeItem(`bellepoule-remote-launched-${id}`);
          localStorage.removeItem(`bellepoule-remote-port-${id}`);
          setCompetitions(prev => prev.filter(c => c.id !== id));

          // Supprimer l'onglet ouvert pour cette compétition (évite le tab fantôme)
          setOpenCompetitions(prev => {
            const next = prev.filter(open => open.competition.id !== id);
            if (activeTabId === id) {
              if (next.length > 0) {
                const lastComp = next[next.length - 1].competition;
                setActiveTabId(lastComp.id);
                setCurrentCompetition(lastComp);
                setView('competition');
              } else {
                setActiveTabId(null);
                setCurrentCompetition(null);
                setView('home');
              }
            } else if (currentCompetition?.id === id) {
              setCurrentCompetition(null);
              setView('home');
            }
            return next;
          });
        }
      } catch (error) {
        logger.error(LogCategory.UI, 'Failed to delete competition', error as Error);
      }
    },
    [
      activeTabId,
      currentCompetition,
      setActiveTabId,
      setCompetitions,
      setCurrentCompetition,
      setOpenCompetitions,
      setView,
    ]
  );

  return {
    handleCreateCompetition,
    handleSelectCompetition,
    handleOpenCompetitionById,
    openImportedCompetition,
    openImportedCompetitionRef,
    handleExportCompetition,
    handleTabClose,
    handleDeleteCompetition,
  };
}
