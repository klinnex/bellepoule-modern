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
 * BellePoule Modern - Change Pool Modal Component
 * Allows moving a fencer from one pool to another
 * Licensed under GPL-3.0
 */
const react_1 = __importStar(require("react"));
const types_1 = require("../../shared/types");
const ChangePoolModal = ({ fencer, currentPool, allPools, onMove, onClose, }) => {
    const [selectedPoolIndex, setSelectedPoolIndex] = (0, react_1.useState)(null);
    const currentPoolIndex = allPools.findIndex(p => p.id === currentPool.id);
    const otherPools = allPools
        .map((pool, index) => ({ pool, index }))
        .filter(({ pool }) => pool.id !== currentPool.id);
    // Vérifier si des matches ont été joués dans la poule actuelle impliquant ce tireur
    const hasPlayedMatches = currentPool.matches.some(m => m.status === types_1.MatchStatus.FINISHED &&
        (m.fencerA?.id === fencer.id || m.fencerB?.id === fencer.id));
    const handleMove = () => {
        if (selectedPoolIndex !== null) {
            onMove(fencer.id, currentPoolIndex, selectedPoolIndex);
            onClose();
        }
    };
    return ((0, jsx_runtime_1.jsx)("div", { className: "modal-overlay", onClick: onClose, children: (0, jsx_runtime_1.jsxs)("div", { className: "modal", onClick: e => e.stopPropagation(), style: { maxWidth: '450px' }, children: [(0, jsx_runtime_1.jsxs)("div", { className: "modal-header", children: [(0, jsx_runtime_1.jsx)("h2", { children: "Changer de poule" }), (0, jsx_runtime_1.jsx)("button", { className: "btn-close", onClick: onClose, children: "\u00D7" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "modal-body", children: [(0, jsx_runtime_1.jsxs)("div", { style: {
                                padding: '1rem',
                                background: '#f3f4f6',
                                borderRadius: '8px',
                                marginBottom: '1rem',
                                textAlign: 'center'
                            }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }, children: "Tireur s\u00E9lectionn\u00E9" }), (0, jsx_runtime_1.jsxs)("div", { style: { fontSize: '1.25rem', fontWeight: '600' }, children: [fencer.firstName, " ", fencer.lastName] }), (0, jsx_runtime_1.jsxs)("div", { style: { fontSize: '0.875rem', color: '#6b7280' }, children: ["Actuellement en Poule ", currentPool.number] })] }), hasPlayedMatches && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                padding: '0.75rem',
                                background: '#fef3c7',
                                borderRadius: '6px',
                                marginBottom: '1rem',
                                color: '#92400e',
                                fontSize: '0.875rem'
                            }, children: ["\u26A0\uFE0F ", (0, jsx_runtime_1.jsx)("strong", { children: "Attention :" }), " Ce tireur a d\u00E9j\u00E0 disput\u00E9 des matches dans cette poule. Le d\u00E9placement supprimera ses r\u00E9sultats."] })), (0, jsx_runtime_1.jsxs)("div", { style: { marginBottom: '1rem' }, children: [(0, jsx_runtime_1.jsx)("label", { style: {
                                        display: 'block',
                                        fontSize: '0.875rem',
                                        fontWeight: '500',
                                        marginBottom: '0.5rem'
                                    }, children: "D\u00E9placer vers :" }), otherPools.length === 0 ? ((0, jsx_runtime_1.jsx)("div", { style: {
                                        padding: '1rem',
                                        textAlign: 'center',
                                        color: '#6b7280',
                                        background: '#f9fafb',
                                        borderRadius: '6px'
                                    }, children: "Aucune autre poule disponible" })) : ((0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' }, children: otherPools.map(({ pool, index }) => {
                                        const matchesPlayed = pool.matches.filter(m => m.status === types_1.MatchStatus.FINISHED).length;
                                        const isSelected = selectedPoolIndex === index;
                                        return ((0, jsx_runtime_1.jsxs)("div", { onClick: () => setSelectedPoolIndex(index), style: {
                                                padding: '0.75rem 1rem',
                                                border: `2px solid ${isSelected ? '#3b82f6' : '#e5e7eb'}`,
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                background: isSelected ? '#eff6ff' : 'white',
                                                transition: 'all 0.15s ease',
                                            }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsxs)("span", { style: { fontWeight: '600' }, children: ["Poule ", pool.number] }), (0, jsx_runtime_1.jsxs)("span", { style: {
                                                                        marginLeft: '0.5rem',
                                                                        fontSize: '0.875rem',
                                                                        color: '#6b7280'
                                                                    }, children: ["(", pool.fencers.length, " tireurs)"] })] }), matchesPlayed > 0 && ((0, jsx_runtime_1.jsxs)("span", { style: {
                                                                fontSize: '0.75rem',
                                                                padding: '0.125rem 0.5rem',
                                                                background: '#fef3c7',
                                                                color: '#92400e',
                                                                borderRadius: '4px'
                                                            }, children: [matchesPlayed, " match", matchesPlayed > 1 ? 's' : '', " jou\u00E9", matchesPlayed > 1 ? 's' : ''] }))] }), (0, jsx_runtime_1.jsx)("div", { style: {
                                                        fontSize: '0.75rem',
                                                        color: '#9ca3af',
                                                        marginTop: '0.25rem'
                                                    }, children: pool.fencers.map(f => f.lastName).join(', ') })] }, pool.id));
                                    }) }))] }), selectedPoolIndex !== null && ((0, jsx_runtime_1.jsx)("div", { style: {
                                padding: '0.75rem',
                                background: '#f0fdf4',
                                borderRadius: '6px',
                                color: '#166534',
                                fontSize: '0.875rem'
                            }, children: "\u2713 Les matches des deux poules seront recalcul\u00E9s" }))] }), (0, jsx_runtime_1.jsxs)("div", { className: "modal-footer", children: [(0, jsx_runtime_1.jsx)("button", { className: "btn btn-secondary", onClick: onClose, children: "Annuler" }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-primary", onClick: handleMove, disabled: selectedPoolIndex === null, children: "D\u00E9placer le tireur" })] })] }) }));
};
exports.default = ChangePoolModal;
//# sourceMappingURL=ChangePoolModal.js.map