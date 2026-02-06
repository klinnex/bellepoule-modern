"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Main App Component
 * Licensed under GPL-3.0
 */
const react_1 = require("react");
const CompetitionList_1 = __importDefault(require("./components/CompetitionList"));
const CompetitionView_1 = __importDefault(require("./components/CompetitionView"));
const NewCompetitionModal_1 = __importDefault(require("./components/NewCompetitionModal"));
const ReportIssueModal_1 = __importDefault(require("./components/ReportIssueModal"));
const UpdateNotification_1 = __importDefault(require("./components/UpdateNotification"));
const SettingsModal_1 = __importDefault(require("./components/SettingsModal"));
const Toast_1 = require("./components/Toast");
const useTranslation_1 = require("./hooks/useTranslation");
const App = () => {
    const { t, isLoading: translationLoading } = (0, useTranslation_1.useTranslation)();
    const [view, setView] = (0, react_1.useState)('home');
    const [competitions, setCompetitions] = (0, react_1.useState)([]);
    const [currentCompetition, setCurrentCompetition] = (0, react_1.useState)(null);
    const [openCompetitions, setOpenCompetitions] = (0, react_1.useState)([]);
    const [activeTabId, setActiveTabId] = (0, react_1.useState)(null);
    const [showNewCompetitionModal, setShowNewCompetitionModal] = (0, react_1.useState)(false);
    const [showReportIssueModal, setShowReportIssueModal] = (0, react_1.useState)(false);
    const [showSettingsModal, setShowSettingsModal] = (0, react_1.useState)(false);
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    // Load competitions on mount
    (0, react_1.useEffect)(() => {
        loadCompetitions();
        // Listen for menu events
        if (window.electronAPI) {
            window.electronAPI.onMenuNewCompetition(() => setShowNewCompetitionModal(true));
            window.electronAPI.onMenuReportIssue(() => setShowReportIssueModal(true));
            // Listen for file operations
            window.electronAPI.onFileOpened(async (filepath) => {
                console.log('Fichier .BPM ouvert:', filepath);
                // Recharger la liste des compétitions depuis la nouvelle base de données
                await loadCompetitions();
            });
            window.electronAPI.onFileSaved(async (filepath) => {
                console.log('Fichier sauvegardé:', filepath);
                // Optionnel: afficher une confirmation de sauvegarde
            });
        }
        return () => {
            if (window.electronAPI?.removeAllListeners) {
                window.electronAPI.removeAllListeners('menu:new-competition');
                window.electronAPI.removeAllListeners('menu:report-issue');
                window.electronAPI.removeAllListeners('file:opened');
                window.electronAPI.removeAllListeners('file:saved');
            }
        };
    }, []);
    const loadCompetitions = async () => {
        setIsLoading(true);
        try {
            if (window.electronAPI) {
                const comps = await window.electronAPI.db.getAllCompetitions();
                setCompetitions(comps);
            }
        }
        catch (error) {
            console.error('Failed to load competitions:', error);
        }
        setIsLoading(false);
    };
    const handleCreateCompetition = async (data) => {
        try {
            if (window.electronAPI) {
                // Assurer que le titre est défini
                const competitionData = {
                    title: data.title || 'Nouvelle compétition',
                    date: data.date || new Date(),
                    weapon: data.weapon || 'FOIL',
                    gender: data.gender || 'M',
                    category: data.category || 'SENIOR',
                    ...data
                };
                const newComp = await window.electronAPI.db.createCompetition(competitionData);
                setCompetitions([newComp, ...competitions]);
                // Ouvrir la compétition dans un nouvel onglet
                const fencers = await window.electronAPI.db.getFencersByCompetition(newComp.id);
                newComp.fencers = fencers;
                setOpenCompetitions(prev => [...prev, { competition: newComp, isDirty: false }]);
                setActiveTabId(newComp.id);
                setCurrentCompetition(newComp);
                setView('competition');
            }
        }
        catch (error) {
            console.error('Failed to create competition:', error);
        }
        setShowNewCompetitionModal(false);
    };
    const handleSelectCompetition = async (competition) => {
        try {
            if (window.electronAPI) {
                // Vérifier si la compétition est déjà ouverte
                const existingOpenComp = openCompetitions.find(open => open.competition.id === competition.id);
                if (existingOpenComp) {
                    // Activer l'onglet existant
                    setActiveTabId(competition.id);
                    setCurrentCompetition(existingOpenComp.competition);
                    setView('competition');
                }
                else {
                    // Ouvrir dans un nouvel onglet
                    const comp = await window.electronAPI.db.getCompetition(competition.id);
                    if (comp) {
                        const fencers = await window.electronAPI.db.getFencersByCompetition(competition.id);
                        comp.fencers = fencers;
                        setOpenCompetitions(prev => [...prev, { competition: comp, isDirty: false }]);
                        setActiveTabId(comp.id);
                        setCurrentCompetition(comp);
                        setView('competition');
                    }
                }
            }
        }
        catch (error) {
            console.error('Failed to load competition:', error);
        }
    };
    const handleTabSwitch = (competitionId) => {
        const openComp = openCompetitions.find(open => open.competition.id === competitionId);
        if (openComp) {
            setActiveTabId(competitionId);
            setCurrentCompetition(openComp.competition);
            setView('competition');
        }
    };
    const handleTabClose = async (competitionId, e) => {
        if (e) {
            e.stopPropagation();
        }
        const openComp = openCompetitions.find(open => open.competition.id === competitionId);
        if (openComp && openComp.isDirty) {
            if (!window.confirm('Des modifications ne sont pas sauvegardées. Voulez-vous vraiment fermer cette compétition ?')) {
                return;
            }
        }
        const newOpenCompetitions = openCompetitions.filter(open => open.competition.id !== competitionId);
        setOpenCompetitions(newOpenCompetitions);
        if (activeTabId === competitionId) {
            if (newOpenCompetitions.length > 0) {
                const nextComp = newOpenCompetitions[newOpenCompetitions.length - 1];
                setActiveTabId(nextComp.competition.id);
                setCurrentCompetition(nextComp.competition);
            }
            else {
                setActiveTabId(null);
                setCurrentCompetition(null);
                setView('home');
            }
        }
    };
    const handleDeleteCompetition = async (id) => {
        try {
            if (window.electronAPI) {
                await window.electronAPI.db.deleteCompetition(id);
                setCompetitions(competitions.filter(c => c.id !== id));
                if (currentCompetition?.id === id) {
                    setCurrentCompetition(null);
                    setView('home');
                }
            }
        }
        catch (error) {
            console.error('Failed to delete competition:', error);
        }
    };
    const handleBack = () => {
        setView('home');
    };
    const handleSettingsSave = (settings) => {
        // Currently settings handling would go here
        // For now, the language change is handled in the SettingsModal component
        console.log('Settings saved:', settings);
    };
    const handleUpdateCompetition = (updated) => {
        setCurrentCompetition(updated);
        setCompetitions(competitions.map(c => c.id === updated.id ? updated : c));
        // Marquer l'onglet comme modifié
        setOpenCompetitions(prev => prev.map(open => open.competition.id === updated.id
            ? { ...open, competition: updated, isDirty: true }
            : open));
    };
    return ((0, jsx_runtime_1.jsxs)(Toast_1.ToastProvider, { children: [(0, jsx_runtime_1.jsx)(UpdateNotification_1.default, {}), (0, jsx_runtime_1.jsxs)("div", { className: "app", children: [(0, jsx_runtime_1.jsxs)("header", { className: "header", children: [(0, jsx_runtime_1.jsxs)("div", { className: "header-title", children: [(0, jsx_runtime_1.jsxs)("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [(0, jsx_runtime_1.jsx)("path", { d: "M14.5 17.5L3 6V3h3l11.5 11.5" }), (0, jsx_runtime_1.jsx)("path", { d: "M13 19l6-6" }), (0, jsx_runtime_1.jsx)("path", { d: "M16 16l4 4" }), (0, jsx_runtime_1.jsx)("path", { d: "M19 21a2 2 0 100-4 2 2 0 000 4z" })] }), t('app.title')] }), (0, jsx_runtime_1.jsxs)("div", { className: "header-nav", children: [openCompetitions.length > 0 && view === 'competition' && ((0, jsx_runtime_1.jsx)("button", { className: "btn btn-secondary", onClick: () => {
                                            setView('home');
                                            setActiveTabId(null);
                                        }, title: "Revenir \u00E0 la liste des comp\u00E9titions", children: "\uD83C\uDFE0 G\u00E9n\u00E9ral" })), (0, jsx_runtime_1.jsxs)("button", { className: "btn btn-primary", onClick: () => setShowNewCompetitionModal(true), children: ["+ ", t('menu.new_competition')] }), (0, jsx_runtime_1.jsxs)("button", { className: "btn btn-secondary", onClick: () => setShowSettingsModal(true), title: t('settings.title'), children: ["\u2699\uFE0F ", t('settings.title')] })] })] }), openCompetitions.length > 0 && ((0, jsx_runtime_1.jsxs)("div", { className: "tabs-container", style: {
                            background: '#f8fafc',
                            borderBottom: '1px solid #e5e7eb',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 1rem',
                            gap: '0.25rem',
                            overflowX: 'auto'
                        }, children: [(0, jsx_runtime_1.jsx)("div", { className: `tab ${view === 'home' ? 'tab-active' : ''}`, onClick: () => {
                                    setView('home');
                                    setActiveTabId(null);
                                }, style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px 8px 0 0',
                                    cursor: 'pointer',
                                    background: view === 'home' ? 'white' : 'transparent',
                                    border: view === 'home' ? '1px solid #e5e7eb' : '1px solid transparent',
                                    borderBottom: view === 'home' ? '1px solid white' : 'none',
                                    marginBottom: view === 'home' ? '-1px' : '0',
                                    transition: 'all 0.15s ease',
                                    position: 'relative',
                                    minWidth: '120px'
                                }, onMouseEnter: (e) => {
                                    if (view !== 'home') {
                                        e.currentTarget.style.background = '#f1f5f9';
                                    }
                                }, onMouseLeave: (e) => {
                                    if (view !== 'home') {
                                        e.currentTarget.style.background = 'transparent';
                                    }
                                }, children: (0, jsx_runtime_1.jsx)("span", { style: {
                                        fontWeight: view === 'home' ? '600' : '400',
                                        color: view === 'home' ? '#1f2937' : '#6b7280',
                                        fontSize: '0.875rem',
                                        whiteSpace: 'nowrap',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem'
                                    }, children: "\uD83C\uDFE0 G\u00E9n\u00E9ral" }) }), openCompetitions.map((openComp) => ((0, jsx_runtime_1.jsxs)("div", { className: `tab ${activeTabId === openComp.competition.id ? 'tab-active' : ''}`, onClick: () => handleTabSwitch(openComp.competition.id), style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px 8px 0 0',
                                    cursor: 'pointer',
                                    background: activeTabId === openComp.competition.id ? 'white' : 'transparent',
                                    border: activeTabId === openComp.competition.id ? '1px solid #e5e7eb' : '1px solid transparent',
                                    borderBottom: activeTabId === openComp.competition.id ? '1px solid white' : 'none',
                                    marginBottom: activeTabId === openComp.competition.id ? '-1px' : '0',
                                    transition: 'all 0.15s ease',
                                    position: 'relative',
                                    minWidth: '150px'
                                }, onMouseEnter: (e) => {
                                    if (activeTabId !== openComp.competition.id) {
                                        e.currentTarget.style.background = '#f1f5f9';
                                    }
                                }, onMouseLeave: (e) => {
                                    if (activeTabId !== openComp.competition.id) {
                                        e.currentTarget.style.background = 'transparent';
                                    }
                                }, children: [(0, jsx_runtime_1.jsxs)("span", { style: {
                                            fontWeight: activeTabId === openComp.competition.id ? '600' : '400',
                                            color: activeTabId === openComp.competition.id ? '#1f2937' : '#6b7280',
                                            fontSize: '0.875rem',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            flex: 1
                                        }, children: [openComp.competition.title, openComp.isDirty && (0, jsx_runtime_1.jsx)("span", { style: { color: '#ef4444', marginLeft: '0.25rem' }, children: "\u25CF" })] }), (0, jsx_runtime_1.jsx)("button", { onClick: (e) => handleTabClose(openComp.competition.id, e), style: {
                                            background: 'none',
                                            border: 'none',
                                            color: '#6b7280',
                                            cursor: 'pointer',
                                            padding: '0.125rem',
                                            borderRadius: '3px',
                                            fontSize: '0.75rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }, onMouseEnter: (e) => {
                                            e.currentTarget.style.background = '#e5e7eb';
                                            e.currentTarget.style.color = '#374151';
                                        }, onMouseLeave: (e) => {
                                            e.currentTarget.style.background = 'none';
                                            e.currentTarget.style.color = '#6b7280';
                                        }, title: "Fermer l'onglet", children: "\u00D7" })] }, openComp.competition.id)))] })), (0, jsx_runtime_1.jsxs)("main", { className: "main", children: [view === 'home' && ((0, jsx_runtime_1.jsx)(CompetitionList_1.default, { competitions: competitions, isLoading: isLoading, onSelect: handleSelectCompetition, onDelete: handleDeleteCompetition, onNewCompetition: () => setShowNewCompetitionModal(true) })), view === 'competition' && currentCompetition && activeTabId && ((0, jsx_runtime_1.jsx)(CompetitionView_1.default, { competition: currentCompetition, onUpdate: handleUpdateCompetition }))] }), showNewCompetitionModal && ((0, jsx_runtime_1.jsx)(NewCompetitionModal_1.default, { onClose: () => setShowNewCompetitionModal(false), onCreate: handleCreateCompetition })), showReportIssueModal && ((0, jsx_runtime_1.jsx)(ReportIssueModal_1.default, { onClose: () => setShowReportIssueModal(false) })), showSettingsModal && ((0, jsx_runtime_1.jsx)(SettingsModal_1.default, { onClose: () => setShowSettingsModal(false), onSave: handleSettingsSave }))] })] }));
};
exports.default = App;
//# sourceMappingURL=App.js.map