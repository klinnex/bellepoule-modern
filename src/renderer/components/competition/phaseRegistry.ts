/**
 * BellePoule Modern - Registre des phases de la compétition ouverte (#1536)
 * La barre de phases publie ses phases accessibles ; la palette de commandes (Ctrl+K)
 * les liste pour permettre la navigation entre phases. Licensed under GPL-3.0
 */

export interface RegisteredPhase {
  id: string;
  label: string;
  disabled: boolean;
}

interface PhaseRegistry {
  phases: RegisteredPhase[];
  currentId: string;
  select: (id: string) => void;
}

let registry: PhaseRegistry | null = null;

/** Publie les phases de la compétition affichée ; renvoie la fonction de retrait */
export function registerPhases(next: PhaseRegistry): () => void {
  registry = next;
  return () => {
    if (registry === next) registry = null;
  };
}

/** Phases accessibles (hors phase courante) avec leur position 1…n dans la barre */
export function getPhaseTargets(): Array<{ id: string; label: string; position: number }> {
  if (!registry) return [];
  const { phases, currentId } = registry;
  const targets: Array<{ id: string; label: string; position: number }> = [];
  phases.forEach((p, i) => {
    if (!p.disabled && p.id !== currentId)
      targets.push({ id: p.id, label: p.label, position: i + 1 });
  });
  return targets;
}

export function selectPhase(id: string): void {
  registry?.select(id);
}
