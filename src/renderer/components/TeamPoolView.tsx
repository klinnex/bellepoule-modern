/**
 * BellePoule Modern - Vue poule équipes
 * Composant présentationnel : l'état (matchs, cartons, sélection) est possédé
 * par le parent (TeamManagerView), suivant le même pattern que PoolView/PoolRankingView.
 * Licensed under GPL-3.0
 */

import React from 'react';
import { Card, CardReason, TargetZone, ZONE_POINTS } from '../../shared/types';
import { TeamRow, TeamMatchRow, TeamBoutRow, TeamMatchCardRow } from '../../features/teams/types/team.types';
import { TeamTargetRule, getRelayCap } from '../../features/teams/utils/teamCalculations';
import { LaserArenaBoutCap } from '../../features/teams/utils/laserArenaCalculations';
import { determineTeamCardEscalation } from '../../features/teams/utils/teamCardEscalation';
import { CARD_REASON_LABELS, getAvailableReasons } from '../../shared/utils/cardSystem';

const CARD_BADGE: Record<string, string> = { WHITE: '⬜', YELLOW: '🟨', RED: '🟥', BLACK: '⬛' };
const TEAM_CARD_BADGE: Record<string, string> = { white: '⬜', yellow: '🟨', red: '🟥', black: '⬛' };
const TEAM_CARD_TYPES: Array<'white' | 'yellow' | 'red' | 'black'> = ['white', 'yellow', 'red', 'black'];

export interface CardTarget {
  boutId: string;
  fencerId: string;
}

interface Props {
  teams: TeamRow[];
  matches: TeamMatchRow[];
  weapon: string; // Weapon enum value (competition.weapon)
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
  emptyLabel: string;
  // Format arène Sabre Laser uniquement (`isLaserArena`) : plafond d'assaut fixe
  // (5 touches/3min au lieu de la cible progressive FIE) et cartons d'équipe "E"
  // (retard de désignation), distincts des cartons individuels par tireur.
  isLaserArena?: boolean;
  boutCap?: LaserArenaBoutCap;
  matchCards?: Record<string, TeamMatchCardRow[]>;
  onAddTeamCard?: (matchId: string, teamId: string, type: 'white' | 'yellow' | 'red' | 'black') => void;
  onAssignArena?: (matchId: string, arenaId: string) => void;
}

