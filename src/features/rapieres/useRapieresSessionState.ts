/**
 * BellePoule Modern - État de session du tournoi des rapières (#1241)
 * Composition des équipes, vagues (state session) et fenêtre d'équipe, sortis de CompetitionView.
 * Licensed under GPL-3.0
 */
import { useCallback } from 'react';
import { useStateGroup } from '../../renderer/hooks/useStateGroup';
import type { Fencer } from '../../shared/types';
import {
  createRapieresSession,
  RapieresLegacyState,
  RapieresSession,
  RapieresTeamInfo,
} from './rapieres.types';

export function useRapieresSessionState() {
  // Tournoi des rapières : composition des équipes et vagues (état de session)
  // Fenêtre d'équipe : null = fermée, {} = ajout, { fencer } = modification
  const { rapieresState, setRapieresState, rapieresTeamModal, setRapieresTeamModal } =
    useStateGroup({
      rapieresState: undefined as RapieresSession | RapieresLegacyState | undefined,
      rapieresTeamModal: null as { fencer?: Fencer } | null,
    });
  const rapieres: RapieresSession =
    rapieresState?.version === 2 ? rapieresState : createRapieresSession();
  const updateRapieres = useCallback(
    (patch: Partial<RapieresSession>) =>
      setRapieresState(prev => ({
        ...(prev?.version === 2 ? prev : createRapieresSession()),
        ...patch,
      })),
    [setRapieresState]
  );
  const setRapieresTeam = useCallback(
    (id: string, info: RapieresTeamInfo) =>
      setRapieresState(prev => {
        const base = prev?.version === 2 ? prev : createRapieresSession();
        return { ...base, teams: { ...base.teams, [id]: info } };
      }),
    [setRapieresState]
  );
  return {
    rapieresState,
    setRapieresState,
    rapieresTeamModal,
    setRapieresTeamModal,
    rapieres,
    updateRapieres,
    setRapieresTeam,
  };
}
