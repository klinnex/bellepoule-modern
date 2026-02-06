/**
 * BellePoule Modern - Event Manager Hook
 * Proper cleanup of event listeners and timers
 * Licensed under GPL-3.0
 */
export declare const useEventManager: () => {
    addEventListener: any;
    removeEventListener: any;
    setTimeout: any;
    setInterval: any;
    clearTimeout: any;
    clearInterval: any;
    cleanup: any;
};
export declare const useKeyboardEvents: (keyMap: Record<string, () => void>, dependencies?: any[]) => void;
export declare const useWindowResize: (handler: () => void, debounceMs?: number) => void;
export declare const useAutoSave: (saveFunction: () => Promise<void>, intervalMs?: number) => {
    startAutoSave: any;
    stopAutoSave: any;
};
export declare const useIPCEvents: (eventHandlers: Record<string, (...args: any[]) => void>) => void;
//# sourceMappingURL=useEventManager.d.ts.map