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
exports.updateNotificationStyles = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Update Notification Component
 * Affichage des notifications de mise à jour dans l'interface
 * Licensed under GPL-3.0
 */
const react_1 = __importStar(require("react"));
const Toast_1 = require("./Toast");
const UpdateNotification = ({ visible: propVisible }) => {
    const { showToast } = (0, Toast_1.useToast)();
    const [visible, setVisible] = (0, react_1.useState)(propVisible || false);
    const [updateInfo, setUpdateInfo] = (0, react_1.useState)(null);
    const [dismissed, setDismissed] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        // Écouter les événements de mise à jour depuis le processus principal
        const handleUpdateAvailable = (_event, info) => {
            setUpdateInfo(info);
            if (!dismissed) {
                setVisible(true);
            }
        };
        // @ts-ignore
        if (window.electronAPI?.onUpdateAvailable) {
            // @ts-ignore
            window.electronAPI.onUpdateAvailable(handleUpdateAvailable);
        }
        return () => {
            // Nettoyage des écouteurs
        };
    }, [dismissed]);
    const handleDownload = () => {
        // Ouvre directement vers la dernière release (pas l'historique complet)
        window.open('https://github.com/klinnex/bellepoule-modern/releases/latest', '_blank');
        showToast('Redirection vers la page de téléchargement...', 'info');
        setVisible(false);
    };
    const handleDismiss = () => {
        setDismissed(true);
        setVisible(false);
        showToast('Vous pourrez mettre à jour plus tard depuis le menu Aide', 'info');
    };
    const handleViewRelease = () => {
        // Ouvre vers la page de la release spécifique (pas l'historique complet)
        if (updateInfo?.latestVersion) {
            const releaseUrl = `https://github.com/klinnex/bellepoule-modern/releases/tag/v${updateInfo.latestVersion}`;
            window.open(releaseUrl, '_blank');
        }
        else {
            window.open('https://github.com/klinnex/bellepoule-modern/releases/latest', '_blank');
        }
    };
    if (!visible || !updateInfo || dismissed) {
        return null;
    }
    return ((0, jsx_runtime_1.jsx)("div", { className: "update-notification", children: (0, jsx_runtime_1.jsxs)("div", { className: "update-notification-content", children: [(0, jsx_runtime_1.jsx)("div", { className: "update-notification-icon", children: "\uD83D\uDE80" }), (0, jsx_runtime_1.jsxs)("div", { className: "update-notification-text", children: [(0, jsx_runtime_1.jsx)("h4", { children: "Mise \u00E0 jour disponible !" }), (0, jsx_runtime_1.jsxs)("p", { children: ["Version ", (0, jsx_runtime_1.jsxs)("strong", { children: ["v", updateInfo.latestVersion] }), " (Build #", updateInfo.latestBuild, ")"] }), updateInfo.latestBuild - updateInfo.currentBuild > 1 && ((0, jsx_runtime_1.jsxs)("p", { className: "update-notification-multiple", children: ["Vous avez ", updateInfo.latestBuild - updateInfo.currentBuild, " mises \u00E0 jour de retard"] }))] }), (0, jsx_runtime_1.jsxs)("div", { className: "update-notification-actions", children: [(0, jsx_runtime_1.jsx)("button", { className: "btn btn-primary btn-sm", onClick: handleDownload, children: "\uD83D\uDCE5 T\u00E9l\u00E9charger" }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-secondary btn-sm", onClick: handleViewRelease, children: "\uD83D\uDCCB Voir les notes" }), (0, jsx_runtime_1.jsx)("button", { className: "btn btn-ghost btn-sm", onClick: handleDismiss, children: "\u2716\uFE0F" })] })] }) }));
};
exports.default = UpdateNotification;
/* Styles à ajouter dans le fichier CSS global */
exports.updateNotificationStyles = `
.update-notification {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1000;
  max-width: 400px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  animation: slideInRight 0.3s ease-out;
}

.update-notification-content {
  display: flex;
  align-items: center;
  padding: 16px;
  gap: 12px;
  color: white;
}

.update-notification-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.update-notification-text {
  flex: 1;
  min-width: 0;
}

.update-notification-text h4 {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
}

.update-notification-text p {
  margin: 0;
  font-size: 14px;
  opacity: 0.9;
}

.update-notification-multiple {
  color: #ffd700 !important;
  font-weight: 600;
}

.update-notification-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

.btn-ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
}

.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.5);
}
`;
//# sourceMappingURL=UpdateNotification.js.map