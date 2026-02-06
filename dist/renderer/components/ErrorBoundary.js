"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useErrorHandler = exports.DatabaseErrorBoundary = exports.PoolErrorBoundary = exports.CompetitionErrorBoundary = exports.ErrorBoundary = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
/**
 * BellePoule Modern - React Error Boundary
 * Catches JavaScript errors in child component tree
 * Licensed under GPL-3.0
 */
const react_1 = require("react");
class ErrorBoundary extends react_1.Component {
    constructor(props) {
        super(props);
        this.handleReset = () => {
            this.setState({ hasError: false, error: undefined, errorInfo: undefined });
        };
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        console.error('Error Boundary caught an error:', error, errorInfo);
        this.setState({
            error,
            errorInfo
        });
        // Call custom error handler if provided
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }
        // Log to external service in production
        if (process.env.NODE_ENV === 'production') {
            // TODO: Integrate with error reporting service
            console.warn('Production error detected:', {
                error: error.message,
                stack: error.stack,
                componentStack: errorInfo.componentStack
            });
        }
    }
    render() {
        if (this.state.hasError) {
            // Custom fallback UI
            if (this.props.fallback) {
                return this.props.fallback;
            }
            // Default error UI
            return ((0, jsx_runtime_1.jsxs)("div", { style: {
                    padding: '20px',
                    margin: '20px',
                    border: '2px solid #ff4444',
                    borderRadius: '8px',
                    backgroundColor: '#fff5f5',
                    fontFamily: 'Arial, sans-serif'
                }, children: [(0, jsx_runtime_1.jsx)("h2", { style: { color: '#cc0000', marginTop: 0 }, children: "\uD83D\uDEAB Une erreur est survenue" }), (0, jsx_runtime_1.jsx)("p", { style: { color: '#666', marginBottom: '20px' }, children: "BellePoule Modern a rencontr\u00E9 une erreur technique. Veuillez rafra\u00EEchir la page ou contacter le support." }), process.env.NODE_ENV === 'development' && this.state.error && ((0, jsx_runtime_1.jsxs)("details", { style: {
                            backgroundColor: '#f8f8f8',
                            padding: '10px',
                            borderRadius: '4px',
                            marginBottom: '20px'
                        }, children: [(0, jsx_runtime_1.jsx)("summary", { style: { cursor: 'pointer', fontWeight: 'bold' }, children: "D\u00E9tails techniques (d\u00E9veloppement)" }), (0, jsx_runtime_1.jsxs)("div", { style: { marginTop: '10px' }, children: [(0, jsx_runtime_1.jsx)("h4", { children: "Erreur:" }), (0, jsx_runtime_1.jsx)("pre", { style: {
                                            backgroundColor: '#fff',
                                            padding: '10px',
                                            borderRadius: '4px',
                                            fontSize: '12px',
                                            overflow: 'auto',
                                            maxHeight: '200px'
                                        }, children: this.state.error.stack }), this.state.errorInfo && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("h4", { children: "Component Stack:" }), (0, jsx_runtime_1.jsx)("pre", { style: {
                                                    backgroundColor: '#fff',
                                                    padding: '10px',
                                                    borderRadius: '4px',
                                                    fontSize: '12px',
                                                    overflow: 'auto',
                                                    maxHeight: '200px'
                                                }, children: this.state.errorInfo.componentStack })] }))] })] })), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("button", { onClick: this.handleReset, style: {
                                    backgroundColor: '#007bff',
                                    color: 'white',
                                    border: 'none',
                                    padding: '10px 20px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    marginRight: '10px'
                                }, children: "\uD83D\uDD04 R\u00E9essayer" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => window.location.reload(), style: {
                                    backgroundColor: '#6c757d',
                                    color: 'white',
                                    border: 'none',
                                    padding: '10px 20px',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }, children: "\uD83D\uDD04 Rafra\u00EEchir la page" })] })] }));
        }
        return this.props.children;
    }
}
exports.ErrorBoundary = ErrorBoundary;
// ============================================================================
// Specialized Error Boundaries
// ============================================================================
class CompetitionErrorBoundary extends react_1.Component {
    render() {
        return ((0, jsx_runtime_1.jsx)(ErrorBoundary, { ...this.props, onError: (error, errorInfo) => {
                console.error('Competition Error:', error, errorInfo);
                // Specific handling for competition-related errors
                if (this.props.onError) {
                    this.props.onError(error, errorInfo);
                }
            }, fallback: (0, jsx_runtime_1.jsxs)("div", { style: { padding: '20px', textAlign: 'center' }, children: [(0, jsx_runtime_1.jsx)("h3", { children: "\uD83E\uDD3A Erreur de comp\u00E9tition" }), (0, jsx_runtime_1.jsx)("p", { children: "Une erreur est survenue lors du chargement de la comp\u00E9tition." }), (0, jsx_runtime_1.jsx)("button", { onClick: () => window.location.reload(), children: "Recharger l'application" })] }), children: this.props.children }));
    }
}
exports.CompetitionErrorBoundary = CompetitionErrorBoundary;
class PoolErrorBoundary extends react_1.Component {
    render() {
        return ((0, jsx_runtime_1.jsx)(ErrorBoundary, { ...this.props, fallback: (0, jsx_runtime_1.jsxs)("div", { style: { padding: '20px', textAlign: 'center' }, children: [(0, jsx_runtime_1.jsx)("h3", { children: "\uD83C\uDFCA Erreur de poule" }), (0, jsx_runtime_1.jsx)("p", { children: "Une erreur est survenue lors du calcul des poules." }), (0, jsx_runtime_1.jsx)("button", { onClick: () => window.location.reload(), children: "Recharger la page" })] }), children: this.props.children }));
    }
}
exports.PoolErrorBoundary = PoolErrorBoundary;
class DatabaseErrorBoundary extends react_1.Component {
    render() {
        return ((0, jsx_runtime_1.jsx)(ErrorBoundary, { ...this.props, onError: (error, errorInfo) => {
                console.error('Database Error:', error, errorInfo);
                // Specific handling for database errors
                if (error.message.includes('SQL') || error.message.includes('database')) {
                    // Could trigger database recovery here
                    console.warn('Database error detected, attempting recovery...');
                }
                if (this.props.onError) {
                    this.props.onError(error, errorInfo);
                }
            }, fallback: (0, jsx_runtime_1.jsxs)("div", { style: { padding: '20px', textAlign: 'center' }, children: [(0, jsx_runtime_1.jsx)("h3", { children: "\uD83D\uDCBE Erreur de base de donn\u00E9es" }), (0, jsx_runtime_1.jsx)("p", { children: "Une erreur est survenue lors de l'acc\u00E8s aux donn\u00E9es." }), (0, jsx_runtime_1.jsx)("p", { children: "Les donn\u00E9es peuvent \u00EAtre corrompues. Veuillez contacter le support." }), (0, jsx_runtime_1.jsx)("button", { onClick: () => window.location.reload(), children: "Red\u00E9marrer l'application" })] }), children: this.props.children }));
    }
}
exports.DatabaseErrorBoundary = DatabaseErrorBoundary;
// ============================================================================
// Hook for functional components
// ============================================================================
const useErrorHandler = () => {
    return (error, errorInfo) => {
        console.error('Unhandled error in component:', error, errorInfo);
        if (process.env.NODE_ENV === 'production') {
            // TODO: Send to error reporting service
            console.warn('Production error:', {
                message: error.message,
                stack: error.stack
            });
        }
    };
};
exports.useErrorHandler = useErrorHandler;
//# sourceMappingURL=ErrorBoundary.js.map