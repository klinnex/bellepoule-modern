import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';
import { AnalyticsService } from '../services/analyticsService';
import type { FencerCompetitionStats } from '../../../shared/types';

interface CompetitionMetrics {
  totalFencers: number;
  completedMatches: number;
}

interface AnalyticsState {
  fencerStats: FencerCompetitionStats[];
  competitionMetrics: CompetitionMetrics | null;
  isLoading: boolean;
  error: string | null;
}

interface AnalyticsActions {
  loadFencerStats: (competitionId: string) => Promise<void>;
  loadCompetitionMetrics: (competitionId: string) => Promise<void>;
  clearError: () => void;
}

const service = new AnalyticsService();

export const useAnalyticsStore = create<AnalyticsState & AnalyticsActions>()(
  devtools(
    immer((set, get) => ({
      // State
      fencerStats: [],
      competitionMetrics: null,
      isLoading: false,
      error: null,

      // Actions
      loadFencerStats: async (competitionId: string) => {
        set({ isLoading: true, error: null });
        try {
          const stats = await service.getFencerStats(competitionId);
          set({ fencerStats: stats, isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to load stats',
            isLoading: false,
          });
        }
      },

      loadCompetitionMetrics: async (competitionId: string) => {
        set({ isLoading: true, error: null });
        try {
          const metrics = await service.getCompetitionMetrics(competitionId);
          set({ competitionMetrics: metrics, isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to load metrics',
            isLoading: false,
          });
        }
      },

      clearError: () => {
        set({ error: null });
      },
    })),
    { name: 'AnalyticsStore' }
  )
);

// ── Selector hooks ───────────────────────────────────────────────────────────
export const useFencerStats = () => useAnalyticsStore(useShallow(s => s.fencerStats));
export const useCompetitionMetrics = () => useAnalyticsStore(s => s.competitionMetrics);
export const useAnalyticsLoading = () => useAnalyticsStore(s => s.isLoading);
export const useAnalyticsError = () => useAnalyticsStore(s => s.error);
export const useAnalyticsActions = () =>
  useAnalyticsStore(
    useShallow(s => ({
      loadFencerStats: s.loadFencerStats,
      clearError: s.clearError,
    }))
  );
