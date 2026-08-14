/**
 * BellePoule Modern - Tableau équipes (élimination directe)
 * Composant présentationnel : reconstruit l'arbre à partir de round/position
 * (pas d'arbre séparé à persister) et réutilise TeamPoolView pour la saisie
 * de score de chaque match réel (mêmes règles arme-aware : cible progressive,
 * touche double épée, zones Sabre Laser, cartons).
 * Licensed under GPL-3.0
 */

import React from 'react';
import { Card, CardReason } from '../../shared/types';
import { TeamRow, TeamMatchRow, TeamBoutRow, TeamMatchCardRow } from '../../features/teams/types/team.types';
import {
  TeamTargetRule,
  calculateTableSize,
  placeRankedTeamsInTable,
  resolveTeamTableauSlot,
} from '../../features/teams/utils/teamCalculations';
import { LaserArenaBoutCap } from '../../features/teams/utils/laserArenaCalculations';
import TeamPoolView, { CardTarget } from './TeamPoolView';

interface Props {
  teams: TeamRow[];
  rankedTeams: TeamRow[]; // équipes triées par classement de poule (ordre de seed)
  tableauMatches: TeamMatchRow[];
  weapon: string;
  targetRule: TeamTargetRule;
  isEpee: boolean;
  isLaserPoints: boolean;
  fencerName: (id: string) => string;
  scoringMatchId: string | null;
  onToggleScoring: (matchId: string) => void;
  onScoreBout: (bout: TeamBoutRow, side: 'A' | 'B' | 'double', points?: number) => void;
  onResetBout: (bout: TeamBoutRow) => void;
  boutCards: Record<string, Card[]>;
  cardTarget: CardTarget | null;
  onSetCardTarget: (target: CardTarget | null) => void;
  selectedReason: CardReason | '';
  onSelectReason: (reason: CardReason | '') => void;
  onAddCard: (matchId: string) => void;
  onGenerate: () => void;
  isLaserArena?: boolean;
  boutCap?: LaserArenaBoutCap;
  matchCards?: Record<string, TeamMatchCardRow[]>;
  onAddTeamCard?: (matchId: string, teamId: string, type: 'white' | 'yellow' | 'red' | 'black') => void;
  onAssignArena?: (matchId: string, arenaId: string) => void;
}

const ROUND_LABELS: Record<number, string> = {
  1: 'Finale',
  2: 'Demi-finales',
  4: 'Quarts de finale',
  8: 'Huitièmes de finale',
  16: 'Seizièmes de finale',
  32: 'Trente-deuxièmes de finale',
};

const TeamTableauView: React.FC<Props> = ({
  teams,
  rankedTeams,
  tableauMatches,
  weapon,
  targetRule,
  isEpee,
  isLaserPoints,
  fencerName,
  scoringMatchId,
  onToggleScoring,
  onScoreBout,
  onResetBout,
  boutCards,
  cardTarget,
  onSetCardTarget,
  selectedReason,
  onSelectReason,
  onAddCard,
  onGenerate,
  isLaserArena,
  boutCap,
  matchCards,
  onAddTeamCard,
  onAssignArena,
}) => {
  if (rankedTeams.length < 2) {
    return (
      <div className="text-center text-gray-400 py-10">
        Il faut au moins 2 équipes pour générer un tableau.
      </div>
    );
  }

  if (tableauMatches.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-gray-400 mb-4">Aucun tableau généré.</p>
        <button
          onClick={onGenerate}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          Générer le tableau ({rankedTeams.length} équipes)
        </button>
      </div>
    );
  }

  const tableSize = calculateTableSize(rankedTeams.length);
  const placements = placeRankedTeamsInTable(rankedTeams, tableSize);
  const teamById = new Map(teams.map(t => [t.id, t]));
  const matchesByKey = new Map(tableauMatches.map(m => [`${m.round}-${m.position}`, m]));

  const rounds: number[] = [];
  for (let r = tableSize / 2; r >= 1; r /= 2) rounds.push(r);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={onGenerate}
          className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
        >
          ↻ Régénérer / faire avancer le tableau
        </button>
      </div>
      {rounds.map(round => (
        <div key={round}>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            {ROUND_LABELS[round] ?? `Tour (${round} matchs)`}
          </h3>
          <div className="space-y-3">
            {Array.from({ length: round }, (_, position) => {
              const slot = resolveTeamTableauSlot(
                round,
                position,
                tableSize,
                placements,
                matchesByKey,
                teamById
              );

              if (slot.isBye) {
                return (
                  <div
                    key={position}
                    className="text-xs text-gray-500 px-3 py-2 bg-gray-50 border border-gray-200 rounded"
                  >
                    {slot.team?.name ?? '—'} qualifié(e) directement (exempt)
                  </div>
                );
              }

              if (!slot.match) {
                return (
                  <div
                    key={position}
                    className="text-xs text-gray-400 italic px-3 py-2 border border-dashed border-gray-200 rounded"
                  >
                    En attente des résultats précédents…
                  </div>
                );
              }

              return (
                <TeamPoolView
                  key={slot.match.id}
                  teams={teams}
                  matches={[slot.match]}
                  weapon={weapon}
                  targetRule={targetRule}
                  isEpee={isEpee}
                  isLaserPoints={isLaserPoints}
                  fencerName={fencerName}
                  scoringMatchId={scoringMatchId}
                  onToggleScoring={onToggleScoring}
                  onScoreBout={onScoreBout}
                  onResetBout={onResetBout}
                  boutCards={boutCards}
                  cardTarget={cardTarget}
                  onSetCardTarget={onSetCardTarget}
                  selectedReason={selectedReason}
                  onSelectReason={onSelectReason}
                  onAddCard={onAddCard}
                  emptyLabel=""
                  isLaserArena={isLaserArena}
                  boutCap={boutCap}
                  matchCards={matchCards}
                  onAddTeamCard={onAddTeamCard}
                  onAssignArena={onAssignArena}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TeamTableauView;
