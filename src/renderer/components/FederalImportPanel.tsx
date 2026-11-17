/**
 * BellePoule Modern - « Partir des fichiers de la fédération » dans Nouvelle compétition (#1938)
 * Licensed under GPL-3.0
 */
import React, { useState } from 'react';
import { FileUp, Lock, Unlock, X } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import type { useFederalImport } from '../hooks/useFederalImport';
import type { FederalNotice, FencerConflict } from '../../shared/utils/fileParser/federalImport';
import { Button } from './common/Button';

const MAX_CONFLICTS_SHOWN = 8;
const DOMAINS = ['I', 'N', 'R', 'L', 'C'];

interface FederalImportPanelProps {
  state: ReturnType<typeof useFederalImport>;
  /** Avertissements calculés par la fenêtre (date passée…) */
  extraNotices: FederalNotice[];
  locked: boolean;
  onUnlock: () => void;
}

const FederalImportPanel: React.FC<FederalImportPanelProps> = ({
  state,
  extraNotices,
  locked,
  onUnlock,
}) => {
  const { t } = useTranslation();
  const [dragOver, setDragOver] = useState(false);
  const { result, names, loading, error, source, setSource, pick, drop, clear, payload } = state;

  const noticeText = (n: FederalNotice) =>
    t(`federalImport.notice_${n.code}`, { value: n.value ?? '' });
  const conflictText = (c: FencerConflict) =>
    t(`federalImport.conflict_${c.field}`, {
      name: `${c.lastName} ${c.firstName}`.trim(),
      xml: c.xml ?? '',
      fff: c.fff ?? '',
    });

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void drop(Array.from(e.dataTransfer.files));
  };

  if (!result) {
    return (
      <div
        className={`federal-import-drop${dragOver ? ' is-over' : ''}`}
        onDragOver={e => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        data-testid="federal-import-drop"
      >
        <FileUp size={18} aria-hidden="true" />
        <div className="federal-import-text">
          <strong>{t('federalImport.title')}</strong>
          <span>{loading ? t('federalImport.loading') : t('federalImport.hint')}</span>
          {error && (
            <span className="federal-import-error">
              {t('federalImport.error', { message: error })}
            </span>
          )}
        </div>
        <Button type="button" onClick={() => void pick()} disabled={loading}>
          {t('federalImport.choose')}
        </Button>
      </div>
    );
  }

  const federal = result.header?.federal;
  const notices = [...result.notices, ...extraNotices];
  const domain = federal?.domain?.toUpperCase();

  return (
    <div className="federal-import-panel" data-testid="federal-import-panel">
      <div className="federal-import-head">
        <strong>{t('federalImport.files', { names: names.join(', ') })}</strong>
        <button
          type="button"
          className="btn-close"
          onClick={clear}
          aria-label={t('federalImport.clear')}
          title={t('federalImport.clear')}
        >
          <X size={14} />
        </button>
      </div>

      {federal && (
        <div className="federal-import-meta">
          {federal.id && <span>{t('federalImport.federal_id', { id: federal.id })}</span>}
          {federal.season && <span>{t('federalImport.season', { season: federal.season })}</span>}
          {domain && (
            <span>
              {t('federalImport.domain', {
                domain: DOMAINS.includes(domain) ? t(`federalImport.domain_${domain}`) : domain,
              })}
            </span>
          )}
          {federal.championship && <span>{federal.championship}</span>}
        </div>
      )}

      {payload && (
        <div className="federal-import-summary">
          {t('federalImport.summary', {
            fencers: payload.fencers.length,
            teams: payload.teams.length,
            referees: payload.referees.length,
          })}
        </div>
      )}

      {federal && (
        <div className={`federal-import-lock${locked ? '' : ' is-unlocked'}`}>
          {locked ? <Lock size={14} aria-hidden="true" /> : <Unlock size={14} aria-hidden="true" />}
          <span>{locked ? t('federalImport.locked') : t('federalImport.unlocked_warning')}</span>
          {locked && (
            <Button type="button" size="sm" onClick={onUnlock}>
              {t('federalImport.unlock')}
            </Button>
          )}
        </div>
      )}

      {result.conflicts.length > 0 && (
        <div className="federal-import-conflicts" role="alert">
          <strong>{t('federalImport.conflicts_title', { count: result.conflicts.length })}</strong>
          <ul>
            {result.conflicts.slice(0, MAX_CONFLICTS_SHOWN).map(c => (
              <li key={`${c.key}-${c.field}`}>{conflictText(c)}</li>
            ))}
          </ul>
          {result.conflicts.length > MAX_CONFLICTS_SHOWN && (
            <div>
              {t('federalImport.conflicts_more', {
                count: result.conflicts.length - MAX_CONFLICTS_SHOWN,
              })}
            </div>
          )}
          <div className="federal-import-source" role="radiogroup">
            <span>{t('federalImport.source_label')}</span>
            {(['xml', 'fff'] as const).map(s => (
              <label key={s} className="u-row cursor-pointer">
                <input
                  type="radio"
                  name="federal-source"
                  checked={source === s}
                  onChange={() => setSource(s)}
                />
                {t(`federalImport.source_${s}`)}
              </label>
            ))}
          </div>
        </div>
      )}

      {notices.length > 0 && (
        <ul className="federal-import-notices">
          {notices.map((n, i) => (
            <li key={`${n.code}-${i}`}>{noticeText(n)}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default FederalImportPanel;
