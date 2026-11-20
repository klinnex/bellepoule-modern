/**
 * Mode d'affichage de l'onglet Saisie distante (#1414) : Basique (épuré) ou Expert (complet).
 * Choix mémorisé par compétition, Basique par défaut.
 */
import { useCallback, useEffect, useState } from 'react';

export type RemoteViewMode = 'basic' | 'expert';

export const remoteViewModeKey = (competitionId: string): string =>
  `bellepoule-remote-view-mode-${competitionId}`;

export function readRemoteViewMode(competitionId: string): RemoteViewMode {
  try {
    return localStorage.getItem(remoteViewModeKey(competitionId)) === 'expert' ? 'expert' : 'basic';
  } catch {
    return 'basic';
  }
}

export function writeRemoteViewMode(competitionId: string, mode: RemoteViewMode): void {
  try {
    localStorage.setItem(remoteViewModeKey(competitionId), mode);
  } catch {
    /* stockage indisponible : le choix reste en mémoire */
  }
}

/** État du mode, relu à chaque changement de compétition et persisté par compétition. */
export function useRemoteViewMode(
  competitionId: string
): [RemoteViewMode, (mode: RemoteViewMode) => void] {
  const [mode, setMode] = useState<RemoteViewMode>(() => readRemoteViewMode(competitionId));
  useEffect(() => {
    setMode(readRemoteViewMode(competitionId));
  }, [competitionId]);
  const change = useCallback(
    (next: RemoteViewMode) => {
      setMode(next);
      writeRemoteViewMode(competitionId, next);
    },
    [competitionId]
  );
  return [mode, change];
}
