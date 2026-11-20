/**
 * BellePoule Modern - Team Competition Store
 * Feature 22: State management for team events
 * Licensed under GPL-3.0
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';
import {
  Team,
  TeamMatch,
  TeamPool,
  CreateTeamDTO,
  UpdateTeamBoutScoreDTO,
  TeamStats,
} from '../../../shared/domain/teams/team.types';

interface TeamState {
  teams: Team[];
  matches: TeamMatch[];
  pools: TeamPool[];
  currentMatch: TeamMatch | null;
  isLoading: boolean;
  error: string | null;
}

interface TeamActions {
  // Team management
  addTeam: (data: CreateTeamDTO) => void;
  updateTeam: (teamId: string, updates: Partial<Team>) => void;
  removeTeam: (teamId: string) => void;

  // Match management
  createMatch: (teamAId: string, teamBId: string) => TeamMatch;
  updateBoutScore: (matchId: string, boutData: UpdateTeamBoutScoreDTO) => void;
  startNextBout: (matchId: string) => void;
  finishMatch: (matchId: string, winnerId: string) => void;
  setCurrentMatch: (match: TeamMatch | null) => void;

  // Pool management
  generatePools: (teamIds: string[], poolSize: number) => void;
  computePoolRanking: (poolId: string) => void;

  // Stats
  getTeamStats: (teamId: string) => TeamStats;

  // Utils
  clearError: () => void;
}

export const useTeamStore = create<TeamState & TeamActions>()(
  devtools(
    immer(
      persist(
        (set, get) => ({
          // State
          teams: [],
          matches: [],
          pools: [],
          currentMatch: null,
          isLoading: false,
          error: null,

          // Actions
          addTeam: (data: CreateTeamDTO) => {
            set(state => {
              const newTeam: Team = {
                id: `team-${Date.now()}`,
                name: data.name,
                club: data.club,
                fencers: [], // Would fetch from fencer IDs
                reserveFencers: [],
                totalPoints: 0,
                ranking: 0,
              };
              state.teams.push(newTeam);
            });
          },

          updateTeam: (teamId: string, updates: Partial<Team>) => {
            set(state => {
              const teamIndex = state.teams.findIndex(t => t.id === teamId);
              if (teamIndex !== -1) {
                Object.assign(state.teams[teamIndex], updates);
              }
            });
          },

          removeTeam: (teamId: string) => {
            set(state => {
              state.teams = state.teams.filter(t => t.id !== teamId);
            });
          },

          createMatch: (teamAId: string, teamBId: string) => {
            const state = get();
            const teamA = state.teams.find(t => t.id === teamAId);
            const teamB = state.teams.find(t => t.id === teamBId);

            if (!teamA || !teamB) {
              throw new Error('Teams not found');
            }

            const match: TeamMatch = {
              id: `match-${Date.now()}`,
              teamA,
              teamB,
              bouts: [], // Generate relay bouts
              scoreA: 0,
              scoreB: 0,
              status: 'not_started',
              currentBoutIndex: 0,
            };

            set(state => {
              state.matches.push(match);
            });

            return match;
          },

          updateBoutScore: (matchId: string, boutData: UpdateTeamBoutScoreDTO) => {
            set(state => {
              const match = state.matches.find(m => m.id === matchId);
              if (!match) return;

              const bout = match.bouts.find(b => b.id === boutData.boutId);
              if (!bout) return;

              bout.scoreA = boutData.scoreA;
              bout.scoreB = boutData.scoreB;
              bout.status = boutData.status;

              if (boutData.status === 'finished') {
                bout.winner = bout.scoreA > bout.scoreB ? bout.fencerA : bout.fencerB;
                bout.endTime = new Date();

                // Update match score
                if (bout.winner.teamOrder <= 3) {
                  // Main fencers only
                  if (bout.winner === bout.fencerA) {
                    match.scoreA += 1;
                  } else {
                    match.scoreB += 1;
                  }
                }
              }
            });
          },

          startNextBout: (matchId: string) => {
            set(state => {
              const match = state.matches.find(m => m.id === matchId);
              if (!match) return;

              if (match.currentBoutIndex < match.bouts.length) {
                match.status = 'in_progress';
                const nextBout = match.bouts[match.currentBoutIndex];
                nextBout.status = 'in_progress';
                nextBout.startTime = new Date();
                match.currentBoutIndex += 1;
              }
            });
          },

          finishMatch: (matchId: string, winnerId: string) => {
            set(state => {
              const match = state.matches.find(m => m.id === matchId);
              if (!match) return;

              match.status = 'finished';
              match.winner = match.teamA.id === winnerId ? match.teamA : match.teamB;
            });
          },

          setCurrentMatch: match => {
            set({ currentMatch: match });
          },

          generatePools: (teamIds: string[], poolSize: number) => {
            // Implementation for pool generation
            set(state => {
              const teams = state.teams.filter(t => teamIds.includes(t.id));
              const numPools = Math.ceil(teams.length / poolSize);

              for (let i = 0; i < numPools; i++) {
                const poolTeams = teams.slice(i * poolSize, (i + 1) * poolSize);
                const pool: TeamPool = {
                  id: `pool-${i + 1}`,
                  name: `Poule ${i + 1}`,
                  teams: poolTeams,
                  matches: [],
                  ranking: [],
                  isComplete: false,
                };
                state.pools.push(pool);
              }
            });
          },

          computePoolRanking: (poolId: string) => {
            set(state => {
              const pool = state.pools.find(p => p.id === poolId);
              if (!pool) return;

              // Calculate ranking based on victories, bouts, etc.
              pool.ranking = pool.teams
                .map(team => ({
                  team,
                  rank: 0,
                  victories: 0,
                  boutsWon: 0,
                  boutsLost: 0,
                  pointsScored: 0,
                  pointsReceived: 0,
                  index: 0,
                }))
                .sort((a, b) => b.victories - a.victories || b.index - a.index);

              // Assign ranks
              pool.ranking.forEach((r, i) => {
                r.rank = i + 1;
              });
            });
          },

          getTeamStats: (teamId: string) => {
            const state = get();
            const team = state.teams.find(t => t.id === teamId);

            if (!team) {
              throw new Error('Team not found');
            }

            const teamMatches = state.matches.filter(
              m => m.teamA.id === teamId || m.teamB.id === teamId
            );

            const wonMatches = teamMatches.filter(m => m.winner?.id === teamId).length;
            const totalBouts = teamMatches.reduce((sum, m) => sum + m.bouts.length, 0);
            const wonBouts = teamMatches.reduce(
              (sum, m) =>
                sum +
                m.bouts.filter(
                  b =>
                    b.status === 'finished' &&
                    b.winner?.id &&
                    team.fencers.some(f => f.id === b.winner?.id)
                ).length,
              0
            );

            return {
              totalMatches: teamMatches.length,
              wonMatches,
              lostMatches: teamMatches.length - wonMatches,
              totalBouts,
              wonBouts,
              winRate: teamMatches.length > 0 ? (wonMatches / teamMatches.length) * 100 : 0,
              averageBoutDuration: 0, // Would calculate from bout times
            };
          },

          clearError: () => {
            set({ error: null });
          },
        }),
        {
          name: 'team-store',
          partialize: state => ({
            teams: state.teams,
            matches: state.matches,
            pools: state.pools,
          }),
        }
      )
    ),
    { name: 'TeamStore' }
  )
);

// ── Selector hooks ───────────────────────────────────────────────────────────
export const useTeams = () => useTeamStore(useShallow(s => s.teams));
export const useTeamMatches = () => useTeamStore(useShallow(s => s.matches));
export const useTeamPools = () => useTeamStore(useShallow(s => s.pools));
export const useCurrentTeamMatch = () => useTeamStore(s => s.currentMatch);
export const useTeamLoading = () => useTeamStore(s => s.isLoading);
export const useTeamError = () => useTeamStore(s => s.error);

export default useTeamStore;
