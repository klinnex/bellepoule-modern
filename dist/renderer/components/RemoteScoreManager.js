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
 * BellePoule Modern - Remote Score Management Component
 * Interface for managing remote score entry
 * Licensed under GPL-3.0
 */
const react_1 = __importStar(require("react"));
const Toast_1 = require("./Toast");
const RemoteScoreManager = ({ competition, onStartRemote, onStopRemote, isRemoteActive = false }) => {
    const { showToast } = (0, Toast_1.useToast)();
    const [session, setSession] = (0, react_1.useState)(null);
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const [refereeName, setRefereeName] = (0, react_1.useState)('');
    const [stripCount, setStripCount] = (0, react_1.useState)(4);
    (0, react_1.useEffect)(() => {
        if (isRemoteActive) {
            checkSessionStatus();
            const interval = setInterval(checkSessionStatus, 5000);
            return () => clearInterval(interval);
        }
    }, [isRemoteActive]);
    const checkSessionStatus = async () => {
        try {
            const response = await fetch('http://localhost:3001/api/session');
            if (response.ok) {
                const sessionData = await response.json();
                setSession(sessionData);
            }
        }
        catch (error) {
            console.error('Failed to check session status:', error);
        }
    };
    const handleStartSession = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('http://localhost:3001/api/session/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    competitionId: competition.id,
                    strips: stripCount
                })
            });
            if (response.ok) {
                const sessionData = await response.json();
                setSession(sessionData);
                showToast('Session de saisie distante démarrée', 'success');
            }
            else {
                const error = await response.json();
                showToast(`Erreur: ${error.error}`, 'error');
            }
        }
        catch (error) {
            showToast('Impossible de démarrer la session distante', 'error');
        }
        finally {
            setIsLoading(false);
        }
    };
    const handleStopSession = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('http://localhost:3001/api/session/stop', {
                method: 'POST'
            });
            if (response.ok) {
                setSession(null);
                showToast('Session de saisie distante arrêtée', 'success');
            }
        }
        catch (error) {
            showToast('Impossible d\'arrêter la session distante', 'error');
        }
        finally {
            setIsLoading(false);
        }
    };
    const handleAddReferee = async () => {
        if (!refereeName.trim()) {
            showToast('Veuillez entrer un nom d\'arbitre', 'error');
            return;
        }
        try {
            const response = await fetch('http://localhost:3001/api/referees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: refereeName })
            });
            if (response.ok) {
                const referee = await response.json();
                showToast(`Arbitre ${referee.name} ajouté avec le code ${referee.code}`, 'success');
                setRefereeName('');
                checkSessionStatus();
            }
        }
        catch (error) {
            showToast('Impossible d\'ajouter l\'arbitre', 'error');
        }
    };
    const generateMatchesForRemote = () => {
        const matches = [];
        // Générer les matchs de poules
        // Note: À adapter selon la structure réelle de la compétition
        // competition.pools?.forEach(pool => {
        //   pool.matches.forEach(match => {
        //     if (match.status !== MatchStatus.FINISHED) {
        //       matches.push(match);
        //     }
        //   });
        // });
        // Générer les matchs de tableau
        // competition.tableau?.matches.forEach(match => {
        //   if (match.status !== MatchStatus.FINISHED) {
        //     matches.push(match);
        //   }
        // });
        return matches;
    };
    const assignMatchesToStrips = () => {
        if (!session)
            return;
        const matches = generateMatchesForRemote();
        const availableStrips = session.strips.filter(strip => strip.status === 'available');
        // Logique simple d'assignation des matchs aux pistes
        matches.slice(0, availableStrips.length).forEach((match, index) => {
            if (index < availableStrips.length) {
                // Assigner le match à la piste
                console.log(`Assigning match ${match.id} to strip ${availableStrips[index].number}`);
            }
        });
    };
    if (!isRemoteActive) {
        return ((0, jsx_runtime_1.jsx)("div", { className: "remote-score-manager", children: (0, jsx_runtime_1.jsxs)("div", { className: "remote-status inactive", children: [(0, jsx_runtime_1.jsx)("h3", { children: "\uD83D\uDD34 Saisie distante inactive" }), (0, jsx_runtime_1.jsx)("p", { children: "La saisie distante permet aux arbitres de saisir les scores depuis une tablette. Les arbitres se connectent via un navigateur web sur http://localhost:3001" }), (0, jsx_runtime_1.jsx)("button", { className: "btn-primary", onClick: onStartRemote, children: "\u26A1 D\u00E9marrer la saisie distante" })] }) }));
    }
    return ((0, jsx_runtime_1.jsxs)("div", { className: "remote-score-manager", children: [(0, jsx_runtime_1.jsxs)("div", { className: "remote-header", children: [(0, jsx_runtime_1.jsxs)("div", { className: "remote-status active", children: [(0, jsx_runtime_1.jsx)("h3", { children: "\uD83D\uDFE2 Saisie distante active" }), (0, jsx_runtime_1.jsxs)("p", { children: ["Les arbitres peuvent se connecter sur: ", (0, jsx_runtime_1.jsx)("strong", { children: "http://localhost:3001" })] })] }), (0, jsx_runtime_1.jsx)("button", { className: "btn-secondary", onClick: onStopRemote, children: "\uD83D\uDED1 Arr\u00EAter" })] }), !session ? ((0, jsx_runtime_1.jsxs)("div", { className: "session-setup", children: [(0, jsx_runtime_1.jsx)("h4", { children: "Configuration de la session" }), (0, jsx_runtime_1.jsxs)("div", { className: "setup-form", children: [(0, jsx_runtime_1.jsxs)("div", { className: "form-group", children: [(0, jsx_runtime_1.jsx)("label", { children: "Nombre de pistes:" }), (0, jsx_runtime_1.jsx)("input", { type: "number", min: "1", max: "20", value: stripCount, onChange: (e) => setStripCount(parseInt(e.target.value) || 1) })] }), (0, jsx_runtime_1.jsx)("button", { className: "btn-primary", onClick: handleStartSession, disabled: isLoading, children: isLoading ? 'Démarrage...' : 'Démarrer la session' })] })] })) : ((0, jsx_runtime_1.jsxs)("div", { className: "session-active", children: [(0, jsx_runtime_1.jsxs)("div", { className: "session-info", children: [(0, jsx_runtime_1.jsx)("h4", { children: "Session active" }), (0, jsx_runtime_1.jsxs)("p", { children: ["D\u00E9marr\u00E9e: ", session.startTime ? new Date(session.startTime).toLocaleString() : 'Inconnue'] }), (0, jsx_runtime_1.jsxs)("p", { children: ["Pistes: ", session.strips.length] }), (0, jsx_runtime_1.jsxs)("p", { children: ["Arbitres: ", session.referees.length] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "referee-management", children: [(0, jsx_runtime_1.jsx)("h5", { children: "Ajouter un arbitre" }), (0, jsx_runtime_1.jsxs)("div", { className: "add-referee", children: [(0, jsx_runtime_1.jsx)("input", { type: "text", placeholder: "Nom de l'arbitre", value: refereeName, onChange: (e) => setRefereeName(e.target.value), onKeyPress: (e) => e.key === 'Enter' && handleAddReferee() }), (0, jsx_runtime_1.jsx)("button", { className: "btn-primary", onClick: handleAddReferee, children: "Ajouter" })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "referees-list", children: [(0, jsx_runtime_1.jsxs)("h5", { children: ["Arbitres (", session.referees.length, ")"] }), session.referees.length === 0 ? ((0, jsx_runtime_1.jsx)("p", { className: "no-referees", children: "Aucun arbitre ajout\u00E9" })) : ((0, jsx_runtime_1.jsx)("div", { className: "referee-grid", children: session.referees.map(referee => ((0, jsx_runtime_1.jsxs)("div", { className: `referee-card ${referee.isActive ? 'active' : 'inactive'}`, children: [(0, jsx_runtime_1.jsx)("h6", { children: referee.name }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Code:" }), " ", referee.code] }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Statut:" }), " ", referee.isActive ? '🟢 Connecté' : '🔴 Déconnecté'] }), referee.currentMatch && ((0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Match actuel:" }), " ", referee.currentMatch] })), (0, jsx_runtime_1.jsx)("p", { children: (0, jsx_runtime_1.jsxs)("small", { children: ["Derni\u00E8re activit\u00E9: ", new Date(referee.lastActivity).toLocaleTimeString()] }) })] }, referee.id))) }))] }), (0, jsx_runtime_1.jsxs)("div", { className: "strips-status", children: [(0, jsx_runtime_1.jsx)("h5", { children: "\u00C9tat des pistes" }), (0, jsx_runtime_1.jsx)("div", { className: "strip-grid", children: session.strips.map(strip => ((0, jsx_runtime_1.jsxs)("div", { className: `strip-card ${strip.status}`, children: [(0, jsx_runtime_1.jsxs)("h6", { children: ["Piste ", strip.number] }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Statut:" }), " ", strip.status === 'available' ? '✅ Disponible' :
                                                    strip.status === 'occupied' ? '🔄 Occupée' : '🔧 Maintenance'] }), strip.currentMatch && ((0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Match:" }), " ", strip.currentMatch] })), strip.assignedReferee && ((0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Arbitre:" }), " ", strip.assignedReferee] }))] }, strip.number))) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "session-actions", children: [(0, jsx_runtime_1.jsx)("button", { className: "btn-secondary", onClick: assignMatchesToStrips, children: "\uD83D\uDCCB Assigner les matchs" }), (0, jsx_runtime_1.jsx)("button", { className: "btn-danger", onClick: handleStopSession, disabled: isLoading, children: "\uD83D\uDED1 Arr\u00EAter la session" })] })] })), (0, jsx_runtime_1.jsxs)("div", { className: "remote-instructions", children: [(0, jsx_runtime_1.jsx)("h5", { children: "Instructions pour les arbitres" }), (0, jsx_runtime_1.jsxs)("ol", { children: [(0, jsx_runtime_1.jsx)("li", { children: "Ouvrir un navigateur web sur la tablette" }), (0, jsx_runtime_1.jsxs)("li", { children: ["Aller \u00E0 l'adresse: ", (0, jsx_runtime_1.jsx)("strong", { children: "http://localhost:3001" })] }), (0, jsx_runtime_1.jsx)("li", { children: "Entrer le code d'acc\u00E8s fourni par l'organisateur" }), (0, jsx_runtime_1.jsx)("li", { children: "Saisir les scores du match en cours" }), (0, jsx_runtime_1.jsx)("li", { children: "Cliquer sur \"Match suivant\" pour passer au match suivant" })] })] })] }));
};
exports.default = RemoteScoreManager;
//# sourceMappingURL=RemoteScoreManager.js.map