/**
 * BellePoule Modern - Event Manager Hook
 * Proper cleanup of event listeners and timers
 * Licensed under GPL-3.0
 */
export declare const useEventManager: () => {
    addEventListener: (element: EventTarget, event: string, handler: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => void;
    removeEventListener: (element: EventTarget, event: string, handler: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => void;
    setTimeout: (callback: () => void, delay: number) => number;
    setInterval: (callback: () => void, delay: number) => number;
    clearTimeout: (id: number) => void;
    clearInterval: (id: number) => void;
    cleanup: () => void;
};
export declare const useKeyboardEvents: (keyMap: Record<string, () => void>, dependencies?: any[]) => void;
export declare const useWindowResize: (handler: () => void, debounceMs?: number) => void;
export declare const useAutoSave: (saveFunction: () => Promise<void>, intervalMs?: number) => {
    startAutoSave: () => void;
    stopAutoSave: () => void;
};
export declare const useIPCEvents: (eventHandlers: Record<string, (...args: any[]) => void>) => void;
//# sourceMappingURL=useEventManager.d.ts.map