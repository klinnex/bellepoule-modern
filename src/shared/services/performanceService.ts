/**
 * BellePoule Modern - Performance Service
 * Caching, memoization, and optimization utilities
 * Licensed under GPL-3.0
 */

// ============================================================================
// Cache Service
// ============================================================================

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expiresAt: number;
}

export class CacheService {
  private cache = new Map<string, CacheEntry<unknown>>();
  private defaultTTL: number;
  private hits = 0;
  private misses = 0;

  constructor(defaultTTL: number = 5 * 60 * 1000) {
    // 5 minutes default
    this.defaultTTL = defaultTTL;
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry.value as T;
  }

  /**
   * Set a value in cache
   */
  set<T>(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    this.cache.set(key, {
      value,
      timestamp: now,
      expiresAt: now + (ttl ?? this.defaultTTL),
    });
  }

  /**
   * Delete a value from cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cached values
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }
}

// ============================================================================
// Memoization Utility
// ============================================================================

export function memoize<T extends (...args: unknown[]) => unknown>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, ReturnType<T>>();

  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = fn(...args) as ReturnType<T>;
    cache.set(key, result);
    return result;
  }) as T;
}

// ============================================================================
// Lazy Loading for Large Lists
// ============================================================================

export interface VirtualListConfig {
  itemHeight: number;
  overscan: number;
  containerHeight: number;
}

export interface VirtualListState {
  startIndex: number;
  endIndex: number;
  visibleItems: number;
  totalHeight: number;
  offsetY: number;
}

export function calculateVirtualListState(
  scrollTop: number,
  totalItems: number,
  config: VirtualListConfig
): VirtualListState {
  const { itemHeight, overscan, containerHeight } = config;

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleItems = Math.ceil(containerHeight / itemHeight) + overscan * 2;
  const endIndex = Math.min(totalItems - 1, startIndex + visibleItems);

  const totalHeight = totalItems * itemHeight;
  const offsetY = startIndex * itemHeight;

  return {
    startIndex,
    endIndex,
    visibleItems: endIndex - startIndex + 1,
    totalHeight,
    offsetY,
  };
}

// ============================================================================
// Debounce and Throttle
// ============================================================================

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// ============================================================================
// Web Worker for Heavy Calculations
// ============================================================================

export class WorkerPool {
  private workers: Worker[] = [];
  private queue: Array<{
    task: unknown;
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }> = [];
  private activeWorkers = 0;
  private maxWorkers: number;

  constructor(maxWorkers = navigator.hardwareConcurrency || 4) {
    this.maxWorkers = maxWorkers;
  }

  /**
   * Execute a task in a worker
   */
  async execute<T>(task: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve: resolve as (value: unknown) => void, reject });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.queue.length === 0 || this.activeWorkers >= this.maxWorkers) {
      return;
    }

    const { task, resolve, reject } = this.queue.shift()!;
    this.activeWorkers++;

    // Simplified - in real implementation, would create actual Web Workers
    setTimeout(() => {
      try {
        // Execute task (simplified)
        resolve(task);
      } catch (error) {
        reject(error);
      }
      this.activeWorkers--;
      this.processQueue();
    }, 0);
  }
}

// ============================================================================
// Image Optimization
// ============================================================================

export async function optimizeImage(
  file: File,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    format?: 'jpeg' | 'png' | 'webp';
  } = {}
): Promise<Blob> {
  const { maxWidth = 800, maxHeight = 800, quality = 0.8, format = 'jpeg' } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Calculate new dimensions
      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Could not create blob'));
          }
        },
        `image/${format}`,
        quality
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

// ============================================================================
// React Hook for Virtual List
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { logger, LogCategory } from './logger';

export function useVirtualList<T>(items: T[], config: VirtualListConfig) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const state = calculateVirtualListState(scrollTop, items.length, config);
  const visibleItems = items.slice(state.startIndex, state.endIndex + 1);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setScrollTop(containerRef.current.scrollTop);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    containerRef,
    visibleItems,
    state,
    onScroll,
    startIndex: state.startIndex,
  };
}

// ============================================================================
// Performance Monitoring
// ============================================================================

export class PerformanceMonitor {
  private marks = new Map<string, number>();
  private measures: Array<{ name: string; duration: number; timestamp: number }> = [];

  /**
   * Start timing a section
   */
  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  /**
   * End timing and record measurement
   */
  measure(name: string, startMark: string): number {
    const startTime = this.marks.get(startMark);
    if (!startTime) {
      logger.warn(LogCategory.PERFORMANCE, `Mark ${startMark} not found`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.measures.push({
      name,
      duration,
      timestamp: Date.now(),
    });

    // Keep only last 100 measurements
    if (this.measures.length > 100) {
      this.measures.shift();
    }

    return duration;
  }

  /**
   * Get average duration for a measurement
   */
  getAverage(name: string): number {
    const relevant = this.measures.filter(m => m.name === name);
    if (relevant.length === 0) return 0;

    const sum = relevant.reduce((acc, m) => acc + m.duration, 0);
    return sum / relevant.length;
  }

  /**
   * Get all measurements
   */
  getAllMeasurements(): typeof this.measures {
    return [...this.measures];
  }

  /**
   * Clear all measurements
   */
  clear(): void {
    this.marks.clear();
    this.measures = [];
  }
}

// Global cache instance
export const globalCache = new CacheService();

// Global performance monitor
export const perfMonitor = new PerformanceMonitor();

export default {
  CacheService,
  memoize,
  calculateVirtualListState,
  useVirtualList,
  debounce,
  throttle,
  optimizeImage,
  globalCache,
  perfMonitor,
};
