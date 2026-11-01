/**
 * Abonnement au bus d'événements de données main → renderer (#1298).
 * Remplace les polls : le callback est appelé après chaque écriture concernée.
 * Licensed under GPL-3.0
 */
import { useEffect, useRef } from 'react';

export type CompetitionEventType = 'fencers:changed';

export function useCompetitionEvent(
  type: CompetitionEventType,
  competitionId: string | undefined,
  callback: () => void
): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    const subscribe = window.electronAPI?.onCompetitionEvent;
    if (!subscribe) return;
    return subscribe(event => {
      if (event.type !== type) return;
      if (competitionId && event.competitionId && event.competitionId !== competitionId) return;
      cbRef.current();
    });
  }, [type, competitionId]);
}
