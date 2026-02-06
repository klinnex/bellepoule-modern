/**
 * BellePoule Modern - Optimized Pool Hooks
 * Memoized calculations for pool performance
 * Licensed under GPL-3.0
 */
import { Pool, Fencer, Match, Weapon, PoolRanking } from '../../shared/types';
export declare const usePoolCalculations: (pool: Pool, weapon?: Weapon) => {
    fencerStats: Map<string, {
        victories: number;
        defeats: number;
        touchesScored: number;
        touchesReceived: number;
        matchesPlayed: number;
    }>;
    poolRanking: PoolRanking[];
    matchCategories: {
        pending: {
            match: Match;
            index: number;
        }[];
        finished: {
            match: Match;
            index: number;
        }[];
    };
    isLaserSabre: boolean;
};
export declare const useOrderedMatches: (pool: Pool) => {
    pending: {
        match: Match;
        index: number;
    }[];
    finished: {
        match: Match;
        index: number;
    }[];
};
export declare const useScoreEditing: () => {
    editingMatch: number | null;
    editScoreA: string;
    editScoreB: string;
    victoryA: boolean;
    victoryB: boolean;
    setEditScoreA: import("react").Dispatch<import("react").SetStateAction<string>>;
    setEditScoreB: import("react").Dispatch<import("react").SetStateAction<string>>;
    setVictoryA: import("react").Dispatch<import("react").SetStateAction<boolean>>;
    setVictoryB: import("react").Dispatch<import("react").SetStateAction<boolean>>;
    startEditing: (match: Match) => void;
    cancelEditing: () => void;
    clearEditing: () => void;
};
export declare const useFencerDisplay: (fencers: Fencer[]) => {
    fencerById: Map<string, Fencer>;
    getFencerDisplay: (fencer: Fencer | null) => string;
    getFencerShortDisplay: (fencer: Fencer | null) => string;
};
export declare const usePoolGridData: (pool: Pool, poolRanking: PoolRanking[]) => {
    grid: {
        fencerA: Fencer;
        fencerB: Fencer;
        match: Match | null;
        score: string;
        winner: "A" | "B" | null;
    }[][];
    gridSize: number;
};
//# sourceMappingURL=usePoolOptimizations.d.ts.map