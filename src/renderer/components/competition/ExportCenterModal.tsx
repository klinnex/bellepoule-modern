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
import type { XmlExportTarget } from '../../hooks/useExport';
import FtpPublishForm from './FtpPublishForm';
import { Button } from '../common/Button';

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
  exportResultsXML: (
    ranking: PoolRanking[],
    results: FinalResult[],
    pools?: Pool[],
    target?: XmlExportTarget
  ) => void | Promise<void>;
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
          <Button type="button" variant="primary" onClick={onClose}>
            {t('actions.close')}
          </Button>
        </>
      }
    >
      {onExportCompetition && (
        <Section title={t('competition.export_section')}>
          <Button onClick={onExportCompetition}>{t('competition.save_progress_bpm')}</Button>
        </Section>
      )}

      {fencers.length > 0 && (
        <Section title={t('exportCenter.fencers')}>
          <Button onClick={() => exportFencersList(fencers, 'txt')}>
            {t('exportCenter.list_txt')}
          </Button>
          <Button onClick={() => exportFencersList(fencers, 'fff')}>
            {t('exportCenter.list_fff')}
          </Button>
        </Section>
      )}

      {pools.length > 0 && (
        <Section title={t('exportCenter.pools')}>
          <Button onClick={() => exportPoolsPDF(pools, currentPoolRound)}>
            {t('exportCenter.export_pdf')}
          </Button>
          <Button onClick={() => printPoolsPDF(pools, currentPoolRound)}>
            {t('exportCenter.print')}
          </Button>
        </Section>
      )}

      {tableauMatchesCount > 0 && (
        <Section title={t('exportCenter.tableau')}>
          <Button onClick={onGoToTableau}>{t('exportCenter.go_tableau')}</Button>
        </Section>
      )}

      {overallRanking.length > 0 && (
        <Section title={t('exportCenter.ranking')}>
          <Button onClick={() => exportRanking(overallRanking, 'csv', isLaserSabre)}>CSV</Button>
          <Button onClick={() => exportRankingExcelCSV(overallRanking)}>
            {t('exportCenter.csv_excel')}
          </Button>
          <Button onClick={() => exportRanking(overallRanking, 'json', isLaserSabre)}>JSON</Button>
          <Button onClick={onExportFFE}>{t('exportCenter.send_ffe')}</Button>
        </Section>
      )}

      {finalResults.length > 0 && (
        <Section title={t('exportCenter.final_results')}>
          <Button onClick={() => exportResults(finalResults, 'csv')}>CSV</Button>
          <Button onClick={() => exportResults(finalResults, 'json')}>JSON</Button>
          <Button onClick={() => exportResultsHTML(overallRanking, finalResults)}>HTML</Button>
          <Button onClick={() => exportResultsXML(overallRanking, finalResults, pools)}>
            XML FFE
          </Button>
          <Button onClick={() => exportResultsXML(overallRanking, finalResults, pools, 'greg')}>
            {t('exportCenter.publish_greg')}
          </Button>
        </Section>
      )}

      {finalResults.length > 0 && (
        <Section title={t('exportCenter.ftp_section')}>
          <FtpPublishForm
            onPublish={config =>
              exportResultsXML(overallRanking, finalResults, pools, { ftp: config })
            }
          />
        </Section>
      )}

      {pools.length > 0 && overallRanking.length > 0 && (
        <Section title={t('exportCenter.stats')}>
          <Button onClick={() => exportDetailedStats(pools, overallRanking)}>
            {t('exportCenter.stats_csv')}
          </Button>
        </Section>
      )}

      {finalResults.length > 0 && (
        <Section title={t('exportCenter.full')}>
          <Button onClick={onGoToResults}>{t('exportCenter.go_results')}</Button>
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
