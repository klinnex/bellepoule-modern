"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Pool View Component
 * With classic grid view and match list view
 * Licensed under GPL-3.0
 */
const react_1 = require("react");
const useModalResize_1 = require("../hooks/useModalResize");
const types_1 = require("../../shared/types");
const poolCalculations_1 = require("../../shared/utils/poolCalculations");
const Toast_1 = require("./Toast");
const pdfExport_1 = require("../../shared/utils/pdfExport");
const PoolView = ({ pool, maxScore = 5, weapon, onScoreUpdate, onFencerChangePool }) => {
    const { showToast } = (0, Toast_1.useToast)();
    const [viewMode, setViewMode] = (0, react_1.useState)('grid');
    const [editingMatch, setEditingMatch] = (0, react_1.useState)(null);
    const [editScoreA, setEditScoreA] = (0, react_1.useState)('');
    const [editScoreB, setEditScoreB] = (0, react_1.useState)('');
    const [victoryA, setVictoryA] = (0, react_1.useState)(false);
    const [victoryB, setVictoryB] = (0, react_1.useState)(false);
    const [matchesUpdateTrigger, setMatchesUpdateTrigger] = (0, react_1.useState)(0);
    const isLaserSabre = weapon === types_1.Weapon.LASER;
    const fencers = pool.fencers;
    // Calculer l'ordre optimal des matches restants
    const orderedMatches = (0, react_1.useMemo)(() => {
        const pending = pool.matches
            .map((m, idx) => ({ match: m, index: idx }))
            .filter(({ match }) => match.status !== types_1.MatchStatus.FINISHED);
        const finished = pool.matches
            .map((m, idx) => ({ match: m, index: idx }))
            .filter(({ match }) => match.status === types_1.MatchStatus.FINISHED);
        if (pending.length === 0)
            return { pending: [], finished };
        // Algorithme pour éviter qu'un tireur combatte 2 fois d'affilée
        const ordered = [];
        const remaining = [...pending];
        let lastFencerIds = new Set();
        // Si des matchs ont déjà été joués, récupérer les derniers combattants
        if (finished.length > 0) {
            const lastMatch = finished[finished.length - 1].match;
            if (lastMatch.fencerA)
                lastFencerIds.add(lastMatch.fencerA.id);
            if (lastMatch.fencerB)
                lastFencerIds.add(lastMatch.fencerB.id);
        }
        while (remaining.length > 0) {
            // Chercher un match où aucun des deux tireurs n'a combattu au dernier tour
            let bestIdx = -1;
            let bestScore = -1;
            for (let i = 0; i < remaining.length; i++) {
                const { match } = remaining[i];
                const fencerAId = match.fencerA?.id || '';
                const fencerBId = match.fencerB?.id || '';
                let score = 0;
                if (!lastFencerIds.has(fencerAId))
                    score++;
                if (!lastFencerIds.has(fencerBId))
                    score++;
                if (score > bestScore) {
                    bestScore = score;
                    bestIdx = i;
                }
                // Score parfait (2) = aucun des deux n'a combattu
                if (score === 2)
                    break;
            }
            // Prendre le meilleur match trouvé (ou le premier si aucun idéal)
            const chosenIdx = bestIdx >= 0 ? bestIdx : 0;
            const chosen = remaining.splice(chosenIdx, 1)[0];
            ordered.push(chosen);
            // Mettre à jour les derniers combattants
            lastFencerIds = new Set();
            if (chosen.match.fencerA)
                lastFencerIds.add(chosen.match.fencerA.id);
            if (chosen.match.fencerB)
                lastFencerIds.add(chosen.match.fencerB.id);
        }
        return { pending: ordered, finished };
    }, [pool.matches.length, pool.matches.map(m => m.status).join(',')]);
    const getScore = (fencerA, fencerB) => {
        const match = pool.matches.find(m => (m.fencerA?.id === fencerA.id && m.fencerB?.id === fencerB.id) ||
            (m.fencerA?.id === fencerB.id && m.fencerB?.id === fencerA.id));
        if (!match || match.status !== types_1.MatchStatus.FINISHED)
            return null;
        return match.fencerA?.id === fencerA.id ? match.scoreA : match.scoreB;
    };
    const getMatchIndex = (fencerA, fencerB) => {
        return pool.matches.findIndex(m => (m.fencerA?.id === fencerA.id && m.fencerB?.id === fencerB.id) ||
            (m.fencerA?.id === fencerB.id && m.fencerB?.id === fencerA.id));
    };
    const { modalRef, dimensions } = (0, useModalResize_1.useModalResize)({
        defaultWidth: 720, // Augmenté de 600 à 720 (+20%)
        defaultHeight: 400,
        minWidth: 480, // Augmenté de 400 à 480 (+20%)
        minHeight: 300
    });
    const openScoreModal = (matchIndex) => {
        const match = pool.matches[matchIndex];
        setEditingMatch(matchIndex);
        setEditScoreA(match.scoreA?.value?.toString() || '');
        setEditScoreB(match.scoreB?.value?.toString() || '');
        setVictoryA(false);
        setVictoryB(false);
    };
    const handleCellClick = (rowFencer, colFencer) => {
        if (rowFencer.id === colFencer.id)
            return;
        const matchIndex = getMatchIndex(rowFencer, colFencer);
        if (matchIndex === -1)
            return;
        const match = pool.matches[matchIndex];
        const isRowA = match.fencerA?.id === rowFencer.id;
        setEditingMatch(matchIndex);
        setEditScoreA(isRowA ? (match.scoreA?.value?.toString() || '') : (match.scoreB?.value?.toString() || ''));
        setEditScoreB(isRowA ? (match.scoreB?.value?.toString() || '') : (match.scoreA?.value?.toString() || ''));
        setVictoryA(false);
        setVictoryB(false);
    };
    const handleScoreSubmit = () => {
        if (editingMatch === null)
            return;
        const scoreA = parseInt(editScoreA, 10) || 0;
        const scoreB = parseInt(editScoreB, 10) || 0;
        // Valider que les scores ne dépassent pas le maximum
        if (maxScore > 0) {
            if (scoreA > maxScore) {
                showToast(`Le score du tireur A ne peut pas dépasser ${maxScore}`, 'error');
                return;
            }
            if (scoreB > maxScore) {
                showToast(`Le score du tireur B ne peut pas dépasser ${maxScore}`, 'error');
                return;
            }
        }
        if (scoreA === scoreB) {
            if (isLaserSabre && (victoryA || victoryB)) {
                onScoreUpdate(editingMatch, scoreA, scoreB, victoryA ? 'A' : 'B');
            }
            else if (isLaserSabre) {
                showToast('Match nul : cliquez sur V pour attribuer la victoire', 'warning');
                return;
            }
            else {
                showToast('Match nul impossible en escrime !', 'error');
                return;
            }
        }
        else {
            onScoreUpdate(editingMatch, scoreA, scoreB);
        }
        // Forcer la mise à jour de l'ordre des matchs
        setMatchesUpdateTrigger(prev => prev + 1);
        // Fermer le modal immédiatement après la mise à jour
        setEditingMatch(null);
        setEditScoreA('');
        setEditScoreB('');
        setVictoryA(false);
        setVictoryB(false);
    };
    const handleSpecialStatus = (status) => {
        if (editingMatch === null)
            return;
        const match = pool.matches[editingMatch];
        // Déterminer quel tireur abandonne (le premier par défaut, pourrait être paramétrable)
        const isA = window.confirm(`${match.fencerA?.lastName} ${match.fencerA?.firstName?.charAt(0)}. ${status === 'abandon' ? 'abandonne' : status === 'forfait' ? 'déclare forfait' : 'est exclu'} ?\n\nCliquez sur Annuler pour ${status === 'abandon' ? 'abandonner' : status === 'forfait' ? 'déclarer forfait' : 'exclure'} ${match.fencerB?.lastName} ${match.fencerB?.firstName?.charAt(0)}.`);
        if (isA) {
            // Tireur A abandonne/forfait/exclu
            onScoreUpdate(editingMatch, 0, match.scoreB?.value || maxScore, 'B', status);
        }
        else {
            // Tireur B abandonne/forfait/exclu
            onScoreUpdate(editingMatch, match.scoreA?.value || maxScore, 0, 'A', status);
        }
        // Forcer la mise à jour de l'ordre des matchs
        setMatchesUpdateTrigger(prev => prev + 1);
        // Fermer le modal immédiatement après la mise à jour
        setEditingMatch(null);
        setEditScoreA('');
        setEditScoreB('');
        setVictoryA(false);
        setVictoryB(false);
    };
    const calculateFencerStats = (fencer) => {
        let v = 0, d = 0, td = 0, tr = 0;
        for (const match of pool.matches) {
            if (match.status !== types_1.MatchStatus.FINISHED)
                continue;
            if (match.fencerA?.id === fencer.id) {
                if (match.scoreA?.isVictory)
                    v++;
                else
                    d++;
                td += match.scoreA?.value || 0;
                tr += match.scoreB?.value || 0;
            }
            else if (match.fencerB?.id === fencer.id) {
                if (match.scoreB?.isVictory)
                    v++;
                else
                    d++;
                td += match.scoreB?.value || 0;
                tr += match.scoreA?.value || 0;
            }
        }
        return { v, d, td, tr, index: td - tr, ratio: (v + d) > 0 ? v / (v + d) : 0 };
    };
    const finishedCount = pool.matches.filter(m => m.status === types_1.MatchStatus.FINISHED).length;
    const totalMatches = pool.matches.length;
    // Export PDF function
    const handleExportPDF = async () => {
        try {
            await (0, pdfExport_1.exportPoolToPDF)(pool, {
                title: `Poule ${pool.number} - ${pool.fencers.length} tireurs`,
                includeFinishedMatches: true,
                includePendingMatches: true,
                includePoolStats: true
            });
            showToast(`Export PDF de la poule ${pool.number} généré avec succès`, 'success');
        }
        catch (error) {
            console.error('Erreur lors de l\'export PDF:', error);
            showToast(`Erreur lors de la génération du PDF: ${error instanceof Error ? error.message : 'Erreur inconnue'}`, 'error');
        }
    };
    // Render Score Modal
    const renderScoreModal = () => {
        if (editingMatch === null)
            return null;
        const match = pool.matches[editingMatch];
        return ((0, jsx_runtime_1.jsx)("div", { className: "modal-overlay", onClick: () => setEditingMatch(null), children: (0, jsx_runtime_1.jsxs)("div", { ref: modalRef, className: "modal resizable", onClick: (e) => e.stopPropagation(), children: [(0, jsx_runtime_1.jsx)("div", { className: "modal-header", style: { cursor: 'move' }, children: (0, jsx_runtime_1.jsx)("h3", { className: "modal-title", children: "Entrer le score" }) }), (0, jsx_runtime_1.jsxs)("div", { className: "modal-body", children: [(0, jsx_runtime_1.jsxs)("p", { className: "text-sm text-muted mb-4", children: [match.fencerA?.lastName, " vs ", match.fencerB?.lastName] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '2rem', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', padding: '1rem' }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { textAlign: 'center', flex: '1 1 300px', minWidth: '150px' }, children: [(0, jsx_runtime_1.jsx)("div", { className: "text-sm mb-1", children: match.fencerA?.lastName }), (0, jsx_runtime_1.jsxs)("div", { className: "text-xs text-muted mb-2", children: [match.fencerA?.firstName && `${match.fencerA.firstName.charAt(0)}. `, match.fencerA?.birthDate && `${match.fencerA.birthDate.getFullYear()} `, match.fencerA?.ranking && `#${match.fencerA.ranking}`] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center' }, children: [isLaserSabre && ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => { setVictoryA(!victoryA); setVictoryB(false); }, style: { padding: '0.5rem', background: victoryA ? '#22c55e' : '#e5e7eb', color: victoryA ? 'white' : '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }, children: "V" })), (0, jsx_runtime_1.jsx)("input", { type: "number", className: "form-input", style: {
                                                            width: '100px',
                                                            minWidth: '80px',
                                                            maxWidth: '200px',
                                                            textAlign: 'center',
                                                            fontSize: '2rem',
                                                            padding: '0.75rem',
                                                            borderColor: (parseInt(editScoreA, 10) || 0) > (maxScore > 0 ? maxScore : 999) ? '#ef4444' : undefined,
                                                            borderWidth: (parseInt(editScoreA, 10) || 0) > (maxScore > 0 ? maxScore : 999) ? '2px' : undefined
                                                        }, value: editScoreA, onChange: (e) => setEditScoreA(e.target.value), min: "0", max: maxScore > 0 ? maxScore : undefined, autoFocus: true, onKeyDown: (e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                handleScoreSubmit();
                                                            }
                                                            else if (e.key === 'Tab' && !e.shiftKey) {
                                                                e.preventDefault();
                                                                // Passer au champ de score du tireur B
                                                                const modalBody = e.currentTarget.closest('.modal-body');
                                                                if (modalBody) {
                                                                    const inputs = modalBody.querySelectorAll('input[type="number"]');
                                                                    if (inputs.length > 1) {
                                                                        const nextInput = inputs[1];
                                                                        nextInput.focus();
                                                                        nextInput.select();
                                                                    }
                                                                }
                                                            }
                                                        } })] })] }), (0, jsx_runtime_1.jsx)("span", { style: { fontSize: '2.5rem', fontWeight: 'bold', margin: '0 1rem' }, children: "-" }), (0, jsx_runtime_1.jsxs)("div", { style: { textAlign: 'center', flex: '1 1 300px', minWidth: '150px' }, children: [(0, jsx_runtime_1.jsx)("div", { className: "text-sm mb-1", children: match.fencerB?.lastName }), (0, jsx_runtime_1.jsxs)("div", { className: "text-xs text-muted mb-2", children: [match.fencerB?.firstName && `${match.fencerB.firstName.charAt(0)}. `, match.fencerB?.birthDate && `${match.fencerB.birthDate.getFullYear()} `, match.fencerB?.ranking && `#${match.fencerB.ranking}`] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center' }, children: [(0, jsx_runtime_1.jsx)("input", { type: "number", className: "form-input", style: {
                                                            width: '100px',
                                                            minWidth: '80px',
                                                            maxWidth: '200px',
                                                            textAlign: 'center',
                                                            fontSize: '2rem',
                                                            padding: '0.75rem',
                                                            borderColor: (parseInt(editScoreB, 10) || 0) > (maxScore > 0 ? maxScore : 999) ? '#ef4444' : undefined,
                                                            borderWidth: (parseInt(editScoreB, 10) || 0) > (maxScore > 0 ? maxScore : 999) ? '2px' : undefined
                                                        }, value: editScoreB, onChange: (e) => setEditScoreB(e.target.value), min: "0", max: maxScore > 0 ? maxScore : undefined, onKeyDown: (e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                handleScoreSubmit();
                                                            }
                                                            else if (e.key === 'Tab' && e.shiftKey) {
                                                                e.preventDefault();
                                                                // Revenir au champ de score du tireur A
                                                                const modalBody = e.currentTarget.closest('.modal-body');
                                                                if (modalBody) {
                                                                    const inputs = modalBody.querySelectorAll('input[type="number"]');
                                                                    if (inputs.length > 0) {
                                                                        const prevInput = inputs[0];
                                                                        prevInput.focus();
                                                                        prevInput.select();
                                                                    }
                                                                }
                                                            }
                                                        } }), isLaserSabre && ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => { setVictoryB(!victoryB); setVictoryA(false); }, style: { padding: '0.5rem', background: victoryB ? '#22c55e' : '#e5e7eb', color: victoryB ? 'white' : '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }, children: "V" }))] })] })] }), isLaserSabre && (0, jsx_runtime_1.jsx)("p", { className: "text-sm text-muted mt-3", style: { textAlign: 'center' }, children: "\uD83D\uDCA1 \u00C9galit\u00E9? Cliquez V pour attribuer la victoire" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "modal-footer", style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '0.5rem' }, children: [(0, jsx_runtime_1.jsx)("button", { className: "btn btn-secondary", onClick: () => setEditingMatch(null), children: "Annuler" }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-primary", onClick: handleScoreSubmit, children: "Valider" })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '0.25rem', justifyContent: 'center', borderTop: '1px solid #e5e7eb', paddingTop: '0.5rem' }, children: [(0, jsx_runtime_1.jsx)("button", { className: "btn btn-warning", onClick: () => handleSpecialStatus('abandon'), style: { fontSize: '0.75rem', padding: '0.25rem 0.5rem' }, children: "\uD83D\uDEB4 Abandon" }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-warning", onClick: () => handleSpecialStatus('forfait'), style: { fontSize: '0.75rem', padding: '0.25rem 0.5rem' }, children: "\uD83D\uDCCB Forfait" }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-danger", onClick: () => handleSpecialStatus('exclusion'), style: { fontSize: '0.75rem', padding: '0.25rem 0.5rem' }, children: "\uD83D\uDEAB Exclusion" })] })] })] }) }));
    };
    // Render Grid View
    const renderGridView = () => ((0, jsx_runtime_1.jsxs)("div", { className: "pool-grid", children: [(0, jsx_runtime_1.jsxs)("div", { className: "pool-row", children: [(0, jsx_runtime_1.jsx)("div", { className: "pool-cell pool-cell-header pool-cell-name" }), fencers.map((_, i) => (0, jsx_runtime_1.jsx)("div", { className: "pool-cell pool-cell-header", children: i + 1 }, i)), (0, jsx_runtime_1.jsx)("div", { className: "pool-cell pool-cell-header", children: "V" }), (0, jsx_runtime_1.jsx)("div", { className: "pool-cell pool-cell-header", children: "V/M" }), (0, jsx_runtime_1.jsx)("div", { className: "pool-cell pool-cell-header", children: "TD" }), (0, jsx_runtime_1.jsx)("div", { className: "pool-cell pool-cell-header", children: "TR" }), (0, jsx_runtime_1.jsx)("div", { className: "pool-cell pool-cell-header", children: "Ind" }), isLaserSabre && (0, jsx_runtime_1.jsx)("div", { className: "pool-cell pool-cell-header", style: { color: '#7c3aed' }, children: "Quest" }), (0, jsx_runtime_1.jsx)("div", { className: "pool-cell pool-cell-header", children: "Rg" })] }), fencers.map((rowFencer, rowIndex) => {
                const stats = calculateFencerStats(rowFencer);
                const rankEntry = pool.ranking.find(r => r.fencer.id === rowFencer.id);
                return ((0, jsx_runtime_1.jsxs)("div", { className: "pool-row", children: [(0, jsx_runtime_1.jsxs)("div", { className: "pool-cell pool-cell-header pool-cell-name", title: `${rowFencer.firstName} ${rowFencer.lastName}`, style: { display: 'flex', alignItems: 'center', gap: '0.25rem' }, children: [(0, jsx_runtime_1.jsxs)("span", { style: { fontWeight: 500 }, children: [rowIndex + 1, "."] }), (0, jsx_runtime_1.jsxs)("span", { className: "truncate", style: { flex: 1 }, children: [rowFencer.lastName, (0, jsx_runtime_1.jsx)("span", { style: { fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.25rem' }, children: rowFencer.firstName })] }), onFencerChangePool && ((0, jsx_runtime_1.jsx)("button", { onClick: (e) => { e.stopPropagation(); onFencerChangePool(rowFencer); }, title: "Changer de poule", style: {
                                        padding: '0.125rem 0.25rem',
                                        fontSize: '0.625rem',
                                        background: '#e5e7eb',
                                        border: 'none',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        opacity: 0.6,
                                        transition: 'opacity 0.15s',
                                    }, onMouseEnter: (e) => (e.currentTarget.style.opacity = '1'), onMouseLeave: (e) => (e.currentTarget.style.opacity = '0.6'), children: "\u2194" }))] }), fencers.map((colFencer, colIndex) => {
                            if (rowIndex === colIndex) {
                                return (0, jsx_runtime_1.jsx)("div", { className: "pool-cell pool-cell-diagonal" }, colIndex);
                            }
                            const score = getScore(rowFencer, colFencer);
                            const cellClass = score ? (score.isVictory ? 'pool-cell-victory' : 'pool-cell-defeat') : 'pool-cell-editable';
                            return ((0, jsx_runtime_1.jsx)("div", { className: `pool-cell ${cellClass}`, onClick: () => handleCellClick(rowFencer, colFencer), style: { cursor: 'pointer' }, children: score ? (0, jsx_runtime_1.jsxs)("span", { children: [score.isVictory ? 'V' : '', score.value] }) : (0, jsx_runtime_1.jsx)("span", { style: { color: '#9CA3AF' }, children: "-" }) }, colIndex));
                        }), (0, jsx_runtime_1.jsx)("div", { className: "pool-cell", style: { fontWeight: 600 }, children: stats.v }), (0, jsx_runtime_1.jsx)("div", { className: "pool-cell text-sm", children: (0, poolCalculations_1.formatRatio)(stats.ratio) }), (0, jsx_runtime_1.jsx)("div", { className: "pool-cell", children: stats.td }), (0, jsx_runtime_1.jsx)("div", { className: "pool-cell", children: stats.tr }), (0, jsx_runtime_1.jsx)("div", { className: "pool-cell", style: { color: stats.index >= 0 ? '#059669' : '#DC2626' }, children: (0, poolCalculations_1.formatIndex)(stats.index) }), isLaserSabre && (0, jsx_runtime_1.jsx)("div", { className: "pool-cell", style: { fontWeight: 600, color: '#7c3aed' }, children: rankEntry?.questPoints ?? '-' }), (0, jsx_runtime_1.jsx)("div", { className: "pool-cell", style: { fontWeight: 600 }, children: rankEntry?.rank || '-' })] }, rowFencer.id));
            })] }));
    // Composant Prochain Match réutilisable
    const renderNextMatch = () => {
        if (orderedMatches.pending.length === 0)
            return null;
        const nextMatch = orderedMatches.pending[0];
        return ((0, jsx_runtime_1.jsx)("div", { style: {
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                borderRadius: '8px',
                padding: '1rem',
                marginTop: '1rem',
                color: 'white'
            }, children: (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.8 }, children: "\u2694\uFE0F Prochain match" }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, justifyContent: 'center' }, children: [(0, jsx_runtime_1.jsxs)("span", { style: { fontWeight: '600' }, children: [nextMatch.match.fencerA?.lastName, " ", nextMatch.match.fencerA?.firstName?.charAt(0), ".", nextMatch.match.fencerA?.ranking && ` #${nextMatch.match.fencerA.ranking}`] }), (0, jsx_runtime_1.jsx)("span", { style: { opacity: 0.7 }, children: "vs" }), (0, jsx_runtime_1.jsxs)("span", { style: { fontWeight: '600' }, children: [nextMatch.match.fencerB?.lastName, " ", nextMatch.match.fencerB?.firstName?.charAt(0), ".", nextMatch.match.fencerB?.ranking && ` #${nextMatch.match.fencerB.ranking}`] })] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => openScoreModal(nextMatch.index), style: {
                            padding: '0.5rem 1rem',
                            background: 'rgba(255,255,255,0.2)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: '6px',
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: '500',
                            fontSize: '0.875rem',
                        }, children: "Saisir" })] }) }));
    };
    // Render Match List View
    const renderMatchListView = () => ((0, jsx_runtime_1.jsxs)("div", { children: [orderedMatches.pending.length > 0 && ((0, jsx_runtime_1.jsxs)("div", { style: {
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    marginBottom: '1rem',
                    color: 'white'
                }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.8, marginBottom: '0.5rem' }, children: "\u2694\uFE0F Prochain match" }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { flex: 1, textAlign: 'center' }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: '1.5rem', fontWeight: '700' }, children: orderedMatches.pending[0].match.fencerA?.lastName }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: '0.875rem', opacity: 0.8 }, children: orderedMatches.pending[0].match.fencerA?.firstName })] }), (0, jsx_runtime_1.jsx)("div", { style: { padding: '0 1rem', fontSize: '1.25rem', fontWeight: '600' }, children: "VS" }), (0, jsx_runtime_1.jsxs)("div", { style: { flex: 1, textAlign: 'center' }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: '1.5rem', fontWeight: '700' }, children: orderedMatches.pending[0].match.fencerB?.lastName }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: '0.875rem', opacity: 0.8 }, children: orderedMatches.pending[0].match.fencerB?.firstName })] })] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => openScoreModal(orderedMatches.pending[0].index), style: {
                            marginTop: '1rem',
                            width: '100%',
                            padding: '0.75rem',
                            background: 'rgba(255,255,255,0.2)',
                            border: '2px solid rgba(255,255,255,0.3)',
                            borderRadius: '6px',
                            color: 'white',
                            fontSize: '1rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                        }, children: "\uD83C\uDFAF Saisir le score" })] })), orderedMatches.pending.length > 1 && ((0, jsx_runtime_1.jsxs)("div", { style: { marginBottom: '1rem' }, children: [(0, jsx_runtime_1.jsxs)("h4", { style: { fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#6b7280' }, children: ["Matches \u00E0 venir (", orderedMatches.pending.length - 1, ")"] }), (0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' }, children: orderedMatches.pending.slice(1).map(({ match, index }, i) => ((0, jsx_runtime_1.jsxs)("div", { onClick: () => openScoreModal(index), style: {
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0.75rem 1rem',
                                background: '#f9fafb',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                border: '1px solid #e5e7eb',
                            }, children: [(0, jsx_runtime_1.jsxs)("span", { style: { color: '#9ca3af', fontSize: '0.875rem', minWidth: '30px' }, children: ["#", i + 2] }), (0, jsx_runtime_1.jsx)("span", { style: { flex: 1, fontWeight: '500' }, children: match.fencerA?.lastName }), (0, jsx_runtime_1.jsx)("span", { style: { color: '#9ca3af', padding: '0 0.5rem' }, children: "vs" }), (0, jsx_runtime_1.jsx)("span", { style: { flex: 1, textAlign: 'right', fontWeight: '500' }, children: match.fencerB?.lastName })] }, index))) })] })), orderedMatches.finished.length > 0 && ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsxs)("h4", { style: { fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#6b7280' }, children: ["Matches termin\u00E9s (", orderedMatches.finished.length, ")"] }), (0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' }, children: orderedMatches.finished.map(({ match, index }) => ((0, jsx_runtime_1.jsxs)("div", { onClick: () => openScoreModal(index), style: {
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0.75rem 1rem',
                                background: match.scoreA?.isVictory ? '#f0fdf4' : '#fef2f2',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                border: '1px solid #e5e7eb',
                            }, children: [(0, jsx_runtime_1.jsxs)("span", { style: {
                                        flex: 1,
                                        fontWeight: match.scoreA?.isVictory ? '600' : '400',
                                        color: match.scoreA?.isVictory ? '#16a34a' : '#6b7280'
                                    }, children: [match.scoreA?.isVictory ? '✓ ' : '', match.fencerA?.lastName] }), (0, jsx_runtime_1.jsxs)("span", { style: {
                                        padding: '0.25rem 0.75rem',
                                        background: 'white',
                                        borderRadius: '4px',
                                        fontWeight: '600',
                                        fontSize: '0.875rem'
                                    }, children: [match.scoreA?.isVictory ? 'V' : '', match.scoreA?.value, " - ", match.scoreB?.isVictory ? 'V' : '', match.scoreB?.value] }), (0, jsx_runtime_1.jsxs)("span", { style: {
                                        flex: 1,
                                        textAlign: 'right',
                                        fontWeight: match.scoreB?.isVictory ? '600' : '400',
                                        color: match.scoreB?.isVictory ? '#16a34a' : '#6b7280'
                                    }, children: [match.fencerB?.lastName, match.scoreB?.isVictory ? ' ✓' : ''] })] }, index))) })] })), orderedMatches.pending.length === 0 && ((0, jsx_runtime_1.jsxs)("div", { style: { textAlign: 'center', padding: '2rem', color: '#6b7280' }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: '3rem', marginBottom: '0.5rem' }, children: "\uD83C\uDFC1" }), (0, jsx_runtime_1.jsx)("div", { style: { fontWeight: '600' }, children: "Poule termin\u00E9e !" }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: '0.875rem' }, children: "Tous les matches ont \u00E9t\u00E9 jou\u00E9s" })] }))] }));
    return ((0, jsx_runtime_1.jsxs)("div", { className: "card", children: [(0, jsx_runtime_1.jsxs)("div", { className: "card-header", style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', gap: '0.75rem' }, children: [(0, jsx_runtime_1.jsxs)("span", { children: ["Poule ", pool.number] }), (0, jsx_runtime_1.jsx)("span", { className: `badge ${pool.isComplete ? 'badge-success' : 'badge-warning'}`, children: pool.isComplete ? 'Terminée' : `${finishedCount}/${totalMatches}` })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '0.5rem' }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: handleExportPDF, style: {
                                    padding: '0.375rem 0.75rem',
                                    fontSize: '0.75rem',
                                    background: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                }, title: "Exporter la poule en PDF", children: "\uD83D\uDCC4 PDF" }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '0.25rem' }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => setViewMode('grid'), style: {
                                            padding: '0.375rem 0.75rem',
                                            fontSize: '0.75rem',
                                            background: viewMode === 'grid' ? '#3b82f6' : '#e5e7eb',
                                            color: viewMode === 'grid' ? 'white' : '#374151',
                                            border: 'none',
                                            borderRadius: '4px 0 0 4px',
                                            cursor: 'pointer',
                                        }, children: "\uD83D\uDCCA Tableau" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setViewMode('matches'), style: {
                                            padding: '0.375rem 0.75rem',
                                            fontSize: '0.75rem',
                                            background: viewMode === 'matches' ? '#3b82f6' : '#e5e7eb',
                                            color: viewMode === 'matches' ? 'white' : '#374151',
                                            border: 'none',
                                            borderRadius: '0 4px 4px 0',
                                            cursor: 'pointer',
                                        }, children: "\u2694\uFE0F Matches" })] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "card-body", style: { overflowX: 'auto' }, children: [viewMode === 'grid' ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [renderGridView(), renderNextMatch()] })) : renderMatchListView(), renderScoreModal()] })] }));
};
exports.default = PoolView;
//# sourceMappingURL=PoolView.js.map