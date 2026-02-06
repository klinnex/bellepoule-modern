"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Pool Ranking View Component
 * Shows ranking after pools with export/print functionality
 * Licensed under GPL-3.0
 */
const react_1 = __importStar(require("react"));
const poolCalculations_1 = require("../../shared/utils/poolCalculations");
const Toast_1 = require("./Toast");
const PoolRankingView = ({ pools, weapon, onGoToTableau, onGoToResults, hasDirectElimination = true, onExport }) => {
    const { showToast } = (0, Toast_1.useToast)();
    const isLaserSabre = weapon === 'L';
    // Calculer le classement général selon le type d'arme
    const overallRanking = (0, react_1.useMemo)(() => {
        return isLaserSabre ? (0, poolCalculations_1.calculateOverallRankingQuest)(pools) : (0, poolCalculations_1.calculateOverallRanking)(pools);
    }, [pools, isLaserSabre]);
    const handleExport = (format) => {
        if (onExport) {
            onExport(format);
        }
        else {
            showToast(`Export ${format.toUpperCase()} non implémenté`, 'warning');
        }
    };
    const handlePrint = () => {
        window.print();
    };
    const generateCSV = () => {
        const headers = ['Rg', 'Nom', 'Prénom', 'Club', 'V', 'M', 'V/M', 'TD', 'TR', 'Indice'];
        if (isLaserSabre) {
            headers.push('Quest');
        }
        const rows = overallRanking.map(r => [
            r.rank,
            r.fencer.lastName,
            r.fencer.firstName,
            r.fencer.club || '',
            r.victories,
            r.victories + r.defeats,
            (0, poolCalculations_1.formatRatio)(r.ratio),
            r.touchesScored,
            r.touchesReceived,
            (0, poolCalculations_1.formatIndex)(r.index),
            ...(isLaserSabre ? [r.questPoints || 0] : [])
        ]);
        return [headers, ...rows].map(row => row.join(';')).join('\n');
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "content", style: { padding: '1rem' }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }, children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h2", { style: { fontSize: '1.25rem', fontWeight: '600' }, children: "Classement apr\u00E8s poules" }), (0, jsx_runtime_1.jsxs)("p", { className: "text-sm text-muted", children: [pools.length, " poule", pools.length > 1 ? 's' : '', " \u2022 ", overallRanking.length, " tireur", overallRanking.length > 1 ? 's' : ''] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '0.5rem' }, children: [(0, jsx_runtime_1.jsx)("button", { className: "btn btn-secondary", onClick: () => handleExport('csv'), title: "Exporter en CSV", children: "\uD83D\uDCC4 CSV" }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-secondary", onClick: () => handleExport('xml'), title: "Exporter en XML (BellePoule)", children: "\uD83D\uDCCB XML" }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-secondary", onClick: handlePrint, title: "Imprimer", children: "\uD83D\uDDA8\uFE0F Imprimer" })] })] }), (0, jsx_runtime_1.jsx)("div", { className: "card", children: (0, jsx_runtime_1.jsxs)("table", { className: "table", children: [(0, jsx_runtime_1.jsx)("thead", { children: (0, jsx_runtime_1.jsxs)("tr", { children: [(0, jsx_runtime_1.jsx)("th", { style: { width: '50px' }, children: "Rg" }), (0, jsx_runtime_1.jsx)("th", { children: "Nom" }), (0, jsx_runtime_1.jsx)("th", { children: "Pr\u00E9nom" }), (0, jsx_runtime_1.jsx)("th", { children: "Club" }), (0, jsx_runtime_1.jsx)("th", { style: { width: '40px' }, children: "V" }), (0, jsx_runtime_1.jsx)("th", { style: { width: '40px' }, children: "M" }), (0, jsx_runtime_1.jsx)("th", { style: { width: '60px' }, children: "V/M" }), (0, jsx_runtime_1.jsx)("th", { style: { width: '50px' }, children: "TD" }), (0, jsx_runtime_1.jsx)("th", { style: { width: '50px' }, children: "TR" }), (0, jsx_runtime_1.jsx)("th", { style: { width: '60px' }, children: "Indice" }), isLaserSabre && (0, jsx_runtime_1.jsx)("th", { style: { width: '70px', color: '#7c3aed' }, children: "Quest" })] }) }), (0, jsx_runtime_1.jsx)("tbody", { children: overallRanking.map((ranking) => ((0, jsx_runtime_1.jsxs)("tr", { children: [(0, jsx_runtime_1.jsx)("td", { style: { fontWeight: '600' }, children: ranking.rank }), (0, jsx_runtime_1.jsx)("td", { className: "font-medium", children: ranking.fencer.lastName }), (0, jsx_runtime_1.jsx)("td", { children: ranking.fencer.firstName }), (0, jsx_runtime_1.jsx)("td", { className: "text-sm text-muted", children: ranking.fencer.club || '-' }), (0, jsx_runtime_1.jsx)("td", { style: { textAlign: 'center', fontWeight: '600' }, children: ranking.victories }), (0, jsx_runtime_1.jsx)("td", { style: { textAlign: 'center' }, children: ranking.victories + ranking.defeats }), (0, jsx_runtime_1.jsx)("td", { style: { textAlign: 'center' }, children: (0, poolCalculations_1.formatRatio)(ranking.ratio) }), (0, jsx_runtime_1.jsx)("td", { style: { textAlign: 'center' }, children: ranking.touchesScored }), (0, jsx_runtime_1.jsx)("td", { style: { textAlign: 'center' }, children: ranking.touchesReceived }), (0, jsx_runtime_1.jsx)("td", { style: { textAlign: 'center', color: ranking.index >= 0 ? '#059669' : '#DC2626', fontWeight: '600' }, children: (0, poolCalculations_1.formatIndex)(ranking.index) }), isLaserSabre && ((0, jsx_runtime_1.jsx)("td", { style: { textAlign: 'center', fontWeight: '600', color: '#7c3aed' }, children: ranking.questPoints || 0 }))] }, ranking.fencer.id))) })] }) }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem' }, children: [(0, jsx_runtime_1.jsxs)("div", { className: "text-sm text-muted", children: [(0, jsx_runtime_1.jsx)("strong", { children: "L\u00E9gende :" }), " V = Victoires, M = Matchs, V/M = Ratio Victoires/Matchs, TD = Touches Donn\u00E9es, TR = Touches Re\u00E7ues, Indice = TD - TR", isLaserSabre && ', Quest = Points Quest (Sabre Laser)'] }), (0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', gap: '0.5rem' }, children: hasDirectElimination ? ((0, jsx_runtime_1.jsx)("button", { className: "btn btn-primary", onClick: onGoToTableau, children: "Passer au tableau \u2192" })) : ((0, jsx_runtime_1.jsx)("button", { className: "btn btn-primary", onClick: onGoToResults, children: "Voir les r\u00E9sultats \u2192" })) })] }), (0, jsx_runtime_1.jsx)("style", { dangerouslySetInnerHTML: {
                    __html: `
          @media print {
            .btn, .text-muted, .text-sm {
              display: none !important;
            }
            .card {
              border: none !important;
              box-shadow: none !important;
            }
            table {
              font-size: 12pt !important;
            }
            th, td {
              padding: 4px !important;
            }
          }
        `
                } })] }));
};
exports.default = PoolRankingView;
//# sourceMappingURL=PoolRankingView.js.map