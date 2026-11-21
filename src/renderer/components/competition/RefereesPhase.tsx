/**
 * BellePoule Modern - Phase « Arbitres » de la compétition (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Competition, Match, Pool, Referee } from '../../../shared/types';
import { poolMatchesWithReferee } from '../../../shared/utils/refereeStats';
import type { ConsolationBracket, TableauMatch } from '../../../shared/domain/tableau/tableauTypes';
import { RefereeManagerComponent } from '../RefereeManager';
import type { AssignmentsInput } from '../../hooks/usePoolsLaunch';

interface RefereesPhaseProps {
  competition: Competition;
  referees: Referee[];
  setReferees: Dispatch<SetStateAction<Referee[]>>;
  pools: Pool[];
  poolHistory: Pool[][];
  assignableMatches: Match[];
  tableauMatches: TableauMatch[];
  setTableauMatches: Dispatch<SetStateAction<TableauMatch[]>>;
  consolationBrackets: ConsolationBracket[];
  setConsolationBrackets: Dispatch<SetStateAction<ConsolationBracket[]>>;
  applyPoolRefereeAssignments: (assignments: Map<string, Referee>) => void;
  /** Arbitres écrits par le moteur (assignMatches, docs/adr/0017) ; absent : écran seul */
  assign?: (input: AssignmentsInput) => Promise<'recorded' | 'local' | 'refused'>;
}

const RefereesPhase: React.FC<RefereesPhaseProps> = ({
  competition,
  referees,
  setReferees,
  pools,
  poolHistory,
  assignableMatches,
  tableauMatches,
  setTableauMatches,
  consolationBrackets,
  setConsolationBrackets,
  applyPoolRefereeAssignments,
  assign,
}) => {
  return (
    <RefereeManagerComponent
      competition={competition}
      referees={referees}
      pools={pools}
      matches={assignableMatches}
      statsPoolMatches={[...poolHistory.flat(), ...pools].flatMap(poolMatchesWithReferee)}
      statsTableauMatches={[...tableauMatches, ...consolationBrackets.flatMap(b => b.matches)]}
      onRefereesChange={setReferees}
      onAssignmentsChange={async assignments => {
        // Par le moteur : poules, tableau et tableaux de classement ; l'écran relit l'état
        const outcome = assign
          ? await assign({
              matches: [...assignments].map(([matchId, ref]) => ({ matchId, refereeId: ref.id })),
            })
          : 'local';
        if (outcome !== 'local') return;
        applyPoolRefereeAssignments(assignments);
        // Matchs de tableau / consolation : referees[0] = arbitre principal
        const applyToTableau = (list: TableauMatch[]) =>
          list.map(m => {
            const ref = assignments.get(m.id);
            if (!ref) return m;
            const principal = {
              id: ref.id,
              firstName: ref.firstName,
              lastName: ref.lastName,
            };
            const others = (m.referees ?? []).slice(1).filter(r => r.id !== ref.id);
            return { ...m, referee: principal, referees: [principal, ...others] };
          });
        if (tableauMatches.some(m => assignments.has(m.id))) {
          setTableauMatches(prev => applyToTableau(prev));
        }
        if (consolationBrackets.some(b => b.matches.some(m => assignments.has(m.id)))) {
          setConsolationBrackets(prev =>
            prev.map(b => ({ ...b, matches: applyToTableau(b.matches) }))
          );
        }
      }}
    />
  );
};

export default React.memo(RefereesPhase);
