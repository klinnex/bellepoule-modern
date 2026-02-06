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
exports.PoolGrid = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Optimized Pool Grid Component
 * Efficient rendering of pool results grid
 * Licensed under GPL-3.0
 */
const react_1 = __importStar(require("react"));
const types_1 = require("../../shared/types");
// Individual cell component - memoized to prevent unnecessary re-renders
const GridCell = (0, react_1.memo)(({ match, onClick, isDiagonal }) => {
    if (isDiagonal) {
        return ((0, jsx_runtime_1.jsx)("td", { style: {
                backgroundColor: '#f3f4f6',
                textAlign: 'center',
                fontWeight: 'bold',
                border: '1px solid #d1d5db'
            }, children: "-" }));
    }
    if (!match) {
        return ((0, jsx_runtime_1.jsx)("td", { style: {
                backgroundColor: '#fafafa',
                textAlign: 'center',
                cursor: 'pointer',
                border: '1px solid #d1d5db'
            }, onMouseEnter: (e) => {
                e.currentTarget.style.backgroundColor = '#e5e7eb';
            }, onMouseLeave: (e) => {
                e.currentTarget.style.backgroundColor = '#fafafa';
            }, onClick: onClick, children: "-" }));
    }
    const scoreA = match.scoreA?.value ?? 0;
    const scoreB = match.scoreB?.value ?? 0;
    const victoryA = match.scoreA?.isVictory;
    const victoryB = match.scoreB?.isVictory;
    const isFinished = match.status === 'finished';
    let cellStyle = {
        textAlign: 'center',
        cursor: 'pointer',
        border: '1px solid #d1d5db',
        fontWeight: 'bold'
    };
    if (victoryA) {
        cellStyle.backgroundColor = '#dcfce7';
        cellStyle.color = '#166534';
    }
    else if (victoryB) {
        cellStyle.backgroundColor = '#dcfce7';
        cellStyle.color = '#166534';
    }
    else if (isFinished && scoreA > 0 && scoreB > 0) {
        cellStyle.backgroundColor = '#fef3c7';
    }
    const displayScore = victoryA ? 'V' : victoryB ? 'V' : `${scoreA}-${scoreB}`;
    return ((0, jsx_runtime_1.jsx)("td", { style: cellStyle, onClick: onClick, children: displayScore }));
});
GridCell.displayName = 'GridCell';
// Header row component
const HeaderRow = (0, react_1.memo)(({ fencers }) => ((0, jsx_runtime_1.jsxs)("tr", { children: [(0, jsx_runtime_1.jsx)("th", { style: {
                backgroundColor: '#1f2937',
                color: 'white',
                padding: '8px',
                border: '1px solid #374151',
                fontSize: '12px'
            }, children: "#" }), (0, jsx_runtime_1.jsx)("th", { style: {
                backgroundColor: '#1f2937',
                color: 'white',
                padding: '8px',
                border: '1px solid #374151',
                fontSize: '12px'
            }, children: "Tireur" }), fencers.map(fencer => ((0, jsx_runtime_1.jsx)("th", { style: {
                backgroundColor: '#1f2937',
                color: 'white',
                padding: '4px',
                border: '1px solid #374151',
                fontSize: '10px',
                transform: 'rotate(-45deg)',
                transformOrigin: 'center',
                width: '30px',
                height: '30px'
            }, children: fencer.ref }, fencer.id)))] })));
HeaderRow.displayName = 'HeaderRow';
// Fencer row component
const FencerRow = (0, react_1.memo)(({ fencer, rowIndex, fencerCount, matches, onMatchClick }) => {
    const getMatchForCell = (colIndex) => {
        const opponentFencer = fencerCount > colIndex ? null : fencer; // This needs to be fixed
        // Find match between fencer and column fencer
        return matches.find(match => (match.fencerA?.id === fencer.id && match.fencerB?.id === fencer.id) ||
            (match.fencerB?.id === fencer.id && match.fencerA?.id === fencer.id)) || null;
    };
    return ((0, jsx_runtime_1.jsxs)("tr", { children: [(0, jsx_runtime_1.jsx)("td", { style: {
                    backgroundColor: '#f9fafb',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    border: '1px solid #d1d5db',
                    padding: '8px'
                }, children: fencer.ref }), (0, jsx_runtime_1.jsxs)("td", { style: {
                    backgroundColor: '#f9fafb',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '12px',
                    textAlign: 'left',
                    whiteSpace: 'nowrap'
                }, children: [fencer.firstName, " ", fencer.lastName] }), Array.from({ length: fencerCount }, (_, colIndex) => {
                const match = getMatchForCell(colIndex);
                const isDiagonal = rowIndex === colIndex;
                return ((0, jsx_runtime_1.jsx)(GridCell, { match: match, onClick: () => match && onMatchClick(match), isDiagonal: isDiagonal }, `${fencer.id}-${colIndex}`));
            })] }));
});
FencerRow.displayName = 'FencerRow';
// Main pool grid component
exports.PoolGrid = (0, react_1.memo)(({ fencers, matches, maxScore, onMatchClick }) => {
    const createMatch = (fencerAId, fencerBId, index) => {
        // This should be replaced with proper match creation logic
        const fencerA = fencers.find(f => f.id === fencerAId);
        const fencerB = fencers.find(f => f.id === fencerBId);
        return {
            id: `temp-${fencerAId}-${fencerBId}`,
            number: index,
            fencerA: fencerA || null,
            fencerB: fencerB || null,
            scoreA: null,
            scoreB: null,
            maxScore,
            status: types_1.MatchStatus.NOT_STARTED,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    };
    const getMatchForCell = (fencerAId, fencerBId) => {
        return matches.find(match => (match.fencerA?.id === fencerAId && match.fencerB?.id === fencerBId) ||
            (match.fencerB?.id === fencerAId && match.fencerA?.id === fencerBId)) || null;
    };
    return ((0, jsx_runtime_1.jsx)("div", { style: { overflowX: 'auto', backgroundColor: 'white', borderRadius: '8px' }, children: (0, jsx_runtime_1.jsxs)("table", { style: {
                borderCollapse: 'collapse',
                fontSize: '11px',
                minWidth: `${300 + fencers.length * 35}px`
            }, children: [(0, jsx_runtime_1.jsx)("thead", { children: (0, jsx_runtime_1.jsx)(HeaderRow, { fencers: fencers }) }), (0, jsx_runtime_1.jsx)("tbody", { children: fencers.map((fencer, rowIndex) => ((0, jsx_runtime_1.jsx)(FencerRow, { fencer: fencer, rowIndex: rowIndex, fencerCount: fencers.length, matches: matches, onMatchClick: onMatchClick }, fencer.id))) })] }) }));
});
exports.PoolGrid.displayName = 'PoolGrid';
//# sourceMappingURL=OptimizedPoolGrid.js.map