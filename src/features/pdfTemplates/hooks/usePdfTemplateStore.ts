import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { PdfDocType, PdfTemplate } from '../../../shared/types/pdfTemplate.types';
import { buildDefaultTemplate, PDF_ELEMENT_IDS } from '../../../shared/types/pdfTemplate.types';

interface PdfTemplateState {
  templates: Record<PdfDocType, PdfTemplate>;
}

interface PdfTemplateActions {
  setTemplate: (docType: PdfDocType, template: PdfTemplate) => void;
  resetTemplate: (docType: PdfDocType) => void;
  importTemplate: (template: PdfTemplate) => void;
}

function migrateTemplate(template: PdfTemplate): PdfTemplate {
  const expected = PDF_ELEMENT_IDS[template.docType];
  const existing = new Set(template.elements.map(e => e.id));
  const missing = expected.filter(id => !existing.has(id));
  if (missing.length === 0) return template;
  const maxOrder = Math.max(...template.elements.map(e => e.order), 0);
  return {
    ...template,
    elements: [
      ...template.elements,
      ...missing.map((id, i) => ({ id, visible: true, order: maxOrder + (i + 1) * 10 })),
    ],
  };
}

export const usePdfTemplateStore = create<PdfTemplateState & PdfTemplateActions>()(
  devtools(
    immer(
      persist(
        set => ({
          templates: {
            pool: buildDefaultTemplate('pool'),
            tableau: buildDefaultTemplate('tableau'),
            ranking: buildDefaultTemplate('ranking'),
          },

          setTemplate: (docType, template) =>
            set(s => {
              s.templates[docType] = template;
            }),

          resetTemplate: docType =>
            set(s => {
              s.templates[docType] = buildDefaultTemplate(docType);
            }),

          importTemplate: template =>
            set(s => {
              s.templates[template.docType] = template;
            }),
        }),
        {
          name: 'bellepoule-pdf-templates',
          onRehydrateStorage: () => state => {
            if (!state) return;
            (['pool', 'tableau', 'ranking'] as PdfDocType[]).forEach(docType => {
              state.templates[docType] = migrateTemplate(state.templates[docType]);
            });
          },
        }
      )
    ),
    { name: 'PdfTemplateStore' }
  )
);
