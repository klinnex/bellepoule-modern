/**
 * BellePoule Modern - Modal Save/Load de formules nommées
 */

import React, { useRef, useState, memo } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useTranslation } from '../../hooks/useTranslation';
import { CustomFormulaConfig } from '../../../shared/types';
import {
  deleteCustomFormulaTemplate,
  exportFormulaAsJSON,
  getCustomFormulaTemplates,
  importFormulaFromJSON,
  saveCustomFormulaTemplate,
} from '../../../shared/utils/tournamentTemplates';
import { getActiveLocale } from '../../../shared/utils/localeFormat';

interface Props {
  mode: 'save' | 'load';
  currentFormula?: CustomFormulaConfig;
  onLoad: (formula: CustomFormulaConfig) => void;
  onClose: () => void;
}

const FormulaTemplateModal_: React.FC<Props> = ({ mode, currentFormula, onLoad, onClose }) => {
  const { t } = useTranslation();
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [name, setName] = useState('');
  const [templates, setTemplates] = useState(() => getCustomFormulaTemplates());
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => setTemplates(getCustomFormulaTemplates());

  const handleSave = () => {
    if (!name.trim()) {
      setError(t('formulaTemplate.name_required'));
      return;
    }
    if (!currentFormula) return;
    saveCustomFormulaTemplate(name.trim(), currentFormula);
    refresh();
    setError('');
    setName('');
  };

  const handleDelete = (templateName: string) => {
    deleteCustomFormulaTemplate(templateName);
    refresh();
  };

  const handleExport = (formula: CustomFormulaConfig, templateName: string) => {
    const json = exportFormulaAsJSON(formula);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `formule-${templateName.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const json = ev.target?.result as string;
      const formula = importFormulaFromJSON(json);
      if (formula) {
        onLoad(formula);
        onClose();
      } else {
        setError(t('formulaTemplate.invalid_file'));
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2 className="modal-title">
            {mode === 'save' ? t('formulaTemplate.save_title') : t('formulaTemplate.load_title')}
          </h2>
          <button
            className="btn btn-icon btn-secondary"
            onClick={onClose}
            aria-label={t('actions.close')}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          {mode === 'save' && (
            <div className="form-group">
              <label className="form-label">{t('formulaTemplate.name')}</label>
              <div className="input-row">
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('formulaTemplate.name_ph')}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  autoFocus
                />
                <button type="button" className="btn btn-primary" onClick={handleSave}>
                  {t('formulaTemplate.save')}
                </button>
              </div>
              {error && <p className="form-error">{error}</p>}
            </div>
          )}

          <div className="template-list">
            {templates.length === 0 ? (
              <p className="template-empty">{t('formulaTemplate.empty')}</p>
            ) : (
              templates.map(entry => (
                <div key={entry.name} className="template-entry">
                  <div className="template-entry-info">
                    <strong>{entry.name}</strong>
                    <span className="template-entry-date">
                      {new Date(entry.savedAt).toLocaleDateString(getActiveLocale())}
                    </span>
                    <span className="template-entry-phases">
                      {t('formulaTemplate.phases', { count: entry.formula.phases.length })}
                    </span>
                  </div>
                  <div className="template-entry-actions">
                    {mode === 'load' && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          onLoad(entry.formula);
                          onClose();
                        }}
                      >
                        {t('formulaTemplate.load')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleExport(entry.formula, entry.name)}
                    >
                      {t('formulaTemplate.export_json')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(entry.name)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {mode === 'load' && (
            <div className="template-import-section">
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportFile}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => fileRef.current?.click()}
              >
                {t('formulaTemplate.import_json')}
              </button>
              {error && <p className="form-error">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const FormulaTemplateModal = memo(FormulaTemplateModal_);
