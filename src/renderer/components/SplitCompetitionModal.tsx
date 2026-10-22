/**
 * BellePoule Modern - Nom de la compétition séparée (compétition couplée)
 * Licensed under GPL-3.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';

interface SplitCompetitionModalProps {
  groupLabel: string;
  fencerCount: number;
  defaultTitle: string;
  onConfirm: (title: string) => void;
  onCancel: () => void;
}

const SplitCompetitionModal: React.FC<SplitCompetitionModalProps> = ({
  groupLabel,
  fencerCount,
  defaultTitle,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState(defaultTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) onConfirm(title.trim());
  };

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      onKeyDown={e => e.key === 'Escape' && onCancel()}
    >
      <form
        className="modal"
        onClick={e => e.stopPropagation()}
        onSubmit={submit}
        style={{ maxWidth: '460px' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="split-competition-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="split-competition-title">
            {t('splitCompetition.title', { group: groupLabel })}
          </h2>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0 }}>{t('splitCompetition.text', { count: fencerCount })}</p>
          <div className="form-group">
            <label className="form-label" htmlFor="split-competition-name">
              {t('splitCompetition.name')}
            </label>
            <input
              ref={inputRef}
              id="split-competition-name"
              className="form-input"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t('actions.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!title.trim()}>
            {t('splitCompetition.create')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SplitCompetitionModal;
