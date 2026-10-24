/**
 * BellePoule Modern - Tournoi des rapières : ajout / modification d'une équipe (#1118)
 * Nom d'équipe, niveau, et les deux tireurs avec leur catégorie d'âge.
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useFocusTrap } from '../../renderer/hooks/useFocusTrap';
import { useTranslation } from '../../renderer/hooks/useTranslation';
import {
  RAPIERES_AGE_CATEGORIES,
  RAPIERES_GENDERS,
  RAPIERES_LEVELS,
  RapieresAgeCategory,
  RapieresFencer,
  RapieresGender,
  RapieresLevel,
  RapieresTeamInfo,
} from './rapieres.types';

export interface RapieresTeamDraft {
  name: string;
  info: RapieresTeamInfo;
}

interface RapieresTeamModalProps {
  /** Équipe modifiée (absente = ajout) */
  initial?: RapieresTeamDraft;
  onSave: (team: RapieresTeamDraft) => void | Promise<void>;
  onClose: () => void;
}

const emptyFencer = (): RapieresFencer => ({ firstName: '', lastName: '', category: 'SENIOR' });

const RapieresTeamModal: React.FC<RapieresTeamModalProps> = ({ initial, onSave, onClose }) => {
  const { t } = useTranslation();
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [name, setName] = useState(initial?.name ?? '');
  const [level, setLevel] = useState<RapieresLevel>(initial?.info.level ?? 'beginner');
  const [fencers, setFencers] = useState<[RapieresFencer, RapieresFencer]>(
    initial
      ? [{ ...initial.info.fencers[0] }, { ...initial.info.fencers[1] }]
      : [emptyFencer(), emptyFencer()]
  );
  const [error, setError] = useState(false);

  const setFencer = (i: 0 | 1, patch: Partial<RapieresFencer>) =>
    setFencers(prev => {
      const next: [RapieresFencer, RapieresFencer] = [{ ...prev[0] }, { ...prev[1] }];
      next[i] = { ...next[i], ...patch };
      return next;
    });

  const build = (): RapieresTeamDraft | null => {
    const clean = fencers.map(f => ({
      ...f,
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
    })) as [RapieresFencer, RapieresFencer];
    if (!name.trim() || clean.some(f => !f.lastName)) return null;
    return { name: name.trim(), info: { level, fencers: clean } };
  };

  const submit = async (e: React.FormEvent, keepOpen = false) => {
    e.preventDefault();
    const team = build();
    if (!team) {
      setError(true);
      return;
    }
    await onSave(team);
    if (keepOpen) {
      setName('');
      setFencers([emptyFencer(), emptyFencer()]);
      setError(false);
    } else onClose();
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
            {initial ? t('rapieres.edit_team') : t('rapieres.add_team')}
          </h2>
          <button className="btn-close" onClick={onClose} aria-label={t('rapieres.cancel')}>
            ×
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body" style={{ display: 'grid', gap: '1rem' }}>
            {error && (
              <div className="alert alert-warning" role="alert">
                {t('rapieres.team_incomplete')}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="rapieres-team-name">
                  {t('rapieres.team_name')} *
                </label>
                <input
                  id="rapieres-team-name"
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="rapieres-team-level">
                  {t('rapieres.level')}
                </label>
                <select
                  id="rapieres-team-level"
                  className="form-input"
                  value={level}
                  onChange={e => setLevel(e.target.value as RapieresLevel)}
                >
                  {RAPIERES_LEVELS.map(l => (
                    <option key={l} value={l}>
                      {t(`rapieres.level_${l}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {([0, 1] as const).map(i => (
              <fieldset key={i} style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend className="form-label" style={{ fontWeight: 600 }}>
                  {t('rapieres.fencer_n', { n: String(i + 1) })}
                </legend>
                <div
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}
                >
                  <div className="form-group">
                    <label className="form-label" htmlFor={`rapieres-f${i}-last`}>
                      {t('rapieres.last_name')} *
                    </label>
                    <input
                      id={`rapieres-f${i}-last`}
                      type="text"
                      className="form-input"
                      value={fencers[i].lastName}
                      onChange={e => setFencer(i, { lastName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor={`rapieres-f${i}-first`}>
                      {t('rapieres.first_name')}
                    </label>
                    <input
                      id={`rapieres-f${i}-first`}
                      type="text"
                      className="form-input"
                      value={fencers[i].firstName}
                      onChange={e => setFencer(i, { firstName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor={`rapieres-f${i}-cat`}>
                      {t('rapieres.category')}
                    </label>
                    <select
                      id={`rapieres-f${i}-cat`}
                      className="form-input"
                      value={fencers[i].category}
                      onChange={e =>
                        setFencer(i, { category: e.target.value as RapieresAgeCategory })
                      }
                    >
                      {RAPIERES_AGE_CATEGORIES.map(c => (
                        <option key={c} value={c}>
                          {t(`rapieres.cat_${c}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor={`rapieres-f${i}-gender`}>
                      {t('rapieres.gender')}
                    </label>
                    <select
                      id={`rapieres-f${i}-gender`}
                      className="form-input"
                      value={fencers[i].gender ?? ''}
                      onChange={e =>
                        setFencer(i, { gender: (e.target.value || undefined) as RapieresGender })
                      }
                    >
                      <option value="">{t('rapieres.gender_unset')}</option>
                      {RAPIERES_GENDERS.map(g => (
                        <option key={g} value={g}>
                          {t(g === 'M' ? 'genders.male' : 'genders.female')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </fieldset>
            ))}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('rapieres.cancel')}
            </button>
            {!initial && (
              <button type="button" className="btn btn-secondary" onClick={e => submit(e, true)}>
                {t('rapieres.save_and_add')}
              </button>
            )}
            <button type="submit" className="btn btn-primary">
              {t('rapieres.save_team')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RapieresTeamModal;
