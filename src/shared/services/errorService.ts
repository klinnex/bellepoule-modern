/**
 * BellePoule Modern - Error Service
 * Centralized error handling singleton
 * Licensed under GPL-3.0
 */

import { logError, logWarning } from '../utils/errorLogger';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export class ErrorService {
  handle(error: Error | unknown, context: string, severity: ErrorSeverity = 'medium'): void {
    const err = error instanceof Error ? error : new Error(String(error));
    const message = err.message;

    if (severity === 'low') {
      logWarning(message, context);
    } else {
      logError(err, context, { severity });
    }

    if (severity === 'critical') {
      window.dispatchEvent(new CustomEvent('bp:critical-error', { detail: { message, context } }));
    }
  }
}

export const errorService = new ErrorService();
