/**
 * BellePoule Modern - Event Manager Hook
 * Proper cleanup of event listeners and timers
 * Licensed under GPL-3.0
 */

import { useEffect, useRef, useCallback } from 'react';
import { logger, LogCategory } from '@shared/services/logger';

// ============================================================================
// Event Listener Management Hook
// ============================================================================

interface EventListenerItem {
  element: EventTarget;
  event: string;
  handler: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
}

export const useEventManager = () => {
  const listenersRef = useRef<EventListenerItem[]>([]);
  const timersRef = useRef<Array<{ id: number; type: 'timeout' | 'interval' }>>([]);

  const addEventListener = useCallback(
    (
      element: EventTarget,
      event: string,
      handler: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ) => {
      element.addEventListener(event, handler, options);
      listenersRef.current.push({ element, event, handler, options });
    },
    []
  );

  const removeEventListener = useCallback(
    (
      element: EventTarget,
      event: string,
      handler: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions
    ) => {
      element.removeEventListener(event, handler, options);
      listenersRef.current = listenersRef.current.filter(
        listener =>
          !(
            listener.element === element &&
            listener.event === event &&
            listener.handler === handler
          )
      );
    },
    []
  );

  const managedSetTimeout = useCallback((callback: () => void, delay: number): number => {
    const id = window.setTimeout(callback, delay);
    timersRef.current.push({ id, type: 'timeout' });
    return id;
  }, []);

  const managedSetInterval = useCallback((callback: () => void, delay: number): number => {
    const id = window.setInterval(callback, delay);
    timersRef.current.push({ id, type: 'interval' });
    return id;
  }, []);

  const managedClearTimeout = useCallback((id: number) => {
    window.clearTimeout(id);
    timersRef.current = timersRef.current.filter(timer => timer.id !== id);
  }, []);

  const managedClearInterval = useCallback((id: number) => {
    window.clearInterval(id);
    timersRef.current = timersRef.current.filter(timer => timer.id !== id);
  }, []);

  const cleanup = useCallback(() => {
    // Remove all event listeners
    listenersRef.current.forEach(({ element, event, handler, options }) => {
      try {
        element.removeEventListener(event, handler, options);
      } catch (error) {
        logger.warn(LogCategory.UI, 'Error removing event listener', undefined, error as Error);
      }
    });
    listenersRef.current = [];

    // Clear all timers
    timersRef.current.forEach(({ id, type }) => {
      try {
        if (type === 'timeout') {
          window.clearTimeout(id);
        } else {
          window.clearInterval(id);
        }
      } catch (error) {
        logger.warn(LogCategory.UI, 'Error clearing timer', undefined, error as Error);
      }
    });
    timersRef.current = [];
  }, []);

  // Auto cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    addEventListener,
    removeEventListener,
    managedSetTimeout,
    managedSetInterval,
    managedClearTimeout,
    managedClearInterval,
    cleanup,
  };
};

// ============================================================================
// Keyboard Event Hook
// ============================================================================

export const useKeyboardEvents = (keyMap: Record<string, () => void>, dependencies: any[] = []) => {
  const { addEventListener, removeEventListener } = useEventManager();

  useEffect(() => {
    const handleKeyDown = (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      const key = keyboardEvent.key.toLowerCase();
      const handler = keyMap[key];

      if (handler) {
        keyboardEvent.preventDefault();
        handler();
      }
    };

    addEventListener(window, 'keydown', handleKeyDown);

    return () => {
      removeEventListener(window, 'keydown', handleKeyDown);
    };
  }, [keyMap, dependencies, addEventListener, removeEventListener]);
};

// ============================================================================
// Window Resize Hook
// ============================================================================

export const useWindowResize = (handler: () => void, debounceMs: number = 100) => {
  const { addEventListener, removeEventListener, managedSetTimeout, managedClearTimeout } =
    useEventManager();
  const timeoutRef = useRef<number>(0);

  useEffect(() => {
    const handleResize = () => {
      if (timeoutRef.current) {
        managedClearTimeout(timeoutRef.current);
      }

      timeoutRef.current = managedSetTimeout(handler, debounceMs);
    };

    addEventListener(window, 'resize', handleResize);

    return () => {
      removeEventListener(window, 'resize', handleResize);
      if (timeoutRef.current) {
        managedClearTimeout(timeoutRef.current);
      }
    };
  }, [
    handler,
    debounceMs,
    addEventListener,
    removeEventListener,
    managedSetTimeout,
    managedClearTimeout,
  ]);
};

// ============================================================================
// Auto-save Hook
// ============================================================================

export const useAutoSave = (
  saveFunction: () => Promise<void>,
  intervalMs: number = 120000 // 2 minutes default
) => {
  const { managedSetInterval, managedClearInterval } = useEventManager();
  const intervalRef = useRef<number>(0);

  const startAutoSave = useCallback(() => {
    if (intervalRef.current) {
      managedClearInterval(intervalRef.current);
    }

    intervalRef.current = managedSetInterval(async () => {
      try {
        await saveFunction();
      } catch (error) {
        logger.error(LogCategory.UI, 'Auto-save failed', error as Error);
      }
    }, intervalMs);
  }, [saveFunction, intervalMs, managedSetInterval, managedClearInterval]);

  const stopAutoSave = useCallback(() => {
    if (intervalRef.current) {
      managedClearInterval(intervalRef.current);
      intervalRef.current = 0;
    }
  }, [managedClearInterval]);

  useEffect(() => {
    startAutoSave();
    return stopAutoSave;
  }, [startAutoSave, stopAutoSave]);

  return {
    startAutoSave,
    stopAutoSave,
  };
};

// ============================================================================
// IPC Event Hook for Electron
// ============================================================================

export const useIPCEvents = (eventHandlers: Record<string, (...args: any[]) => void>) => {
  const listenersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      // Register all event handlers
      Object.entries(eventHandlers).forEach(([event, handler]) => {
        const ipcHandler = (...args: any[]) => {
          try {
            handler(...args);
          } catch (error) {
            logger.error(LogCategory.UI, `Error in IPC event handler for ${event}`, error as Error);
          }
        };

        // Register with electronAPI if method exists
        const methodName =
          `on${event.charAt(0).toUpperCase() + event.slice(1)}` as keyof typeof window.electronAPI;
        const method = window.electronAPI[methodName];
        if (typeof method === 'function') {
          // Le préload retourne la fonction de désabonnement (#1894)
          const off = (method as Function)(ipcHandler);
          if (typeof off === 'function') listenersRef.current.push(off as () => void);
        }
      });
    }

    // Cleanup function
    return () => {
      listenersRef.current.forEach(off => {
        try {
          off();
        } catch (error) {
          logger.warn(LogCategory.UI, 'Error removing IPC listener', undefined, error as Error);
        }
      });
      listenersRef.current = [];
    };
  }, [eventHandlers]);
};
