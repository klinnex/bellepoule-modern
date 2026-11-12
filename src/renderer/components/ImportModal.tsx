/**
 * BellePoule Modern - Import Modal Component
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import Modal from './common/Modal';
import {
  TD,
  TD_CENTER,
  TD_LEFT,
  LIST_INDENT,
  TABLE,
  STICKY_HEAD,
  TH_CHECK,
  TAB_LIST,
  tabStyle,
  rowStyle,
} from './importModal.styles';
import { Fencer } from '../../shared/types';
import {
  parseFFEFile,
  parseXMLFile,
  parseSimpleTXTFile,
  ImportResult,
  ImportedReferee,
  importRankingFromFFF,
  RankingImportResult,
  resolveFencerFileFormat,
} from '../../shared/utils/fileParser';
import { Button } from './common/Button';

interface ImportModalProps {
  format: string;
  filepath: string;
  content: string;
  fencers: Fencer[];
  onImport: (fencers: Partial<Fencer>[]) => void | Promise<void>;
  onImportRanking?: (result: RankingImportResult) => void;
  /** Arbitres du bloc <Arbitres> d'un XML (#1504) */
  onImportReferees?: (referees: ImportedReferee[]) => void;
  onClose: () => void;
}

const ImportModal: React.FC<ImportModalProps> = ({
  format,
  filepath,
  content,
  fencers,
  onImport,
  onImportRanking,
  onImportReferees,
  onClose,
}) => {
  const { t } = useTranslation();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [rankingResult, setRankingResult] = useState<RankingImportResult | null>(null);
  const [selectedFencers, setSelectedFencers] = useState<Set<number>>(new Set());
  const [selectedReferees, setSelectedReferees] = useState<Set<number>>(new Set());
  // Liste affichée : tireurs ou arbitres du XML (#1504)
  const [view, setView] = useState<'fencers' | 'referees'>('fencers');
  const isRankingImport = format === 'ranking';

  React.useEffect(() => {
    if (isRankingImport) {
      const rankingImportResult = importRankingFromFFF(content, fencers);
      setRankingResult(rankingImportResult);
    }
  }, [content, fencers, isRankingImport]);

  React.useEffect(() => {
    if (!isRankingImport) {
      let parseResult: ImportResult;
      const effectiveFormat = resolveFencerFileFormat(format, content);

      if (effectiveFormat === 'xml') {
        parseResult = parseXMLFile(content);
      } else if (effectiveFormat === 'txt') {
        parseResult = parseSimpleTXTFile(content);
      } else {
        parseResult = parseFFEFile(content);
      }

      setResult(parseResult);
      setSelectedFencers(new Set(parseResult.fencers.map((_, i) => i)));
      const refs = parseResult.referees ?? [];
      setSelectedReferees(onImportReferees ? new Set(refs.map((_, i) => i)) : new Set());
      setView(parseResult.fencers.length === 0 && refs.length > 0 ? 'referees' : 'fencers');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, content, isRankingImport]);

  const referees = result?.referees ?? [];
  const showReferees = view === 'referees' && referees.length > 0;
  const listLength = showReferees ? referees.length : (result?.fencers.length ?? 0);
  const selected = showReferees ? selectedReferees : selectedFencers;
  const setSelected = showReferees ? setSelectedReferees : setSelectedFencers;
  const canSelect = !showReferees || !!onImportReferees;

  const toggleFencer = (index: number) => {
    if (!canSelect) return;
    const newSelected = new Set(selected);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelected(newSelected);
  };

  const toggleAll = () => {
    if (selected.size === listLength) {
      setSelected(new Set());
    } else {
      setSelected(new Set(Array.from({ length: listLength }, (_, i) => i)));
    }
  };

  const importLabel = () => {
    const nf = selectedFencers.size;
    const nr = selectedReferees.size;
    if (nr === 0) return t('importModal.import_n', { count: nf });
    if (nf === 0) return t('importModal.import_referees_n', { count: nr });
    return t('importModal.import_fencers_referees', { fencers: nf, referees: nr });
  };

  const handleImport = () => {
    if (isRankingImport && rankingResult && onImportRanking) {
      onImportRanking(rankingResult);
      onClose();
    } else if (result) {
      const fencersToImport = result.fencers.filter((_, i) => selectedFencers.has(i));
      const refereesToImport = referees.filter((_, i) => selectedReferees.has(i));
      // Arbitres après les tireurs : l'activation des arbitres part de la compétition à jour (#1504)
      const fencersDone =
        fencersToImport.length > 0 ? Promise.resolve(onImport(fencersToImport)) : Promise.resolve();
      if (refereesToImport.length > 0 && onImportReferees)
        void fencersDone.then(() => onImportReferees(refereesToImport));
      onClose();
    }
  };

  const filename = filepath.split(/[/\\]/).pop() || filepath;

  return (
    <Modal
      title={isRankingImport ? t('importModal.title_ranking') : t('importModal.title_fencers')}
      onClose={onClose}
      size="lg"
      scroll
      footer={
        <>
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={
              isRankingImport
                ? !rankingResult || rankingResult.updated === 0
                : selectedFencers.size === 0 && selectedReferees.size === 0
            }
          >
            {isRankingImport
              ? t('importModal.update_n', { count: rankingResult?.updated || 0 })
              : importLabel()}
          </Button>
        </>
      }
    >
      <div
        style={{
          marginBottom: '1rem',
          padding: '0.75rem',
          background: 'var(--color-bg)',
          borderRadius: '6px',
        }}
      >
        <strong>{t('importModal.file')}</strong> {filename}
        <br />
        <strong>{t('importModal.format')}</strong> {format.toUpperCase()}
      </div>

      {/* Affichage pour l'import de classement */}
      {isRankingImport && rankingResult && (
        <>
          {rankingResult.errors.length > 0 && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                background: '#fee2e2',
                borderRadius: '6px',
                color: '#dc2626',
              }}
            >
              <strong>{t('importModal.errors')}</strong>
              <ul style={LIST_INDENT}>
                {rankingResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              background: rankingResult.updated > 0 ? '#d1fae5' : '#fee2e2',
              borderRadius: '6px',
            }}
          >
            <strong>{t('importModal.result')}</strong>
            <ul style={LIST_INDENT}>
              <li>
                <span style={{ color: '#059669', fontWeight: 'bold' }}>
                  {rankingResult.updated}
                </span>{' '}
                {t('importModal.updated')}
              </li>
              <li>
                <span style={{ color: '#dc2626', fontWeight: 'bold' }}>
                  {rankingResult.notFound}
                </span>{' '}
                {t('importModal.not_found')}
              </li>
            </ul>
          </div>

          {rankingResult.details.length > 0 && (
            <>
              <div className="mb-2">
                <strong>{t('importModal.details')}</strong>
              </div>
              <div
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  maxHeight: '300px',
                  overflow: 'auto',
                }}
              >
                <table style={TABLE}>
                  <thead style={STICKY_HEAD}>
                    <tr>
                      <th style={TD_LEFT}>{t('importModal.last_name')}</th>
                      <th style={TD_LEFT}>{t('importModal.first_name')}</th>
                      <th style={TD_LEFT}>{t('importModal.club')}</th>
                      <th style={TD_CENTER}>{t('importModal.ranking')}</th>
                      <th style={TD_CENTER}>{t('importModal.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankingResult.details.map((detail, index) => (
                      <tr
                        key={index}
                        style={{
                          background: detail.matched ? '#d1fae5' : '#fee2e2',
                          borderBottom: '1px solid var(--color-border)',
                        }}
                      >
                        <td style={TD}>{detail.lastName}</td>
                        <td style={TD}>{detail.firstName}</td>
                        <td style={TD}>{detail.club || '-'}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 'bold' }}>
                          {detail.ranking}
                        </td>
                        <td style={TD_CENTER}>
                          {detail.matched ? (
                            <span style={{ color: '#059669' }}>{t('importModal.matched')}</span>
                          ) : (
                            <span style={{ color: '#dc2626' }}>{t('importModal.unmatched')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* Affichage pour l'import de tireurs (ancien code) */}
      {!isRankingImport && result && result.errors && result.errors.length > 0 && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            background: '#fee2e2',
            borderRadius: '6px',
            color: '#dc2626',
          }}
        >
          <strong>{t('importModal.errors')}</strong>
          <ul style={LIST_INDENT}>
            {result.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {!isRankingImport && result && result.warnings && result.warnings.length > 0 && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            background: '#fef3c7',
            borderRadius: '6px',
            color: '#d97706',
          }}
        >
          <strong>{t('importModal.warnings')}</strong>
          <ul
            style={{
              margin: '0.5rem 0 0 1rem',
              padding: 0,
              maxHeight: '100px',
              overflow: 'auto',
            }}
          >
            {result.warnings.map((warn, i) => (
              <li key={i}>{warn}</li>
            ))}
          </ul>
        </div>
      )}

      {!isRankingImport && result && (result.fencers.length > 0 || referees.length > 0) ? (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.5rem',
            }}
          >
            {result.referees ? (
              <span role="tablist" aria-label={t('importModal.list_choice')} style={TAB_LIST}>
                {(['fencers', 'referees'] as const).map(v => {
                  const active = (v === 'referees') === showReferees;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      disabled={v === 'referees' && referees.length === 0}
                      onClick={() => setView(v)}
                      style={tabStyle(active)}
                    >
                      <strong>{v === 'fencers' ? result.fencers.length : referees.length}</strong>{' '}
                      {t(v === 'fencers' ? 'importModal.found' : 'importModal.referees_found')}
                    </button>
                  );
                })}
              </span>
            ) : (
              <span>
                <strong>{result.fencers.length}</strong> {t('importModal.found')}
              </span>
            )}
            {canSelect && (
              <button
                onClick={toggleAll}
                style={{
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.875rem',
                  color: 'var(--color-text)',
                  background: 'var(--color-border)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                {selected.size === listLength
                  ? t('importModal.deselect_all')
                  : t('importModal.select_all')}
              </button>
            )}
          </div>

          <div
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              maxHeight: '300px',
              overflow: 'auto',
            }}
          >
            {showReferees ? (
              <table style={TABLE}>
                <thead style={STICKY_HEAD}>
                  <tr>
                    {canSelect && <th style={TH_CHECK}>✓</th>}
                    <th style={TD_LEFT}>{t('importModal.last_name')}</th>
                    <th style={TD_LEFT}>{t('importModal.first_name')}</th>
                    <th style={TD_CENTER}>{t('importModal.sex')}</th>
                    <th style={TD_LEFT}>{t('importModal.club')}</th>
                    <th style={TD_LEFT}>{t('importModal.referee_level')}</th>
                  </tr>
                </thead>
                <tbody>
                  {referees.map((referee, index) => (
                    <tr
                      key={index}
                      onClick={() => toggleFencer(index)}
                      style={rowStyle(selected.has(index), canSelect)}
                    >
                      {canSelect && (
                        <td style={TD_CENTER}>
                          <input
                            type="checkbox"
                            checked={selected.has(index)}
                            onChange={e => {
                              e.stopPropagation();
                              toggleFencer(index);
                            }}
                          />
                        </td>
                      )}
                      <td style={TD}>{referee.lastName}</td>
                      <td style={TD}>{referee.firstName}</td>
                      <td style={TD_CENTER}>{referee.gender}</td>
                      <td style={TD}>{referee.club || '-'}</td>
                      <td style={TD}>{referee.category || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table style={TABLE}>
                <thead style={STICKY_HEAD}>
                  <tr>
                    <th style={TH_CHECK}>✓</th>
                    <th style={TD_LEFT}>{t('importModal.last_name')}</th>
                    <th style={TD_LEFT}>{t('importModal.first_name')}</th>
                    <th style={TD_CENTER}>{t('importModal.sex')}</th>
                    <th style={TD_LEFT}>{t('importModal.club')}</th>
                    <th style={TD_CENTER}>{t('importModal.ranking')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.fencers.map((fencer, index) => (
                    <tr
                      key={index}
                      onClick={() => toggleFencer(index)}
                      style={rowStyle(selectedFencers.has(index), true)}
                    >
                      <td style={TD_CENTER}>
                        <input
                          type="checkbox"
                          checked={selectedFencers.has(index)}
                          onChange={e => {
                            e.stopPropagation();
                            toggleFencer(index);
                          }}
                        />
                      </td>
                      <td style={TD}>{fencer.lastName}</td>
                      <td style={TD}>{fencer.firstName}</td>
                      <td style={TD_CENTER}>{fencer.gender}</td>
                      <td style={TD}>{fencer.club || '-'}</td>
                      <td style={TD_CENTER}>{fencer.ranking || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : !isRankingImport && result ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-light)' }}>
          {t('importModal.none_in_file')}
        </div>
      ) : !isRankingImport ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>{t('importModal.loading')}</div>
      ) : null}
    </Modal>
  );
};

export default React.memo(ImportModal);
