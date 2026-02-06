"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsDashboard = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Analytics Dashboard Component
 * Real-time performance analytics for coaches
 * Licensed under GPL-3.0
 */
const react_1 = require("react");
const types_1 = require("../../shared/types");
const AnalyticsDashboard = ({ competition, pools, matches, fencers, className = '' }) => {
    const [selectedTimeframe, setSelectedTimeframe] = (0, react_1.useState)('live');
    const [autoRefresh, setAutoRefresh] = (0, react_1.useState)(true);
    const [lastUpdate, setLastUpdate] = (0, react_1.useState)(new Date());
    const analyticsData = (0, react_1.useMemo)(() => {
        return calculateAnalytics(competition, pools, matches, fencers, selectedTimeframe);
    }, [competition, pools, matches, fencers, selectedTimeframe]);
    // Auto-refresh for live data
    (0, react_1.useEffect)(() => {
        if (!autoRefresh || selectedTimeframe !== 'live')
            return;
        const interval = setInterval(() => {
            setLastUpdate(new Date());
        }, 5000); // Update every 5 seconds
        return () => clearInterval(interval);
    }, [autoRefresh, selectedTimeframe]);
    const filterMatchesByTimeframe = (matchList, timeframe) => {
        if (timeframe === 'all')
            return matchList;
        const now = new Date();
        const cutoffTime = new Date(now.getTime() - (timeframe === 'last30min' ? 30 : 5) * 60 * 1000);
        return matchList.filter(match => {
            if (!match.updatedAt)
                return false;
            return new Date(match.updatedAt) >= cutoffTime;
        });
    };
    const calculateAnalytics = (comp, poolList, matchList, fencerList, timeframe) => {
        const filteredMatches = filterMatchesByTimeframe(matchList, timeframe);
        const completedMatches = filteredMatches.filter(match => match.status === types_1.MatchStatus.FINISHED);
        return {
            totalFencers: fencerList.length,
            completedMatches: completedMatches.length,
            totalMatches: filteredMatches.length,
            averageMatchDuration: calculateAverageMatchDuration(completedMatches),
            fencerPerformance: calculateFencerPerformance(fencerList, completedMatches),
            weaponStats: calculateWeaponStats(completedMatches),
            poolProgress: calculatePoolProgress(poolList, filteredMatches)
        };
    };
    const calculateAverageMatchDuration = (matches) => {
        if (matches.length === 0)
            return 0;
        const durations = matches.map(match => {
            if (!match.createdAt || !match.updatedAt)
                return 0;
            return new Date(match.updatedAt).getTime() - new Date(match.createdAt).getTime();
        }).filter(d => d > 0);
        return durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    };
    const calculateFencerPerformance = (fencerList, matches) => {
        return fencerList.map(fencer => {
            const fencerMatches = matches.filter(m => (m.fencerA?.id === fencer.id || m.fencerB?.id === fencer.id) &&
                m.status === types_1.MatchStatus.FINISHED);
            const victories = fencerMatches.filter(m => {
                const isA = m.fencerA?.id === fencer.id;
                const score = isA ? m.scoreA : m.scoreB;
                return score?.isVictory;
            }).length;
            const totalScored = fencerMatches.reduce((total, match) => {
                const isA = match.fencerA?.id === fencer.id;
                const score = isA ? match.scoreA : match.scoreB;
                return total + (score?.value || 0);
            }, 0);
            const totalReceived = fencerMatches.reduce((total, match) => {
                const isA = match.fencerA?.id === fencer.id;
                const score = isA ? match.scoreB : match.scoreA;
                return total + (score?.value || 0);
            }, 0);
            const currentStreak = calculateCurrentStreak(fencer, matches);
            const bestStreak = calculateBestStreak(fencer, matches);
            const recentForm = calculateRecentForm(fencer, matches);
            return {
                fencer,
                victoryRate: fencerMatches.length > 0 ? victories / fencerMatches.length : 0,
                averageScore: fencerMatches.length > 0 ? totalScored / fencerMatches.length : 0,
                touchesScoredPerMatch: fencerMatches.length > 0 ? totalScored / fencerMatches.length : 0,
                touchesReceivedPerMatch: fencerMatches.length > 0 ? totalReceived / fencerMatches.length : 0,
                currentStreak,
                bestStreak,
                recentForm
            };
        }).sort((a, b) => b.victoryRate - a.victoryRate);
    };
    const calculateCurrentStreak = (fencer, matches) => {
        const fencerMatches = matches
            .filter(m => (m.fencerA?.id === fencer.id || m.fencerB?.id === fencer.id))
            .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        let streak = 0;
        for (const match of fencerMatches) {
            const isA = match.fencerA?.id === fencer.id;
            const score = isA ? match.scoreA : match.scoreB;
            if (score?.isVictory) {
                streak++;
            }
            else {
                break;
            }
        }
        return streak;
    };
    const calculateBestStreak = (fencer, matches) => {
        // Implementation for calculating historical best streak
        // This would require more complex analysis of match history
        return 0; // Placeholder
    };
    const calculateRecentForm = (fencer, matches) => {
        const recentMatches = matches
            .filter(m => (m.fencerA?.id === fencer.id || m.fencerB?.id === fencer.id))
            .slice(-5); // Last 5 matches
        if (recentMatches.length === 0)
            return 'average';
        const victories = recentMatches.filter(m => {
            const isA = m.fencerA?.id === fencer.id;
            const score = isA ? m.scoreA : m.scoreB;
            return score?.isVictory;
        }).length;
        const winRate = victories / recentMatches.length;
        if (winRate >= 0.8)
            return 'excellent';
        if (winRate >= 0.6)
            return 'good';
        if (winRate >= 0.4)
            return 'average';
        return 'poor';
    };
    const calculateWeaponStats = (matches) => {
        const margins = matches.map(m => {
            if (m.status !== types_1.MatchStatus.FINISHED)
                return 0;
            const margin = Math.abs((m.scoreA?.value || 0) - (m.scoreB?.value || 0));
            return margin;
        }).filter(m => m > 0);
        return {
            totalMatches: matches.length,
            averageVictoryMargin: margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : 0,
            longestMatch: 0, // Would need duration data
            shortestMatch: 0, // Would need duration data
            mostTouchingMatch: Math.max(...matches.map(m => (m.scoreA?.value || 0) + (m.scoreB?.value || 0)))
        };
    };
    const calculatePoolProgress = (pools, matches) => {
        return pools.map(pool => {
            const poolMatches = matches.filter(m => pools.some(p => p.matches.some(pm => pm.id === m.id)));
            const completed = poolMatches.filter(m => m.status === types_1.MatchStatus.FINISHED).length;
            const completionPercentage = poolMatches.length > 0 ? (completed / poolMatches.length) * 100 : 0;
            return {
                poolId: pool.id,
                poolNumber: pool.number || 0,
                completionPercentage,
                averageTimeRemaining: 0, // Complex calculation based on remaining matches
                projectedFinishTime: new Date()
            };
        });
    };
    const formatTime = (milliseconds) => {
        const minutes = Math.floor(milliseconds / 60000);
        const seconds = Math.floor((milliseconds % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };
    const getFormColor = (form) => {
        switch (form) {
            case 'excellent': return 'text-green-600 bg-green-100';
            case 'good': return 'text-blue-600 bg-blue-100';
            case 'average': return 'text-yellow-600 bg-yellow-100';
            case 'poor': return 'text-red-600 bg-red-100';
            default: return 'text-gray-600 bg-gray-100';
        }
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: `analytics-dashboard bg-white rounded-lg shadow-lg p-6 ${className}`, children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center mb-6", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h2", { className: "text-2xl font-bold text-gray-800", children: "Analytics Dashboard" }), (0, jsx_runtime_1.jsx)("p", { className: "text-gray-600", children: competition.title })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center space-x-4", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center space-x-2", children: [(0, jsx_runtime_1.jsx)("input", { type: "checkbox", id: "autoRefresh", checked: autoRefresh, onChange: (e) => setAutoRefresh(e.target.checked), className: "rounded" }), (0, jsx_runtime_1.jsx)("label", { htmlFor: "autoRefresh", className: "text-sm text-gray-600", children: "Auto-refresh" })] }), (0, jsx_runtime_1.jsxs)("select", { value: selectedTimeframe, onChange: (e) => setSelectedTimeframe(e.target.value), className: "px-3 py-2 border border-gray-300 rounded-md", children: [(0, jsx_runtime_1.jsx)("option", { value: "live", children: "Live" }), (0, jsx_runtime_1.jsx)("option", { value: "last30min", children: "Last 30 min" }), (0, jsx_runtime_1.jsx)("option", { value: "all", children: "All time" })] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6", children: [(0, jsx_runtime_1.jsxs)("div", { className: "bg-blue-50 rounded-lg p-4", children: [(0, jsx_runtime_1.jsx)("div", { className: "text-blue-600 text-sm font-medium", children: "Fencers" }), (0, jsx_runtime_1.jsx)("div", { className: "text-2xl font-bold text-blue-800", children: analyticsData.totalFencers })] }), (0, jsx_runtime_1.jsxs)("div", { className: "bg-green-50 rounded-lg p-4", children: [(0, jsx_runtime_1.jsx)("div", { className: "text-green-600 text-sm font-medium", children: "Completed Matches" }), (0, jsx_runtime_1.jsxs)("div", { className: "text-2xl font-bold text-green-800", children: [analyticsData.completedMatches, "/", analyticsData.totalMatches] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "bg-purple-50 rounded-lg p-4", children: [(0, jsx_runtime_1.jsx)("div", { className: "text-purple-600 text-sm font-medium", children: "Avg Match Duration" }), (0, jsx_runtime_1.jsx)("div", { className: "text-2xl font-bold text-purple-800", children: formatTime(analyticsData.averageMatchDuration) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "bg-orange-50 rounded-lg p-4", children: [(0, jsx_runtime_1.jsx)("div", { className: "text-orange-600 text-sm font-medium", children: "Last Update" }), (0, jsx_runtime_1.jsx)("div", { className: "text-lg font-bold text-orange-800", children: lastUpdate.toLocaleTimeString() })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [(0, jsx_runtime_1.jsxs)("div", { className: "bg-gray-50 rounded-lg p-4", children: [(0, jsx_runtime_1.jsx)("h3", { className: "text-lg font-semibold mb-4", children: "Top Performers" }), (0, jsx_runtime_1.jsx)("div", { className: "space-y-2", children: analyticsData.fencerPerformance.slice(0, 5).map((perf, index) => ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between p-2 bg-white rounded", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center space-x-3", children: [(0, jsx_runtime_1.jsx)("div", { className: "w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold", children: index + 1 }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("div", { className: "font-medium", children: `${perf.fencer.lastName} ${perf.fencer.firstName?.charAt(0)}.` }), (0, jsx_runtime_1.jsxs)("div", { className: "text-xs text-gray-500", children: ["Win rate: ", (perf.victoryRate * 100).toFixed(1), "%"] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "text-right", children: [(0, jsx_runtime_1.jsx)("div", { className: "font-medium", children: perf.averageScore.toFixed(1) }), (0, jsx_runtime_1.jsx)("div", { className: `text-xs px-2 py-1 rounded-full ${getFormColor(perf.recentForm)}`, children: perf.recentForm })] })] }, perf.fencer.id))) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "bg-gray-50 rounded-lg p-4", children: [(0, jsx_runtime_1.jsx)("h3", { className: "text-lg font-semibold mb-4", children: "Pool Progress" }), (0, jsx_runtime_1.jsx)("div", { className: "space-y-3", children: analyticsData.poolProgress.map((pool) => ((0, jsx_runtime_1.jsxs)("div", { className: "p-3 bg-white rounded", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center mb-2", children: [(0, jsx_runtime_1.jsxs)("span", { className: "font-medium", children: ["Pool ", pool.poolNumber] }), (0, jsx_runtime_1.jsxs)("span", { className: "text-sm text-gray-600", children: [pool.completionPercentage.toFixed(1), "%"] })] }), (0, jsx_runtime_1.jsx)("div", { className: "w-full bg-gray-200 rounded-full h-2", children: (0, jsx_runtime_1.jsx)("div", { className: "bg-blue-500 h-2 rounded-full transition-all duration-300", style: { width: `${pool.completionPercentage}%` } }) })] }, pool.poolId))) })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "mt-6 bg-gray-50 rounded-lg p-4", children: [(0, jsx_runtime_1.jsx)("h3", { className: "text-lg font-semibold mb-4", children: "Weapon Statistics" }), (0, jsx_runtime_1.jsxs)("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-4", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("div", { className: "text-sm text-gray-600", children: "Total Matches" }), (0, jsx_runtime_1.jsx)("div", { className: "font-bold", children: analyticsData.weaponStats.totalMatches })] }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("div", { className: "text-sm text-gray-600", children: "Avg Victory Margin" }), (0, jsx_runtime_1.jsx)("div", { className: "font-bold", children: analyticsData.weaponStats.averageVictoryMargin.toFixed(1) })] }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("div", { className: "text-sm text-gray-600", children: "Most Touching Match" }), (0, jsx_runtime_1.jsx)("div", { className: "font-bold", children: analyticsData.weaponStats.mostTouchingMatch })] }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("div", { className: "text-sm text-gray-600", children: "Competition" }), (0, jsx_runtime_1.jsx)("div", { className: "font-bold", children: competition.weapon })] })] })] })] }));
};
exports.AnalyticsDashboard = AnalyticsDashboard;
//# sourceMappingURL=AnalyticsDashboard.js.map