/**
 * BellePoule Modern - Chargements initiaux de la compétition : tireurs, arbitres, serveur de saisie
 * distante (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Fencer, Referee } from '../../shared/types';
import type { usePoolManagement } from './usePoolManagement';

interface UseCompetitionBootstrapParams {
  competitionId: string;
  refereeFeatureEnabled: boolean;
  fencers: Fencer[];
  loadFencers: () => void | Promise<unknown>;
  syncFencersToPool: ReturnType<typeof usePoolManagement>['syncFencersToPool'];
  setReferees: Dispatch<SetStateAction<Referee[]>>;
  isRemoteActive: boolean;
  setIsRemoteActive: Dispatch<SetStateAction<boolean>>;
  setRemoteServerUrl: Dispatch<SetStateAction<string | null>>;
}

/** Charge tireurs et arbitres, rétablit l'état du serveur de saisie distante déjà démarré. */
export function useCompetitionBootstrap({
  competitionId,
  refereeFeatureEnabled,
  fencers,
  loadFencers,
  syncFencersToPool,
  setReferees,
  isRemoteActive,
  setIsRemoteActive,
  setRemoteServerUrl,
}: UseCompetitionBootstrapParams) {
  // Rétablir isRemoteActive si une session est déjà en cours (ex: rechargement après phase poules)
  useEffect(() => {
    window.electronAPI.remote
      .getSession(competitionId)
      .then((result: any) => {
        if (result?.success && result?.session) setIsRemoteActive(true);
      })
      .catch(() => {});
  }, [competitionId]);

  // Charger les tireurs au montage
  useEffect(() => {
    loadFencers();
  }, [loadFencers]);

  // Charger les arbitres si la fonction est activée
  useEffect(() => {
    if (!refereeFeatureEnabled) return;
    window.electronAPI.db
      .getRefereesByCompetition(competitionId)
      .then((rows: Referee[]) => setReferees(rows))
      .catch(() => {});
  }, [competitionId, refereeFeatureEnabled]);

  // Synchroniser les photos/données tireurs dans les matches de poule à chaque mise à jour
  useEffect(() => {
    if (fencers.length > 0) {
      syncFencersToPool(fencers);
    }
  }, [fencers]);

  // Restaurer l'état actif de la saisie distante si le serveur tourne déjà (ex : retour sur l'onglet)
  useEffect(() => {
    if (!window.electronAPI?.remote) return;
    window.electronAPI.remote.getServerInfo(competitionId).then((res: any) => {
      if (res?.success && res.serverInfo) {
        setIsRemoteActive(true);
        setRemoteServerUrl(res.serverInfo.url);
      }
    });
  }, [competitionId]);

  // Mettre à jour l'URL du serveur distant quand il devient actif
  useEffect(() => {
    if (!isRemoteActive || !window.electronAPI?.remote) return;
    // Petit délai pour laisser le serveur démarrer si besoin
    const timer = setTimeout(() => {
      window.electronAPI.remote.getServerInfo(competitionId).then((res: any) => {
        if (res?.success && res.serverInfo) setRemoteServerUrl(res.serverInfo.url);
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [isRemoteActive, competitionId]);
}
