/**
 * BellePoule Modern - Double Elimination Bracket
 * Feature 25: Winners and losers brackets
 * Licensed under GPL-3.0
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';

export interface DEBracketNode {
  id: string;
  round: number;
  bracket: 'winners' | 'losers' | 'final';
  matchNumber: number;
  fencerAId?: string;
  fencerBId?: string;
  winnerId?: string;
  loserToNodeId?: string; // Where loser goes (for winners bracket)
  winnerFromNodes?: string[]; // Which matches feed into this
  isComplete: boolean;
  scoreA?: number;
  scoreB?: number;
}

export interface DEBracket {
  id: string;
  competitionId: string;
  winnersBracket: DEBracketNode[];
  losersBracket: DEBracketNode[];
  final: DEBracketNode[];
  size: number; // Number of initial fencers
  isComplete: boolean;
  championId?: string;
  resetRequired: boolean; // If loser of final comes from winners bracket
}

export interface DEFencer {
  id: string;
  seed: number;
  eliminated: boolean;
  eliminationRound?: number;
  finalRank?: number;
}

interface DEBracketState {
  bracket: DEBracket | null;
  fencers: DEFencer[];
  isGenerating: boolean;
}

interface DEBracketActions {
  // Generation
  generateBracket: (competitionId: string, fencerIds: string[]) => DEBracket;

  // Match management
  updateMatchResult: (nodeId: string, scoreA: number, scoreB: number) => void;

  // Navigation
  advanceWinner: (nodeId: string) => void;
  advanceLoser: (nodeId: string) => void;

  // Bracket reset (for grand final)
  resetGrandFinal: () => void;

  // Queries
  getFencerPath: (fencerId: string) => DEBracketNode[];
  getNextMatch: (fencerId: string) => DEBracketNode | undefined;
  isInLosersBracket: (fencerId: string) => boolean;
  canWinChampionship: (fencerId: string) => boolean;

  // Completion
  finalizeBracket: () => void;
  getFinalRanking: () => DEFencer[];

  // Utils
  clearBracket: () => void;
}

export const useDEBracketStore = create<DEBracketState & DEBracketActions>()(
  devtools(
    immer((set, get) => ({
      // State
      bracket: null,
      fencers: [],
      isGenerating: false,

      // Actions
      generateBracket: (competitionId: string, fencerIds: string[]) => {
        set({ isGenerating: true });

        const size = fencerIds.length;
        const bracketSize = Math.pow(2, Math.ceil(Math.log2(size)));

        const winnersBracket: DEBracketNode[] = [];
        const losersBracket: DEBracketNode[] = [];
        const final: DEBracketNode[] = [];

        // Generate Winners Bracket
        let round = 1;
        let matchCount = bracketSize / 2;
        let matchNumber = 1;

        while (matchCount >= 1) {
          for (let i = 0; i < matchCount; i++) {
            const node: DEBracketNode = {
              id: `wb-r${round}-m${i + 1}`,
              round,
              bracket: 'winners',
              matchNumber: matchNumber++,
              isComplete: false,
            };

            // First round - assign fencers
            if (round === 1 && i < fencerIds.length / 2) {
              node.fencerAId = fencerIds[i * 2];
              node.fencerBId = fencerIds[i * 2 + 1];
            }

            winnersBracket.push(node);
          }
          matchCount /= 2;
          round++;
        }

        // Generate Losers Bracket (more complex, simplified here)
        // Would need detailed logic for losers bracket structure

        // Generate Final
        final.push({
          id: 'final-1',
          round: 1,
          bracket: 'final',
          matchNumber,
          isComplete: false,
        });

        const bracket: DEBracket = {
          id: `de-${Date.now()}`,
          competitionId,
          winnersBracket,
          losersBracket,
          final,
          size: bracketSize,
          isComplete: false,
          resetRequired: false,
        };

        const fencers: DEFencer[] = fencerIds.map((id, index) => ({
          id,
          seed: index + 1,
          eliminated: false,
        }));

        set({ bracket, fencers, isGenerating: false });
        return bracket;
      },

      updateMatchResult: (nodeId: string, scoreA: number, scoreB: number) => {
        set(state => {
          if (!state.bracket) return;

          const findAndUpdateNode = (nodes: DEBracketNode[]) => {
            const node = nodes.find(n => n.id === nodeId);
            if (node) {
              node.scoreA = scoreA;
              node.scoreB = scoreB;
              node.winnerId = scoreA > scoreB ? node.fencerAId : node.fencerBId;
              node.isComplete = true;
              return node;
            }
            return null;
          };

          findAndUpdateNode(state.bracket.winnersBracket) ||
            findAndUpdateNode(state.bracket.losersBracket) ||
            findAndUpdateNode(state.bracket.final);
        });
      },

      advanceWinner: (nodeId: string) => {
        set(state => {
          if (!state.bracket) return;

          const allNodes = [
            ...state.bracket.winnersBracket,
            ...state.bracket.losersBracket,
            ...state.bracket.final,
          ];
          const node = allNodes.find(n => n.id === nodeId);
          if (!node || !node.winnerId || !node.isComplete) return;

          // Find the next node that lists this node as a source
          const nextNode = allNodes.find(n => n.winnerFromNodes?.includes(nodeId));
          if (!nextNode) return;

          if (!nextNode.fencerAId) {
            nextNode.fencerAId = node.winnerId;
          } else if (!nextNode.fencerBId) {
            nextNode.fencerBId = node.winnerId;
          }
        });
      },

      advanceLoser: (nodeId: string) => {
        set(state => {
          if (!state.bracket) return;

          // Losers can only come from the winners bracket
          const node = state.bracket.winnersBracket.find(n => n.id === nodeId);
          if (!node || !node.isComplete || !node.winnerId) return;

          const loserId = node.winnerId === node.fencerAId ? node.fencerBId : node.fencerAId;
          if (!loserId || !node.loserToNodeId) return;

          const loserNode = state.bracket.losersBracket.find(n => n.id === node.loserToNodeId);
          if (!loserNode) return;

          if (!loserNode.fencerAId) {
            loserNode.fencerAId = loserId;
          } else if (!loserNode.fencerBId) {
            loserNode.fencerBId = loserId;
          }

          // Mark fencer as in losers bracket
          const fencerRecord = state.fencers.find(f => f.id === loserId);
          if (fencerRecord) {
            fencerRecord.eliminationRound = node.round;
          }
        });
      },

      resetGrandFinal: () => {
        set(state => {
          if (!state.bracket) return;
          state.bracket.resetRequired = true;

          // Add second final match if loser of first final was from winners bracket
          state.bracket.final.push({
            id: 'final-2',
            round: 2,
            bracket: 'final',
            matchNumber: state.bracket.final.length + 1,
            isComplete: false,
          });
        });
      },

      getFencerPath: (fencerId: string) => {
        const { bracket } = get();
        if (!bracket) return [];

        return [
          ...bracket.winnersBracket.filter(
            n => n.fencerAId === fencerId || n.fencerBId === fencerId
          ),
          ...bracket.losersBracket.filter(
            n => n.fencerAId === fencerId || n.fencerBId === fencerId
          ),
          ...bracket.final.filter(n => n.fencerAId === fencerId || n.fencerBId === fencerId),
        ];
      },

      getNextMatch: (fencerId: string) => {
        const { bracket } = get();
        if (!bracket) return undefined;

        // Find next incomplete match for this fencer
        const allMatches = [...bracket.winnersBracket, ...bracket.losersBracket, ...bracket.final];

        return allMatches.find(
          n => !n.isComplete && (n.fencerAId === fencerId || n.fencerBId === fencerId)
        );
      },

      isInLosersBracket: (fencerId: string) => {
        const { bracket } = get();
        if (!bracket) return false;

        return bracket.losersBracket.some(
          n => n.fencerAId === fencerId || n.fencerBId === fencerId
        );
      },

      canWinChampionship: (fencerId: string) => {
        const { bracket, fencers } = get();
        if (!bracket) return false;

        const fencer = fencers.find(f => f.id === fencerId);
        return !!fencer && !fencer.eliminated;
      },

      finalizeBracket: () => {
        set(state => {
          if (!state.bracket) return;
          state.bracket.isComplete = true;

          // Determine champion
          const finalMatch = state.bracket.final[state.bracket.final.length - 1];
          if (finalMatch?.winnerId) {
            state.bracket.championId = finalMatch.winnerId;
          }
        });
      },

      getFinalRanking: () => {
        const { bracket, fencers } = get();
        if (!bracket || !bracket.isComplete) return [];

        // Sort fencers by elimination round and final rank
        return [...fencers].sort((a, b) => {
          if (a.finalRank && b.finalRank) {
            return a.finalRank - b.finalRank;
          }
          return (a.eliminationRound || 999) - (b.eliminationRound || 999);
        });
      },

      clearBracket: () => {
        set({ bracket: null, fencers: [] });
      },
    })),
    { name: 'DEBracketStore' }
  )
);

// ── Selector hooks ───────────────────────────────────────────────────────────
export const useDEBracket = () => useDEBracketStore(s => s.bracket);
export const useDEFencers = () => useDEBracketStore(useShallow(s => s.fencers));
export const useDEGenerating = () => useDEBracketStore(s => s.isGenerating);
export const useDEActions = () =>
  useDEBracketStore(
    useShallow(s => ({
      generateBracket: s.generateBracket,
      updateMatchResult: s.updateMatchResult,
      advanceWinner: s.advanceWinner,
      advanceLoser: s.advanceLoser,
      finalizeBracket: s.finalizeBracket,
      clearBracket: s.clearBracket,
    }))
  );

export default useDEBracketStore;
