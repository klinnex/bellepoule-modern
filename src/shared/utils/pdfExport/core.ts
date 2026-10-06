/**
 * BellePoule Modern - PDF Export Service
 * Helpers communs : sauvegarde PDF, helpers de template, CSS partagé
 * Licensed under GPL-3.0
 */

import type { PdfTemplate } from '../../types/pdfTemplate.types';

/** Sauvegarde PDF via Electron IPC, avec dialogue de fichier. */
export async function savePDF(html: string, defaultName: string): Promise<void> {
  const api = (window as any).electronAPI;
  if (!api?.dialog?.saveFile || !api?.file?.printHtmlToPDF) {
    throw new Error('API Electron non disponible');
  }

  const result = await api.dialog.saveFile({
    title: 'Enregistrer le PDF',
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (!result || result.canceled || !result.filePath) return;

  const res = await api.file.printHtmlToPDF(html, result.filePath);
  if (!res.success) {
    throw new Error(res.error ?? 'Échec de la génération PDF');
  }
}

// ─── Template helpers ─────────────────────────────────────────────────────────

/** Variables de couleur du modèle — à insérer APRÈS BASE_CSS, qui redéfinit :root (#992). */
export function buildCssOverrides(t: PdfTemplate): string {
  const vars = (['navy', 'gold', 'green'] as const)
    .filter(k => /^#[0-9a-fA-F]{3,8}$/.test(t.colors?.[k] ?? ''))
    .map(k => `--${k}: ${t.colors[k]};`)
    .join(' ');
  return vars ? `:root { ${vars} }` : '';
}

function isVisible(t: PdfTemplate | undefined, id: string): boolean {
  if (!t) return true;
  return t.elements.find(e => e.id === id)?.visible ?? true;
}

export function assembleBody(
  sections: Record<string, string>,
  t: PdfTemplate | undefined,
  defaultOrder: string[]
): string {
  const order = t ? [...t.elements].sort((a, b) => a.order - b.order).map(e => e.id) : defaultOrder;
  return order
    .filter(id => isVisible(t, id))
    .map(id => sections[id] ?? '')
    .join('\n');
}

// ─── CSS commun ───────────────────────────────────────────────────────────────

export const BASE_CSS = `
  @page { size: A4; margin: 12mm 10mm; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --navy:        #1a2e4a;
    --navy-light:  #2c4a73;
    --gold:        #c9a227;
    --gold-light:  #f5e6a3;
    --gold-bg:     #fffbeb;
    --green:       #166534;
    --green-bg:    #dcfce7;
    --gray-dark:   #475569;
    --gray-mid:    #94a3b8;
    --gray-light:  #e2e8f0;
    --gray-xlight: #f8fafc;
    --border:      #cbd5e1;
    --text:        #1e293b;
    --white:       #ffffff;
  }
  body {
    font-family: 'Segoe UI', -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 9.5pt;
    color: var(--text);
    background: var(--white);
  }
  /* ── Header ── */
  .doc-header {
    background: var(--navy);
    color: var(--white);
    padding: 5mm 6mm;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0;
  }
  .doc-header-logo {
    max-height: 10mm;
    max-width: 35mm;
    object-fit: contain;
    margin-right: 4mm;
    flex-shrink: 0;
  }
  .doc-header-left h1 {
    font-size: 15pt;
    font-weight: 700;
    letter-spacing: 0.3px;
    line-height: 1.2;
  }
  .doc-header-left .subtitle {
    font-size: 8.5pt;
    color: var(--gold-light);
    margin-top: 1.5mm;
    letter-spacing: 0.5px;
  }
  .doc-header-badge {
    background: var(--gold);
    color: var(--navy);
    font-weight: 900;
    font-size: 18pt;
    min-width: 16mm;
    height: 16mm;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .gold-bar {
    height: 3px;
    background: linear-gradient(90deg, var(--navy) 0%, var(--gold) 50%, var(--navy) 100%);
    margin-bottom: 4mm;
  }
  /* ── Meta chips ── */
  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 2mm;
    margin-bottom: 4mm;
    align-items: center;
  }
  .chip {
    background: var(--gray-xlight);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.8mm 3mm;
    font-size: 8pt;
    color: var(--gray-dark);
  }
  .chip strong { color: var(--navy); }
  .chip.gold { background: var(--gold-bg); border-color: var(--gold); }
  .chip.gold strong { color: #92400e; }
  /* ── Nom compétition ── */
  .competition-name-section {
    text-align: center;
    padding: 2mm 6mm;
    background: var(--navy);
    color: var(--gold);
    font-size: 10pt;
    font-weight: 700;
    letter-spacing: 0.5px;
    margin-bottom: 2mm;
    border-radius: 3px;
  }
  /* ── Section titre ── */
  .section-label {
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: var(--navy);
    display: flex;
    align-items: center;
    gap: 2mm;
    margin-bottom: 2mm;
  }
  .section-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  /* ── Footer ── */
  .doc-footer {
    margin-top: 5mm;
    padding-top: 2mm;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    font-size: 7pt;
    color: var(--gray-mid);
  }
`;
