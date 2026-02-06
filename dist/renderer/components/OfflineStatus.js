"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OfflineStatus = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Offline Status Component
 * UI component to display offline/sync status
 * Licensed under GPL-3.0
 */
const react_1 = require("react");
const offlineSync_1 = require("../services/offlineSync");
const offlineStorage_1 = require("../services/offlineStorage");
const OfflineStatus = ({ className = '' }) => {
    const [isOnline, setIsOnline] = (0, react_1.useState)(true);
    const [isSyncing, setIsSyncing] = (0, react_1.useState)(false);
    const [syncStatus, setSyncStatus] = (0, react_1.useState)({
        pendingActions: 0,
        conflicts: 0,
        lastSync: null
    });
    const [showDetails, setShowDetails] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        const updateStatus = async () => {
            setIsOnline(offlineSync_1.offlineSync.isCurrentlyOnline());
            setIsSyncing(offlineSync_1.offlineSync.isCurrentlySyncing());
            const status = await offlineStorage_1.offlineStorage.getSyncStatus();
            setSyncStatus(status);
        };
        // Initial update
        updateStatus();
        // Set up periodic updates
        const interval = setInterval(updateStatus, 5000); // Update every 5 seconds
        // Listen for sync completion
        offlineSync_1.offlineSync.onSyncComplete((result) => {
            setIsSyncing(false);
            updateStatus();
        });
        // Listen for online/offline events
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            clearInterval(interval);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            // Note: We're not removing the sync callback as there's no public method for it
        };
    }, []);
    const handleManualSync = async () => {
        if (!isOnline)
            return;
        setIsSyncing(true);
        try {
            await offlineSync_1.offlineSync.triggerSync();
        }
        finally {
            setIsSyncing(false);
        }
    };
    const formatLastSync = (timestamp) => {
        if (!timestamp)
            return 'Jamais';
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1)
            return 'À l\'instant';
        if (diffMins < 60)
            return `Il y a ${diffMins} min`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24)
            return `Il y a ${diffHours}h`;
        return date.toLocaleDateString('fr-FR');
    };
    const getStatusColor = () => {
        if (!isOnline)
            return 'bg-red-500';
        if (isSyncing)
            return 'bg-yellow-500';
        if (syncStatus.pendingActions > 0)
            return 'bg-orange-500';
        if (syncStatus.conflicts > 0)
            return 'bg-red-500';
        return 'bg-green-500';
    };
    const getStatusText = () => {
        if (!isOnline)
            return 'Hors ligne';
        if (isSyncing)
            return 'Synchronisation...';
        if (syncStatus.pendingActions > 0)
            return `${syncStatus.pendingActions} en attente`;
        if (syncStatus.conflicts > 0)
            return `${syncStatus.conflicts} conflits`;
        return 'Connecté';
    };
    return ((0, jsx_runtime_1.jsx)("div", { className: `fixed bottom-4 right-4 z-50 ${className}`, children: (0, jsx_runtime_1.jsxs)("div", { className: "bg-white rounded-lg shadow-lg border border-gray-200 min-w-[250px]", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50", onClick: () => setShowDetails(!showDetails), children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center space-x-2", children: [(0, jsx_runtime_1.jsx)("div", { className: `w-3 h-3 rounded-full ${getStatusColor()} ${isSyncing ? 'animate-pulse' : ''}` }), (0, jsx_runtime_1.jsx)("span", { className: "text-sm font-medium text-gray-700", children: getStatusText() })] }), (0, jsx_runtime_1.jsx)("svg", { className: `w-4 h-4 text-gray-400 transform transition-transform ${showDetails ? 'rotate-180' : ''}`, fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: (0, jsx_runtime_1.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 9l-7 7-7-7" }) })] }), showDetails && ((0, jsx_runtime_1.jsxs)("div", { className: "border-t border-gray-200 p-3 space-y-3", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-sm text-gray-600", children: "Connexion:" }), (0, jsx_runtime_1.jsx)("span", { className: `text-sm font-medium ${isOnline ? 'text-green-600' : 'text-red-600'}`, children: isOnline ? 'En ligne' : 'Hors ligne' })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-sm text-gray-600", children: "Derni\u00E8re synchro:" }), (0, jsx_runtime_1.jsx)("span", { className: "text-sm text-gray-700", children: formatLastSync(syncStatus.lastSync) })] }), syncStatus.pendingActions > 0 && ((0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-sm text-gray-600", children: "Actions en attente:" }), (0, jsx_runtime_1.jsx)("span", { className: "text-sm font-medium text-orange-600", children: syncStatus.pendingActions })] })), syncStatus.conflicts > 0 && ((0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-sm text-gray-600", children: "Conflits:" }), (0, jsx_runtime_1.jsx)("span", { className: "text-sm font-medium text-red-600", children: syncStatus.conflicts })] })), isOnline && !isSyncing && syncStatus.pendingActions > 0 && ((0, jsx_runtime_1.jsx)("button", { onClick: handleManualSync, className: "w-full mt-3 px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors", children: "Synchroniser maintenant" })), isSyncing && ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-center space-x-2 py-2", children: [(0, jsx_runtime_1.jsx)("div", { className: "w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" }), (0, jsx_runtime_1.jsx)("span", { className: "text-sm text-gray-600", children: "Synchronisation en cours..." })] })), !isOnline && ((0, jsx_runtime_1.jsx)("div", { className: "bg-yellow-50 border border-yellow-200 rounded p-2", children: (0, jsx_runtime_1.jsxs)("p", { className: "text-xs text-yellow-800", children: [(0, jsx_runtime_1.jsx)("strong", { children: "Mode hors ligne:" }), " Les modifications seront synchronis\u00E9es automatiquement lorsque la connexion sera r\u00E9tablie."] }) }))] }))] }) }));
};
exports.OfflineStatus = OfflineStatus;
//# sourceMappingURL=OfflineStatus.js.map