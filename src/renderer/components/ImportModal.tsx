/**
 * BellePoule Modern - Import Modal Component
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { TD, TD_CENTER, TD_LEFT, LIST_INDENT, TABLE, STICKY_HEAD } from './importModal.styles';
import { Fencer } from '../../shared/types';
import {
  parseFFEFile,
  parseXMLFile,
  parseSimpleTXTFile,
  ImportResult,
  importRankingFromFFF,
  RankingImportResult,
  resolveFencerFileFormat,
} from '../../shared/utils/fileParser';

interface ImportModalProps {
  format: string;
  filepath: string;
  content: string;
  fencers: Fencer[];
  onImport: (fencers: Partial<Fencer>[]) => void;
  onImportRanking?: (result: RankingImportResult) => void;
  onClose: () => void;
}

const ImportModal: React.FC<ImportModalProps> = ({
  format,
  filepath,
  content,
  fencers,
  onImport,
  onImportRanking,
  onClose,
}) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [rankingResult, setRankingResult] = useState<RankingImportResult | null>(null);
  const [selectedFencers, setSelectedFencers] = useState<Set<number>>(new Set());
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
    }
  }, [format, content, isRankingImport]);

  const toggleFencer = (index: number) => {
    const newSelected = new Set(selectedFencers);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedFencers(newSelected);
  };

  const toggleAll = () => {
    if (result) {
      if (selectedFencers.size === result.fencers.length) {
        setSelectedFencers(new Set());
      } else {
        setSelectedFencers(new Set(result.fencers.map((_, i) => i)));
      }
    }
  };

  const handleImport = () => {
    if (isRankingImport && rankingResult && onImportRanking) {
      onImportRanking(rankingResult);
      onClose();
    } else if (result) {
      const fencersToImport = result.fencers.filter((_, i) => selectedFencers.has(i));
      onImport(fencersToImport);
      onClose();
    }
  };

  const filename = filepath.split(/[/\\]/).pop() || filepath;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2>{isRankingImport ? 'Importer un classement' : 'Importer des tireurs'}</h2>
          <button className="btn-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflow: 'auto' }}>
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              background: 'var(--color-bg)',
              borderRadius: '6px',
            }}
          >
            <strong>Fichier:</strong> {filename}
            <br />
            <strong>Format:</strong> {format.toUpperCase()}
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
                  <strong>Erreurs:</strong>
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
                <strong>Résultat:</strong>
                <ul style={LIST_INDENT}>
                  <li>
                    <span style={{ color: '#059669', fontWeight: 'bold' }}>
                      {rankingResult.updated}
                    </span>{' '}
                    tireurs trouvés et mis à jour
                  </li>
                  <li>
                    <span style={{ color: '#dc2626', fontWeight: 'bold' }}>
                      {rankingResult.notFound}
                    </span>{' '}
                    tireurs non trouvés dans la liste d'appel
                  </li>
                </ul>
              </div>

              {rankingResult.details.length > 0 && (
                <>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Détails des mises à jour:</strong>
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
                          <th style={TD_LEFT}>Nom</th>
                          <th style={TD_LEFT}>Prénom</th>
                          <th style={TD_LEFT}>Club</th>
                          <th style={TD_CENTER}>Classement</th>
                          <th style={TD_CENTER}>Statut</th>
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
                            <td
                              style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 'bold' }}
                            >
                              {detail.ranking}
                            </td>
                            <td style={TD_CENTER}>
                              {detail.matched ? (
                                <span style={{ color: '#059669' }}>✓ Mis à jour</span>
                              ) : (
                                <span style={{ color: '#dc2626' }}>✗ Non trouvé</span>
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
              <strong>Erreurs:</strong>
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
              <strong>Avertissements:</strong>
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

          {!isRankingImport && result && result.fencers.length > 0 ? (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}
              >
                <span>
                  <strong>{result.fencers.length}</strong> tireurs trouvés
                </span>
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
                  {selectedFencers.size === result.fencers.length
                    ? 'Désélectionner tout'
                    : 'Sélectionner tout'}
                </button>
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
                      <th style={{ padding: '0.5rem', textAlign: 'center', width: '40px' }}>✓</th>
                      <th style={TD_LEFT}>Nom</th>
                      <th style={TD_LEFT}>Prénom</th>
                      <th style={TD_CENTER}>Sexe</th>
                      <th style={TD_LEFT}>Club</th>
                      <th style={TD_CENTER}>Classement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.fencers.map((fencer, index) => (
                      <tr
                        key={index}
                        onClick={() => toggleFencer(index)}
                        style={{
                          cursor: 'pointer',
                          background: selectedFencers.has(index)
                            ? 'var(--color-primary)'
                            : 'transparent',
                          color: selectedFencers.has(index) ? '#FFFFFF' : 'var(--color-text)',
                          borderBottom: '1px solid var(--color-border)',
                        }}
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
              </div>
            </>
          ) : !isRankingImport && result ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-light)' }}>
              Aucun tireur trouvé dans ce fichier
            </div>
          ) : !isRankingImport ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>Chargement...</div>
          ) : null}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={
              isRankingImport
                ? !rankingResult || rankingResult.updated === 0
                : selectedFencers.size === 0
            }
          >
            {isRankingImport
              ? `Mettre à jour ${rankingResult?.updated || 0} classement${(rankingResult?.updated || 0) > 1 ? 's' : ''}`
              : `Importer ${selectedFencers.size} tireur${selectedFencers.size > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ImportModal);
