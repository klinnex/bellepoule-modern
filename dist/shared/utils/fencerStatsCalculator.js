"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FencerStatsCalculator = void 0;
const types_1 = require("../types");
/**
 * Calculateur optimisé de statistiques pour les tireurs
 */
class FencerStatsCalculator {
    /**
     * Calcule les statistiques d'un tireur dans une poule (version optimisée)
     */
    static calculateFencerPoolStats(fencer, matches) {
        let victories = 0;
        let defeats = 0;
        let touchesScored = 0;
        let touchesReceived = 0;
        let matchesPlayed = 0;
        // Optimisation: pré-filtrer les matchs concernés
        const fencerMatches = matches.filter(match => {
            const isA = match.fencerA?.id === fencer.id;
            const isB = match.fencerB?.id === fencer.id;
            return (isA || isB) && match.status === types_1.MatchStatus.FINISHED;
        });
        for (const match of fencerMatches) {
            const isA = match.fencerA?.id === fencer.id;
            const myScore = isA ? match.scoreA : match.scoreB;
            const oppScore = isA ? match.scoreB : match.scoreA;
            if (!myScore || !oppScore)
                continue;
            matchesPlayed++;
            // Gestion des cas spéciaux (optimisée)
            if (myScore.isAbstention || myScore.isExclusion || myScore.isForfait) {
                defeats++;
                touchesReceived += oppScore.value ?? 0;
                touchesScored += myScore.value ?? 0;
            }
            else if (oppScore.isAbstention || oppScore.isExclusion || oppScore.isForfait) {
                victories++;
                touchesScored += myScore.value ?? 0;
                touchesReceived += oppScore.value ?? 0;
            }
            else if (myScore.isVictory) {
                victories++;
                touchesScored += myScore.value ?? 0;
                touchesReceived += oppScore.value ?? 0;
            }
            else {
                defeats++;
                touchesScored += myScore.value ?? 0;
                touchesReceived += oppScore.value ?? 0;
            }
        }
        return {
            matchesPlayed,
            victories,
            defeats,
            touchesScored,
            touchesReceived,
            index: touchesScored - touchesReceived,
            victoryRatio: matchesPlayed > 0 ? victories / matchesPlayed : 0,
        };
    }
    /**
     * Calcule les statistiques de plusieurs tireurs en lot (optimisé)
     */
    static calculateStatsBatch(fencers, matches) {
        const statsMap = new Map();
        // Optimisation: traiter tous les tireurs en une seule passe
        fencers.forEach(fencer => {
            statsMap.set(fencer.id, this.calculateFencerPoolStats(fencer, matches));
        });
        return statsMap;
    }
    /**
     * Calcule les statistiques Quest d'un tireur (version optimisée)
     */
    static calculateFencerQuestStats(fencer, matches) {
        let questPoints = 0;
        let v4 = 0, v3 = 0, v2 = 0, v1 = 0;
        // Optimisation: pré-filtrer les matchs concernés
        const fencerMatches = matches.filter(match => {
            const isA = match.fencerA?.id === fencer.id;
            const isB = match.fencerB?.id === fencer.id;
            return (isA || isB) && match.status === types_1.MatchStatus.FINISHED;
        });
        for (const match of fencerMatches) {
            const isA = match.fencerA?.id === fencer.id;
            const myScore = isA ? match.scoreA : match.scoreB;
            const oppScore = isA ? match.scoreB : match.scoreA;
            if (!myScore || !oppScore)
                continue;
            const isVictory = myScore.isVictory ||
                (oppScore.isAbstention || oppScore.isExclusion || oppScore.isForfait);
            if (isVictory && myScore.value !== null && oppScore.value !== null) {
                const points = this.calculateQuestPoints(myScore.value, oppScore.value);
                questPoints += points;
                switch (points) {
                    case 4:
                        v4++;
                        break;
                    case 3:
                        v3++;
                        break;
                    case 2:
                        v2++;
                        break;
                    case 1:
                        v1++;
                        break;
                }
            }
        }
        return { questPoints, v4, v3, v2, v1 };
    }
    /**
     * Calcule les points Quest selon l'écart de score
     */
    static calculateQuestPoints(myScore, oppScore) {
        const diff = myScore - oppScore;
        if (diff >= 12)
            return 4; // Écart très important (≥12 points)
        if (diff >= 8)
            return 3; // Écart important (8-11 points)
        if (diff >= 4)
            return 2; // Écart moyen (4-7 points)
        return 1; // Écart faible (≤3 points)
    }
}
exports.FencerStatsCalculator = FencerStatsCalculator;
//# sourceMappingURL=fencerStatsCalculator.js.map