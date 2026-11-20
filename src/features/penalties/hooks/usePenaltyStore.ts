/**
 * BellePoule Modern - Penalty Store
 * Feature 23: Card management system
 * Licensed under GPL-3.0
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';
import {
  Penalty,
  PenaltyHistory,
  PenaltyStats,
  CardType,
  PenaltyReason,
  CreatePenaltyDTO,
  DEFAULT_PENALTY_CONFIG,
  PenaltyConfig,
} from '../../../shared/domain/penalties/penalty.types';
import { createDebouncedJSONStorage } from '../../../shared/utils/debouncedStorage';

interface PenaltyState {
  penalties: Penalty[];
  config: PenaltyConfig;
  isLoading: boolean;
  error: string | null;
}

interface PenaltyActions {
  // Penalty management
  addPenalty: (data: CreatePenaltyDTO) => Penalty;
  removePenalty: (penaltyId: string) => void;
  updatePenalty: (penaltyId: string, updates: Partial<Penalty>) => void;

  // History and stats
  getFencerHistory: (fencerId: string) => PenaltyHistory;
  getPenaltyStats: () => PenaltyStats;

  // Validation
  shouldExcludeFencer: (fencerId: string) => boolean;
  getNextCardType: (fencerId: string) => CardType;
  calculateScoreImpact: (penalty: Penalty) => number;

  // Config
  updateConfig: (config: Partial<PenaltyConfig>) => void;

  // Utils
  clearError: () => void;
}

export const usePenaltyStore = create<PenaltyState & PenaltyActions>()(
  devtools(
    immer(
      persist(
        (set, get) => ({
          // State
          penalties: [],
          config: DEFAULT_PENALTY_CONFIG,
          isLoading: false,
          error: null,

          // Actions
          addPenalty: (data: CreatePenaltyDTO) => {
            const state = get();

            const penalty: Penalty = {
              id: `penalty-${Date.now()}`,
              fencerId: data.fencerId,
              matchId: data.matchId,
              cardType: data.cardType,
              reason: data.reason,
              customReason: data.customReason,
              timestamp: new Date(),
              strip: data.strip,
              bout: data.bout,
              givenBy: data.givenBy,
              notes: data.notes,
              scoreImpact:
                (state.config[
                  `${data.cardType.toLowerCase()}CardTouches` as keyof PenaltyConfig
                ] as number) || 0,
            };

            set(state => {
              state.penalties.push(penalty);
            });

            return penalty;
          },

          removePenalty: (penaltyId: string) => {
            set(state => {
              state.penalties = state.penalties.filter(p => p.id !== penaltyId);
            });
          },

          updatePenalty: (penaltyId: string, updates: Partial<Penalty>) => {
            set(state => {
              const penaltyIndex = state.penalties.findIndex(p => p.id === penaltyId);
              if (penaltyIndex !== -1) {
                Object.assign(state.penalties[penaltyIndex], updates);
              }
            });
          },

          getFencerHistory: (fencerId: string) => {
            const state = get();
            const fencerPenalties = state.penalties.filter(p => p.fencerId === fencerId);

            const whiteCards = fencerPenalties.filter(p => p.cardType === CardType.WHITE).length;
            const yellowCards = fencerPenalties.filter(p => p.cardType === CardType.YELLOW).length;
            const redCards = fencerPenalties.filter(p => p.cardType === CardType.RED).length;
            const blackCards = fencerPenalties.filter(p => p.cardType === CardType.BLACK).length;

            return {
              fencer: { id: fencerId } as any, // Would fetch actual fencer
              penalties: fencerPenalties,
              whiteCards,
              yellowCards,
              redCards,
              blackCards,
              isExcluded: yellowCards >= 2 || redCards >= 1 || blackCards >= 1,
              totalTouchesDeducted: fencerPenalties.reduce((sum, p) => sum + p.scoreImpact, 0),
            };
          },

          getPenaltyStats: () => {
            const state = get();
            const penalties = state.penalties;

            const byType = {
              [CardType.WHITE]: penalties.filter(p => p.cardType === CardType.WHITE).length,
              [CardType.YELLOW]: penalties.filter(p => p.cardType === CardType.YELLOW).length,
              [CardType.RED]: penalties.filter(p => p.cardType === CardType.RED).length,
              [CardType.BLACK]: penalties.filter(p => p.cardType === CardType.BLACK).length,
            };

            const byReason = Object.values(PenaltyReason).reduce(
              (acc, reason) => {
                acc[reason] = penalties.filter(p => p.reason === reason).length;
                return acc;
              },
              {} as Record<PenaltyReason, number>
            );

            const byFencer = penalties.reduce(
              (acc, p) => {
                acc[p.fencerId] = (acc[p.fencerId] || 0) + 1;
                return acc;
              },
              {} as Record<string, number>
            );

            const byMatch = penalties.reduce(
              (acc, p) => {
                acc[p.matchId] = (acc[p.matchId] || 0) + 1;
                return acc;
              },
              {} as Record<string, number>
            );

            // Find most penalized fencer
            const mostPenalizedFencerId = Object.entries(byFencer).sort(
              (a, b) => b[1] - a[1]
            )[0]?.[0];

            // Find most common reason
            const mostCommonReason = Object.entries(byReason).sort(
              (a, b) => b[1] - a[1]
            )[0]?.[0] as PenaltyReason;

            return {
              totalPenalties: penalties.length,
              byType,
              byReason,
              byFencer,
              byMatch,
              mostPenalizedFencer: mostPenalizedFencerId
                ? ({ id: mostPenalizedFencerId } as any)
                : undefined,
              mostCommonReason,
            };
          },

          shouldExcludeFencer: (fencerId: string) => {
            const history = get().getFencerHistory(fencerId);
            const { config } = get();

            return (
              history.yellowCards >= config.maxYellowBeforeRed ||
              history.redCards >= config.autoExcludeAfterReds ||
              history.blackCards > 0
            );
          },

          getNextCardType: (fencerId: string) => {
            const history = get().getFencerHistory(fencerId);
            const { config } = get();

            if (history.yellowCards >= config.maxYellowBeforeRed) {
              return CardType.RED;
            }
            return CardType.YELLOW;
          },

          calculateScoreImpact: (penalty: Penalty) => {
            const { config } = get();
            return (
              (config[
                `${penalty.cardType.toLowerCase()}CardTouches` as keyof PenaltyConfig
              ] as number) || 0
            );
          },

          updateConfig: (config: Partial<PenaltyConfig>) => {
            set(state => {
              Object.assign(state.config, config);
            });
          },

          clearError: () => {
            set({ error: null });
          },
        }),
        {
          name: 'penalty-store',
          // Écriture différée : un carton en plein match ne doit pas resérialiser tout l'historique.
          storage: createDebouncedJSONStorage(500),
          partialize: state => ({
            penalties: state.penalties,
            config: state.config,
          }),
        }
      )
    ),
    { name: 'PenaltyStore' }
  )
);

// ── Selector hooks ───────────────────────────────────────────────────────────
export const usePenalties = () => usePenaltyStore(useShallow(s => s.penalties));
export const usePenaltyConfig = () => usePenaltyStore(s => s.config);
export const usePenaltyLoading = () => usePenaltyStore(s => s.isLoading);
export const usePenaltyError = () => usePenaltyStore(s => s.error);
export const usePenaltyActions = () =>
  usePenaltyStore(
    useShallow(s => ({
      addPenalty: s.addPenalty,
      removePenalty: s.removePenalty,
      updatePenalty: s.updatePenalty,
      updateConfig: s.updateConfig,
    }))
  );

export default usePenaltyStore;
