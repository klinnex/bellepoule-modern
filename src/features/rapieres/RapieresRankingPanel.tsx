/**
 * BellePoule Modern - Tournoi des rapières : classements filtrés (#1118)
 * Menu déroulant : général équipes, par niveau, tireurs par catégorie d'âge. Export PDF.
 * Utilisé après les poules (classement intermédiaire) et dans les résultats (final).
 * Licensed under GPL-3.0
 */

import React, { useMemo, useState } from 'react';
import type { Fencer } from '../../shared/types';
import { useTranslation } from '../../renderer/hooks/useTranslation';
import { useToast } from '../../renderer/components/Toast';
import {
  RAPIERES_AGE_CATEGORIES,
  RAPIERES_LEVELS,
  RapieresFencer,
  RapieresTeamInfo,
} from './rapieres.types';
import { filterRanking, RapieresRankingFilter } from './rapieresCalculations';
import { exportRapieresRankingToPDF } from './rapieresPdf';

export interface RapieresRankedTeam {
  teamId: string;
  rank: number;
}

export interface RapieresTeamStats {
  victories: number;
  matches: number;
  index: number;
  touchesGiven: number;
}

interface RapieresRankingPanelProps {
  competitionTitle: string;
  title: string;
  ranked: RapieresRankedTeam[];
  fencers: Fencer[];
  teams: Record<string, RapieresTeamInfo>;
  stats: Map<string, RapieresTeamStats>;
}

const fencerName = (f: RapieresFencer) => `${f.lastName.toUpperCase()} ${f.firstName}`.trim();

const RapieresRankingPanel: React.FC<RapieresRankingPanelProps> = ({
  competitionTitle,
  title,
  ranked,
  fencers,
  teams,
  stats,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [filterKey, setFilterKey] = useState('teams');

  const filters = useMemo(() => {
    const list: { key: string; label: string; filter: RapieresRankingFilter }[] = [
      { key: 'teams', label: t('rapieres.ranking_teams'), filter: { kind: 'teams' } },
    ];
    for (const level of RAPIERES_LEVELS)
      list.push({
        key: `level:${level}`,
        label: t('rapieres.ranking_level', { level: t(`rapieres.level_${level}`) }),
        filter: { kind: 'level', level },
      });
    for (const category of RAPIERES_AGE_CATEGORIES)
      list.push({
        key: `category:${category}`,
        label: t('rapieres.ranking_category', { category: t(`rapieres.cat_${category}`) }),
        filter: { kind: 'category', category },
      });
    return list;
  }, [t]);

  const selected = filters.find(f => f.key === filterKey) ?? filters[0];
  const individual = selected.filter.kind === 'category';
  const byId = new Map(fencers.map(f => [f.id, f]));
  const rows = filterRanking(ranked, teams, selected.filter);

  const headers = [
    t('rapieres.rank'),
    individual ? t('rapieres.fencer') : t('rapieres.team'),
    individual ? t('rapieres.team') : t('rapieres.fencers'),
    t('rapieres.level'),
    t('rapieres.victories'),
    t('rapieres.matches'),
    t('rapieres.indice'),
    t('rapieres.touches_given'),
  ];
  const tableRows = rows.map(r => {
    const team = byId.get(r.teamId);
    const info = teams[r.teamId];
    const s = stats.get(r.teamId) ?? { victories: 0, matches: 0, index: 0, touchesGiven: 0 };
    const teamName = team?.lastName ?? '?';
    const members = info ? info.fencers.map(fencerName).join(' · ') : (team?.firstName ?? '');
    return [
      r.rank,
      individual && info ? fencerName(info.fencers[r.fencerIndex ?? 0]) : teamName,
      individual ? teamName : members,
      info ? t(`rapieres.level_${info.level}`) : (team?.club ?? ''),
      s.victories,
      s.matches,
      s.index > 0 ? `+${s.index}` : String(s.index),
      s.touchesGiven,
    ];
  });

  const exportPdf = async () => {
    try {
      await exportRapieresRankingToPDF(
        {
          title: competitionTitle,
          subtitle: `${title} — ${selected.label}`,
          headers,
          rows: tableRows,
        },
        `classement-${selected.key.replace(':', '-')}.pdf`
      );
    } catch {
      showToast(t('rapieres.pdf_error'), 'error');
    }
  };

  return (
    <div className="card" style={{ padding: '1rem', margin: '1rem', display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <select
          className="form-input"
          style={{ width: 'auto' }}
          aria-label={t('rapieres.ranking_select')}
          value={selected.key}
          onChange={e => setFilterKey(e.target.value)}
        >
          {filters.map(f => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={rows.length === 0}
          onClick={exportPdf}
        >
          {t('rapieres.export_pdf')}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted">{t('rapieres.no_ranking')}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              {headers.map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r, i) => (
              <tr key={`${rows[i].teamId}-${rows[i].fencerIndex ?? ''}`}>
                {r.map((c, j) => (
                  <td key={j} style={j === 0 ? { fontWeight: 700 } : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default RapieresRankingPanel;
