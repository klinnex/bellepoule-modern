/**
 * BellePoule Modern - États du stepper de phases (#1533)
 * fait / en cours / à faire / bloqué ; le motif de blocage est affiché en texte visible.
 * Licensed under GPL-3.0
 */

export type PhaseStepState = 'done' | 'current' | 'todo' | 'blocked';

export interface PhaseStepperItem {
  id: string;
  label: string;
  disabled: boolean;
  title?: string;
}

/** États de chaque phase, dans l'ordre de la barre */
export function phaseStepStates(phases: PhaseStepperItem[], currentId: string): PhaseStepState[] {
  const currentIndex = phases.findIndex(p => p.id === currentId);
  return phases.map((p, i) => {
    if (p.id === currentId) return 'current';
    if (p.disabled) return 'blocked';
    return currentIndex >= 0 && i < currentIndex ? 'done' : 'todo';
  });
}

/** Première phase bloquée (après la phase courante) dont le motif est connu */
export function nextBlockedReason(
  phases: PhaseStepperItem[],
  currentId: string
): { label: string; reason: string } | null {
  const currentIndex = phases.findIndex(p => p.id === currentId);
  const found = phases.find((p, i) => i > currentIndex && p.disabled && p.title);
  return found && found.title ? { label: found.label, reason: found.title } : null;
}
