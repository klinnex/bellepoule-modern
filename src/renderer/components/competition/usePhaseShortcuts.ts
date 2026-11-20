/**
 * BellePoule Modern - Raccourcis de navigation entre phases (#1533)
 * Ctrl+1 … Ctrl+8 : aller à la phase n (position dans la barre) ;
 * Ctrl+← / Ctrl+→ : phase précédente / suivante parmi les phases accessibles.
 * Ignoré quand le focus est dans un champ de saisie. Licensed under GPL-3.0
 */

import { useEffect } from 'react';

export interface PhaseShortcutItem {
  id: string;
  disabled: boolean;
}

/** Identifiant de la phase visée par une touche, ou null si la touche ne cible rien */
export function phaseShortcutTarget(
  key: string,
  phases: PhaseShortcutItem[],
  currentId: string
): string | null {
  if (/^[1-8]$/.test(key)) {
    const phase = phases[Number(key) - 1];
    return phase && !phase.disabled ? phase.id : null;
  }
  if (key === 'ArrowRight' || key === 'ArrowLeft') {
    const enabled = phases.filter(p => !p.disabled);
    const index = enabled.findIndex(p => p.id === currentId);
    const next = enabled[index + (key === 'ArrowRight' ? 1 : -1)];
    return next ? next.id : null;
  }
  return null;
}

/** Branche les raccourcis Ctrl sur la fenêtre, tant que le composant est monté */
export function usePhaseShortcuts(
  phases: PhaseShortcutItem[],
  currentId: string,
  onSelect: (id: string) => void
): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const target = phaseShortcutTarget(e.key, phases, currentId);
      if (target && target !== currentId) {
        e.preventDefault();
        onSelect(target);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phases, currentId, onSelect]);
}
