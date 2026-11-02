/**
 * BellePoule Modern - Publication GREG automatique toutes les 15 s (#1328)
 * Licensed under GPL-3.0
 */
import { useEffect, useRef, useState } from 'react';

export const GREG_AUTO_PUBLISH_INTERVAL_MS = 15000;

/** `publish` est lu via une ref : l'intervalle n'est pas recréé à chaque rendu. */
export function useGregAutoPublish(publish: () => void) {
  const [on, setOn] = useState(false);
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
