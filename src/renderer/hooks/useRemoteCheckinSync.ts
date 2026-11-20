/**
 * BellePoule Modern - Synchronisation inscription / appel distants selon la phase (extrait de
 * CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Referee } from '../../shared/types';
import type { Phase } from './useCompetitionSession';

interface UseRemoteCheckinSyncParams {
  competitionId: string;
  currentPhase: Phase;
  isRemoteActive: boolean;
  remoteServerUrl: string | null;
  loadFencers: () => void | Promise<unknown>;
  setReferees: Dispatch<SetStateAction<Referee[]>>;
}

/** Ouvre/ferme l'inscription et l'appel distants, recharge les pointages reçus des tablettes. */
export function useRemoteCheckinSync({
  competitionId,
  currentPhase,
  isRemoteActive,
  remoteServerUrl,
  loadFencers,
  setReferees,
}: UseRemoteCheckinSyncParams) {
  // Synchroniser l'état d'inscription distante avec la phase courante
  useEffect(() => {
    if (!isRemoteActive || !window.electronAPI?.remote?.setRegistrationEnabled) return;
    const enabled = currentPhase === 'checkin';
    window.electronAPI.remote.setRegistrationEnabled(competitionId, enabled).catch(() => {});
    // remoteServerUrl : re-synchronise une fois le serveur réellement démarré (#986)
  }, [currentPhase, isRemoteActive, competitionId, remoteServerUrl]);

  // Appel distant (/appel) : actif dès que la saisie distante tourne, quelle que soit
  // la vue affichée (pointage tardif des arbitres pendant les poules, #1016)
  useEffect(() => {
    if (!isRemoteActive || !window.electronAPI?.remote?.setCheckinEnabled) return;
    window.electronAPI.remote.setCheckinEnabled(competitionId, true).catch(() => {});
  }, [isRemoteActive, competitionId, remoteServerUrl]);

  // Pointage reçu depuis la page d'appel distante : recharger depuis la DB
  useEffect(() => {
    const off = window.electronAPI?.onRemoteCheckinUpdated?.(({ kind }) => {
      if (kind === 'fencer') {
        loadFencers();
      } else {
        window.electronAPI.db
          .getRefereesByCompetition(competitionId)
          .then((rows: Referee[]) => setReferees(rows))
          .catch(() => {});
      }
    });
    return () => off?.();
  }, [loadFencers, competitionId]);
}
