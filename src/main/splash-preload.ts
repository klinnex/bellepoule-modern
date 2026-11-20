import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('splashAPI', {
  confirm: (lang: string, hideNextTime = false) =>
    ipcRenderer.send('splash:confirm', lang, hideNextTime === true),
  close: () => ipcRenderer.send('splash:close'),
  onInit: (cb: (savedLang: string) => void) =>
    ipcRenderer.once('splash:init', (_event, lang: string) => cb(lang)),
});
