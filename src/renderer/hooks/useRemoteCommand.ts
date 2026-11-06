/**
 * BellePoule Modern - Écoute des commandes « /remote start|stop » de la palette (Ctrl+K)
 * Licensed under GPL-3.0
 */

import { useEffect, useRef } from 'react';
import { REMOTE_COMMAND_EVENT, type RemoteCommandAction } from '../services/slashCommands';

/** Démarre / arrête la saisie distante sur demande de la palette de commandes. */
export function useRemoteCommand(
  isActive: boolean,
  onStart: () => void,
  onStop: () => void | Promise<void>
): void {
  // Refs : l'écouteur reste stable et voit toujours l'état courant
  const ref = useRef({ isActive, onStart, onStop });
  useEffect(() => {
    ref.current = { isActive, onStart, onStop };
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<RemoteCommandAction>).detail;
      const cur = ref.current;
      if (action === 'start' && !cur.isActive) cur.onStart();
      else if (action === 'stop' && cur.isActive) void cur.onStop();
    };
    window.addEventListener(REMOTE_COMMAND_EVENT, handler);
    return () => window.removeEventListener(REMOTE_COMMAND_EVENT, handler);
  }, []);
}
