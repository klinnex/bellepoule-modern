"use strict";
/**
 * BellePoule Modern - Tournament Flow Management
 * Intelligent scheduling system for tournament optimization
 * Licensed under GPL-3.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TOURNAMENT_CONFIG = exports.TournamentFlowManager = void 0;
const types_1 = require("../types");
class TournamentFlowManager {
    constructor(config) {
        this.historicalData = new Map(); // fencerId -> average match duration
        this.config = config;
    }
    /**
     * Optimize tournament flow for all remaining matches
     */
    async optimizeTournamentFlow(competition, pools, arenas, currentTime = new Date()) {
        const unscheduledMatches = this.getUnscheduledMatches(pools);
        const availableArenas = arenas.filter(arena => arena.available);
        // Create optimization model
        const schedule = await this.createOptimalSchedule(unscheduledMatches, availableArenas, currentTime);
        // Calculate metrics
        const metrics = this.calculateScheduleMetrics(schedule, arenas);
        return {
            schedule,
            metrics
        };
    }
    /**
     * Get all unscheduled matches from pools
     */
    getUnscheduledMatches(pools) {
        return pools.flatMap(pool => pool.matches.filter(match => match.status !== types_1.MatchStatus.FINISHED));
    }
    /**
     * Create optimal schedule using heuristic algorithms
     */
    async createOptimalSchedule(matches, arenas, startTime) {
        // Sort matches by priority (importance for tournament flow)
        const prioritizedMatches = this.prioritizeMatches(matches);
        const schedule = [];
        const arenaAvailability = new Map(arenas.map(arena => [arena.id, startTime]));
        for (const match of prioritizedMatches) {
            const bestSlot = this.findBestTimeSlot(match, arenas, arenaAvailability);
            if (bestSlot) {
                const scheduledMatch = {
                    match,
                    arenaId: bestSlot.arenaId,
                    scheduledTime: bestSlot.startTime,
                    estimatedDuration: this.estimateMatchDuration(match),
                    priority: bestSlot.priority
                };
                schedule.push(scheduledMatch);
                // Update arena availability
                const endTime = new Date(bestSlot.startTime.getTime() + bestSlot.duration * 60000);
                arenaAvailability.set(bestSlot.arenaId, endTime);
                // Update fencer availability (rest time tracking)
                this.updateFencerAvailability(match, endTime);
            }
        }
        return schedule.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
    }
    /**
     * Prioritize matches for optimal tournament flow
     */
    prioritizeMatches(matches) {
        return matches.sort((a, b) => {
            // Priority factors:
            // 1. Pool completion percentage
            // 2. Fencer rankings (higher ranked fencers get priority)
            // 3. Match dependencies
            const priorityA = this.calculateMatchPriority(a);
            const priorityB = this.calculateMatchPriority(b);
            return priorityB - priorityA;
        });
    }
    /**
     * Calculate match priority score
     */
    calculateMatchPriority(match) {
        let priority = 0;
        // Higher priority for matches in almost-complete pools
        if (match.poolId) {
            // This would need pool completion calculation
            priority += 10;
        }
        // Higher priority for higher-ranked fencers
        if (match.fencerA?.initialRanking) {
            priority += (100 - match.fencerA.initialRanking) * 0.1;
        }
        if (match.fencerB?.initialRanking) {
            priority += (100 - match.fencerB.initialRanking) * 0.1;
        }
        return priority;
    }
    /**
     * Find the best time slot for a match
     */
    findBestTimeSlot(match, arenas, arenaAvailability) {
        let bestSlot = null;
        let bestScore = -1;
        for (const arena of arenas) {
            if (!arena.available)
                continue;
            const availableFrom = arenaAvailability.get(arena.id) || new Date();
            const estimatedDuration = this.estimateMatchDuration(match);
            // Check fencer rest time
            const earliestStart = this.getEarliestStartAfterRest(match, availableFrom);
            const slot = {
                arenaId: arena.id,
                startTime: earliestStart,
                duration: estimatedDuration,
                priority: this.calculateArenaSlotPriority(arena, earliestStart, estimatedDuration)
            };
            const score = this.evaluateSlotQuality(match, slot);
            if (score > bestScore) {
                bestScore = score;
                bestSlot = slot;
            }
        }
        return bestSlot;
    }
    /**
     * Estimate match duration based on historical data and default values
     */
    estimateMatchDuration(match) {
        // Default duration - weapon type would come from competition data
        let duration = 15;
        // Adjust based on fencer historical performance
        if (match.fencerA?.id && this.historicalData.has(match.fencerA.id)) {
            duration = (duration + this.historicalData.get(match.fencerA.id)) / 2;
        }
        if (match.fencerB?.id && this.historicalData.has(match.fencerB.id)) {
            duration = (duration + this.historicalData.get(match.fencerB.id)) / 2;
        }
        return Math.max(duration, 5); // Minimum 5 minutes
    }
    /**
     * Get earliest start time respecting fencer rest periods
     */
    getEarliestStartAfterRest(match, availableFrom) {
        // This would track fencer availability
        // For now, return availableFrom
        return new Date(availableFrom);
    }
    /**
     * Calculate priority for a specific arena slot
     */
    calculateArenaSlotPriority(arena, startTime, duration) {
        let priority = 0;
        // Prefer less-used arenas (balance usage)
        priority += (100 - (arena.usageCount || 0)) * 0.1;
        // Prefer earlier time slots
        const hoursFromNow = (startTime.getTime() - Date.now()) / (1000 * 60 * 60);
        priority += Math.max(0, 10 - hoursFromNow);
        return priority;
    }
    /**
     * Evaluate the quality of a time slot for a match
     */
    evaluateSlotQuality(match, slot) {
        let score = 0;
        // Prefer shorter wait times
        const waitTime = (slot.startTime.getTime() - Date.now()) / (1000 * 60); // minutes
        score += Math.max(0, 100 - waitTime);
        // Prefer balanced arena usage
        score += 50; // This would be calculated based on arena usage history
        // Respect rest periods
        score += 30; // This would check fencer rest requirements
        return score;
    }
    /**
     * Update fencer availability tracking
     */
    updateFencerAvailability(match, endTime) {
        // Track when fencers will be available again
        // This would be used for rest time calculations
    }
    /**
     * Calculate schedule metrics
     */
    calculateScheduleMetrics(schedule, arenas) {
        // Calculate average wait time
        const waitTimes = schedule.map(slot => (slot.scheduledTime.getTime() - Date.now()) / (1000 * 60));
        const averageWaitTime = waitTimes.length > 0 ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0;
        // Calculate total duration
        const totalDuration = schedule.length > 0
            ? Math.max(...schedule.map(s => s.scheduledTime.getTime() + s.estimatedDuration * 60000)) - Date.now()
            : 0;
        // Calculate arena utilization
        const arenaUtilization = {};
        for (const arena of arenas) {
            const arenaMatches = schedule.filter(s => s.arenaId === arena.id);
            const totalMatchTime = arenaMatches.reduce((sum, m) => sum + m.estimatedDuration, 0);
            const scheduleTime = totalDuration / (1000 * 60); // Convert to minutes
            arenaUtilization[arena.id] = scheduleTime > 0 ? (totalMatchTime / scheduleTime) * 100 : 0;
        }
        return {
            averageWaitTime,
            totalDuration,
            arenaUtilization,
            fencerRestViolations: 0 // This would be calculated based on rest tracking
        };
    }
    /**
     * Update historical data with completed match
     */
    updateHistoricalData(match) {
        if (match.status !== types_1.MatchStatus.FINISHED)
            return;
        const duration = this.calculateActualDuration(match);
        if (match.fencerA?.id) {
            this.updateFencerAverage(match.fencerA.id, duration);
        }
        if (match.fencerB?.id) {
            this.updateFencerAverage(match.fencerB.id, duration);
        }
    }
    /**
     * Calculate actual match duration from timestamps
     */
    calculateActualDuration(match) {
        if (!match.createdAt || !match.updatedAt)
            return 15; // Default
        const start = new Date(match.createdAt).getTime();
        const end = new Date(match.updatedAt).getTime();
        return Math.max(5, (end - start) / (1000 * 60)); // At least 5 minutes
    }
    /**
     * Update fencer's average match duration
     */
    updateFencerAverage(fencerId, duration) {
        const current = this.historicalData.get(fencerId) || 15;
        const updated = (current + duration) / 2; // Simple moving average
        this.historicalData.set(fencerId, updated);
    }
    /**
     * Get real-time flow recommendations
     */
    getFlowRecommendations(currentSchedule, arenas, currentTime = new Date()) {
        const recommendations = [];
        // Check for bottleneck arenas
        const arenaUsage = this.calculateCurrentArenaUsage(currentSchedule, currentTime);
        const arenaEntries = Object.entries(arenaUsage);
        if (arenaEntries.length > 0) {
            const busiestArena = arenaEntries.reduce((a, b) => a[1] > b[1] ? a : b);
            if (busiestArena[1] > 80) {
                recommendations.push(`🏟️ Piste ${busiestArena[0]} très utilisée (${busiestArena[1]}%). Envisagez de répartir les matchs.`);
            }
            // Check for idle arenas
            const idleArenas = arenaEntries.filter(([_, usage]) => usage < 20);
            if (idleArenas.length > 0) {
                recommendations.push(`😴 ${idleArenas.length} pistes sous-utilisées. Optimisez la répartition.`);
            }
        }
        // Check for fencers with excessive wait times
        const longWaitMatches = currentSchedule.filter(match => (match.scheduledTime.getTime() - currentTime.getTime()) > this.config.maxWaitTime * 60000);
        if (longWaitMatches.length > 0) {
            recommendations.push(`⏰ ${longWaitMatches.length} matchs avec temps d'attente excessif. Considérez l'ajout de pistes.`);
        }
        return recommendations;
    }
    /**
     * Calculate current arena usage
     */
    calculateCurrentArenaUsage(schedule, currentTime) {
        const usage = {};
        for (const scheduledMatch of schedule) {
            const matchStart = scheduledMatch.scheduledTime.getTime();
            const matchEnd = matchStart + scheduledMatch.estimatedDuration * 60000;
            if (matchStart <= currentTime.getTime() && matchEnd >= currentTime.getTime()) {
                usage[scheduledMatch.arenaId] = (usage[scheduledMatch.arenaId] || 0) + 1;
            }
        }
        // Convert to percentages
        const totalMatches = Math.max(1, Object.values(usage).reduce((a, b) => a + b, 0));
        Object.keys(usage).forEach(arenaId => {
            usage[arenaId] = (usage[arenaId] / totalMatches) * 100;
        });
        return usage;
    }
    /**
     * Generate predictive insights
     */
    generatePredictiveInsights(competition, pools, schedule) {
        const totalMatches = pools.reduce((sum, pool) => sum + pool.matches.length, 0);
        const scheduledMatches = schedule.length;
        const remainingMatches = totalMatches - scheduledMatches;
        // Estimate finish time
        const avgMatchDuration = 15; // minutes
        const estimatedRemainingMinutes = remainingMatches * avgMatchDuration / this.config.maxConcurrentMatches;
        const estimatedFinishTime = new Date(Date.now() + estimatedRemainingMinutes * 60000);
        // Identify potential bottlenecks
        const bottlenecks = [];
        if (remainingMatches > 20 && this.config.maxConcurrentMatches < 4) {
            bottlenecks.push('Trop peu de pistes pour le nombre de matchs restants');
        }
        return {
            estimatedFinishTime,
            bottlenecks,
            recommendations: [
                'Augmenter le nombre de pistes simultanées pour réduire les temps d\'attente',
                'Optimiser les pauses entre les matchs pour améliorer l\'expérience des tireurs'
            ]
        };
    }
}
exports.TournamentFlowManager = TournamentFlowManager;
// Default configuration
exports.DEFAULT_TOURNAMENT_CONFIG = {
    maxConcurrentMatches: 4,
    minRestTime: 10, // 10 minutes between matches
    maxWaitTime: 30, // 30 minutes maximum wait time
    balanceStripUsage: true,
    optimizeFencerRest: true
};
//# sourceMappingURL=tournamentFlow.js.map