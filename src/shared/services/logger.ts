/**
 * BellePoule Modern - Professional Logger Service
 * Centralized logging with levels and categories
 * Licensed under GPL-3.0
 */

/** Normalise une valeur capturée (catch) en Error pour logger.error/warn. */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export enum LogCategory {
  DATABASE = 'DB',
  UI = 'UI',
  NETWORK = 'NET',
  BUSINESS = 'BUS',
  SYSTEM = 'SYS',
  PERFORMANCE = 'PERF',
}

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: unknown;
  error?: Error;
}

interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  maxEntries: number;
}

class Logger {
  private config: LoggerConfig;
  private entries: LogEntry[] = [];
  private categoryFilter?: LogCategory[];

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      minLevel: LogLevel.INFO,
      enableConsole: true,
      enableFile: false,
      maxEntries: 1000,
      ...config,
    };
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.minLevel;
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const levelName = LogLevel[entry.level].padStart(5);
    const category = entry.category.padStart(4);
    return `[${timestamp}] [${levelName}] [${category}] ${entry.message}`;
  }

  private log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    data?: unknown,
    error?: Error
  ): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      data,
      error,
    };

    this.entries.push(entry);

    if (this.entries.length > this.config.maxEntries) {
      this.entries.shift();
    }

    if (this.config.enableConsole) {
      const formatted = this.formatMessage(entry);

      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formatted, data || '');
          break;
        case LogLevel.INFO:
          console.info(formatted, data || '');
          break;
        case LogLevel.WARN:
          console.warn(formatted, data || '', error || '');
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          console.error(formatted, data || '', error || '');
          break;
      }
    }
  }

  debug(category: LogCategory, message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, category, message, data);
  }

  info(category: LogCategory, message: string, data?: unknown): void {
    this.log(LogLevel.INFO, category, message, data);
  }

  warn(category: LogCategory, message: string, data?: unknown, error?: Error): void {
    this.log(LogLevel.WARN, category, message, data, error);
  }

  error(category: LogCategory, message: string, error?: Error, data?: unknown): void {
    this.log(LogLevel.ERROR, category, message, data, error);
  }

  fatal(category: LogCategory, message: string, error?: Error, data?: unknown): void {
    this.log(LogLevel.FATAL, category, message, data, error);
  }

  getEntries(level?: LogLevel, category?: LogCategory): LogEntry[] {
    let filtered = this.entries;

    if (level !== undefined) {
      filtered = filtered.filter(e => e.level >= level);
    }

    if (category !== undefined) {
      filtered = filtered.filter(e => e.category === category);
    }

    return filtered;
  }

  clear(): void {
    this.entries = [];
  }

  export(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  setMinLevel(level: LogLevel): void {
    this.config.minLevel = level;
  }

  setCategoryFilter(categories: LogCategory[]): void {
    this.categoryFilter = categories;
  }
}

// Global logger instance
export const logger = new Logger({
  minLevel: process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.DEBUG,
  enableConsole: true,
  maxEntries: 5000,
});

// React Hook for component logging
import { useCallback } from 'react';

export function useLogger(componentName: string) {
  const debug = useCallback(
    (message: string, data?: unknown) => {
      logger.debug(LogCategory.UI, `[${componentName}] ${message}`, data);
    },
    [componentName]
  );

  const info = useCallback(
    (message: string, data?: unknown) => {
      logger.info(LogCategory.UI, `[${componentName}] ${message}`, data);
    },
    [componentName]
  );

  const warn = useCallback(
    (message: string, data?: unknown, error?: Error) => {
      logger.warn(LogCategory.UI, `[${componentName}] ${message}`, data, error);
    },
    [componentName]
  );

  const error = useCallback(
    (message: string, err?: Error, data?: unknown) => {
      logger.error(LogCategory.UI, `[${componentName}] ${message}`, err, data);
    },
    [componentName]
  );

  return { debug, info, warn, error };
}

export default logger;
