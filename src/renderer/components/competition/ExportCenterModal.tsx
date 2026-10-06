/**
 * BellePoule Modern - Centre d'export
 * Point d'entrée unique regroupant les exports jusque-là dispersés entre plusieurs vues
 * (poules, classement, résultats, tableau, export complet).
 * Licensed under GPL-3.0
 */

import React from 'react';
import { Fencer, Pool, PoolRanking } from '../../../shared/types';
import { FinalResult } from '../tableau/tableauTypes';

interface ExportCenterModalProps {
  fencers: Fencer[];
  pools: Pool[];
  currentPoolRound: number;
  overallRanking: PoolRanking[];
  finalResults: FinalResult[];
  tableauMatchesCount: number;
  isLaserSabre: boolean;
  onClose: () => void;
  exportFencersList: (fencers: Fencer[], format: 'txt' | 'fff') => void | Promise<void>;
  exportPoolsPDF: (pools: Pool[], round: number) => void | Promise<void>;
  printPoolsPDF: (pools: Pool[], round: number) => void | Promise<void>;
  exportRanking: (ranking: PoolRanking[], format: 'csv' | 'json', isLaserSabre: boolean) => void;
  exportRankingExcelCSV: (ranking: PoolRanking[]) => void;
  exportResults: (results: FinalResult[], format: 'csv' | 'json') => void;
  exportResultsHTML: (ranking: PoolRanking[], results: FinalResult[]) => void;
  exportResultsXML: (ranking: PoolRanking[], results: FinalResult[], pools?: Pool[]) => void;
  exportDetailedStats: (pools: Pool[], ranking: PoolRanking[]) => void;
  onGoToTableau: () => void;
  onGoToResults: () => void;
  onExportFFE: () => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: '1.25rem' }}>
    <h3
      style={{
        fontSize: '0.8125rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        color: 'var(--color-text-light)',
        marginBottom: '0.5rem',
      }}
    >
      {title}
    </h3>
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>{children}</div>
  </div>
);

const ExportCenterModal: React.FC<ExportCenterModalProps> = ({
  fencers,
  pools,
  currentPoolRound,
  overallRanking,
  finalResults,
  tableauMatchesCount,
  isLaserSabre,
  onClose,
  exportFencersList,
  exportPoolsPDF,
  printPoolsPDF,
  exportRanking,
  exportRankingExcelCSV,
  exportResults,
  exportResultsHTML,
  exportResultsXML,
  exportDetailedStats,
  onGoToTableau,
  onGoToResults,
  onExportFFE,
}) => {
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 11000 }}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '620px', maxHeight: '85vh', overflowY: 'auto' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-center-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="export-center-title">
            📤 Centre d'export
          </h2>
        </div>
        <div className="modal-body">
          {fencers.length > 0 && (
            <Section title="Tireurs">
              <button
                className="btn btn-secondary"
                onClick={() => exportFencersList(fencers, 'txt')}
              >
                Liste (.txt)
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => exportFencersList(fencers, 'fff')}
              >
                Liste FFE (.fff)
              </button>
            </Section>
          )}

          {pools.length > 0 && (
            <Section title="Poules">
              <button
                className="btn btn-secondary"
                onClick={() => exportPoolsPDF(pools, currentPoolRound)}
              >
                Export PDF
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => printPoolsPDF(pools, currentPoolRound)}
              >
                Imprimer
              </button>
            </Section>
          )}

          {tableauMatchesCount > 0 && (
            <Section title="Tableau d'élimination">
              <button className="btn btn-secondary" onClick={onGoToTableau}>
                Aller à Tableau pour l'export PDF →
              </button>
            </Section>
          )}

          {overallRanking.length > 0 && (
            <Section title="Classement">
              <button
                className="btn btn-secondary"
                onClick={() => exportRanking(overallRanking, 'csv', isLaserSabre)}
              >
                CSV
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => exportRankingExcelCSV(overallRanking)}
              >
                CSV Excel
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => exportRanking(overallRanking, 'json', isLaserSabre)}
              >
                JSON
              </button>
              <button className="btn btn-secondary" onClick={onExportFFE}>
                📡 Envoyer à la FFE
              </button>
            </Section>
          )}

          {finalResults.length > 0 && (
            <Section title="Résultats finaux">
              <button
                className="btn btn-secondary"
                onClick={() => exportResults(finalResults, 'csv')}
              >
                CSV
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => exportResults(finalResults, 'json')}
              >
                JSON
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => exportResultsHTML(overallRanking, finalResults)}
              >
                HTML
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => exportResultsXML(overallRanking, finalResults, pools)}
              >
                XML FFE
              </button>
            </Section>
          )}

          {pools.length > 0 && overallRanking.length > 0 && (
            <Section title="Statistiques">
              <button
                className="btn btn-secondary"
                onClick={() => exportDetailedStats(pools, overallRanking)}
              >
                Stats détaillées (CSV)
              </button>
            </Section>
          )}

          {finalResults.length > 0 && (
            <Section title="Export complet compétition">
              <button className="btn btn-secondary" onClick={onGoToResults}>
                Aller à Résultats pour l'export complet →
              </button>
            </Section>
          )}

          {fencers.length === 0 && pools.length === 0 && (
            <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
              Aucune donnée à exporter pour le moment — ajoutez des tireurs pour commencer.
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ExportCenterModal);
