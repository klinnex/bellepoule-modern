/**
 * BellePoule Modern - React Error Boundary
 * Catches JavaScript errors in child component tree
 * Licensed under GPL-3.0
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logError, logComponentError } from '../../shared/utils/errorLogger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error Boundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Log to centralized error logger
    logError(error, 'ErrorBoundary', {
      componentStack: errorInfo.componentStack,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div
          style={{
            padding: '20px',
            margin: '20px',
            border: '2px solid #ff4444',
            borderRadius: '8px',
            backgroundColor: '#fff5f5',
            fontFamily: 'Arial, sans-serif',
          }}
        >
          <h2 style={{ color: '#cc0000', marginTop: 0 }}>🚫 Une erreur est survenue</h2>
          <p style={{ color: '#666', marginBottom: '20px' }}>
            BellePoule Modern a rencontré une erreur technique. Veuillez rafraîchir la page ou
            contacter le support.
          </p>

          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details
              style={{
                backgroundColor: '#f8f8f8',
                padding: '10px',
                borderRadius: '4px',
                marginBottom: '20px',
              }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                Détails techniques (développement)
              </summary>
              <div style={{ marginTop: '10px' }}>
                <h4>Erreur:</h4>
                <pre
                  style={{
                    backgroundColor: '#fff',
                    padding: '10px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    overflow: 'auto',
                    maxHeight: '200px',
                  }}
                >
                  {this.state.error.stack}
                </pre>

                {this.state.errorInfo && (
                  <>
                    <h4>Component Stack:</h4>
                    <pre
                      style={{
                        backgroundColor: '#fff',
                        padding: '10px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        overflow: 'auto',
                        maxHeight: '200px',
                      }}
                    >
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </>
                )}
              </div>
            </details>
          )}

          <div>
            <button
              onClick={this.handleReset}
              style={{
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                cursor: 'pointer',
                marginRight: '10px',
              }}
            >
              🔄 Réessayer
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              🔄 Rafraîchir la page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// Specialized Error Boundaries
// ============================================================================

export class CompetitionErrorBoundary extends Component<Props> {
  render() {
    return (
      <ErrorBoundary
        {...this.props}
        onError={(error, errorInfo) => {
          logComponentError('Competition', 'render', error);
          // Specific handling for competition-related errors
          if (this.props.onError) {
            this.props.onError(error, errorInfo);
          }
        }}
        fallback={
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <h3>🤺 Erreur de compétition</h3>
            <p>Une erreur est survenue lors du chargement de la compétition.</p>
            <button onClick={() => window.location.reload()}>Recharger l'application</button>
          </div>
        }
      >
        {this.props.children}
      </ErrorBoundary>
    );
  }
}

export class PoolErrorBoundary extends Component<Props> {
  render() {
    return (
      <ErrorBoundary
        {...this.props}
        fallback={
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <h3>🏊 Erreur de poule</h3>
            <p>Une erreur est survenue lors du calcul des poules.</p>
            <button onClick={() => window.location.reload()}>Recharger la page</button>
          </div>
        }
      >
        {this.props.children}
      </ErrorBoundary>
    );
  }
}

export class DatabaseErrorBoundary extends Component<Props> {
  render() {
    return (
      <ErrorBoundary
        {...this.props}
        onError={(error, errorInfo) => {
          logComponentError('Database', 'render', error);
          // Specific handling for database errors
          if (error.message.includes('SQL') || error.message.includes('database')) {
            logError(error, 'DatabaseRecovery', {
              type: 'database-recovery',
              attempting: true,
            });
          }
          if (this.props.onError) {
            this.props.onError(error, errorInfo);
          }
        }}
        fallback={
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <h3>💾 Erreur de base de données</h3>
            <p>Une erreur est survenue lors de l'accès aux données.</p>
            <p>Les données peuvent être corrompues. Veuillez contacter le support.</p>
            <button onClick={() => window.location.reload()}>Redémarrer l'application</button>
          </div>
        }
      >
        {this.props.children}
      </ErrorBoundary>
    );
  }
}

// ============================================================================
// Hook for functional components
// ============================================================================

export const useErrorHandler = () => {
  return (error: Error, errorInfo?: ErrorInfo) => {
    console.error('Unhandled error in component:', error, errorInfo);

    // Always log to centralized error logger
    logError(error, 'Component', {
      componentStack: errorInfo?.componentStack,
    });
  };
};
