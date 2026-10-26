/**
 * BellePoule Modern - Chargement de pdf.js à la demande (boîte d'impression, #1214)
 * Modules copiés dans dist/renderer/pdfjs (CopyWebpackPlugin) : rien au démarrage de l'application.
 * pdf.js 4.x : la 3.x ne rend pas les polices des PDF Chromium récents (erreur OTS « cmap »).
 * Licensed under GPL-3.0
 */

export interface PdfPageViewport {
  width: number;
  height: number;
}

export interface PdfPage {
  getViewport(params: { scale: number }): PdfPageViewport;
  render(params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfPageViewport;
    transform?: number[];
  }): { promise: Promise<void>; cancel(): void };
}

export interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}

export interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(params: { data: Uint8Array; isEvalSupported: boolean }): {
    promise: Promise<PdfDocument>;
  };
}

let loading: Promise<PdfJsLib> | null = null;

const assetUrl = (name: string) => new URL(`pdfjs/${name}`, document.baseURI).href;

export function loadPdfJs(): Promise<PdfJsLib> {
  if (!loading) {
    // Module ES hors bundle (webpackIgnore) : le fichier est copié tel quel dans dist/renderer/pdfjs
    loading = (import(/* webpackIgnore: true */ assetUrl('pdf.min.mjs')) as Promise<PdfJsLib>)
      .then(lib => {
        lib.GlobalWorkerOptions.workerSrc = assetUrl('pdf.worker.min.mjs');
        return lib;
      })
      .catch(err => {
        loading = null;
        throw err;
      });
  }
  return loading;
}
