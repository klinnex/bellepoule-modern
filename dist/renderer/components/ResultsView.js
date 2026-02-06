"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const types_1 = require("../../shared/types");
const Toast_1 = require("./Toast");
const ResultsView = ({ competition, poolRanking, finalResults }) => {
    const { showToast } = (0, Toast_1.useToast)();
    const isLaserSabre = competition.weapon === types_1.Weapon.LASER;
    const getMedalEmoji = (rank) => {
        if (rank === 1)
            return '🥇';
        if (rank === 2)
            return '🥈';
        if (rank === 3)
            return '🥉';
        return '';
    };
    const getRowStyle = (rank) => {
        if (rank === 1)
            return { background: '#fef3c7', fontWeight: '600' };
        if (rank === 2)
            return { background: '#f3f4f6', fontWeight: '500' };
        if (rank === 3)
            return { background: '#fed7aa', fontWeight: '500' };
        return {};
    };
    // Si pas de résultats finaux, afficher le classement des poules
    const resultsToDisplay = finalResults.length > 0 ? finalResults : poolRanking.map((pr, idx) => ({
        rank: idx + 1,
        fencer: pr.fencer,
        eliminatedAt: 'Poules',
        questPoints: pr.questPoints,
    }));
    // Récupérer les points Quest depuis poolRanking si disponibles
    const getQuestPoints = (fencerId) => {
        const pr = poolRanking.find(p => p.fencer.id === fencerId);
        return pr?.questPoints;
    };
    const champion = resultsToDisplay.find(r => r.rank === 1);
    return ((0, jsx_runtime_1.jsxs)("div", { style: { padding: '2rem', maxWidth: '900px', margin: '0 auto' }, children: [champion && ((0, jsx_runtime_1.jsxs)("div", { style: {
                    textAlign: 'center',
                    padding: '2rem',
                    background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                    borderRadius: '12px',
                    marginBottom: '2rem',
                    color: 'white',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: '4rem', marginBottom: '0.5rem' }, children: "\uD83C\uDFC6" }), (0, jsx_runtime_1.jsx)("h1", { style: { fontSize: '1.5rem', marginBottom: '0.5rem' }, children: "Champion" }), (0, jsx_runtime_1.jsxs)("div", { style: { fontSize: '2rem', fontWeight: '700' }, children: [champion.fencer.firstName, " ", champion.fencer.lastName] }), champion.fencer.club && ((0, jsx_runtime_1.jsx)("div", { style: { opacity: 0.9, marginTop: '0.5rem' }, children: champion.fencer.club }))] })), (0, jsx_runtime_1.jsxs)("div", { style: {
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-end',
                    gap: '1rem',
                    marginBottom: '2rem',
                    padding: '1rem',
                }, children: [resultsToDisplay[1] && ((0, jsx_runtime_1.jsxs)("div", { style: {
                            textAlign: 'center',
                            background: '#e5e7eb',
                            padding: '1rem',
                            borderRadius: '8px 8px 0 0',
                            minWidth: '150px',
                            height: '120px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-end',
                        }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: '2rem' }, children: "\uD83E\uDD48" }), (0, jsx_runtime_1.jsx)("div", { style: { fontWeight: '600', fontSize: '0.875rem' }, children: resultsToDisplay[1].fencer.lastName }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: '0.75rem', color: '#6b7280' }, children: "2\u00E8me" })] })), resultsToDisplay[0] && ((0, jsx_runtime_1.jsxs)("div", { style: {
                            textAlign: 'center',
                            background: '#fef3c7',
                            padding: '1rem',
                            borderRadius: '8px 8px 0 0',
                            minWidth: '150px',
                            height: '160px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-end',
                            border: '2px solid #f59e0b',
                        }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: '2.5rem' }, children: "\uD83E\uDD47" }), (0, jsx_runtime_1.jsx)("div", { style: { fontWeight: '700', fontSize: '1rem' }, children: resultsToDisplay[0].fencer.lastName }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: '0.875rem', color: '#92400e' }, children: "1er" })] })), resultsToDisplay[2] && ((0, jsx_runtime_1.jsxs)("div", { style: {
                            textAlign: 'center',
                            background: '#fed7aa',
                            padding: '1rem',
                            borderRadius: '8px 8px 0 0',
                            minWidth: '150px',
                            height: '100px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-end',
                        }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: '1.5rem' }, children: "\uD83E\uDD49" }), (0, jsx_runtime_1.jsx)("div", { style: { fontWeight: '600', fontSize: '0.875rem' }, children: resultsToDisplay[2].fencer.lastName }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: '0.75rem', color: '#6b7280' }, children: "3\u00E8me" })] }))] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                    background: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                    overflow: 'hidden',
                }, children: [(0, jsx_runtime_1.jsxs)("div", { style: {
                            padding: '1rem',
                            background: '#f9fafb',
                            borderBottom: '1px solid #e5e7eb',
                            fontWeight: '600',
                        }, children: ["\uD83D\uDCCA Classement final - ", resultsToDisplay.length, " tireurs"] }), (0, jsx_runtime_1.jsxs)("table", { style: { width: '100%', borderCollapse: 'collapse' }, children: [(0, jsx_runtime_1.jsx)("thead", { children: (0, jsx_runtime_1.jsxs)("tr", { style: { background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }, children: [(0, jsx_runtime_1.jsx)("th", { style: { padding: '0.75rem', textAlign: 'left', width: '60px' }, children: "Rang" }), (0, jsx_runtime_1.jsx)("th", { style: { padding: '0.75rem', textAlign: 'left' }, children: "Tireur" }), (0, jsx_runtime_1.jsx)("th", { style: { padding: '0.75rem', textAlign: 'left' }, children: "Club" }), isLaserSabre && ((0, jsx_runtime_1.jsx)("th", { style: { padding: '0.75rem', textAlign: 'center' }, children: "Pts Quest" })), (0, jsx_runtime_1.jsx)("th", { style: { padding: '0.75rem', textAlign: 'center' }, children: "\u00C9limin\u00E9 en" })] }) }), (0, jsx_runtime_1.jsx)("tbody", { children: resultsToDisplay.map((result) => {
                                    const questPts = result.questPoints ?? getQuestPoints(result.fencer.id);
                                    return ((0, jsx_runtime_1.jsxs)("tr", { style: {
                                            ...getRowStyle(result.rank),
                                            borderBottom: '1px solid #e5e7eb',
                                        }, children: [(0, jsx_runtime_1.jsxs)("td", { style: { padding: '0.75rem' }, children: [(0, jsx_runtime_1.jsx)("span", { style: { marginRight: '0.5rem' }, children: getMedalEmoji(result.rank) }), result.rank] }), (0, jsx_runtime_1.jsxs)("td", { style: { padding: '0.75rem' }, children: [result.fencer.firstName, " ", result.fencer.lastName] }), (0, jsx_runtime_1.jsx)("td", { style: { padding: '0.75rem', color: '#6b7280' }, children: result.fencer.club || '-' }), isLaserSabre && ((0, jsx_runtime_1.jsx)("td", { style: { padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#7c3aed' }, children: questPts ?? '-' })), (0, jsx_runtime_1.jsx)("td", { style: { padding: '0.75rem', textAlign: 'center', color: '#6b7280' }, children: result.eliminatedAt || '-' })] }, result.fencer.id));
                                }) })] })] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                    display: 'flex',
                    gap: '1rem',
                    justifyContent: 'center',
                    marginTop: '2rem',
                }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => window.print(), style: {
                            padding: '0.75rem 1.5rem',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                        }, children: "\uD83D\uDDA8\uFE0F Imprimer" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => {
                            const text = resultsToDisplay.map(r => `${r.rank}. ${r.fencer.firstName} ${r.fencer.lastName} (${r.fencer.club || 'Sans club'})`).join('\n');
                            navigator.clipboard.writeText(text);
                            showToast('Résultats copiés dans le presse-papier !', 'success');
                        }, style: {
                            padding: '0.75rem 1.5rem',
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                        }, children: "\uD83D\uDCCB Copier" })] })] }));
};
exports.default = ResultsView;
//# sourceMappingURL=ResultsView.js.map