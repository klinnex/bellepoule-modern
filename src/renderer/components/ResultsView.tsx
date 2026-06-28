/**
 * BellePoule Modern - Results View Component
 * Final competition results display
 * Licensed under GPL-3.0
 */

import React from 'react';
import { Fencer, PoolRanking, Competition, FencerStatus } from '../../shared/types';
import type { Pool } from '../../shared/types';
import { useToast } from './Toast';
import { exportResultsXMLFFE } from '../../shared/utils/multiFormatExport';
// pdfExport (jsPDF) chargé à la demande pour alléger le bundle initial
import type { TableauMatchForPDF, FinalResultForPDF } from '../../shared/utils/pdfExport';
import { usePdfTemplateStore } from '../../features/pdfTemplates/hooks/usePdfTemplateStore';
import type { ConsolationBracket, TableauMatch } from './tableau/tableauTypes';
import { logger, LogCategory } from '@shared/services/logger';

interface FinalResult {
  rank: number;
  fencer: Fencer;
  eliminatedAt?: string; // "Finale", "Demi-finale", etc.
}

interface ResultsViewProps {
  competition: Competition;
  poolRanking: PoolRanking[];
  finalResults: FinalResult[];
  fencers?: Fencer[];
  pools?: Pool[];
  tableauMatches?: TableauMatch[];
  consolationBrackets?: ConsolationBracket[];
  isLaserSabre?: boolean;
  /** Tireurs triés/filtrés tels qu'affichés dans l'appel */
  appelFencers?: Fencer[];
  /** Colonnes visibles telles que configurées dans l'appel */
  appelVisibleColumns?: string[];
}

// ─── Static style constants ───────────────────────────────────────────────────

