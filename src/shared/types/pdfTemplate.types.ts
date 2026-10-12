export type PdfDocType = 'pool' | 'tableau' | 'ranking';

export interface PdfElementConfig {
  id: string;
  visible: boolean;
  order: number;
}

export interface PdfColorScheme {
  navy: string;
  gold: string;
  green: string;
}

export interface PdfTemplate {
  id: string;
  name: string;
  docType: PdfDocType;
  customTitle: string;
  colors: PdfColorScheme;
  elements: PdfElementConfig[];
  updatedAt: string;
}

export const PDF_ELEMENT_IDS: Record<PdfDocType, string[]> = {
  pool: [
    'header',
    'competition-name',
    'gold-bar',
    'meta-chips',
    'score-grid',
    'pending-matches',
    'finished-matches',
    'footer',
  ],
  tableau: ['header', 'gold-bar', 'match-cards', 'footer'],
  ranking: ['header', 'gold-bar', 'ranking-table', 'footer'],
};

export const DEFAULT_COLORS: PdfColorScheme = {
  navy: '#1a2e4a',
  gold: '#c9a227',
  green: '#166534',
};

export function buildDefaultTemplate(docType: PdfDocType): PdfTemplate {
  return {
    id: `default-${docType}`,
    name: '',
    docType,
    customTitle: '',
    colors: { ...DEFAULT_COLORS },
    elements: PDF_ELEMENT_IDS[docType].map((id, i) => ({ id, visible: true, order: i * 10 })),
    updatedAt: new Date().toISOString(),
  };
}
