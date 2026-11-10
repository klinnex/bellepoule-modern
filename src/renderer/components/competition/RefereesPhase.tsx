/**
 * BellePoule Modern - Phase « Arbitres » de la compétition (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Competition, Match, Pool, Referee } from '../../../shared/types';
import { poolMatchesWithReferee } from '../../../shared/utils/refereeStats';
import type { ConsolationBracket, TableauMatch } from '../tableau/tableauTypes';
import { RefereeManagerComponent } from '../RefereeManager';

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
      onAssignmentsChange={assignments => {
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
