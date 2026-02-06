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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Competition View Component
 * Licensed under GPL-3.0
 */
const react_1 = __importStar(require("react"));
const types_1 = require("../../shared/types");
const FencerList_1 = __importDefault(require("./FencerList"));
const PoolView_1 = __importDefault(require("./PoolView"));
const TableauView_1 = __importDefault(require("./TableauView"));
const PoolRankingView_1 = __importDefault(require("./PoolRankingView"));
const ResultsView_1 = __importDefault(require("./ResultsView"));
const AddFencerModal_1 = __importDefault(require("./AddFencerModal"));
const CompetitionPropertiesModal_1 = __importDefault(require("./CompetitionPropertiesModal"));
const ImportModal_1 = __importDefault(require("./ImportModal"));
const ChangePoolModal_1 = __importDefault(require("./ChangePoolModal"));
const RemoteScoreManager_1 = __importDefault(require("./RemoteScoreManager"));
const Toast_1 = require("./Toast");
const useTranslation_1 = require("../hooks/useTranslation");
const poolCalculations_1 = require("../../shared/utils/poolCalculations");
const pdfExport_1 = require("../../shared/utils/pdfExport");
const CompetitionView = ({ competition, onUpdate }) => {
    const { showToast } = (0, Toast_1.useToast)();
    const { t } = (0, useTranslation_1.useTranslation)();
    const [currentPhase, setCurrentPhase] = (0, react_1.useState)('checkin');
    const [currentPoolRound, setCurrentPoolRound] = (0, react_1.useState)(1);
    const [fencers, setFencers] = (0, react_1.useState)(competition.fencers || []);
    const [pools, setPools] = (0, react_1.useState)([]);
    const [poolHistory, setPoolHistory] = (0, react_1.useState)([]); // Historique des tours de poules
    const [overallRanking, setOverallRanking] = (0, react_1.useState)([]);
    const [tableauMatches, setTableauMatches] = (0, react_1.useState)([]);
    const [finalResults, setFinalResults] = (0, react_1.useState)([]);
    const [showAddFencerModal, setShowAddFencerModal] = (0, react_1.useState)(false);
    const [showPropertiesModal, setShowPropertiesModal] = (0, react_1.useState)(false);
    const [importData, setImportData] = (0, react_1.useState)(null);
    const [changePoolData, setChangePoolData] = (0, react_1.useState)(null);
    const [isLoaded, setIsLoaded] = (0, react_1.useState)(false);
    const [isRemoteActive, setIsRemoteActive] = (0, react_1.useState)(false);
    const [showThirdPlaceDialog, setShowThirdPlaceDialog] = (0, react_1.useState)(false);
    // Récupérer les settings avec valeurs par défaut
    const poolRounds = competition.settings?.poolRounds ?? 1;
    const hasDirectElimination = competition.settings?.hasDirectElimination ?? true;
    const thirdPlaceMatch = competition.settings?.thirdPlaceMatch ?? false;
    const poolMaxScore = competition.settings?.defaultPoolMaxScore ?? 21;
    const tableMaxScore = competition.settings?.defaultTableMaxScore ?? 15;
    const isLaserSabre = competition.weapon === types_1.Weapon.LASER;
    // Export all pools to PDF
    const handleExportAllPoolsPDF = async () => {
        try {
            await (0, pdfExport_1.exportMultiplePoolsToPDF)(pools, `Toutes les Poules - ${competition.title} - Tour ${currentPoolRound}`);
            showToast(`Export PDF de ${pools.length} poules généré avec succès`, 'success');
        }
        catch (error) {
            console.error('Erreur lors de l\'export PDF des poules:', error);
            showToast(`Erreur lors de la génération du PDF: ${error instanceof Error ? error.message : 'Erreur inconnue'}`, 'error');
        }
    };
    // Fonction helper pour calculer le classement selon le type de compétition
    const computePoolRanking = (pool) => {
        return isLaserSabre ? (0, poolCalculations_1.calculatePoolRankingQuest)(pool) : (0, poolCalculations_1.calculatePoolRanking)(pool);
    };
    const computeOverallRanking = (poolsList) => {
        return isLaserSabre ? (0, poolCalculations_1.calculateOverallRankingQuest)(poolsList) : (0, poolCalculations_1.calculateOverallRanking)(poolsList);
    };
    // Sauvegarder l'état de session
    const saveState = async () => {
        if (!window.electronAPI?.db?.saveSessionState)
            return;
        // Convertir Phase en number pour SessionState
        const phaseMap = { checkin: 0, pools: 1, ranking: 2, tableau: 3, results: 4, remote: 5 };
        const state = {
            currentPhase: phaseMap[currentPhase],
            pools,
            poolHistory,
            overallRanking,
            tableauMatches,
            finalResults,
            currentPoolRound,
            uiState: {
                currentPhase,
                currentPoolRound,
                pools: pools.length,
            }
        };
        try {
            await window.electronAPI.db.saveSessionState(competition.id, state);
        }
        catch (e) {
            console.error('Failed to save session state:', e);
        }
    };
    // Restaurer l'état de session
    const restoreState = async () => {
        if (!window.electronAPI?.db?.getSessionState) {
            setIsLoaded(true);
            return;
        }
        try {
            const state = await window.electronAPI.db.getSessionState(competition.id);
            if (state) {
                // Convertir number en Phase depuis SessionState
                const phaseMap = ['checkin', 'pools', 'ranking', 'tableau', 'results'];
                const currentPhase = phaseMap[state.currentPhase || 0];
                if (currentPhase)
                    setCurrentPhase(currentPhase);
                if (state.uiState?.currentPoolRound)
                    setCurrentPoolRound(state.uiState.currentPoolRound);
                setPools(state.pools || []);
                setPoolHistory(state.poolHistory || []);
                setOverallRanking(state.overallRanking || []);
                setTableauMatches(state.tableauMatches || []);
                setFinalResults(state.finalResults || []);
                console.log('Session state restored');
            }
        }
        catch (e) {
            console.error('Failed to restore session state:', e);
        }
        setIsLoaded(true);
    };
    // Sauvegarder à chaque changement important
    (0, react_1.useEffect)(() => {
        if (isLoaded) {
            saveState();
        }
    }, [currentPhase, currentPoolRound, pools, tableauMatches, finalResults, overallRanking]);
    // Restaurer au chargement
    (0, react_1.useEffect)(() => {
        restoreState();
    }, [competition.id]);
    (0, react_1.useEffect)(() => {
        loadFencers();
        // Listen for menu events
        if (window.electronAPI?.onMenuCompetitionProperties) {
            window.electronAPI.onMenuCompetitionProperties(() => {
                setShowPropertiesModal(true);
            });
        }
        if (window.electronAPI?.onMenuImport) {
            window.electronAPI.onMenuImport((format, filepath, content) => {
                setImportData({ format, filepath, content });
            });
        }
        if (window.electronAPI?.onMenuExport) {
            window.electronAPI.onMenuExport((format) => {
                handleExport(format);
            });
        }
        const handleExport = (format) => {
            switch (currentPhase) {
                case 'ranking':
                    // Export du classement après poules
                    exportRanking(format);
                    break;
                case 'results':
                    // Export des résultats finaux
                    exportResults(format);
                    break;
                default:
                    showToast(`Export ${format} disponible uniquement en phase de classement ou résultats`, 'warning');
            }
        };
        const exportRanking = (format) => {
            try {
                const ranking = computeOverallRanking(pools);
                let content = '';
                let filename = '';
                let mimeType = '';
                switch (format) {
                    case 'csv':
                        content = generateRankingCSV(ranking);
                        filename = `classement_${competition.title.replace(/[^a-z0-9]/gi, '_')}.csv`;
                        mimeType = 'text/csv';
                        break;
                    case 'json':
                        content = JSON.stringify({ competition: competition.title, date: competition.date, ranking }, null, 2);
                        filename = `classement_${competition.title.replace(/[^a-z0-9]/gi, '_')}.json`;
                        mimeType = 'application/json';
                        break;
                    default:
                        showToast(`Format ${format} non supporté`, 'error');
                        return;
                }
                downloadFile(content, filename, mimeType);
                showToast(`Export ${format.toUpperCase()} du classement réussi`, 'success');
            }
            catch (error) {
                console.error('Export failed:', error);
                showToast(`Export ${format.toUpperCase()} échoué`, 'error');
            }
        };
        const exportResults = (format) => {
            try {
                let content = '';
                let filename = '';
                let mimeType = '';
                switch (format) {
                    case 'csv':
                        content = generateResultsCSV(finalResults);
                        filename = `resultats_${competition.title.replace(/[^a-z0-9]/gi, '_')}.csv`;
                        mimeType = 'text/csv';
                        break;
                    case 'json':
                        content = JSON.stringify({ competition: competition.title, date: competition.date, results: finalResults }, null, 2);
                        filename = `resultats_${competition.title.replace(/[^a-z0-9]/gi, '_')}.json`;
                        mimeType = 'application/json';
                        break;
                    default:
                        showToast(`Format ${format} non supporté`, 'error');
                        return;
                }
                downloadFile(content, filename, mimeType);
                showToast(`Export ${format.toUpperCase()} des résultats réussi`, 'success');
            }
            catch (error) {
                console.error('Export failed:', error);
                showToast(`Export ${format.toUpperCase()} échoué`, 'error');
            }
        };
        const generateRankingCSV = (ranking) => {
            const headers = ['Rg', 'Nom', 'Prénom', 'Club', 'V', 'M', 'V/M', 'TD', 'TR', 'Indice'];
            if (isLaserSabre)
                headers.push('Quest');
            const rows = ranking.map(r => [
                r.rank,
                r.fencer.lastName,
                r.fencer.firstName,
                r.fencer.club || '',
                r.victories,
                r.victories + r.defeats,
                (r.ratio * 100).toFixed(1) + '%',
                r.touchesScored,
                r.touchesReceived,
                r.index,
                ...(isLaserSabre ? [r.questPoints || 0] : [])
            ]);
            return [headers, ...rows].map(row => row.join(';')).join('\n');
        };
        const generateResultsCSV = (results) => {
            const headers = ['Rg', 'Nom', 'Prénom', 'Club', 'Éliminé en'];
            if (isLaserSabre)
                headers.push('Quest');
            const rows = results.map(r => [
                r.rank,
                r.fencer.lastName,
                r.fencer.firstName,
                r.fencer.club || '',
                r.eliminatedAt || '',
                ...(isLaserSabre ? [r.questPoints || 0] : [])
            ]);
            return [headers, ...rows].map(row => row.join(';')).join('\n');
        };
        const downloadFile = (content, filename, mimeType) => {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        };
        return () => {
            if (window.electronAPI?.removeAllListeners) {
                window.electronAPI.removeAllListeners('menu:competition-properties');
                window.electronAPI.removeAllListeners('menu:import');
                window.electronAPI.removeAllListeners('menu:export');
            }
        };
    }, [competition.id]);
    const loadFencers = async () => {
        try {
            if (window.electronAPI) {
                const loadedFencers = await window.electronAPI.db.getFencersByCompetition(competition.id);
                setFencers(loadedFencers);
            }
        }
        catch (error) {
            console.error('Failed to load fencers:', error);
        }
    };
    const handleUpdateCompetition = async (updates) => {
        try {
            if (window.electronAPI) {
                await window.electronAPI.db.updateCompetition(competition.id, updates);
                onUpdate({ ...competition, ...updates });
            }
        }
        catch (error) {
            console.error('Failed to update competition:', error);
        }
    };
    const handleAddFencer = async (fencerData) => {
        try {
            if (window.electronAPI) {
                // Générer un ref si non fourni
                const fencerCreateData = {
                    ref: fencerData.ref || fencers.length + 1,
                    lastName: fencerData.lastName || '',
                    firstName: fencerData.firstName || '',
                    gender: fencerData.gender || 'M',
                    nationality: fencerData.nationality || 'FRA',
                    ...fencerData
                };
                const newFencer = await window.electronAPI.db.addFencer(competition.id, fencerCreateData);
                setFencers([...fencers, newFencer]);
                onUpdate({ ...competition, fencers: [...fencers, newFencer] });
            }
        }
        catch (error) {
            console.error('Failed to add fencer:', error);
        }
    };
    const handleImportFencers = async (importedFencers) => {
        try {
            if (window.electronAPI) {
                const newFencers = [];
                for (const fencerData of importedFencers) {
                    // Générer un ref si non fourni
                    const fencerCreateData = {
                        ref: fencerData.ref || fencers.length + newFencers.length + 1,
                        lastName: fencerData.lastName || '',
                        firstName: fencerData.firstName || '',
                        gender: fencerData.gender || 'M',
                        nationality: fencerData.nationality || 'FRA',
                        ...fencerData
                    };
                    const newFencer = await window.electronAPI.db.addFencer(competition.id, fencerCreateData);
                    newFencers.push(newFencer);
                }
                const allFencers = [...fencers, ...newFencers];
                setFencers(allFencers);
                onUpdate({ ...competition, fencers: allFencers });
            }
        }
        catch (error) {
            console.error('Failed to import fencers:', error);
        }
    };
    const handleUpdateFencer = async (id, updates) => {
        try {
            if (window.electronAPI) {
                await window.electronAPI.db.updateFencer(id, updates);
                const updatedFencers = fencers.map(f => f.id === id ? { ...f, ...updates } : f);
                setFencers(updatedFencers);
                onUpdate({ ...competition, fencers: updatedFencers });
            }
        }
        catch (error) {
            console.error('Failed to update fencer:', error);
        }
    };
    const handleCheckInFencer = (id) => {
        const fencer = fencers.find(f => f.id === id);
        if (fencer) {
            const newStatus = fencer.status === types_1.FencerStatus.CHECKED_IN
                ? types_1.FencerStatus.NOT_CHECKED_IN
                : types_1.FencerStatus.CHECKED_IN;
            handleUpdateFencer(id, { status: newStatus });
        }
    };
    const handleDeleteFencer = async (id) => {
        try {
            if (!window.electronAPI) {
                throw new Error('API electron non disponible');
            }
            // Supprimer d'abord en base de données
            await window.electronAPI.db.deleteFencer(id);
            // Mettre à jour l'état local
            const updatedFencers = fencers.filter(f => f.id !== id);
            setFencers(updatedFencers);
            // Mettre à jour les poules localement
            const updatedPools = pools.map(pool => ({
                ...pool,
                fencers: pool.fencers.filter(f => f.id !== id),
                matches: pool.matches.filter(match => match.fencerA?.id !== id && match.fencerB?.id !== id)
            }));
            // Recalculer les classements si nécessaire
            const updatedPoolsWithRanking = updatedPools.map(pool => {
                if (pool.fencers.length > 0 && pool.matches.some(m => m.status === types_1.MatchStatus.FINISHED)) {
                    const ranking = isLaserSabre
                        ? (0, poolCalculations_1.calculatePoolRankingQuest)(pool)
                        : (0, poolCalculations_1.calculatePoolRanking)(pool);
                    return { ...pool, ranking };
                }
                return { ...pool, ranking: [] };
            });
            setPools(updatedPoolsWithRanking);
            // Mettre à jour la compétition
            onUpdate({
                ...competition,
                fencers: updatedFencers
            });
            showToast('Tireur supprimé avec succès', 'success');
        }
        catch (error) {
            console.error('Failed to delete fencer:', error);
            const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
            showToast(`Erreur de suppression: ${errorMessage}`, 'error');
            // Recharger les données en cas d'erreur pour resynchroniser
            await loadFencers();
        }
    };
    const handleSetFencerStatus = async (id, status) => {
        try {
            if (window.electronAPI) {
                // Mettre à jour le statut du tireur
                await window.electronAPI.db.updateFencer(id, { status });
                // Mettre à jour le tireur dans l'état local
                const updatedFencers = fencers.map(f => f.id === id ? { ...f, status } : f);
                setFencers(updatedFencers);
                // Si abandon ou forfait, mettre à jour tous les matchs restants
                if (status === types_1.FencerStatus.ABANDONED || status === types_1.FencerStatus.FORFAIT) {
                    const updatedPools = pools.map(pool => {
                        // Mettre à jour le statut du tireur dans la poule
                        const updatedPoolFencers = pool.fencers.map(f => f.id === id ? { ...f, status } : f);
                        // Mettre à jour les matchs restants
                        const updatedMatches = pool.matches.map(match => {
                            if (match.status === types_1.MatchStatus.FINISHED)
                                return match;
                            const isFencerA = match.fencerA?.id === id;
                            const isFencerB = match.fencerB?.id === id;
                            if (!isFencerA && !isFencerB)
                                return match;
                            const winScore = match.maxScore || 5;
                            const opponent = isFencerA ? match.fencerB : match.fencerA;
                            if (opponent) {
                                // L'adversaire gagne par forfait
                                return {
                                    ...match,
                                    scoreA: isFencerA ?
                                        { value: 0, isVictory: false, isAbstention: false, isExclusion: false, isForfait: true } :
                                        { value: winScore, isVictory: true, isAbstention: false, isExclusion: false, isForfait: false },
                                    scoreB: isFencerA ?
                                        { value: winScore, isVictory: true, isAbstention: false, isExclusion: false, isForfait: false } :
                                        { value: 0, isVictory: false, isAbstention: false, isExclusion: false, isForfait: true },
                                    status: types_1.MatchStatus.FINISHED,
                                    updatedAt: new Date()
                                };
                            }
                            return match;
                        });
                        // Recalculer le classement si des matchs sont terminés
                        const ranking = updatedMatches.some(m => m.status === types_1.MatchStatus.FINISHED)
                            ? (isLaserSabre ? (0, poolCalculations_1.calculatePoolRankingQuest)({ ...pool, fencers: updatedPoolFencers, matches: updatedMatches })
                                : (0, poolCalculations_1.calculatePoolRanking)({ ...pool, fencers: updatedPoolFencers, matches: updatedMatches }))
                            : [];
                        return {
                            ...pool,
                            fencers: updatedPoolFencers,
                            matches: updatedMatches,
                            ranking,
                            isComplete: updatedMatches.every(m => m.status === types_1.MatchStatus.FINISHED)
                        };
                    });
                    setPools(updatedPools);
                    // Sauvegarder les poules mises à jour en base de données
                    for (const pool of updatedPools) {
                        await window.electronAPI.db.updatePool(pool);
                    }
                }
                else if (status === types_1.FencerStatus.CHECKED_IN) {
                    // Réactivation : remettre à jour les matchs pour l'instant
                    const updatedPools = pools.map(pool => {
                        const updatedPoolFencers = pool.fencers.map(f => f.id === id ? { ...f, status } : f);
                        return { ...pool, fencers: updatedPoolFencers };
                    });
                    setPools(updatedPools);
                }
                // Mettre à jour la compétition
                onUpdate({ ...competition, fencers: updatedFencers });
            }
        }
        catch (error) {
            console.error('Failed to update fencer status:', error);
            const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
            showToast(`Erreur de mise à jour du statut: ${errorMessage}`, 'error');
        }
    };
    const handleCheckInAll = () => {
        const notCheckedInFencers = fencers.filter(f => f.status === types_1.FencerStatus.NOT_CHECKED_IN);
        const updatedFencers = fencers.map(fencer => fencer.status === types_1.FencerStatus.NOT_CHECKED_IN
            ? { ...fencer, status: types_1.FencerStatus.CHECKED_IN }
            : fencer);
        setFencers(updatedFencers);
        onUpdate({ ...competition, fencers: updatedFencers });
        // Update database
        const updatePromises = notCheckedInFencers.map(async (fencer) => {
            try {
                if (window.electronAPI) {
                    await window.electronAPI.db.updateFencer(fencer.id, { status: types_1.FencerStatus.CHECKED_IN });
                }
            }
            catch (error) {
                console.error(`Failed to check in fencer ${fencer.id}:`, error);
            }
        });
        Promise.allSettled(updatePromises);
    };
    const handleUncheckAll = () => {
        const checkedInFencers = fencers.filter(f => f.status === types_1.FencerStatus.CHECKED_IN);
        const updatedFencers = fencers.map(fencer => fencer.status === types_1.FencerStatus.CHECKED_IN
            ? { ...fencer, status: types_1.FencerStatus.NOT_CHECKED_IN }
            : fencer);
        setFencers(updatedFencers);
        onUpdate({ ...competition, fencers: updatedFencers });
        // Update database
        const updatePromises = checkedInFencers.map(async (fencer) => {
            try {
                if (window.electronAPI) {
                    await window.electronAPI.db.updateFencer(fencer.id, { status: types_1.FencerStatus.NOT_CHECKED_IN });
                }
            }
            catch (error) {
                console.error(`Failed to uncheck fencer ${fencer.id}:`, error);
            }
        });
        Promise.allSettled(updatePromises);
    };
    const getCheckedInFencers = () => fencers.filter(f => f.status === types_1.FencerStatus.CHECKED_IN);
    const handleGeneratePools = () => {
        const checkedIn = getCheckedInFencers();
        if (checkedIn.length < 4) {
            showToast('Il faut au moins 4 tireurs pointés pour créer les poules.', 'warning');
            return;
        }
        const poolCount = (0, poolCalculations_1.calculateOptimalPoolCount)(checkedIn.length, 5, 7);
        const distribution = (0, poolCalculations_1.distributeFencersToPoolsSerpentine)(checkedIn, poolCount, { byClub: true, byLeague: true, byNation: false });
        const generatedPools = distribution.map((poolFencers, index) => {
            const matchOrder = (0, poolCalculations_1.generatePoolMatchOrder)(poolFencers.length);
            const matches = matchOrder.map(([a, b], matchIndex) => ({
                id: `match-${index}-${matchIndex}`,
                number: matchIndex + 1,
                fencerA: poolFencers[a - 1],
                fencerB: poolFencers[b - 1],
                scoreA: null,
                scoreB: null,
                maxScore: poolMaxScore,
                status: types_1.MatchStatus.NOT_STARTED,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
            return {
                id: `pool-${index}`,
                number: index + 1,
                phaseId: 'phase-pools',
                fencers: poolFencers,
                matches,
                referees: [],
                isComplete: false,
                hasError: false,
                ranking: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        });
        setPools(generatedPools);
        setCurrentPhase('pools');
    };
    const handleScoreUpdate = async (poolIndex, matchIndex, scoreA, scoreB, winnerOverride, specialStatus) => {
        const updatedPools = [...pools];
        const pool = updatedPools[poolIndex];
        const match = pool.matches[matchIndex];
        // Déterminer le vainqueur : soit par score, soit par override (sabre laser), soit par statut spécial
        let isVictoryA;
        if (winnerOverride) {
            isVictoryA = winnerOverride === 'A';
        }
        else if (specialStatus) {
            isVictoryA = winnerOverride === 'A';
        }
        else {
            isVictoryA = scoreA > scoreB;
        }
        // Gérer les statuts spéciaux
        const isAbstention = specialStatus === 'abandon';
        const isExclusion = specialStatus === 'exclusion';
        const isForfait = specialStatus === 'forfait';
        match.scoreA = {
            value: scoreA,
            isVictory: isVictoryA,
            isAbstention: isAbstention && !isVictoryA,
            isExclusion: isExclusion && !isVictoryA,
            isForfait: isForfait && !isVictoryA
        };
        match.scoreB = {
            value: scoreB,
            isVictory: !isVictoryA,
            isAbstention: isAbstention && isVictoryA,
            isExclusion: isExclusion && isVictoryA,
            isForfait: isForfait && isVictoryA
        };
        match.status = types_1.MatchStatus.FINISHED;
        // Mettre à jour le statut du tireur qui a abandonné/forfait/exclu
        if (specialStatus) {
            const losingFencer = isVictoryA ? match.fencerB : match.fencerA;
            if (losingFencer) {
                const newStatus = specialStatus === 'abandon' ? types_1.FencerStatus.ABANDONED :
                    specialStatus === 'forfait' ? types_1.FencerStatus.FORFAIT :
                        types_1.FencerStatus.EXCLUDED;
                // Mettre à jour le statut du tireur dans toutes les poules
                updatedPools.forEach(p => {
                    const fencerInPool = p.fencers.find(f => f.id === losingFencer?.id);
                    if (fencerInPool) {
                        fencerInPool.status = newStatus;
                    }
                    // Marquer tous les matchs restants de ce tireur comme terminés avec forfait
                    p.matches.forEach(m => {
                        if (m.status !== types_1.MatchStatus.FINISHED &&
                            (m.fencerA?.id === losingFencer.id || m.fencerB?.id === losingFencer.id)) {
                            const isFencerA = m.fencerA?.id === losingFencer.id;
                            const opponent = isFencerA ? m.fencerB : m.fencerA;
                            if (opponent) {
                                // L'adversaire gagne par forfait (score maximum de la poule)
                                const winScore = m.maxScore || 5;
                                m.scoreA = isFencerA ?
                                    { value: 0, isVictory: false, isAbstention: false, isExclusion: false, isForfait: true } :
                                    { value: winScore, isVictory: true, isAbstention: false, isExclusion: false, isForfait: false };
                                m.scoreB = isFencerA ?
                                    { value: winScore, isVictory: true, isAbstention: false, isExclusion: false, isForfait: false } :
                                    { value: 0, isVictory: false, isAbstention: false, isExclusion: false, isForfait: true };
                                m.status = types_1.MatchStatus.FINISHED;
                            }
                        }
                    });
                });
                // Mettre à jour dans la base de données
                try {
                    if (window.electronAPI) {
                        await window.electronAPI.db.updateFencer(losingFencer.id, { status: newStatus });
                    }
                }
                catch (error) {
                    console.error('Failed to update fencer status:', error);
                }
            }
        }
        pool.isComplete = pool.matches.every(m => m.status === types_1.MatchStatus.FINISHED);
        // Recalculer le classement après chaque match (pour mise à jour Quest en temps réel)
        pool.ranking = computePoolRanking(pool);
        setPools(updatedPools);
        // Save to database
        try {
            if (window.electronAPI) {
                await window.electronAPI.db.updatePool(pool);
            }
        }
        catch (error) {
            console.error('Failed to save pool score:', error);
        }
    };
    const handleMoveFencer = (fencerId, fromPoolIndex, toPoolIndex) => {
        const updatedPools = [...pools];
        const fromPool = updatedPools[fromPoolIndex];
        const toPool = updatedPools[toPoolIndex];
        // Trouver le tireur à déplacer
        const fencerIndex = fromPool.fencers.findIndex(f => f.id === fencerId);
        if (fencerIndex === -1)
            return;
        const fencer = fromPool.fencers[fencerIndex];
        // Retirer le tireur de la poule source
        fromPool.fencers.splice(fencerIndex, 1);
        // Ajouter le tireur à la poule destination
        toPool.fencers.push(fencer);
        // Régénérer les matches pour les deux poules
        const regeneratePoolMatches = (pool) => {
            const matchOrder = (0, poolCalculations_1.generatePoolMatchOrder)(pool.fencers.length);
            const now = new Date();
            const newMatches = matchOrder.map(([a, b], matchIndex) => ({
                id: `${pool.id}-match-${matchIndex}`,
                number: matchIndex + 1,
                fencerA: pool.fencers[a - 1],
                fencerB: pool.fencers[b - 1],
                scoreA: null,
                scoreB: null,
                maxScore: poolMaxScore,
                status: types_1.MatchStatus.NOT_STARTED,
                poolId: pool.id,
                createdAt: now,
                updatedAt: now,
            }));
            return {
                ...pool,
                matches: newMatches,
                isComplete: false,
                ranking: [],
            };
        };
        updatedPools[fromPoolIndex] = regeneratePoolMatches(fromPool);
        updatedPools[toPoolIndex] = regeneratePoolMatches(toPool);
        setPools(updatedPools);
    };
    const handleGoToRanking = () => {
        // Calculer le classement général à partir de toutes les poules
        const ranking = computeOverallRanking(pools);
        setOverallRanking(ranking);
        setCurrentPhase('ranking');
    };
    const handleGoToTableau = () => {
        // Calculer le classement général à partir de toutes les poules
        const ranking = computeOverallRanking(pools);
        setOverallRanking(ranking);
        // Afficher le dialogue personnalisé pour le match de 3ème place
        setShowThirdPlaceDialog(true);
    };
    const handleThirdPlaceDecision = (shouldHaveThirdPlace) => {
        // Mettre à jour le paramètre thirdPlaceMatch dans la compétition
        const updatedCompetition = {
            ...competition,
            settings: {
                ...competition.settings,
                thirdPlaceMatch: shouldHaveThirdPlace
            }
        };
        // Sauvegarder le changement en base de données
        if (window.electronAPI) {
            window.electronAPI.db.updateCompetition(competition.id, updatedCompetition);
        }
        // L'état local sera mis à jour via onUpdate
        // Mettre à jour dans les compétitions ouvertes
        onUpdate(updatedCompetition);
        // Réinitialiser le tableau pour qu'il soit régénéré avec le nouveau classement
        setTableauMatches([]);
        setCurrentPhase('tableau');
        setShowThirdPlaceDialog(false);
    };
    const handleNextPoolRound = () => {
        // Sauvegarder les poules actuelles dans l'historique
        setPoolHistory(prev => [...prev, pools]);
        // Calculer le classement actuel pour redistribuer
        const ranking = computeOverallRanking(pools);
        const rankedFencers = ranking.map(r => r.fencer);
        // Générer les nouvelles poules basées sur le classement
        const poolCount = (0, poolCalculations_1.calculateOptimalPoolCount)(rankedFencers.length, 5, 7);
        const distribution = (0, poolCalculations_1.distributeFencersToPoolsSerpentine)(rankedFencers, poolCount, { byClub: true, byLeague: true, byNation: false });
        const now = new Date();
        const generatedPools = distribution.map((poolFencers, index) => {
            const matchOrder = (0, poolCalculations_1.generatePoolMatchOrder)(poolFencers.length);
            const matches = matchOrder.map(([a, b], matchIndex) => ({
                id: `match-r${currentPoolRound + 1}-${index}-${matchIndex}`,
                number: matchIndex + 1,
                fencerA: poolFencers[a - 1],
                fencerB: poolFencers[b - 1],
                scoreA: null,
                scoreB: null,
                maxScore: poolMaxScore,
                status: types_1.MatchStatus.NOT_STARTED,
                poolId: `pool-r${currentPoolRound + 1}-${index}`,
                createdAt: now,
                updatedAt: now,
            }));
            return {
                id: `pool-r${currentPoolRound + 1}-${index}`,
                number: index + 1,
                fencers: poolFencers,
                matches,
                referees: [],
                isComplete: false,
                hasError: false,
                ranking: [],
                phaseId: `phase-pools-r${currentPoolRound + 1}`,
                createdAt: now,
                updatedAt: now,
            };
        });
        setPools(generatedPools);
        setCurrentPoolRound(prev => prev + 1);
    };
    const handleGoToResults = () => {
        // Calculer le classement final basé sur les poules
        const ranking = computeOverallRanking(pools);
        setOverallRanking(ranking);
        // Convertir en résultats finaux (sans élimination directe)
        const results = ranking.map((r, index) => ({
            rank: index + 1,
            fencer: r.fencer,
            eliminatedAt: 'Poules',
        }));
        setFinalResults(results);
        setCurrentPhase('results');
    };
    // Phases dynamiques selon les settings
    const phases = [
        { id: 'checkin', label: 'Appel', icon: '📋' },
        { id: 'pools', label: poolRounds > 1 ? `Poules (${currentPoolRound}/${poolRounds})` : 'Poules', icon: '🎯' },
        { id: 'ranking', label: 'Classement', icon: '📊' },
        ...(hasDirectElimination ? [{ id: 'tableau', label: 'Tableau', icon: '🏆' }] : []),
        { id: 'results', label: 'Résultats', icon: '🏁' },
        { id: 'remote', label: '📡 Saisie distante', icon: '📡' },
    ];
    // Déterminer si on peut passer à la phase suivante
    const canAdvanceFromPools = pools.length > 0 && pools.every(p => p.isComplete);
    const isLastPoolRound = currentPoolRound >= poolRounds;
    // Déterminer l'action du bouton après les poules
    const getPoolsNextAction = () => {
        if (!canAdvanceFromPools)
            return null;
        if (!isLastPoolRound) {
            return {
                label: `Tour ${currentPoolRound + 1} de poules →`,
                action: handleNextPoolRound,
            };
        }
        return {
            label: 'Voir le classement →',
            action: handleGoToRanking,
        };
    };
    // Déterminer l'action du bouton retour
    const getPreviousPhase = () => {
        const phaseOrder = ['checkin', 'pools', 'ranking', 'tableau', 'results'];
        const currentIndex = phaseOrder.indexOf(currentPhase);
        if (currentIndex > 0) {
            return phaseOrder[currentIndex - 1];
        }
        return null;
    };
    const handleGoBack = () => {
        const previousPhase = getPreviousPhase();
        if (previousPhase) {
            setCurrentPhase(previousPhase);
        }
    };
    const poolsNextAction = getPoolsNextAction();
    return ((0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { padding: '1rem', background: competition.color, color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h1", { style: { fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.25rem' }, children: competition.title }), (0, jsx_runtime_1.jsxs)("p", { style: { opacity: 0.9, fontSize: '0.875rem' }, children: [new Date(competition.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), competition.location && ` • ${competition.location}`] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '0.5rem', alignItems: 'center' }, children: [(0, jsx_runtime_1.jsxs)("span", { className: "badge", style: { background: 'rgba(255,255,255,0.2)' }, children: [fencers.length, " tireurs"] }), (0, jsx_runtime_1.jsxs)("span", { className: "badge", style: { background: 'rgba(255,255,255,0.2)' }, children: [getCheckedInFencers().length, " point\u00E9s"] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setCurrentPhase('remote'), style: {
                                    background: 'rgba(255,255,255,0.2)',
                                    border: 'none',
                                    color: 'white',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                }, children: "\uD83D\uDCE1 Saisie distante" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setShowPropertiesModal(true), style: {
                                    background: 'rgba(255,255,255,0.2)',
                                    border: 'none',
                                    color: 'white',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                }, children: "\u2699\uFE0F Propri\u00E9t\u00E9s" })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "phase-nav", children: [phases.map((phase, index) => ((0, jsx_runtime_1.jsxs)(react_1.default.Fragment, { children: [(0, jsx_runtime_1.jsxs)("div", { className: `phase-step ${currentPhase === phase.id ? 'phase-step-active' : ''}`, onClick: () => setCurrentPhase(phase.id), children: [(0, jsx_runtime_1.jsx)("span", { className: "phase-step-number", children: phase.icon }), (0, jsx_runtime_1.jsx)("span", { children: phase.label })] }), index < phases.length - 1 && (0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', alignItems: 'center', color: '#9CA3AF' }, children: "\u2192" })] }, phase.id))), (0, jsx_runtime_1.jsxs)("div", { style: { marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }, children: [getPreviousPhase() && ((0, jsx_runtime_1.jsx)("button", { className: "btn btn-secondary", onClick: handleGoBack, style: {
                                    background: '#6b7280',
                                    color: 'white',
                                    border: 'none',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem'
                                }, children: "\u2190 Retour \u00E0 l'\u00E9tape pr\u00E9c\u00E9dente" })), currentPhase === 'checkin' && ((0, jsx_runtime_1.jsx)("button", { className: "btn btn-primary", onClick: handleGeneratePools, disabled: getCheckedInFencers().length < 4, children: "G\u00E9n\u00E9rer les poules \u2192" })), currentPhase === 'pools' && poolsNextAction && ((0, jsx_runtime_1.jsx)("button", { className: "btn btn-primary", onClick: poolsNextAction.action, children: poolsNextAction.label }))] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { flex: 1, overflow: 'auto' }, children: [currentPhase === 'checkin' && ((0, jsx_runtime_1.jsx)(FencerList_1.default, { fencers: fencers, onCheckIn: handleCheckInFencer, onAddFencer: () => setShowAddFencerModal(true), onEditFencer: handleUpdateFencer, onDeleteFencer: handleDeleteFencer, onCheckInAll: handleCheckInAll, onUncheckAll: handleUncheckAll, onSetFencerStatus: handleSetFencerStatus })), currentPhase === 'pools' && ((0, jsx_runtime_1.jsx)("div", { className: "content", children: pools.length === 0 ? ((0, jsx_runtime_1.jsxs)("div", { className: "empty-state", children: [(0, jsx_runtime_1.jsx)("div", { className: "empty-state-icon", children: "\uD83C\uDFAF" }), (0, jsx_runtime_1.jsx)("h2", { className: "empty-state-title", children: "Pas de poules" }), (0, jsx_runtime_1.jsx)("p", { className: "empty-state-description", children: "Retournez \u00E0 l'appel pour g\u00E9n\u00E9rer les poules" }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-primary", onClick: () => setCurrentPhase('checkin'), children: "Retour \u00E0 l'appel" })] })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [pools.length > 1 && ((0, jsx_runtime_1.jsx)("div", { style: { textAlign: 'center', marginBottom: '2rem' }, children: (0, jsx_runtime_1.jsx)("button", { className: "btn btn-success", onClick: handleExportAllPoolsPDF, style: {
                                            fontSize: '0.875rem',
                                            padding: '0.75rem 1.5rem',
                                            background: '#10b981',
                                            border: 'none',
                                            borderRadius: '6px',
                                            color: 'white',
                                            cursor: 'pointer',
                                            fontWeight: '600',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                        }, children: "\uD83D\uDCC4 Exporter toutes les poules en PDF" }) })), (0, jsx_runtime_1.jsx)("div", { style: { display: 'grid', gap: '2rem', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }, children: pools.map((pool, poolIndex) => ((0, jsx_runtime_1.jsx)(PoolView_1.default, { pool: pool, weapon: competition.weapon, maxScore: poolMaxScore, onScoreUpdate: (matchIndex, scoreA, scoreB, winnerOverride) => handleScoreUpdate(poolIndex, matchIndex, scoreA, scoreB, winnerOverride), onFencerChangePool: pools.length > 1 ? (fencer) => setChangePoolData({ fencer, poolIndex }) : undefined }, pool.id))) })] })) })), currentPhase === 'ranking' && ((0, jsx_runtime_1.jsx)(PoolRankingView_1.default, { pools: pools, weapon: competition.weapon, hasDirectElimination: hasDirectElimination, onGoToTableau: handleGoToTableau, onGoToResults: handleGoToResults, onExport: (format) => {
                            // Implémentation de l'export
                            showToast(`Export ${format.toUpperCase()} à implémenter`, 'info');
                        } })), currentPhase === 'tableau' && ((0, jsx_runtime_1.jsx)(TableauView_1.default, { ranking: overallRanking, matches: tableauMatches, onMatchesChange: setTableauMatches, maxScore: tableMaxScore === 0 ? 999 : tableMaxScore, thirdPlaceMatch: thirdPlaceMatch, onComplete: (results) => {
                            setFinalResults(results);
                            setCurrentPhase('results');
                        } })), currentPhase === 'results' && ((0, jsx_runtime_1.jsx)(ResultsView_1.default, { competition: competition, poolRanking: overallRanking, finalResults: finalResults })), currentPhase === 'remote' && ((0, jsx_runtime_1.jsx)(RemoteScoreManager_1.default, { competition: competition, onStartRemote: () => setIsRemoteActive(true), onStopRemote: () => setIsRemoteActive(false), isRemoteActive: isRemoteActive }))] }), showAddFencerModal && (0, jsx_runtime_1.jsx)(AddFencerModal_1.default, { onClose: () => setShowAddFencerModal(false), onAdd: handleAddFencer }), showPropertiesModal && ((0, jsx_runtime_1.jsx)(CompetitionPropertiesModal_1.default, { competition: competition, onSave: handleUpdateCompetition, onClose: () => setShowPropertiesModal(false) })), importData && ((0, jsx_runtime_1.jsx)(ImportModal_1.default, { format: importData.format, filepath: importData.filepath, content: importData.content, onImport: handleImportFencers, onClose: () => setImportData(null) })), changePoolData && ((0, jsx_runtime_1.jsx)(ChangePoolModal_1.default, { fencer: changePoolData.fencer, currentPool: pools[changePoolData.poolIndex], allPools: pools, onMove: handleMoveFencer, onClose: () => setChangePoolData(null) })), showThirdPlaceDialog && ((0, jsx_runtime_1.jsx)("div", { style: {
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }, children: (0, jsx_runtime_1.jsxs)("div", { style: {
                        backgroundColor: 'white',
                        padding: '2rem',
                        borderRadius: '8px',
                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.25)',
                        maxWidth: '500px',
                        width: '90%'
                    }, children: [(0, jsx_runtime_1.jsx)("h3", { style: { margin: '0 0 1rem 0', color: '#1f2937' }, children: t('competition.third_place_match_dialog') }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }, children: [(0, jsx_runtime_1.jsx)("button", { className: "btn btn-secondary", onClick: () => handleThirdPlaceDecision(false), style: { minWidth: '80px' }, children: "Non" }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-primary", onClick: () => handleThirdPlaceDecision(true), style: { minWidth: '80px' }, children: "Oui" })] })] }) }))] }));
};
exports.default = CompetitionView;
//# sourceMappingURL=CompetitionView.js.map