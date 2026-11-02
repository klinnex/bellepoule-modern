/**
 * BellePoule Modern - Error Logging Utility
 * Centralized error tracking and logging
 * Licensed under GPL-3.0
 */

import { logger, LogCategory, toError } from '../services/logger';

export interface ErrorLogEntry {
  id: string;
  timestamp: Date;
  level: 'error' | 'warn' | 'info';
  message: string;
  stack?: string;
  component?: string;
  context?: Record<string, unknown>;
  userAgent?: string;
  url?: string;
}

const STORAGE_KEY = 'bellepoule-error-logs';
const MAX_LOGS = 100;

/**
 * Generate unique ID for log entry
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get all error logs from localStorage
 */
export function getErrorLogs(): ErrorLogEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const logs = JSON.parse(stored);
      return logs.map((log: ErrorLogEntry) => ({
        ...log,
        timestamp: new Date(log.timestamp),
      }));
    }
  } catch (error) {
    logger.error(LogCategory.SYSTEM, 'Failed to load error logs', toError(error));
  }
  return [];
}

/**
 * Save error logs to localStorage
 */
function saveErrorLogs(logs: ErrorLogEntry[]): void {
  try {
    // Keep only last MAX_LOGS entries
    const trimmed = logs.slice(-MAX_LOGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    logger.error(LogCategory.SYSTEM, 'Failed to save error logs', toError(error));
  }
}

/**
 * Log an error
 */
export function logError(
  error: Error | string,
  component?: string,
  context?: Record<string, unknown>
): void {
  const entry: ErrorLogEntry = {
    id: generateId(),
    timestamp: new Date(),
    level: 'error',
    message: typeof error === 'string' ? error : error.message,
    stack: typeof error === 'string' ? undefined : error.stack,
    component,
    context,
    userAgent: navigator.userAgent,
    url: window.location.href,
  };

  const logs = getErrorLogs();
  logs.push(entry);
  saveErrorLogs(logs);

  // Also log to console in development
  if (process.env.NODE_ENV === 'development') {
    logger.error(LogCategory.SYSTEM, '[ErrorLogger]', undefined, entry);
  }

  // Send to external service if configured
  sendToErrorService(entry);
}

/**
 * Log a warning
 */
export function logWarning(
  message: string,
  component?: string,
  context?: Record<string, unknown>
): void {
  const entry: ErrorLogEntry = {
    id: generateId(),
    timestamp: new Date(),
    level: 'warn',
    message,
    component,
    context,
    userAgent: navigator.userAgent,
    url: window.location.href,
  };

  const logs = getErrorLogs();
  logs.push(entry);
  saveErrorLogs(logs);

  if (process.env.NODE_ENV === 'development') {
    logger.warn(LogCategory.SYSTEM, '[ErrorLogger]', entry);
  }
}

/**
 * Log info
 */
export function logInfo(
  message: string,
  component?: string,
  context?: Record<string, unknown>
): void {
  const entry: ErrorLogEntry = {
    id: generateId(),
    timestamp: new Date(),
    level: 'info',
    message,
    component,
    context,
    userAgent: navigator.userAgent,
    url: window.location.href,
  };

  const logs = getErrorLogs();
  logs.push(entry);
  saveErrorLogs(logs);
}

/**
 * Clear all error logs
 */
export function clearErrorLogs(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get error statistics
 */
export function getErrorStats(): {
  total: number;
  errors: number;
  warnings: number;
  infos: number;
  recent: ErrorLogEntry[];
} {
  const logs = getErrorLogs();
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return {
    total: logs.length,
    errors: logs.filter(l => l.level === 'error').length,
    warnings: logs.filter(l => l.level === 'warn').length,
    infos: logs.filter(l => l.level === 'info').length,
    recent: logs.filter(l => l.timestamp > twentyFourHoursAgo),
  };
}

/**
 * Export logs as JSON
 */
export function exportLogs(): string {
  return JSON.stringify(getErrorLogs(), null, 2);
}

/**
 * Configuration pour le service de rapport d'erreurs
 * Définir ces variables dans les variables d'environnement ou config
 */
const ERROR_REPORTING_CONFIG = {
  enabled: false, // Activer pour envoyer les erreurs à un service externe
  endpoint: '', // URL du endpoint de collecte d'erreurs
  apiKey: '', // Clé API si nécessaire
};

/**
 * Send to external error reporting service
 * Intégration avec Sentry ou service similaire
 */
function sendToErrorService(entry: ErrorLogEntry): void {
  // Envoi vers un endpoint externe si configuré
  if (ERROR_REPORTING_CONFIG.enabled && ERROR_REPORTING_CONFIG.endpoint) {
    fetch(ERROR_REPORTING_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ERROR_REPORTING_CONFIG.apiKey && {
          Authorization: `Bearer ${ERROR_REPORTING_CONFIG.apiKey}`,
        }),
      },
      body: JSON.stringify({
        message: entry.message,
        level: entry.level,
        timestamp: entry.timestamp.toISOString(),
        context: {
          ...entry.context,
          component: entry.component,
          stack: entry.stack,
          url: entry.url,
          userAgent: entry.userAgent,
        },
        tags: {
          component: entry.component || 'unknown',
          level: entry.level,
        },
      }),
    }).catch(err => {
      // Ne pas bloquer si l'envoi échoue
      logger.warn(
        LogCategory.SYSTEM,
        'Failed to send error to external service',
        undefined,
        toError(err)
      );
    });
  }

  // Support pour Sentry si disponible globalement
  if (typeof window !== 'undefined' && (window as any).Sentry) {
    const Sentry = (window as any).Sentry;
    const scope = new Sentry.Scope();
    scope.setTags({ component: entry.component || 'unknown' });
    scope.setExtras(entry.context || {});

    if (entry.level === 'error') {
      Sentry.captureException(entry.message, scope);
    } else {
      Sentry.captureMessage(entry.message, entry.level, scope);
    }
  }
}

/**
 * Configure le service de rapport d'erreurs
 */
export function configureErrorReporting(config: {
  enabled?: boolean;
  endpoint?: string;
  apiKey?: string;
}): void {
  Object.assign(ERROR_REPORTING_CONFIG, config);
  logInfo('Error reporting configured', 'ErrorLogger', { config });
}

/**
 * Global error handler
 */
export function setupGlobalErrorHandler(): void {
  window.onerror = (message, source, lineno, colno, error) => {
    logError(error || String(message), 'Global', {
      source,
      lineno,
      colno,
    });
    return false;
  };

  window.onunhandledrejection = event => {
    logError(event.reason, 'UnhandledPromise', {
      type: 'unhandledrejection',
    });
  };
}

/**
 * Log component lifecycle errors
 */
export function logComponentError(
  component: string,
  phase: 'mount' | 'update' | 'render' | 'unmount',
  error: Error
): void {
  logError(error, component, {
    phase,
    type: 'component-error',
  });
}
