/**
 * BellePoule Modern - Optimized Pool Hooks
 * Memoized calculations for pool performance
 * Licensed under GPL-3.0
 */
import { Pool, Fencer, Weapon, PoolRanking } from '../../shared/types';
export declare const usePoolCalculations: (pool: Pool, weapon?: Weapon) => {
    fencerStats: any;
    poolRanking: any;
    matchCategories: any;
    isLaserSabre: boolean;
};
export declare const useOrderedMatches: (pool: Pool) => any;
export declare const useScoreEditing: () => {
    editingMatch: any;
    editScoreA: any;
    editScoreB: any;
    victoryA: any;
    victoryB: any;
    setEditScoreA: any;
    setEditScoreB: any;
    setVictoryA: any;
    setVictoryB: any;
    startEditing: any;
    cancelEditing: any;
    clearEditing: any;
};
export declare const useFencerDisplay: (fencers: Fencer[]) => {
    fencerById: any;
    getFencerDisplay: any;
    getFencerShortDisplay: any;
};
export declare const usePoolGridData: (pool: Pool, poolRanking: PoolRanking[]) => any;
//# sourceMappingURL=usePoolOptimizations.d.ts.map