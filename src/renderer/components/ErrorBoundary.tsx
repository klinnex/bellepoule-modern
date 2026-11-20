/**
 * BellePoule Modern - React Error Boundary
 * Catches JavaScript errors in child component tree
 * Licensed under GPL-3.0
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logError, logComponentError } from '../../shared/utils/errorLogger';
import { translateStatic } from '../contexts/TranslationContext';
import { logger, LogCategory } from '../../shared/services/logger';

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
    logger.error(LogCategory.UI, 'Error Boundary caught an error:', undefined, [error, errorInfo]);

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
        <div className="error-boundary-1">
          <h2 className="error-boundary-2">{translateStatic('errorBoundary.title')}</h2>
          <p className="error-boundary-3">{translateStatic('errorBoundary.desc')}</p>

          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="error-boundary-4">
              <summary className="error-boundary-5">
                {translateStatic('errorBoundary.details')}
              </summary>
              <div className="error-boundary-6">
                <h4>{translateStatic('errorBoundary.error')}</h4>
                <pre className="error-boundary-7">{this.state.error.stack}</pre>

                {this.state.errorInfo && (
                  <>
                    <h4>{translateStatic('errorBoundary.stack')}</h4>
                    <pre className="error-boundary-7">{this.state.errorInfo.componentStack}</pre>
                  </>
                )}
              </div>
            </details>
          )}

          <div>
            <button onClick={this.handleReset} className="error-boundary-8">
              {translateStatic('errorBoundary.retry')}
            </button>
            <button onClick={() => window.location.reload()} className="error-boundary-9">
              {translateStatic('errorBoundary.refresh')}
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
          <div className="error-boundary-10">
            <h3>{translateStatic('errorBoundary.comp_title')}</h3>
            <p>{translateStatic('errorBoundary.comp_desc')}</p>
            <button onClick={() => window.location.reload()}>
              {translateStatic('errorBoundary.reload_app')}
            </button>
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
          <div className="error-boundary-10">
            <h3>{translateStatic('errorBoundary.pool_title')}</h3>
            <p>{translateStatic('errorBoundary.pool_desc')}</p>
            <button onClick={() => window.location.reload()}>
              {translateStatic('errorBoundary.reload_page')}
            </button>
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
          <div className="error-boundary-10">
            <h3>{translateStatic('errorBoundary.db_title')}</h3>
            <p>{translateStatic('errorBoundary.db_desc')}</p>
            <p>{translateStatic('errorBoundary.db_corrupt')}</p>
            <button onClick={() => window.location.reload()}>
              {translateStatic('errorBoundary.restart_app')}
            </button>
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
    logger.error(LogCategory.UI, 'Unhandled error in component:', undefined, [error, errorInfo]);

    // Always log to centralized error logger
    logError(error, 'Component', {
      componentStack: errorInfo?.componentStack,
    });
  };
};
