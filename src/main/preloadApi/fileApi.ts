/**
 * BellePoule Modern - Préload : Opérations fichiers (file:*), avec validation (#1774)
 * Licensed under GPL-3.0
 */
import { ipcRenderer } from 'electron';
import type { FileAPI } from '../../shared/types/preload';
import { getPrintRequestHandler } from './printHandler';

export const fileApi = {
  export: (filepath: string) => {
    if (!filepath || typeof filepath !== 'string') {
      throw new Error('Filepath is required and must be a string');
    }
    return ipcRenderer.invoke('file:export', filepath);
  },
  import: (filepath: string) => {
    if (!filepath || typeof filepath !== 'string') {
      throw new Error('Filepath is required and must be a string');
    }
    return ipcRenderer.invoke('file:import', filepath);
  },
  openDialog: () => ipcRenderer.invoke('file:openDialog'),
  unpackFederalFiles: (inputs: Array<{ name: string; bytes: Uint8Array }>) => {
    if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('Files are required');
    return ipcRenderer.invoke('file:unpackFederalFiles', inputs);
  },
  exportCompetition: (competitionId: string) =>
    ipcRenderer.invoke('file:exportCompetition', competitionId),
  writeContent: (filepath: string, content: string) => {
    if (!filepath || typeof filepath !== 'string') {
      throw new Error('Filepath is required and must be a string');
    }
    if (typeof content !== 'string') {
      throw new Error('Content must be a string');
    }
    return ipcRenderer.invoke('file:writeContent', filepath, content);
  },
  /** Classeur .xlsx (une feuille) écrit par le main depuis une grille de valeurs */
  writeSpreadsheet: (filepath: string, rows: (string | number)[][], sheetName?: string) => {
    if (!filepath || typeof filepath !== 'string') {
      throw new Error('Filepath is required and must be a string');
    }
    if (!Array.isArray(rows)) throw new Error('Rows must be an array');
    return ipcRenderer.invoke('file:writeSpreadsheet', filepath, rows, sheetName);
  },
  printHtml: (html: string) => {
    if (!html || typeof html !== 'string') {
      throw new Error('HTML content is required');
    }
    // Boîte d'impression intégrée (#1214), toujours active ; sinon aperçu PDF
    const printRequestHandler = getPrintRequestHandler();
    if (printRequestHandler) return printRequestHandler(html);
    return ipcRenderer.invoke('file:printHtml', html, { preview: true });
  },
  previewPdf: (html: string, title?: string) => {
    if (!html || typeof html !== 'string') {
      throw new Error('HTML content is required');
    }
    // Aperçu dans la boîte d'impression intégrée (#1214) : plus de fichier temporaire
    const printRequestHandler = getPrintRequestHandler();
    if (printRequestHandler) return printRequestHandler(html);
    return ipcRenderer.invoke('file:previewPdf', html, title);
  },
  printHtmlToPDF: (html: string, outputPath: string) => {
    if (!html || typeof html !== 'string') {
      throw new Error('HTML content is required');
    }
    if (!outputPath || typeof outputPath !== 'string') {
      throw new Error('Output path is required');
    }
    return ipcRenderer.invoke('file:printHtmlToPDF', html, outputPath);
  },
  countHtmlPages: (html: string) => {
    if (!html || typeof html !== 'string') {
      throw new Error('HTML content is required');
    }
    return ipcRenderer.invoke('file:countHtmlPages', html);
  },
  exportPhotos: (competitionId: string, filepath: string) => {
    if (!competitionId || typeof competitionId !== 'string') {
      throw new Error('Competition ID is required and must be a string');
    }
    if (!filepath || typeof filepath !== 'string') {
      throw new Error('Filepath is required and must be a string');
    }
    return ipcRenderer.invoke('file:exportPhotos', competitionId, filepath);
  },
  importPhotos: (competitionId: string, filepath: string) => {
    if (!competitionId || typeof competitionId !== 'string') {
      throw new Error('Competition ID is required and must be a string');
    }
    if (!filepath || typeof filepath !== 'string') {
      throw new Error('Filepath is required and must be a string');
    }
    return ipcRenderer.invoke('file:importPhotos', competitionId, filepath);
  },
  exportFencersArchive: (competitionId: string, filepath: string) => {
    if (!competitionId || typeof competitionId !== 'string') {
      throw new Error('Competition ID is required and must be a string');
    }
    if (!filepath || typeof filepath !== 'string') {
      throw new Error('Filepath is required and must be a string');
    }
    return ipcRenderer.invoke('file:exportFencersArchive', competitionId, filepath);
  },
  importFencersArchive: (competitionId: string, filepath: string) => {
    if (!competitionId || typeof competitionId !== 'string') {
      throw new Error('Competition ID is required and must be a string');
    }
    if (!filepath || typeof filepath !== 'string') {
      throw new Error('Filepath is required and must be a string');
    }
    return ipcRenderer.invoke('file:importFencersArchive', competitionId, filepath);
  },
} satisfies FileAPI;
