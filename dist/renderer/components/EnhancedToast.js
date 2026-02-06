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
exports.useToastHelpers = exports.ToastProvider = exports.useToast = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - Enhanced Toast Component
 * User-friendly notifications for errors and success
 * Licensed under GPL-3.0
 */
const react_1 = __importStar(require("react"));
const ToastContext = (0, react_1.createContext)(null);
const useToast = () => {
    const context = (0, react_1.useContext)(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
exports.useToast = useToast;
const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = (0, react_1.useState)([]);
    const addToast = (toast) => {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const newToast = { ...toast, id };
        setToasts(prev => [...prev, newToast]);
        // Auto-remove after duration (default 5 seconds)
        if (!toast.persistent && toast.duration !== 0) {
            setTimeout(() => {
                removeToast(id);
            }, toast.duration || 5000);
        }
    };
    const removeToast = (id) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    };
    const clearToasts = () => {
        setToasts([]);
    };
    return ((0, jsx_runtime_1.jsxs)(ToastContext.Provider, { value: { toasts, addToast, removeToast, clearToasts }, children: [children, (0, jsx_runtime_1.jsx)(ToastContainer, {})] }));
};
exports.ToastProvider = ToastProvider;
const ToastContainer = () => {
    const { toasts, removeToast } = (0, exports.useToast)();
    if (toasts.length === 0)
        return null;
    return ((0, jsx_runtime_1.jsx)("div", { style: {
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        }, children: toasts.map(toast => ((0, jsx_runtime_1.jsx)(ToastItem, { toast: toast, onRemove: removeToast }, toast.id))) }));
};
const ToastItem = ({ toast, onRemove }) => {
    const [isVisible, setIsVisible] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        // Trigger enter animation
        setTimeout(() => setIsVisible(true), 10);
    }, []);
    const getToastStyle = () => {
        const baseStyle = {
            padding: '16px',
            borderRadius: '8px',
            minWidth: '300px',
            maxWidth: '500px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
            opacity: isVisible ? 1 : 0,
            transition: 'all 0.3s ease-in-out',
            backgroundColor: '#fff'
        };
        switch (toast.type) {
            case 'success':
                return {
                    ...baseStyle,
                    borderLeft: '4px solid #10b981'
                };
            case 'error':
                return {
                    ...baseStyle,
                    borderLeft: '4px solid #ef4444'
                };
            case 'warning':
                return {
                    ...baseStyle,
                    borderLeft: '4px solid #f59e0b'
                };
            case 'info':
                return {
                    ...baseStyle,
                    borderLeft: '4px solid #3b82f6'
                };
            default:
                return baseStyle;
        }
    };
    const getIcon = () => {
        switch (toast.type) {
            case 'success': return '✅';
            case 'error': return '❌';
            case 'warning': return '⚠️';
            case 'info': return 'ℹ️';
            default: return '📢';
        }
    };
    return ((0, jsx_runtime_1.jsxs)("div", { style: getToastStyle(), children: [(0, jsx_runtime_1.jsx)("div", { style: { fontSize: '20px', lineHeight: 1 }, children: getIcon() }), (0, jsx_runtime_1.jsxs)("div", { style: { flex: 1 }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                            fontWeight: 'bold',
                            marginBottom: toast.message ? '4px' : '0',
                            color: toast.type === 'error' ? '#dc2626' : '#111827'
                        }, children: toast.title }), toast.message && ((0, jsx_runtime_1.jsx)("div", { style: {
                            fontSize: '14px',
                            color: '#6b7280',
                            lineHeight: 1.4
                        }, children: toast.message })), toast.action && ((0, jsx_runtime_1.jsx)("button", { onClick: toast.action.onClick, style: {
                            marginTop: '8px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            backgroundColor: toast.type === 'error' ? '#ef4444' : '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }, children: toast.action.label }))] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => onRemove(toast.id), style: {
                    background: 'none',
                    border: 'none',
                    fontSize: '18px',
                    cursor: 'pointer',
                    color: '#9ca3af',
                    padding: '0',
                    lineHeight: 1
                }, children: "\u00D7" })] }));
};
// ============================================================================
// Convenience Functions
// ============================================================================
const useToastHelpers = () => {
    const { addToast } = (0, exports.useToast)();
    return {
        success: (title, message, options) => addToast({ type: 'success', title, message, ...options }),
        error: (title, message, options) => addToast({ type: 'error', title, message, persistent: true, ...options }),
        warning: (title, message, options) => addToast({ type: 'warning', title, message, ...options }),
        info: (title, message, options) => addToast({ type: 'info', title, message, ...options }),
    };
};
exports.useToastHelpers = useToastHelpers;
//# sourceMappingURL=EnhancedToast.js.map