const RV_STYLES = {
  wrapper: { padding: '2rem', maxWidth: '900px', margin: '0 auto' } satisfies React.CSSProperties,
  champHeader: { textAlign: 'center' as const, padding: '2rem', background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', borderRadius: '12px', marginBottom: '2rem', color: 'white', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' } satisfies React.CSSProperties,
  champTrophy: { fontSize: '4rem', marginBottom: '0.5rem' } satisfies React.CSSProperties,
  champTitle: { fontSize: '1.5rem', marginBottom: '0.5rem' } satisfies React.CSSProperties,
  champName: { fontSize: '2rem', fontWeight: '700' } satisfies React.CSSProperties,
  champClub: { opacity: 0.9, marginTop: '0.5rem' } satisfies React.CSSProperties,
  podiumRow: { display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '1rem', marginBottom: '2rem', padding: '1rem' } satisfies React.CSSProperties,
  podium2: { textAlign: 'center' as const, background: '#e5e7eb', padding: '1rem', borderRadius: '8px 8px 0 0', minWidth: '150px', height: '120px', display: 'flex', flexDirection: 'column' as const, justifyContent: 'flex-end' as const } satisfies React.CSSProperties,
  podium2Medal: { fontSize: '2rem' } satisfies React.CSSProperties,
  podium2Name: { fontWeight: '600', fontSize: '0.875rem' } satisfies React.CSSProperties,
  podium2Place: { fontSize: '0.75rem', color: '#6b7280' } satisfies React.CSSProperties,
  podium1: { textAlign: 'center' as const, background: '#fef3c7', padding: '1rem', borderRadius: '8px 8px 0 0', minWidth: '150px', height: '160px', display: 'flex', flexDirection: 'column' as const, justifyContent: 'flex-end' as const, border: '2px solid #f59e0b' } satisfies React.CSSProperties,
  podium1Medal: { fontSize: '2.5rem' } satisfies React.CSSProperties,
  podium1Name: { fontWeight: '700', fontSize: '1rem' } satisfies React.CSSProperties,
  podium1Place: { fontSize: '0.875rem', color: '#92400e' } satisfies React.CSSProperties,
  podium3: { textAlign: 'center' as const, background: '#fed7aa', padding: '1rem', borderRadius: '8px 8px 0 0', minWidth: '150px', height: '100px', display: 'flex', flexDirection: 'column' as const, justifyContent: 'flex-end' as const } satisfies React.CSSProperties,
  podium3Medal: { fontSize: '1.5rem' } satisfies React.CSSProperties,
  podium3Name: { fontWeight: '600', fontSize: '0.875rem' } satisfies React.CSSProperties,
  podium3Place: { fontSize: '0.75rem', color: '#6b7280' } satisfies React.CSSProperties,
  tableWrapper: { background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', overflow: 'hidden' } satisfies React.CSSProperties,
  tableHeader: { padding: '1rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: '600' } satisfies React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const } satisfies React.CSSProperties,
  thead: { background: '#f9fafb', borderBottom: '2px solid #e5e7eb' } satisfies React.CSSProperties,
  thRank: { padding: '0.75rem', textAlign: 'left' as const, width: '60px' } satisfies React.CSSProperties,
  thLeft: { padding: '0.75rem', textAlign: 'left' as const } satisfies React.CSSProperties,
  thCenter: { padding: '0.75rem', textAlign: 'center' as const } satisfies React.CSSProperties,
  tdPad: { padding: '0.75rem' } satisfies React.CSSProperties,
  tdMedalSpan: { marginRight: '0.5rem' } satisfies React.CSSProperties,
  tdClub: { padding: '0.75rem', color: '#6b7280' } satisfies React.CSSProperties,
  tdElim: { padding: '0.75rem', textAlign: 'center' as const, color: '#6b7280' } satisfies React.CSSProperties,
  exportRow: { display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem', flexWrap: 'wrap' as const } satisfies React.CSSProperties,
  btnPrint: { padding: '0.75rem 1.5rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' } satisfies React.CSSProperties,
  btnCopy: { padding: '0.75rem 1.5rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' } satisfies React.CSSProperties,
  btnCsv: { padding: '0.75rem 1.5rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' } satisfies React.CSSProperties,
  btnXml: { padding: '0.75rem 1.5rem', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' } satisfies React.CSSProperties,
  btnPdf: { padding: '0.75rem 1.5rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' } satisfies React.CSSProperties,
  btnFullPdf: { padding: '0.75rem 1.5rem', background: '#166534', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' } satisfies React.CSSProperties,
  legend: { textAlign: 'center' as const, marginTop: '1.5rem', fontSize: '0.875rem', color: '#6b7280' } satisfies React.CSSProperties,
  spinner: { display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'rv-spin 0.7s linear infinite' } satisfies React.CSSProperties,
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: '1rem', zIndex: 9999 } satisfies React.CSSProperties,
  overlaySpinner: { width: '48px', height: '48px', border: '5px solid rgba(255,255,255,0.3)', borderTopColor: '#fbbf24', borderRadius: '50%', animation: 'rv-spin 0.8s linear infinite' } satisfies React.CSSProperties,
  overlayText: { color: 'white', fontSize: '1.1rem', fontWeight: 600 } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;

const ResultsView: React.FC<ResultsViewProps> = ({
  competition, poolRanking, finalResults,
  fencers, pools, tableauMatches, consolationBrackets, isLaserSabre,
  appelFencers, appelVisibleColumns,
}) => {
  const { showToast } = useToast();
  const rankingTemplate = usePdfTemplateStore(s => s.templates.ranking);
  const [isExportingFull, setIsExportingFull] = React.useState(false);

  const getMedalEmoji = (rank: number): string => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
  };

  const getRowStyle = (rank: number): React.CSSProperties => {
    if (rank === 1) return { background: '#fef3c7', fontWeight: '600' };
    if (rank === 2) return { background: '#f3f4f6', fontWeight: '500' };
    if (rank === 3) return { background: '#fed7aa', fontWeight: '500' };
    return {};
  };

  const resultsToDisplay = (() => {
    if (finalResults.length === 0) {
      return poolRanking.map((pr, idx) => ({
        rank: idx + 1,
        fencer: pr.fencer,
        eliminatedAt: 'Poules' as const,
      }));
    }
    const tableauIds = new Set(finalResults.map(r => r.fencer.id));
    const poolEliminated = poolRanking
      .filter(pr => !tableauIds.has(pr.fencer.id))
      .map((pr, idx) => ({
        rank: finalResults.length + idx + 1,
        fencer: pr.fencer,
        eliminatedAt: 'Poules' as const,
      }));
    return [...finalResults, ...poolEliminated];
  })();

  // Export CSV
  const exportCSV = () => {
    const headers = ['Rang', 'Nom', 'Prénom', 'Club', 'Statut', 'Éliminé à'];

    const getStatusLabel = (status: FencerStatus) => {
      switch (status) {
        case FencerStatus.ABANDONED:
          return 'A';
        case FencerStatus.FORFAIT:
          return 'F';
        case FencerStatus.EXCLUDED:
          return 'X';
        default:
          return '';
      }
    };

    const rows = resultsToDisplay.map(r => {
      return [
        r.rank,
        r.fencer.lastName,
        r.fencer.firstName,
        r.fencer.club || '',
        getStatusLabel(r.fencer.status),
        r.eliminatedAt || '',
      ];
    });

    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `resultats_${competition.title.replace(/[^a-z0-9]/gi, '_')}.csv`;
    link.click();
    showToast('Export CSV réussi !', 'success');
  };

  // Export PDF
  const exportPDF = async () => {
    try {
      const logo = localStorage.getItem('bellepoule-logo') ?? undefined;
      const { exportResultsToPDF } = await import('../../shared/utils/pdfExport');
      await exportResultsToPDF(
        resultsToDisplay,
        `Résultats — ${competition.title}`,
        logo,
        rankingTemplate
      );
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };

  // Export XML
  const exportXML = () => {
    const xmlContent = exportResultsXMLFFE(
      competition,
      poolRanking,
      resultsToDisplay.map(r => ({
        rank: r.rank,
        fencer: r.fencer,
        eliminatedAt: r.eliminatedAt,
      })),
      pools,
      tableauMatches
    );

    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `resultats_${competition.title.replace(/[^a-z0-9]/gi, '_')}.xml`;
    link.click();
    showToast('Export XML réussi !', 'success');
  };

  const exportFullPDF = async () => {
    setIsExportingFull(true);
    try {
      const api = (window as any).electronAPI;

      // Chaque fetch de secours est isolé : un échec ne doit pas vider tout l'export
      const safe = async <T,>(fn: () => Promise<T>, label: string, fallback: T): Promise<T> => {
        try { return await fn(); } catch (e) {
          logger.warn(LogCategory.DATABASE, `export complet — ${label} échoué`, e instanceof Error ? e : undefined);
          return fallback;
        }
      };

      const effectiveFencers = (appelFencers && appelFencers.length > 0)
        ? appelFencers
        : (fencers && fencers.length > 0)
          ? fencers
          : await safe(() => api?.db?.getFencersByCompetition?.(competition.id) ?? [], 'tireurs', []);

      const effectiveTableauMatches = (tableauMatches && tableauMatches.length > 0)
        ? tableauMatches
        : await safe(() => api?.db?.getTableauMatchesForExport?.(competition.id) ?? [], 'matchs tableau', []);

      let effectivePools: Pool[] = pools && pools.length > 0 ? pools : [];
      if (effectivePools.length === 0 && api?.db?.getPhasesByCompetition && api?.db?.getPoolsByPhase) {
        effectivePools = await safe(async () => {
          const phases = await api.db.getPhasesByCompetition(competition.id);
          const poolPhases = phases.filter((p: { type: string }) => p.type === 'pool');
          const poolArrays = await Promise.all(poolPhases.map((ph: { id: string }) => api.db.getPoolsByPhase(ph.id)));
          return poolArrays.flat();
        }, 'poules', []);
      }

      // Signatures des poules : poolId → (fencerId → data URL)
      const poolSignatures = await safe(async () => {
        const entries = await Promise.all(
          effectivePools.map(async (p) => {
            const sigs = (await api?.db?.getPoolSignatures?.(p.id)) ?? [];
            return [p.id, Object.fromEntries(sigs.map((s: { fencerId: string; signatureData: string }) => [s.fencerId, s.signatureData]))] as const;
          })
        );
        return Object.fromEntries(entries) as Record<string, Record<string, string>>;
      }, 'signatures poules', {} as Record<string, Record<string, string>>);

      // Signatures des matchs de TDE : matchId → { A, B }
      const allTableauMatches = [
        ...(effectiveTableauMatches as TableauMatchForPDF[]),
        ...(consolationBrackets ?? []).flatMap(b => b.matches as TableauMatchForPDF[]),
      ];
      const tableauSignatures = await safe(async () => {
        const ids = allTableauMatches.map(m => m.id).filter(Boolean);
        const rows = (await api?.db?.getDEMatchSignaturesByMatchIds?.(ids)) ?? [];
        const out: Record<string, { A?: string; B?: string }> = {};
        for (const row of rows as { matchId: string; fencerId: string; signatureData: string }[]) {
          const match = allTableauMatches.find(m => m.id === row.matchId);
          if (!match) continue;
          const slot = match.fencerA?.id === row.fencerId ? 'A' : match.fencerB?.id === row.fencerId ? 'B' : null;
          if (!slot) continue;
          (out[row.matchId] ??= {})[slot] = row.signatureData;
        }
        return out;
      }, 'signatures tableau', {} as Record<string, { A?: string; B?: string }>);

      const { exportFullCompetitionPDF } = await import('../../shared/utils/pdfExport');
      await exportFullCompetitionPDF({
        fencers: effectiveFencers,
        appelVisibleColumns,
        pools: effectivePools,
        overallRanking: poolRanking,
        tableauMatches: effectiveTableauMatches as TableauMatchForPDF[],
        consolationBrackets: (consolationBrackets ?? []).map(b => ({
          id: b.id,
          name: b.name,
          matches: b.matches as TableauMatchForPDF[],
        })),
        finalResults: resultsToDisplay as FinalResultForPDF[],
        competitionTitle: competition.title,
        isLaserSabre,
        template: rankingTemplate,
        poolSignatures,
        tableauSignatures,
      });
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setIsExportingFull(false);
    }
  };

  const exportNoSignaturePDF = async () => {
    setIsExportingFull(true);
    try {
      const api = (window as any).electronAPI;

      const safe = async <T,>(fn: () => Promise<T>, label: string, fallback: T): Promise<T> => {
        try { return await fn(); } catch (e) {
          logger.warn(LogCategory.DATABASE, `export sans signature — ${label} échoué`, e instanceof Error ? e : undefined);
          return fallback;
        }
      };

      const effectiveTableauMatches = (tableauMatches && tableauMatches.length > 0)
        ? tableauMatches
        : await safe(() => api?.db?.getTableauMatchesForExport?.(competition.id) ?? [], 'matchs tableau', []);

      let effectivePools: Pool[] = pools && pools.length > 0 ? pools : [];
      if (effectivePools.length === 0 && api?.db?.getPhasesByCompetition && api?.db?.getPoolsByPhase) {
        effectivePools = await safe(async () => {
          const phases = await api.db.getPhasesByCompetition(competition.id);
          const poolPhases = phases.filter((p: { type: string }) => p.type === 'pool');
          const poolArrays = await Promise.all(poolPhases.map((ph: { id: string }) => api.db.getPoolsByPhase(ph.id)));
          return poolArrays.flat();
        }, 'poules', []);
      }

      const { exportPoolsAndTableauxNoSignaturePDF } = await import('../../shared/utils/pdfExport');
      await exportPoolsAndTableauxNoSignaturePDF({
        pools: effectivePools,
        tableauMatches: effectiveTableauMatches as TableauMatchForPDF[],
        consolationBrackets: (consolationBrackets ?? []).map(b => ({
          id: b.id,
          name: b.name,
          matches: b.matches as TableauMatchForPDF[],
        })),
        competitionTitle: competition.title,
        template: rankingTemplate,
      });
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setIsExportingFull(false);
    }
  };

  const champion = resultsToDisplay.find(r => r.rank === 1);

  return (
    <div style={RV_STYLES.wrapper}>
      <style>{`@keyframes rv-spin { to { transform: rotate(360deg); } }`}</style>
      {isExportingFull && (
        <div style={RV_STYLES.overlay}>
          <div style={RV_STYLES.overlaySpinner} />
          <div style={RV_STYLES.overlayText}>Génération du PDF complet…</div>
        </div>
      )}
      {/* En-tête avec le champion */}
      {champion && (
        <div style={RV_STYLES.champHeader}>
          <div style={RV_STYLES.champTrophy}>🏆</div>
          <h1 style={RV_STYLES.champTitle}>Champion</h1>
          <div style={RV_STYLES.champName}>
            {champion.fencer.firstName} {champion.fencer.lastName}
          </div>
          {champion.fencer.club && (
            <div style={RV_STYLES.champClub}>{champion.fencer.club}</div>
          )}
        </div>
      )}

      {/* Podium visuel */}
      <div style={RV_STYLES.podiumRow}>
        {/* 2ème place */}
        {resultsToDisplay[1] && (
          <div style={RV_STYLES.podium2}>
            <div style={RV_STYLES.podium2Medal}>🥈</div>
            <div style={RV_STYLES.podium2Name}>{resultsToDisplay[1].fencer.lastName}</div>
            <div style={RV_STYLES.podium2Place}>2ème</div>
          </div>
        )}

        {/* 1ère place */}
        {resultsToDisplay[0] && (
          <div style={RV_STYLES.podium1}>
            <div style={RV_STYLES.podium1Medal}>🥇</div>
            <div style={RV_STYLES.podium1Name}>{resultsToDisplay[0].fencer.lastName}</div>
            <div style={RV_STYLES.podium1Place}>1er</div>
          </div>
        )}

        {/* 3ème place */}
        {resultsToDisplay[2] && (
          <div style={RV_STYLES.podium3}>
            <div style={RV_STYLES.podium3Medal}>🥉</div>
            <div style={RV_STYLES.podium3Name}>{resultsToDisplay[2].fencer.lastName}</div>
            <div style={RV_STYLES.podium3Place}>3ème</div>
          </div>
        )}
      </div>

      {/* Tableau complet des résultats */}
      <div style={RV_STYLES.tableWrapper}>
        <div style={RV_STYLES.tableHeader}>
          📊 Classement final - {resultsToDisplay.length} tireurs
        </div>

        <table style={RV_STYLES.table}>
          <thead>
            <tr style={RV_STYLES.thead}>
              <th style={RV_STYLES.thRank}>Rang</th>
              <th style={RV_STYLES.thLeft}>Tireur</th>
              <th style={RV_STYLES.thLeft}>Club</th>
              <th style={RV_STYLES.thCenter}>Éliminé en</th>
            </tr>
          </thead>
          <tbody>
            {resultsToDisplay.map(result => (
              <tr
                key={result.fencer.id}
                style={{
                  ...getRowStyle(result.rank),
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <td style={RV_STYLES.tdPad}>
                  <span style={RV_STYLES.tdMedalSpan}>{getMedalEmoji(result.rank)}</span>
                  {result.rank}
                </td>
                <td style={RV_STYLES.tdPad}>
                  {result.fencer.firstName} {result.fencer.lastName}
                  {result.fencer.status === FencerStatus.ABANDONED && ' (A)'}
                  {result.fencer.status === FencerStatus.FORFAIT && ' (F)'}
                  {result.fencer.status === FencerStatus.EXCLUDED && ' (X)'}
                </td>
                <td style={RV_STYLES.tdClub}>{result.fencer.club || '-'}</td>
                <td style={RV_STYLES.tdElim}>{result.eliminatedAt || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Boutons d'export */}
      <div style={RV_STYLES.exportRow}>
        <button onClick={() => window.electronAPI.print()} style={RV_STYLES.btnPrint}>
          🖨️ Imprimer
        </button>
        <button
          onClick={() => {
            const text = resultsToDisplay
              .map(
                r =>
                  `${r.rank}. ${r.fencer.firstName} ${r.fencer.lastName} (${r.fencer.club || 'Sans club'})`
              )
              .join('\n');
            navigator.clipboard.writeText(text);
            showToast('Résultats copiés dans le presse-papier !', 'success');
          }}
          style={RV_STYLES.btnCopy}
        >
          📋 Copier
        </button>
        <button onClick={exportCSV} style={RV_STYLES.btnCsv}>
          📊 CSV
        </button>
        <button onClick={exportXML} style={RV_STYLES.btnXml}>
          📝 XML
        </button>
        <button onClick={exportPDF} style={RV_STYLES.btnPdf}>
          📄 PDF
        </button>
        <button
          onClick={exportFullPDF}
          style={{ ...RV_STYLES.btnFullPdf, opacity: isExportingFull ? 0.6 : 1, cursor: isExportingFull ? 'wait' : 'pointer' }}
          disabled={isExportingFull}
        >
          {isExportingFull ? (
            <>
              <span style={RV_STYLES.spinner} /> Génération…
            </>
          ) : (
            '📦 Export complet PDF'
          )}
        </button>
        <button
          onClick={exportNoSignaturePDF}
          style={{ ...RV_STYLES.btnFullPdf, opacity: isExportingFull ? 0.6 : 1, cursor: isExportingFull ? 'wait' : 'pointer' }}
          disabled={isExportingFull}
          title="Poules et tableaux d'élimination directe, sans les signatures des combattants"
        >
          {isExportingFull ? (
            <>
              <span style={RV_STYLES.spinner} /> Génération…
            </>
          ) : (
            '📄 Export PDF complet sans signature'
          )}
        </button>
      </div>

      {/* Légende */}
      <div style={RV_STYLES.legend}>(A) = Abandon • (F) = Forfait • (X) = Exclu</div>
    </div>
  );
};

export default React.memo(ResultsView);
