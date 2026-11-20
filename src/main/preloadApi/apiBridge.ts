/**
 * BellePoule Modern - Pont du contrat d'API dans le préload (#1981)
 * Transport brut (nom d'opération + entrée) : la validation est faite côté main par le moteur.
 * Licensed under GPL-3.0
 */
import { ipcRenderer } from 'electron';
import type { ApiBridge } from '../../shared/types/preload';
import { subscribe as subscribeChannel } from './subscribe';

export const apiBridge: ApiBridge = {
  invoke: (name, input) => ipcRenderer.invoke('api:invoke', name, input),
  subscribe: (id, name, input) => ipcRenderer.invoke('api:subscribe', id, name, input),
  unsubscribe: id => ipcRenderer.send('api:unsubscribe', id),
  onEvent: callback => subscribeChannel('api:event', callback),
};
