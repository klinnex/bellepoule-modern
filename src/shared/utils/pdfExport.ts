/**
 * BellePoule Modern - PDF Export Service
 * Génération PDF via Electron printToPDF (sans menus ni chrome applicatif)
 * Licensed under GPL-3.0
 *
 * Point d'entrée (barrel) — le code est découpé en modules dans ./pdfExport/
 * L'API publique reste strictement identique.
 */

// ─── Poules ───────────────────────────────────────────────────────────────────
export type { PoolExportOptions } from './pdfExport/poolPdf';
export {
  generatePoolHTML,
  exportPoolToPDF,
  exportMultiplePoolsToPDF,
  printPoolHTML,
  printMultiplePoolsHTML,
  previewPoolHTML,
} from './pdfExport/poolPdf';

// ─── Tableau Élimination Directe ─────────────────────────────────────────────
export type { TableauMatchForPDF } from './pdfExport/tableauPdf';
export { MAX_MATCHES_PER_PAGE_TABLEAU } from './pdfConstants';
export {
  generateTableauHTML,
  exportTableauToPDF,
  printTableauHTML,
  previewTableauHTML,
} from './pdfExport/tableauPdf';

// ─── Arbre (Bracket Tree) ─────────────────────────────────────────────────────
export {
  generateBracketTreeHTML,
  generateBracketTreeMultiPageHTML,
  exportBracketTreeToPDF,
  printBracketTreeHTML,
} from './pdfExport/bracketTreePdf';

// ─── Classement Général ───────────────────────────────────────────────────────
export { generateRankingHTML, exportRankingToPDF } from './pdfExport/rankingPdf';

// ─── Résultats Finaux ─────────────────────────────────────────────────────────
export type { FinalResultForPDF } from './pdfExport/resultsPdf';
export { exportResultsToPDF } from './pdfExport/resultsPdf';

// ─── Liste d'Appel ────────────────────────────────────────────────────────────
export { exportAppelToPDF } from './pdfExport/appelPdf';

// ─── Export complet compétition ───────────────────────────────────────────────
export type {
  FullCompetitionExportData,
  NoSignatureExportData,
} from './pdfExport/fullCompetitionPdf';
export {
  exportFullCompetitionPDF,
  exportPoolsAndTableauxNoSignaturePDF,
} from './pdfExport/fullCompetitionPdf';
