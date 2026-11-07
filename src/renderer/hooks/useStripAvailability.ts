/**
 * BellePoule Modern - Pistes indisponibles (plan des pistes, #1501)
 * Liste des pistes de l'intervalle marquées indisponibles, par compétition.
 * Persistée dans localStorage (confort par poste) ; les consommateurs
 * (cartes de matchs, boutons de piste, répartition automatique) lisent le store.
 * Licensed under GPL-3.0
 */
import { create } from 'zustand';

const key = (competitionId: string) => `bellepoule-strips-unavailable-${competitionId}`;

function read(competitionId: string): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key(competitionId)) ?? '[]');
    return Array.isArray(raw) ? raw.filter(n => Number.isInteger(n) && n > 0) : [];
  } catch {
    return [];
  }
}

interface StripAvailabilityState {
  competitionId: string | null;
  unavailable: number[];
  load: (competitionId: string) => void;
  toggle: (strip: number) => void;
}

export const useStripAvailability = create<StripAvailabilityState>((set, get) => ({
  competitionId: null,
  unavailable: [],
  load: competitionId => {
    if (get().competitionId === competitionId) return;
    set({ competitionId, unavailable: read(competitionId) });
  },
  toggle: strip => {
    const { competitionId, unavailable } = get();
    const next = unavailable.includes(strip)
      ? unavailable.filter(n => n !== strip)
      : [...unavailable, strip].sort((a, b) => a - b);
    set({ unavailable: next });
    if (!competitionId) return;
    try {
      localStorage.setItem(key(competitionId), JSON.stringify(next));
    } catch {
      /* stockage indisponible : l'état reste en mémoire */
    }
  },
}));
