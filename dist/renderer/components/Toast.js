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
exports.useToast = exports.ToastProvider = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Toast Notification Component
 * Replaces native alert() to avoid focus issues in Electron
 * Licensed under GPL-3.0
 */
const react_1 = __importStar(require("react"));
const ToastContext = (0, react_1.createContext)(null);
let toastId = 0;
const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = (0, react_1.useState)([]);
    const showToast = (0, react_1.useCallback)((message, type = 'info') => {
        const id = ++toastId;
        setToasts(prev => [...prev, { id, message, type }]);
        // Auto-remove after 4 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);
    const removeToast = (id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };
    const getIcon = (type) => {
        switch (type) {
            case 'success': return '✅';
            case 'warning': return '⚠️';
            case 'error': return '❌';
            default: return 'ℹ️';
        }
    };
    const getColors = (type) => {
        switch (type) {
            case 'success': return { bg: '#f0fdf4', border: '#22c55e', text: '#166534' };
            case 'warning': return { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' };
            case 'error': return { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' };
            default: return { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' };
        }
    };
    return ((0, jsx_runtime_1.jsxs)(ToastContext.Provider, { value: { showToast }, children: [children, (0, jsx_runtime_1.jsx)("div", { style: {
                    position: 'fixed',
                    top: '1rem',
                    right: '1rem',
                    zIndex: 10000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    pointerEvents: 'none',
                }, children: toasts.map(toast => {
                    const colors = getColors(toast.type);
                    return ((0, jsx_runtime_1.jsxs)("div", { style: {
                            background: colors.bg,
                            border: `2px solid ${colors.border}`,
                            borderRadius: '8px',
                            padding: '0.75rem 1rem',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            maxWidth: '400px',
                            pointerEvents: 'auto',
                            animation: 'slideIn 0.3s ease-out',
                        }, children: [(0, jsx_runtime_1.jsx)("span", { style: { fontSize: '1.25rem' }, children: getIcon(toast.type) }), (0, jsx_runtime_1.jsx)("span", { style: { color: colors.text, fontWeight: '500', flex: 1 }, children: toast.message }), (0, jsx_runtime_1.jsx)("button", { onClick: () => removeToast(toast.id), style: {
                                    background: 'transparent',
                                    border: 'none',
                                    color: colors.text,
                                    cursor: 'pointer',
                                    padding: '0.25rem',
                                    opacity: 0.7,
                                    fontSize: '1rem',
                                }, children: "\u2715" })] }, toast.id));
                }) }), (0, jsx_runtime_1.jsx)("style", { children: `
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      ` })] }));
};
exports.ToastProvider = ToastProvider;
const useToast = () => {
    const context = (0, react_1.useContext)(ToastContext);
    if (!context) {
        // Fallback if used outside provider
        return {
            showToast: (message) => {
                console.warn('Toast used outside provider:', message);
            }
        };
    }
    return context;
};
exports.useToast = useToast;
exports.default = exports.ToastProvider;
//# sourceMappingURL=Toast.js.map