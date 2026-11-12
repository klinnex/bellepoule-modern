/**
 * BellePoule Modern - Préload : Boîtes de dialogue fichiers (dialog:*) (#1774)
 * Licensed under GPL-3.0
 */
import { ipcRenderer } from 'electron';
import type { DialogAPI, DialogOpenOptions, DialogSaveOptions } from '../../shared/types/preload';

export const dialogApi = {
  openFile: (options: DialogOpenOptions) => {
    if (!options || typeof options !== 'object') {
      throw new Error('Dialog options are required');
    }
    return ipcRenderer.invoke('dialog:openFile', options);
  },
  saveFile: (options: DialogSaveOptions) => {
    if (!options || typeof options !== 'object') {
      throw new Error('Dialog options are required');
    }
    return ipcRenderer.invoke('dialog:saveFile', options);
  },
} satisfies DialogAPI;
