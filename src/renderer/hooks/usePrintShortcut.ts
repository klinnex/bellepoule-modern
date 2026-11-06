/**
 * BellePoule Modern - Raccourci Ctrl+P / Cmd+P (impression) conditionnel (#1241)
 * Licensed under GPL-3.0
 */
import { useEffect } from 'react';

/** Déclenche `onPrint` sur Ctrl+P / Cmd+P tant que `enabled` est vrai. */
export function usePrintShortcut(enabled: boolean, onPrint: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        onPrint();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onPrint]);
}
