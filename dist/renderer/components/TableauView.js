"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Tableau View Component
 * Direct Elimination Table
 * Licensed under GPL-3.0
 */
const react_1 = require("react");
const Toast_1 = require("./Toast");
const useModalResize_1 = require("../hooks/useModalResize");
const TableauView = ({ ranking, matches, onMatchesChange, maxScore = 999, onComplete, thirdPlaceMatch = false }) => {
    const { showToast } = (0, Toast_1.useToast)();
    const [tableauSize, setTableauSize] = (0, react_1.useState)(0);
    const [editingMatch, setEditingMatch] = (0, react_1.useState)(null);
    const [tempScoreA, setTempScoreA] = (0, react_1.useState)('');
    const [tempScoreB, setTempScoreB] = (0, react_1.useState)('');
    const [showScoreModal, setShowScoreModal] = (0, react_1.useState)(false);
    const [editScoreA, setEditScoreA] = (0, react_1.useState)('');
    const [editScoreB, setEditScoreB] = (0, react_1.useState)('');
    const [victoryA, setVictoryA] = (0, react_1.useState)(false);
    const [victoryB, setVictoryB] = (0, react_1.useState)(false);
    const isUnlimitedScore = maxScore === 999;
    const { modalRef, dimensions } = (0, useModalResize_1.useModalResize)({
        defaultWidth: 800,
        defaultHeight: 350,
        minWidth: 600,
        minHeight: 300
    });
    (0, react_1.useEffect)(() => {
        if (ranking.length > 0) {
            // Vérifier si le tableau existant correspond au classement actuel
            const expectedSize = getTableauSize(ranking.length);
            const currentSize = matches.length > 0 ? Math.max(...matches.map(m => m.round)) : 0;
            // Régénérer si pas de matches OU si la taille ne correspond pas
            if (matches.length === 0 || currentSize !== expectedSize) {
                generateTableau();
            }
            else {
                setTableauSize(currentSize);
            }
        }
    }, [ranking.length]); // Dépend uniquement du nombre de tireurs dans le ranking
    const getTableauSize = (fencerCount) => {
        const sizes = [4, 8, 16, 32, 64, 128, 256];
        for (const size of sizes) {
            if (fencerCount <= size)
                return size;
        }
        return 256;
    };
    const generateTableau = () => {
        const qualifiedFencers = ranking.slice(0, Math.min(ranking.length, 64));
        const size = getTableauSize(qualifiedFencers.length);
        setTableauSize(size);
        const seeding = generateFIESeeding(size);
        const newMatches = [];
        // Premier tour
        for (let i = 0; i < size / 2; i++) {
            const seedA = seeding[i * 2];
            const seedB = seeding[i * 2 + 1];
            const fencerA = seedA <= qualifiedFencers.length ? qualifiedFencers[seedA - 1].fencer : null;
            const fencerB = seedB <= qualifiedFencers.length ? qualifiedFencers[seedB - 1].fencer : null;
            const isBye = !fencerA || !fencerB;
            const winner = isBye ? (fencerA || fencerB) : null;
            newMatches.push({
                id: `${size}-${i}`,
                round: size,
                position: i,
                fencerA,
                fencerB,
                scoreA: isBye ? null : null,
                scoreB: isBye ? null : null,
                winner,
                isBye,
            });
        }
        // Générer les rounds suivants
        let currentRound = size / 2;
        while (currentRound >= 2) {
            for (let i = 0; i < currentRound / 2; i++) {
                newMatches.push({
                    id: `${currentRound}-${i}`,
                    round: currentRound,
                    position: i,
                    fencerA: null,
                    fencerB: null,
                    scoreA: null,
                    scoreB: null,
                    winner: null,
                    isBye: false,
                });
            }
            currentRound = currentRound / 2;
        }
        // Ajouter le match pour la 3ème place si demandé
        if (thirdPlaceMatch && size >= 4) {
            newMatches.push({
                id: '3-0',
                round: 3,
                position: 0,
                fencerA: null,
                fencerB: null,
                scoreA: null,
                scoreB: null,
                winner: null,
                isBye: false,
            });
        }
        // Propager les byes
        propagateWinners(newMatches, size);
        onMatchesChange(newMatches);
    };
    const generateFIESeeding = (size) => {
        if (size === 4)
            return [1, 4, 3, 2];
        if (size === 8)
            return [1, 8, 5, 4, 3, 6, 7, 2];
        if (size === 16)
            return [1, 16, 9, 8, 5, 12, 13, 4, 3, 14, 11, 6, 7, 10, 15, 2];
        if (size === 32) {
            return [1, 32, 17, 16, 9, 24, 25, 8, 5, 28, 21, 12, 13, 20, 29, 4,
                3, 30, 19, 14, 11, 22, 27, 6, 7, 26, 23, 10, 15, 18, 31, 2];
        }
        if (size === 64) {
            return [
                1, 64, 33, 32, 17, 48, 49, 16, 9, 56, 41, 24, 25, 40, 57, 8,
                5, 60, 37, 28, 21, 44, 53, 12, 13, 52, 45, 20, 29, 36, 61, 4,
                3, 62, 35, 30, 19, 46, 51, 14, 11, 54, 43, 22, 27, 38, 59, 6,
                7, 58, 39, 26, 23, 42, 55, 10, 15, 50, 47, 18, 31, 34, 63, 2
            ];
        }
        return Array.from({ length: size }, (_, i) => i + 1);
    };
    const propagateWinners = (matchList, size) => {
        let currentRound = size;
        while (currentRound > 2) {
            const nextRound = currentRound / 2;
            const currentMatches = matchList.filter(m => m.round === currentRound);
            const nextMatches = matchList.filter(m => m.round === nextRound);
            currentMatches.forEach((match, idx) => {
                if (match.winner && !match.isBye) { // NE PAS propager les byes
                    const nextMatchIdx = Math.floor(idx / 2);
                    const nextMatch = nextMatches[nextMatchIdx];
                    if (nextMatch) {
                        if (idx % 2 === 0) {
                            nextMatch.fencerA = match.winner;
                        }
                        else {
                            nextMatch.fencerB = match.winner;
                        }
                        // Vérifier si le match suivant est un bye (seulement si un seul adversaire)
                        if (nextMatch.fencerA && !nextMatch.fencerB) {
                            nextMatch.winner = nextMatch.fencerA;
                            nextMatch.isBye = true;
                        }
                        else if (!nextMatch.fencerA && nextMatch.fencerB) {
                            nextMatch.winner = nextMatch.fencerB;
                            nextMatch.isBye = true;
                        }
                        else if (nextMatch.fencerA && nextMatch.fencerB) {
                            // Les deux adversaires sont présents, ce n'est plus un bye
                            nextMatch.isBye = false;
                            nextMatch.winner = null;
                        }
                    }
                }
            });
            currentRound = nextRound;
        }
        // Gérer le match de 3ème place si activé
        if (thirdPlaceMatch && size >= 4) {
            const thirdPlaceMatch = matchList.find(m => m.round === 3);
            const semiFinalMatches = matchList.filter(m => m.round === 4);
            if (thirdPlaceMatch && semiFinalMatches.length === 2) {
                // Assigner les perdants des demi-finales au match de 3ème place
                const losers = [];
                semiFinalMatches.forEach(semiFinal => {
                    if (semiFinal.winner) {
                        const loser = semiFinal.fencerA?.id === semiFinal.winner.id
                            ? semiFinal.fencerB
                            : semiFinal.fencerA;
                        if (loser)
                            losers.push(loser);
                    }
                });
                if (losers.length === 2) {
                    thirdPlaceMatch.fencerA = losers[0];
                    thirdPlaceMatch.fencerB = losers[1];
                }
            }
        }
    };
    const getRoundName = (round) => {
        if (round === 2)
            return 'Finale';
        if (round === 3)
            return 'Petite finale (3ème place)';
        if (round === 4)
            return 'Demi-finales';
        if (round === 8)
            return 'Quarts de finale';
        if (round === 16)
            return 'Tableau de 16';
        if (round === 32)
            return 'Tableau de 32';
        if (round === 64)
            return 'Tableau de 64';
        return `Tableau de ${round}`;
    };
    const handleScoreSubmit = () => {
        if (!editingMatch)
            return;
        const scoreA = parseInt(editScoreA) || 0;
        const scoreB = parseInt(editScoreB) || 0;
        // Validation
        if (scoreA === scoreB && !victoryA && !victoryB) {
            showToast('Les scores ne peuvent pas être égaux en élimination directe', 'error');
            return;
        }
        if (!isUnlimitedScore && maxScore > 0) {
            if (scoreA > maxScore || scoreB > maxScore) {
                showToast(`Le score ne peut pas dépasser ${maxScore}`, 'error');
                return;
            }
        }
        // Déterminer le vainqueur
        let winner = null;
        if (victoryA) {
            winner = matches.find(m => m.id === editingMatch)?.fencerA || null;
        }
        else if (victoryB) {
            winner = matches.find(m => m.id === editingMatch)?.fencerB || null;
        }
        else if (scoreA > scoreB) {
            winner = matches.find(m => m.id === editingMatch)?.fencerA || null;
        }
        else if (scoreB > scoreA) {
            winner = matches.find(m => m.id === editingMatch)?.fencerB || null;
        }
        const updatedMatches = matches.map(match => {
            if (match.id === editingMatch) {
                return {
                    ...match,
                    scoreA,
                    scoreB,
                    winner
                };
            }
            return match;
        });
        onMatchesChange(updatedMatches);
        setShowScoreModal(false);
        setEditingMatch(null);
        setEditScoreA('');
        setEditScoreB('');
        setVictoryA(false);
        setVictoryB(false);
        // Propager les gagnants
        propagateWinners(updatedMatches, tableauSize);
    };
    const openScoreModal = (match) => {
        setEditingMatch(match.id);
        setEditScoreA(match.scoreA?.toString() || '');
        setEditScoreB(match.scoreB?.toString() || '');
        setVictoryA(false);
        setVictoryB(false);
        setShowScoreModal(true);
    };
    const handleSpecialStatus = (status) => {
        if (!editingMatch)
            return;
        const match = matches.find(m => m.id === editingMatch);
        if (!match)
            return;
        let winner = null;
        if (status === 'abandon' || status === 'forfait') {
            // Le match est annulé, pas de vainqueur
            winner = null;
        }
        else if (status === 'exclusion') {
            // Pour l'exclusion, l'adversaire gagne
            winner = match.fencerA && match.fencerB ? match.fencerB : match.fencerA || match.fencerB;
        }
        const updatedMatches = matches.map(m => {
            if (m.id === editingMatch) {
                return {
                    ...m,
                    winner,
                    // On pourrait ajouter des champs pour les statuts spéciaux ici
                };
            }
            return m;
        });
        onMatchesChange(updatedMatches);
        setShowScoreModal(false);
        setEditingMatch(null);
        setEditScoreA('');
        setEditScoreB('');
        setVictoryA(false);
        setVictoryB(false);
        // Propager les gagnants
        propagateWinners(updatedMatches, tableauSize);
    };
    const calculateFinalResults = (matchList) => {
        const results = [];
        const processed = new Set();
        // Champion (gagnant de la finale)
        const finalMatch = matchList.find(m => m.round === 2);
        if (finalMatch?.winner) {
            results.push({ rank: 1, fencer: finalMatch.winner, eliminatedAt: 'Vainqueur' });
            processed.add(finalMatch.winner.id);
            // 2ème (perdant de la finale)
            const loser = finalMatch.fencerA?.id === finalMatch.winner.id ? finalMatch.fencerB : finalMatch.fencerA;
            if (loser) {
                results.push({ rank: 2, fencer: loser, eliminatedAt: 'Finale' });
                processed.add(loser.id);
            }
        }
        // Match pour la 3ème place (existe si présent)
        const thirdPlaceMatch = matchList.find(m => m.round === 3);
        if (thirdPlaceMatch?.winner) {
            results.push({ rank: 3, fencer: thirdPlaceMatch.winner, eliminatedAt: '3ème place' });
            processed.add(thirdPlaceMatch.winner.id);
            // 4ème place (perdant du match pour la 3ème place)
            const fourthPlace = thirdPlaceMatch.fencerA?.id === thirdPlaceMatch.winner.id ? thirdPlaceMatch.fencerB : thirdPlaceMatch.fencerA;
            if (fourthPlace) {
                results.push({ rank: 4, fencer: fourthPlace, eliminatedAt: '3ème place' });
                processed.add(fourthPlace.id);
            }
        }
        // Parcourir les autres tours
        const rounds = [4, 8, 16, 32, 64].filter(r => r <= tableauSize && r !== 3);
        let currentRank = (thirdPlaceMatch ? 5 : 3);
        for (const round of rounds) {
            const roundMatches = matchList.filter(m => m.round === round && m.winner);
            const losers = [];
            for (const match of roundMatches) {
                const loser = match.fencerA?.id === match.winner?.id ? match.fencerB : match.fencerA;
                if (loser && !processed.has(loser.id)) {
                    losers.push(loser);
                    processed.add(loser.id);
                }
            }
            // Tous les perdants d'un même tour ont le même rang
            for (const loser of losers) {
                results.push({ rank: currentRank, fencer: loser, eliminatedAt: getRoundName(round) });
            }
            if (losers.length > 0) {
                currentRank += losers.length;
            }
        }
        return results.sort((a, b) => a.rank - b.rank);
    };
    const renderMatch = (match) => {
        const isEditing = editingMatch === match.id;
        const canEdit = match.fencerA && match.fencerB && !match.winner && !match.isBye;
        return ((0, jsx_runtime_1.jsxs)("div", { style: {
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                padding: '0.5rem',
                margin: '0.25rem 0',
                background: match.winner ? '#f0fdf4' : 'var(--color-surface)',
                minWidth: '180px',
            }, children: [(0, jsx_runtime_1.jsxs)("div", { style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '0.25rem',
                        background: match.winner === match.fencerA ? '#dcfce7' : 'transparent',
                        borderRadius: '2px',
                    }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', flexDirection: 'column', gap: '0.125rem' }, children: [(0, jsx_runtime_1.jsx)("span", { style: { fontSize: '0.875rem', fontWeight: match.winner === match.fencerA ? '600' : '400' }, children: match.fencerA ? `${match.fencerA.lastName} ${match.fencerA.firstName.charAt(0)}.` : '-' }), match.fencerA && ((0, jsx_runtime_1.jsxs)("span", { style: { fontSize: '0.625rem', color: '#6b7280' }, children: [match.fencerA.birthDate && `${match.fencerA.birthDate.getFullYear()}`, match.fencerA.ranking && ` • #${match.fencerA.ranking}`] }))] }), isEditing ? ((0, jsx_runtime_1.jsx)("input", { type: "number", value: tempScoreA, onChange: e => setTempScoreA(e.target.value), style: { width: '40px', textAlign: 'center' }, min: "0", max: isUnlimitedScore ? 999 : maxScore, autoFocus: true })) : ((0, jsx_runtime_1.jsx)("span", { style: { fontWeight: '600' }, children: match.scoreA !== null ? match.scoreA : '' }))] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '0.25rem',
                        background: match.winner === match.fencerB ? '#dcfce7' : 'transparent',
                        borderRadius: '2px',
                    }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', flexDirection: 'column', gap: '0.125rem' }, children: [(0, jsx_runtime_1.jsx)("span", { style: { fontSize: '0.875rem', fontWeight: match.winner === match.fencerB ? '600' : '400' }, children: match.fencerB ? `${match.fencerB.lastName} ${match.fencerB.firstName.charAt(0)}.` : '-' }), match.fencerB && ((0, jsx_runtime_1.jsxs)("span", { style: { fontSize: '0.625rem', color: '#6b7280' }, children: [match.fencerB.birthDate && `${match.fencerB.birthDate.getFullYear()}`, match.fencerB.ranking && ` • #${match.fencerB.ranking}`] }))] }), isEditing ? ((0, jsx_runtime_1.jsx)("input", { type: "number", value: tempScoreB, onChange: e => setTempScoreB(e.target.value), style: { width: '40px', textAlign: 'center' }, min: "0", max: isUnlimitedScore ? 999 : maxScore })) : ((0, jsx_runtime_1.jsx)("span", { style: { fontWeight: '600' }, children: match.scoreB !== null ? match.scoreB : '' }))] }), match.isBye && ((0, jsx_runtime_1.jsx)("div", { style: { fontSize: '0.75rem', color: '#6b7280', textAlign: 'center', marginTop: '0.25rem' }, children: "Exempt" })), canEdit && !isEditing && ((0, jsx_runtime_1.jsx)("button", { onClick: () => {
                        setEditingMatch(match.id);
                        setTempScoreA('');
                        setTempScoreB('');
                    }, style: {
                        width: '100%',
                        marginTop: '0.5rem',
                        padding: '0.25rem',
                        fontSize: '0.75rem',
                        background: '#3b82f6',
                        color: 'var(--color-text-dark)',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                    }, children: "Saisir score" })), isEditing && ((0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '0.25rem', marginTop: '0.5rem' }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => openScoreModal(match), style: {
                                flex: 1,
                                padding: '0.25rem',
                                fontSize: '0.75rem',
                                background: '#22c55e',
                                color: 'var(--color-text-dark)',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                            }, children: "\u2713" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setEditingMatch(null), style: {
                                flex: 1,
                                padding: '0.25rem',
                                fontSize: '0.75rem',
                                background: '#ef4444',
                                color: 'var(--color-text-dark)',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                            }, children: "\u2715" })] }))] }, match.id));
    };
    const renderRound = (round) => {
        const roundMatches = matches.filter(m => m.round === round);
        return ((0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', flexDirection: 'column', justifyContent: 'space-around', minWidth: '200px' }, children: [(0, jsx_runtime_1.jsx)("div", { style: { textAlign: 'center', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }, children: getRoundName(round) }), roundMatches.map(match => renderMatch(match))] }, round));
    };
    if (ranking.length === 0) {
        return ((0, jsx_runtime_1.jsxs)("div", { className: "empty-state", children: [(0, jsx_runtime_1.jsx)("div", { className: "empty-state-icon", children: "\uD83C\uDFC6" }), (0, jsx_runtime_1.jsx)("h2", { className: "empty-state-title", children: "Tableau \u00E0 \u00E9limination directe" }), (0, jsx_runtime_1.jsx)("p", { className: "empty-state-description", children: "Terminez d'abord les poules pour g\u00E9n\u00E9rer le tableau" })] }));
    }
    const finalMatch = matches.find(m => m.round === 2);
    const champion = finalMatch?.winner;
    const rounds = [];
    let r = tableauSize;
    while (r >= 2) {
        rounds.push(r);
        r = r / 2;
    }
    return ((0, jsx_runtime_1.jsxs)("div", { style: { padding: '1rem' }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }, children: [(0, jsx_runtime_1.jsxs)("h2", { style: { fontSize: '1.25rem', fontWeight: '600' }, children: ["Tableau de ", tableauSize, " - ", ranking.length, " qualifi\u00E9s"] }), champion && ((0, jsx_runtime_1.jsxs)("div", { style: {
                            background: '#fef3c7',
                            padding: '0.5rem 1rem',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }, children: [(0, jsx_runtime_1.jsx)("span", { style: { fontSize: '1.5rem' }, children: "\uD83C\uDFC6" }), (0, jsx_runtime_1.jsxs)("span", { style: { fontWeight: '600' }, children: [champion.lastName, " ", champion.firstName] })] }))] }), (0, jsx_runtime_1.jsx)("div", { style: {
                    display: 'flex',
                    gap: '1rem',
                    overflowX: 'auto',
                    padding: '1rem',
                    background: '#f9fafb',
                    borderRadius: '8px',
                }, children: rounds.map(round => renderRound(round)) }), (0, jsx_runtime_1.jsxs)("div", { style: { marginTop: '2rem' }, children: [(0, jsx_runtime_1.jsx)("h3", { style: { fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }, children: "Classement apr\u00E8s poules" }), (0, jsx_runtime_1.jsx)("div", { style: {
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                            gap: '0.5rem',
                            maxHeight: '200px',
                            overflowY: 'auto',
                        }, children: ranking.slice(0, tableauSize).map((r, idx) => ((0, jsx_runtime_1.jsxs)("div", { style: {
                                display: 'flex',
                                gap: '0.5rem',
                                padding: '0.25rem 0.5rem',
                                background: idx < 8 ? '#dbeafe' : 'var(--color-surface)',
                                borderRadius: '4px',
                                fontSize: '0.875rem',
                            }, children: [(0, jsx_runtime_1.jsxs)("span", { style: { fontWeight: '600', minWidth: '24px' }, children: [idx + 1, "."] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', flexDirection: 'column', gap: '0.125rem' }, children: [(0, jsx_runtime_1.jsxs)("span", { children: [r.fencer.lastName, " ", r.fencer.firstName] }), (0, jsx_runtime_1.jsxs)("span", { style: { fontSize: '0.625rem', color: '#6b7280' }, children: [r.fencer.birthDate && `${r.fencer.birthDate.getFullYear()}`, r.fencer.ranking && ` • #${r.fencer.ranking}`] })] }), (0, jsx_runtime_1.jsxs)("span", { style: { marginLeft: 'auto', color: '#6b7280' }, children: [(r.ratio * 100).toFixed(0), "%"] })] }, r.fencer.id))) })] }), (() => {
                if (!showScoreModal || !editingMatch)
                    return null;
                const match = matches.find(m => m.id === editingMatch);
                if (!match)
                    return null;
                return ((0, jsx_runtime_1.jsx)("div", { className: "modal-overlay", onClick: () => setShowScoreModal(false), children: (0, jsx_runtime_1.jsxs)("div", { ref: modalRef, className: "modal resizable", style: {
                            width: `${dimensions.width}px`,
                            height: `${dimensions.height}px`
                        }, onClick: (e) => e.stopPropagation(), children: [(0, jsx_runtime_1.jsx)("div", { className: "modal-header", style: { cursor: 'move' }, children: (0, jsx_runtime_1.jsx)("h3", { className: "modal-title", children: "Entrer le score" }) }), (0, jsx_runtime_1.jsxs)("div", { className: "modal-body", children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }, children: [(0, jsx_runtime_1.jsx)("h4", { className: "modal-title", style: { margin: 0, fontSize: '1rem', color: 'var(--color-text-light)' }, children: getRoundName(match.round) }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: '0.875rem', color: 'var(--color-text-light)' }, children: !isUnlimitedScore && maxScore > 0 && `Max: ${maxScore} touches` })] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '2rem',
                                            padding: '1.5rem',
                                            backgroundColor: 'var(--color-bg)',
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--color-border)'
                                        }, children: [(0, jsx_runtime_1.jsxs)("div", { style: {
                                                    flex: 1,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    textAlign: 'center'
                                                }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                                            fontSize: '1.125rem',
                                                            fontWeight: '600',
                                                            marginBottom: '0.5rem',
                                                            color: 'var(--color-text)'
                                                        }, children: match.fencerA?.lastName || 'TBD' }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                                            fontSize: '0.75rem',
                                                            color: 'var(--color-text-light)',
                                                            marginBottom: '1rem',
                                                            height: '2.5rem',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            justifyContent: 'center',
                                                            gap: '0.25rem'
                                                        }, children: [(0, jsx_runtime_1.jsx)("div", { children: match.fencerA?.firstName && `${match.fencerA.firstName.charAt(0)}.` }), (0, jsx_runtime_1.jsxs)("div", { children: [match.fencerA?.birthDate && `${match.fencerA.birthDate.getFullYear()}`, match.fencerA?.ranking && ` • #${match.fencerA.ranking}`] })] }), (0, jsx_runtime_1.jsx)("input", { type: "number", className: "form-input", style: {
                                                            width: '120px',
                                                            textAlign: 'center',
                                                            fontSize: '2.5rem',
                                                            fontWeight: 'bold',
                                                            padding: '0.75rem',
                                                            borderColor: (parseInt(editScoreA, 10) || 0) > (isUnlimitedScore ? 999 : maxScore) ? '#ef4444' : 'var(--color-border)',
                                                            borderWidth: (parseInt(editScoreA, 10) || 0) > (isUnlimitedScore ? 999 : maxScore) ? '2px' : '1px',
                                                            backgroundColor: 'var(--color-surface)',
                                                            color: 'var(--color-text)'
                                                        }, value: editScoreA, onChange: (e) => setEditScoreA(e.target.value), min: "0", max: isUnlimitedScore ? undefined : maxScore, autoFocus: true, onKeyDown: (e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                handleScoreSubmit();
                                                            }
                                                            else if (e.key === 'Tab' && !e.shiftKey) {
                                                                e.preventDefault();
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
                                                        } })] }), (0, jsx_runtime_1.jsx)("div", { style: {
                                                    fontSize: '2rem',
                                                    fontWeight: 'bold',
                                                    color: 'var(--color-text-light)',
                                                    padding: '0 1rem'
                                                }, children: "VS" }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                                    flex: 1,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    textAlign: 'center'
                                                }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                                            fontSize: '1.125rem',
                                                            fontWeight: '600',
                                                            marginBottom: '0.5rem',
                                                            color: 'var(--color-text)'
                                                        }, children: match.fencerB?.lastName || 'TBD' }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                                            fontSize: '0.75rem',
                                                            color: 'var(--color-text-light)',
                                                            marginBottom: '1rem',
                                                            height: '2.5rem',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            justifyContent: 'center',
                                                            gap: '0.25rem'
                                                        }, children: [(0, jsx_runtime_1.jsx)("div", { children: match.fencerB?.firstName && `${match.fencerB.firstName.charAt(0)}.` }), (0, jsx_runtime_1.jsxs)("div", { children: [match.fencerB?.birthDate && `${match.fencerB.birthDate.getFullYear()}`, match.fencerB?.ranking && ` • #${match.fencerB.ranking}`] })] }), (0, jsx_runtime_1.jsx)("input", { type: "number", className: "form-input", style: {
                                                            width: '120px',
                                                            textAlign: 'center',
                                                            fontSize: '2.5rem',
                                                            fontWeight: 'bold',
                                                            padding: '0.75rem',
                                                            borderColor: (parseInt(editScoreB, 10) || 0) > (isUnlimitedScore ? 999 : maxScore) ? '#ef4444' : 'var(--color-border)',
                                                            borderWidth: (parseInt(editScoreB, 10) || 0) > (isUnlimitedScore ? 999 : maxScore) ? '2px' : '1px',
                                                            backgroundColor: 'var(--color-surface)',
                                                            color: 'var(--color-text)'
                                                        }, value: editScoreB, onChange: (e) => setEditScoreB(e.target.value), min: "0", max: isUnlimitedScore ? undefined : maxScore, onKeyDown: (e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                handleScoreSubmit();
                                                            }
                                                            else if (e.key === 'Tab' && e.shiftKey) {
                                                                e.preventDefault();
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
                                                        } })] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "modal-footer", style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '0.5rem' }, children: [(0, jsx_runtime_1.jsx)("button", { className: "btn btn-secondary", onClick: () => setShowScoreModal(false), children: "Annuler" }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-primary", onClick: handleScoreSubmit, children: "Valider" })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '0.25rem', justifyContent: 'center', borderTop: '1px solid #e5e7eb', paddingTop: '0.5rem' }, children: [(0, jsx_runtime_1.jsx)("button", { className: "btn btn-warning", onClick: () => handleSpecialStatus('abandon'), style: { fontSize: '0.75rem', padding: '0.25rem 0.5rem' }, children: "\uD83D\uDEB4 Abandon" }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-warning", onClick: () => handleSpecialStatus('forfait'), style: { fontSize: '0.75rem', padding: '0.25rem 0.5rem' }, children: "\uD83D\uDCCB Forfait" }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-danger", onClick: () => handleSpecialStatus('exclusion'), style: { fontSize: '0.75rem', padding: '0.25rem 0.5rem' }, children: "\uD83D\uDEAB Exclusion" })] })] })] }) }));
            })()] }));
};
exports.default = TableauView;
//# sourceMappingURL=TableauView.js.map