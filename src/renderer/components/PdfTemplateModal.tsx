import React, { useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useTranslation } from '../hooks/useTranslation';
import { usePdfTemplateStore } from '../../features/pdfTemplates/hooks/usePdfTemplateStore';
import PdfTemplateEditor from './PdfTemplateEditor';
import PdfPreview from './PdfPreview';
import type { PdfDocType, PdfTemplate } from '../../shared/types/pdfTemplate.types';
import { Button } from './common/Button';

interface Props {
  onClose: () => void;
}

const DOC_TYPES: PdfDocType[] = ['pool', 'tableau', 'ranking'];

const PdfTemplateModal: React.FC<Props> = ({ onClose }) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const { t } = useTranslation();
  const [activeType, setActiveType] = useState<PdfDocType>('pool');
  const { templates, setTemplate, resetTemplate } = usePdfTemplateStore();

  const current = templates[activeType];

  const handleChange = (updated: PdfTemplate) => setTemplate(activeType, updated);
  const handleReset = () => resetTemplate(activeType);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal pdf-template-modal-1"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header flex-shrink-0">
          <h2 className="modal-title">{t('pdfTemplate.modalTitle')}</h2>
          <Button
            aria-label={t('actions.close')}

            style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
            onClick={onClose}
          >
            ✕
          </Button>
        </div>

        {/* Type selector */}
        <div className="pdf-template-modal-2">
          {DOC_TYPES.map(type => (
            <Button
              key={type}
              variant={activeType === type ? 'primary' : 'secondary'}
              style={{ fontSize: '0.85rem' }}
              onClick={() => setActiveType(type)}
            >
              {t(`pdfTemplate.docType.${type}`)}
            </Button>
          ))}
        </div>

        {/* Body: editor + preview side by side */}
        <div className="pdf-template-modal-3">
          {/* Left: editor */}
          <div className="pdf-template-modal-4">
            <PdfTemplateEditor template={current} onChange={handleChange} onReset={handleReset} />
          </div>

          {/* Right: live preview */}
          <div className="pdf-template-modal-5">
            <div className="pdf-template-modal-6">{t('pdfModal.preview')}</div>
            <PdfPreview template={current} docType={activeType} />
          </div>
        </div>

        <div className="modal-footer flex-shrink-0">
          <Button variant="primary" onClick={onClose}>
            {t('actions.close') || 'Fermer'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(PdfTemplateModal);
