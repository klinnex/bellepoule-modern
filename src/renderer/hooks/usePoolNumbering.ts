/**
 * BellePoule Modern - Numérotage des poules (#1864)
 * Bulles de la matrice : numéro de placement dans la poule (1, 2, 3…) au lieu des initiales.
 * Réglage global, tous modes, mémorisé localement.
 * Licensed under GPL-3.0
 */
import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'bellepoule_pool_numbering';

const load = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

let enabled = load();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = (): boolean => enabled;

export const setPoolNumbering = (value: boolean): void => {
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* stockage indisponible : réglage limité à la session */
  }
  listeners.forEach(l => l());
};

export const usePoolNumbering = () => {
  const numbering = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const toggleNumbering = useCallback(() => setPoolNumbering(!enabled), []);
  return { numbering, toggleNumbering };
};
