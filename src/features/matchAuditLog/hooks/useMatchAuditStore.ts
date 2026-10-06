/**
 * BellePoule Modern - Match Audit Log Store
 * Licensed under GPL-3.0
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';
import type { MatchEventEntry, MatchEventType } from '../../../shared/types';

interface MatchAuditState {
  entries: MatchEventEntry[];
  isLoading: boolean;
  error: string | null;
  activeMatchId: string | null;
  activeCompetitionId: string | null;
  filterTypes: MatchEventType[];
}

interface MatchAuditActions {
  loadMatchTimeline: (matchId: string) => Promise<void>;
  loadCompetitionTimeline: (competitionId: string) => Promise<void>;
  setFilterTypes: (types: MatchEventType[]) => void;
  clearError: () => void;
  reset: () => void;
}

export const useMatchAuditStore = create<MatchAuditState & MatchAuditActions>()(
  devtools(
    immer(set => ({
      entries: [],
      isLoading: false,
      error: null,
      activeMatchId: null,
      activeCompetitionId: null,
      filterTypes: [],

      loadMatchTimeline: async (matchId: string) => {
        set({ isLoading: true, error: null, activeMatchId: matchId, activeCompetitionId: null });
        try {
          const data = await window.electronAPI.db.getMatchTimeline(matchId);
          set({ entries: data, isLoading: false });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Erreur chargement', isLoading: false });
        }
      },

      loadCompetitionTimeline: async (competitionId: string) => {
        set({
          isLoading: true,
          error: null,
          activeCompetitionId: competitionId,
          activeMatchId: null,
        });
        try {
          const data = await window.electronAPI.db.getCompetitionTimeline(competitionId);
          set({ entries: data, isLoading: false });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Erreur chargement', isLoading: false });
        }
      },

      setFilterTypes: (types: MatchEventType[]) => set({ filterTypes: types }),
      clearError: () => set({ error: null }),
      reset: () =>
        set({
          entries: [],
          isLoading: false,
          error: null,
          activeMatchId: null,
          activeCompetitionId: null,
        }),
    })),
    { name: 'MatchAuditStore' }
  )
);

export const useMatchAuditEntries = () => useMatchAuditStore(s => s.entries);
export const useMatchAuditLoading = () => useMatchAuditStore(s => s.isLoading);
export const useMatchAuditActions = () =>
  useMatchAuditStore(
    useShallow(s => ({
      loadMatchTimeline: s.loadMatchTimeline,
      loadCompetitionTimeline: s.loadCompetitionTimeline,
      setFilterTypes: s.setFilterTypes,
      reset: s.reset,
    }))
  );
