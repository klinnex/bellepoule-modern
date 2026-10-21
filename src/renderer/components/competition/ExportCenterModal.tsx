/**
 * BellePoule Modern - Centre d'export
 * Point d'entrée unique regroupant les exports jusque-là dispersés entre plusieurs vues
 * (poules, classement, résultats, tableau, export complet).
 * Licensed under GPL-3.0
 */

import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import Modal from '../common/Modal';
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
  /** Sauvegarde .bpm de la compétition dans son état actuel (#1117) */
  onExportCompetition?: () => void;
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
  onExportCompetition,
}) => {
  const { t } = useTranslation();
  return (
    <Modal
      title={t('exportCenter.title')}
      onClose={onClose}
      size="md"
      elevated
      scroll
      footer={
        <>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t('actions.close')}
          </button>
        </>
      }
    >
      {onExportCompetition && (
        <Section title={t('competition.export_section')}>
          <button className="btn btn-secondary" onClick={onExportCompetition}>
            {t('competition.save_progress_bpm')}
          </button>
        </Section>
      )}

      {fencers.length > 0 && (
        <Section title={t('exportCenter.fencers')}>
          <button className="btn btn-secondary" onClick={() => exportFencersList(fencers, 'txt')}>
            {t('exportCenter.list_txt')}
          </button>
          <button className="btn btn-secondary" onClick={() => exportFencersList(fencers, 'fff')}>
            {t('exportCenter.list_fff')}
          </button>
        </Section>
      )}

      {pools.length > 0 && (
        <Section title={t('exportCenter.pools')}>
          <button
            className="btn btn-secondary"
            onClick={() => exportPoolsPDF(pools, currentPoolRound)}
          >
            {t('exportCenter.export_pdf')}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => printPoolsPDF(pools, currentPoolRound)}
          >
            {t('exportCenter.print')}
          </button>
        </Section>
      )}

      {tableauMatchesCount > 0 && (
        <Section title={t('exportCenter.tableau')}>
          <button className="btn btn-secondary" onClick={onGoToTableau}>
            {t('exportCenter.go_tableau')}
          </button>
        </Section>
      )}

      {overallRanking.length > 0 && (
        <Section title={t('exportCenter.ranking')}>
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
            {t('exportCenter.csv_excel')}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => exportRanking(overallRanking, 'json', isLaserSabre)}
          >
            JSON
          </button>
          <button className="btn btn-secondary" onClick={onExportFFE}>
            {t('exportCenter.send_ffe')}
          </button>
        </Section>
      )}

      {finalResults.length > 0 && (
        <Section title={t('exportCenter.final_results')}>
          <button className="btn btn-secondary" onClick={() => exportResults(finalResults, 'csv')}>
            CSV
          </button>
          <button className="btn btn-secondary" onClick={() => exportResults(finalResults, 'json')}>
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
        <Section title={t('exportCenter.stats')}>
          <button
            className="btn btn-secondary"
            onClick={() => exportDetailedStats(pools, overallRanking)}
          >
            {t('exportCenter.stats_csv')}
          </button>
        </Section>
      )}

      {finalResults.length > 0 && (
        <Section title={t('exportCenter.full')}>
          <button className="btn btn-secondary" onClick={onGoToResults}>
            {t('exportCenter.go_results')}
          </button>
        </Section>
      )}

      {fencers.length === 0 && pools.length === 0 && (
        <p style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
          {t('exportCenter.empty')}
        </p>
      )}
    </Modal>
  );
};

export default React.memo(ExportCenterModal);