const TeamPoolView: React.FC<Props> = ({
  teams,
  matches,
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
  emptyLabel,
  isLaserArena = false,
  boutCap,
  matchCards = {},
  onAddTeamCard,
  onAssignArena,
}) => {
  const teamById = new Map(teams.map(t => [t.id, t]));

  if (matches.length === 0) {
    return <div className="text-center text-gray-400 py-10">{emptyLabel}</div>;
  }

  return (
    <div className="space-y-4">
      {matches.map(m => {
        const ta = teamById.get(m.teamAId);
        const tb = teamById.get(m.teamBId);
        const isScoring = scoringMatchId === m.id;
        const statusColor =
          m.status === 'finished'
            ? 'bg-green-50 border-green-200'
            : m.status === 'in_progress'
              ? 'bg-yellow-50 border-yellow-200'
              : 'bg-white border-gray-200';

        return (
          <div key={m.id} className={`border rounded-lg overflow-hidden ${statusColor}`}>
            {/* Match header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-4 flex-1">
                <div className="text-center flex-1">
                  <div className="font-bold text-gray-900">{ta?.name ?? '—'}</div>
                  <div className="text-xs text-gray-400">{ta?.club}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-700">
                    {m.scoreBoutsA} – {m.scoreBoutsB}
                  </div>
                  <div
                    className={`text-xs font-medium ${m.status === 'finished' ? 'text-green-600' : m.status === 'in_progress' ? 'text-yellow-600' : 'text-gray-400'}`}
                  >
                    {m.status === 'finished'
                      ? (m.winnerId === m.teamAId ? ta?.name : tb?.name) + ' gagne'
                      : m.status === 'in_progress'
                        ? 'En cours'
                        : 'À commencer'}
                  </div>
                </div>
                <div className="text-center flex-1">
                  <div className="font-bold text-gray-900">{tb?.name ?? '—'}</div>
                  <div className="text-xs text-gray-400">{tb?.club}</div>
                </div>
              </div>
              {isLaserArena && onAssignArena && (
                <button
                  onClick={() => {
                    const arenaId = window.prompt(
                      "Numéro d'arène pour la saisie tablette (ex : 1)"
                    );
                    if (arenaId?.trim()) onAssignArena(m.id, arenaId.trim());
                  }}
                  title="Envoyer cette rencontre sur une arène pour saisie tablette temps réel"
                  className="ml-4 text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  📡 Arène
                </button>
              )}
              <button
                onClick={() => onToggleScoring(m.id)}
                className={`ml-4 text-xs px-3 py-1.5 rounded border ${isScoring ? 'bg-gray-200 border-gray-300 text-gray-700' : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'}`}
              >
                {isScoring ? 'Fermer' : 'Scorer'}
              </button>
            </div>

            {/* Assauts */}
            {isScoring && (
              <div className="border-t border-gray-200 px-4 py-3 space-y-1">
                <div className="grid grid-cols-[1fr_auto_1fr] text-xs text-gray-500 font-medium mb-2">
                  <span>{ta?.name}</span>
                  <span className="text-center w-24">Assaut</span>
                  <span className="text-right">{tb?.name}</span>
                </div>
                {m.bouts.map(bout => {
                  const fa = fencerName(bout.fencerAId);
                  const fb = fencerName(bout.fencerBId);
                  const done = bout.status === 'finished';
                  const cap = isLaserArena
                    ? (boutCap?.maxTouches ?? 5)
                    : Math.min(getRelayCap(bout.boutOrder - 1, targetRule.stepSize), targetRule.target);
                  const cardsA = (boutCards[bout.id] ?? []).filter(
                    c => c.fencerId === bout.fencerAId
                  );
                  const cardsB = (boutCards[bout.id] ?? []).filter(
                    c => c.fencerId === bout.fencerBId
                  );

                  return (
                    <React.Fragment key={bout.id}>
                      <div
                        className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1.5 px-2 rounded ${done ? 'bg-gray-50 opacity-70' : 'bg-white border border-gray-100'}`}
                      >
                        {/* Côté A */}
                        <div className="flex items-center gap-2">
                          {isLaserPoints ? (
                            <div className="flex gap-0.5">
                              {(
                                [TargetZone.ZONE_A, TargetZone.ZONE_B, TargetZone.ZONE_C] as const
                              ).map(zone => (
                                <button
                                  key={zone}
                                  onClick={() => onScoreBout(bout, 'A', ZONE_POINTS[zone])}
                                  disabled={done}
                                  title={`Zone ${zone} (${ZONE_POINTS[zone]} pts)`}
                                  className="w-6 h-8 text-xs font-bold rounded bg-blue-100 text-blue-800 hover:bg-blue-200 disabled:opacity-40 flex-shrink-0"
                                >
                                  {zone}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <button
                              onClick={() => onScoreBout(bout, 'A')}
                              disabled={done}
                              className="w-8 h-8 text-sm font-bold rounded-full bg-blue-100 text-blue-800 hover:bg-blue-200 disabled:opacity-40 flex-shrink-0"
                            >
                              +
                            </button>
                          )}
                          <span className="text-sm font-medium truncate">{fa}</span>
                          {cardsA.map(c => (
                            <span key={c.id} title={CARD_REASON_LABELS[c.reason]}>
                              {CARD_BADGE[c.type]}
                            </span>
                          ))}
                          <button
                            onClick={() =>
                              onSetCardTarget(
                                cardTarget?.boutId === bout.id &&
                                  cardTarget.fencerId === bout.fencerAId
                                  ? null
                                  : { boutId: bout.id, fencerId: bout.fencerAId }
                              )
                            }
                            title="Ajouter un carton"
                            className="text-[10px] text-gray-400 hover:text-gray-600 flex-shrink-0"
                          >
                            🚩
                          </button>
                        </div>
                        {/* Score */}
                        <div className="text-center w-24">
                          <span
                            className={`font-mono text-sm font-bold ${done ? (bout.winnerId === bout.fencerAId ? 'text-green-600' : 'text-red-500') : 'text-gray-700'}`}
                          >
                            {bout.scoreA}
                          </span>
                          <span className="text-gray-400 mx-1">–</span>
                          <span
                            className={`font-mono text-sm font-bold ${done ? (bout.winnerId === bout.fencerBId ? 'text-green-600' : 'text-red-500') : 'text-gray-700'}`}
                          >
                            {bout.scoreB}
                          </span>
                          <div className="text-xs text-gray-400">
                            /{cap} · A{bout.boutOrder}
                          </div>
                          {isEpee && (
                            <button
                              onClick={() => onScoreBout(bout, 'double')}
                              disabled={done}
                              title="Touche double simultanée (pas de priorité en épée)"
                              className="mt-0.5 text-[10px] px-1.5 py-0.5 rounded border border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-40"
                            >
                              ⚔ double
                            </button>
                          )}
                        </div>
                        {/* Côté B */}
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() =>
                              onSetCardTarget(
                                cardTarget?.boutId === bout.id &&
                                  cardTarget.fencerId === bout.fencerBId
                                  ? null
                                  : { boutId: bout.id, fencerId: bout.fencerBId }
                              )
                            }
                            title="Ajouter un carton"
                            className="text-[10px] text-gray-400 hover:text-gray-600 flex-shrink-0"
                          >
                            🚩
                          </button>
                          {cardsB.map(c => (
                            <span key={c.id} title={CARD_REASON_LABELS[c.reason]}>
                              {CARD_BADGE[c.type]}
                            </span>
                          ))}
                          <span className="text-sm font-medium truncate text-right">{fb}</span>
                          {isLaserPoints ? (
                            <div className="flex gap-0.5">
                              {(
                                [TargetZone.ZONE_A, TargetZone.ZONE_B, TargetZone.ZONE_C] as const
                              ).map(zone => (
                                <button
                                  key={zone}
                                  onClick={() => onScoreBout(bout, 'B', ZONE_POINTS[zone])}
                                  disabled={done}
                                  title={`Zone ${zone} (${ZONE_POINTS[zone]} pts)`}
                                  className="w-6 h-8 text-xs font-bold rounded bg-blue-100 text-blue-800 hover:bg-blue-200 disabled:opacity-40 flex-shrink-0"
                                >
                                  {zone}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <button
                              onClick={() => onScoreBout(bout, 'B')}
                              disabled={done}
                              className="w-8 h-8 text-sm font-bold rounded-full bg-blue-100 text-blue-800 hover:bg-blue-200 disabled:opacity-40 flex-shrink-0"
                            >
                              +
                            </button>
                          )}
                          {done && (
                            <button
                              onClick={() => onResetBout(bout)}
                              className="w-6 h-6 text-xs rounded text-red-400 hover:text-red-600 flex-shrink-0"
                              title="Réinitialiser cet assaut"
                            >
                              ↩
                            </button>
                          )}
                        </div>
                      </div>
                      {cardTarget?.boutId === bout.id && (
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-yellow-50 border border-yellow-200 rounded text-xs">
                          <span className="text-gray-600">
                            Carton pour {fencerName(cardTarget.fencerId)} :
                          </span>
                          <select
                            value={selectedReason}
                            onChange={e => onSelectReason(e.target.value as CardReason)}
                            className="border border-gray-300 rounded px-1.5 py-1 text-xs"
                          >
                            <option value="">-- motif --</option>
                            {getAvailableReasons(weapon as any).map(reason => (
                              <option key={reason} value={reason}>
                                {CARD_REASON_LABELS[reason]}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => onAddCard(m.id)}
                            disabled={!selectedReason}
                            className="px-2 py-1 bg-yellow-600 text-white rounded disabled:opacity-40"
                          >
                            Ajouter
                          </button>
                          <button
                            onClick={() => onSetCardTarget(null)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Annuler
                          </button>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
                {isLaserArena && onAddTeamCard && (
                  <div className="mt-2 pt-2 border-t border-gray-200 grid grid-cols-2 gap-3 text-xs">
                    {([['A', ta, m.teamAId] as const, ['B', tb, m.teamBId] as const]).map(
                      ([side, team, teamId]) => {
                        const cards = (matchCards[m.id] ?? []).filter(c => c.teamId === teamId);
                        const suggested = determineTeamCardEscalation(cards);
                        return (
                          <div key={side} className={side === 'B' ? 'text-right' : ''}>
                            <div className="text-gray-500 mb-1">
                              Cartons équipe « E » — {team?.name ?? '—'}
                            </div>
                            <div
                              className={`flex items-center gap-1 flex-wrap ${side === 'B' ? 'justify-end' : ''}`}
                            >
                              {TEAM_CARD_TYPES.map(type => (
                                <button
                                  key={type}
                                  onClick={() => onAddTeamCard(m.id, teamId, type)}
                                  title={`Carton ${type} E${type === suggested ? ' (suggéré)' : ''}`}
                                  className={`px-1.5 py-0.5 rounded border hover:bg-gray-50 ${type === suggested ? 'border-blue-400 ring-1 ring-blue-300' : 'border-gray-200'}`}
                                >
                                  {TEAM_CARD_BADGE[type]}
                                </button>
                              ))}
                              {cards.map(c => (
                                <span key={c.id} title={c.reason}>
                                  {TEAM_CARD_BADGE[c.type]}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default TeamPoolView;
