/**
 * BellePoule Modern - Affectation des arbitres d'une poule (#1241)
 * Sort de PoolView la modale de désignation (état regroupé + actions).
 * Licensed under GPL-3.0
 */
import { useCallback } from 'react';
import type { Referee } from '../../../shared/types';
import { useStateGroup } from '../../hooks/useStateGroup';
import { POOL_REFEREE_INIT } from './poolViewState';

interface UsePoolRefereesOptions {
  poolId: string;
  initialReferees: Referee[];
  competitionId?: string;
  maxRefereesPerPool: number;
  onRefereeAssigned?: (poolId: string, referees: Referee[]) => void;
}

export function usePoolReferees({
  poolId,
  initialReferees,
  competitionId,
  maxRefereesPerPool,
  onRefereeAssigned,
}: UsePoolRefereesOptions) {
  const {
    showRefereeModal,
    setShowRefereeModal,
    competitionReferees,
    setCompetitionReferees,
    isLoadingReferees,
    setIsLoadingReferees,
    pendingRefereeIds,
    setPendingRefereeIds,
    assignedReferees,
    setAssignedReferees,
  } = useStateGroup({
    ...POOL_REFEREE_INIT,
    assignedReferees: initialReferees,
  });

  const openRefereeModal = useCallback(() => {
    setPendingRefereeIds(assignedReferees.map(r => r.id));
    setShowRefereeModal(true);
    if (competitionId) {
      setIsLoadingReferees(true);
      window.electronAPI.db
        .getRefereesByCompetition(competitionId)
        .then(refs =>
          // Arbitres non pointés masqués, sauf ceux déjà assignés (#977)
          setCompetitionReferees(
            refs.filter(
              r => r.status !== 'unavailable' || assignedReferees.some(a => a.id === r.id)
            )
          )
        )
        .finally(() => setIsLoadingReferees(false));
    }
  }, [
    competitionId,
    assignedReferees,
    setPendingRefereeIds,
    setShowRefereeModal,
    setIsLoadingReferees,
    setCompetitionReferees,
  ]);

  const closeRefereeModal = useCallback(() => setShowRefereeModal(false), [setShowRefereeModal]);

  const applyReferees = useCallback(
    (referees: Referee[]) => {
      window.electronAPI.db.updatePoolReferees(
        poolId,
        referees.map(r => r.id)
      );
      setAssignedReferees(referees);
      setShowRefereeModal(false);
      onRefereeAssigned?.(poolId, referees);
    },
    [poolId, onRefereeAssigned, setAssignedReferees, setShowRefereeModal]
  );

  const handleAssignReferee = useCallback(
    (referee: Referee | null) => {
      applyReferees(referee ? [referee] : []);
    },
    [applyReferees]
  );

  const togglePendingReferee = useCallback(
    (refereeId: string) => {
      setPendingRefereeIds(prev => {
        if (prev.includes(refereeId)) return prev.filter(id => id !== refereeId);
        if (prev.length >= maxRefereesPerPool) return prev;
        return [...prev, refereeId];
      });
    },
    [maxRefereesPerPool, setPendingRefereeIds]
  );

  const confirmPendingReferees = useCallback(() => {
    const byId = new Map(
      [...competitionReferees, ...assignedReferees].map(r => [r.id, r] as const)
    );
    applyReferees(pendingRefereeIds.map(id => byId.get(id)).filter((r): r is Referee => !!r));
  }, [competitionReferees, assignedReferees, pendingRefereeIds, applyReferees]);

  return {
    showRefereeModal,
    competitionReferees,
    isLoadingReferees,
    pendingRefereeIds,
    assignedReferees,
    openRefereeModal,
    closeRefereeModal,
    handleAssignReferee,
    togglePendingReferee,
    confirmPendingReferees,
  };
}
