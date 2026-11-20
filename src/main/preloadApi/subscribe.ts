/**
 * BellePoule Modern - Abonnement IPC du préload (#1894)
 * Enveloppe le callback sans l'IpcRendererEvent (pas de fuite de `sender` vers le renderer)
 * et retourne la fonction de désabonnement à appeler dans le cleanup d'un useEffect.
 * Licensed under GPL-3.0
 */

import { ipcRenderer, type IpcRendererEvent } from 'electron';

export type Unsubscribe = () => void;

export function subscribe<A extends unknown[]>(
  channel: string,
  callback: (...args: A) => void
): Unsubscribe {
  const wrapper = (_event: IpcRendererEvent, ...args: unknown[]): void => callback(...(args as A));
  ipcRenderer.on(channel, wrapper);
  return () => {
    ipcRenderer.removeListener(channel, wrapper);
  };
}
