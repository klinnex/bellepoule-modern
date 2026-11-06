/**
 * BellePoule Modern - Publication GREG automatique toutes les 15 s (#1328)
 * Licensed under GPL-3.0
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const GREG_AUTO_PUBLISH_INTERVAL_MS = 15000;

const storageKey = (competitionId: string) => `greg-auto-publish:${competitionId}`;

/** État ON/OFF mémorisé par compétition (#1328). */
export function readGregAutoPublish(competitionId?: string): boolean {
  if (!competitionId) return false;
  try {
    return localStorage.getItem(storageKey(competitionId)) === '1';
  } catch {
    return false;
  }
}

function writeGregAutoPublish(competitionId: string | undefined, on: boolean) {
  if (!competitionId) return;
  try {
    if (on) localStorage.setItem(storageKey(competitionId), '1');
    else localStorage.removeItem(storageKey(competitionId));
  } catch {
    /* stockage indisponible : l'état reste en mémoire */
  }
}

/** `publish` est lu via une ref : l'intervalle n'est pas recréé à chaque rendu. */
export function useGregAutoPublish(publish: () => void, competitionId?: string) {
  const [on, setOnState] = useState(() => readGregAutoPublish(competitionId));
  useEffect(() => {
    setOnState(readGregAutoPublish(competitionId));
  }, [competitionId]);
  const setOn = useCallback(
    (value: boolean) => {
      writeGregAutoPublish(competitionId, value);
      setOnState(value);
    },
    [competitionId]
  );
  const ref = useRef(publish);
  useEffect(() => {
    ref.current = publish;
  });
  useEffect(() => {
    if (!on) return;
    ref.current();
    const timer = setInterval(() => ref.current(), GREG_AUTO_PUBLISH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [on]);
  return [on, setOn] as const;
}
