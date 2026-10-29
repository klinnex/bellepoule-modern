/**
 * BellePoule Modern - Tournoi des rapières : classements filtrés (#1118)
 * Menu déroulant : général équipes, par niveau, tireurs par catégorie d'âge. Export PDF.
 * Utilisé après les poules (classement intermédiaire) et dans les résultats (final).
 * Licensed under GPL-3.0
 */

import React, { useMemo, useState } from 'react';
import { Funnel } from 'lucide-react';
import type { Fencer } from '../../shared/types';
import { useTranslation } from '../../renderer/hooks/useTranslation';
import { useToast } from '../../renderer/components/Toast';
import {
  RAPIERES_AGE_CATEGORIES,
  RAPIERES_GENDERS,
  RAPIERES_LEVELS,
  RapieresFencer,
  RapieresTeamInfo,
} from './rapieres.types';
import { filterRanking, RapieresRankingFilter } from './rapieresCalculations';
import {
  exportRapieresRankingToPDF,
  printRapieresRanking,
  RapieresColumnKind,
} from './rapieresPdf';

const HIDDEN_KEY = 'bellepoule_rapieres_ranking_hidden_columns';
const COLUMN_IDS = [
  'rank',
  'main',
  'sub',
  'level',
  'victories',
  'matches',
  'index',
  'touches',
] as const;
const COLUMN_KINDS: RapieresColumnKind[] = [
  'rank',
  'text',
  'text',
  'text',
  'num',
  'num',
  'num',
  'num',
];

const loadHidden = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

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
  /** Classement final (sinon intermédiaire, titré avec la vague en cours) */
  final?: boolean;
  wave: number;
  ranked: RapieresRankedTeam[];
  fencers: Fencer[];
  teams: Record<string, RapieresTeamInfo>;
  stats: Map<string, RapieresTeamStats>;
}

const fencerName = (f: RapieresFencer) => `${f.lastName.toUpperCase()} ${f.firstName}`.trim();

const RapieresRankingPanel: React.FC<RapieresRankingPanelProps> = ({
  competitionTitle,
  final = false,
  wave,
  ranked,
  fencers,
  teams,
  stats,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const title = final
    ? t('rapieres.ranking_final')
    : wave > 0
      ? t('rapieres.ranking_intermediate_wave', { n: wave })
      : t('rapieres.ranking_intermediate');
  const [filterKey, setFilterKey] = useState('teams');
  const [hidden, setHidden] = useState<string[]>(loadHidden);
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleColumn = (id: string) => {
    const next = hidden.includes(id) ? hidden.filter(c => c !== id) : [...hidden, id];
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {
      /* stockage indisponible : réglage non persisté */
    }
  };

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
    for (const gender of RAPIERES_GENDERS)
      list.push({
        key: `gender:${gender}`,
        label: t('rapieres.ranking_gender', {
          gender: t(gender === 'M' ? 'genders.male' : 'genders.female'),
        }),
        filter: { kind: 'gender', gender },
      });
    return list;
  }, [t]);

  const selected = filters.find(f => f.key === filterKey) ?? filters[0];
  const individual = selected.filter.kind === 'category' || selected.filter.kind === 'gender';
  const byId = new Map(fencers.map(f => [f.id, f]));
  const rows = filterRanking(ranked, teams, selected.filter);

  const allHeaders = [
    t('rapieres.rank'),
    individual ? t('rapieres.fencer') : t('rapieres.team'),
    individual ? t('rapieres.team') : t('rapieres.fencers'),
    t('rapieres.level'),
    t('rapieres.victories'),
    t('rapieres.matches'),
    t('rapieres.indice'),
    t('rapieres.touches_given'),
  ];
  const shown = COLUMN_IDS.map((id, i) => i).filter(i => !hidden.includes(COLUMN_IDS[i]));
  const headers = shown.map(i => allHeaders[i]);
  const kinds = shown.map(i => COLUMN_KINDS[i]);
  const tableRows = rows.map(r => {
    const team = byId.get(r.teamId);
    const info = teams[r.teamId];
    const s = stats.get(r.teamId) ?? { victories: 0, matches: 0, index: 0, touchesGiven: 0 };
    const teamName = team?.lastName ?? '?';
    const members = info ? info.fencers.map(fencerName).join(' · ') : (team?.firstName ?? '');
    const cells = [
      r.rank,
      individual && info ? fencerName(info.fencers[r.fencerIndex ?? 0]) : teamName,
      individual ? teamName : members,
      info ? t(`rapieres.level_${info.level}`) : (team?.club ?? ''),
      s.victories,
      s.matches,
      s.index > 0 ? `+${s.index}` : String(s.index),
      s.touchesGiven,
    ];
    return shown.map(i => cells[i]);
  });

  const pdfTable = () => ({
    title: competitionTitle,
    subtitle: `${title} — ${selected.label}`,
    headers,
    rows: tableRows,
    kinds,
  });

  const exportPdf = async () => {
    try {
      await exportRapieresRankingToPDF(
        pdfTable(),
        `classement-${selected.key.replace(':', '-')}.pdf`
      );
    } catch {
      showToast(t('rapieres.pdf_error'), 'error');
    }
  };

  // Boîte d'impression intégrée avec aperçu (#1214)
  const print = async () => {
    try {
      await printRapieresRanking(pdfTable());
    } catch (e) {
      showToast((e as Error).message, 'error');
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
        <div className="ranking-col-wrap">
          <button
            type="button"
            className={`btn btn-secondary ranking-col-btn${hidden.length > 0 ? ' ranking-col-btn-active' : ''}`}
            title={t('poolRanking.columns_title')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
          >
            <Funnel size={15} /> {t('poolRanking.columns')}
          </button>
          {menuOpen && (
            <div className="ranking-col-menu">
              <div className="ranking-col-menu-title">{t('poolRanking.columns_shown')}</div>
              {COLUMN_IDS.map((id, i) => (
                <label key={id} className="ranking-col-menu-item">
                  <input
                    type="checkbox"
                    checked={!hidden.includes(id)}
                    onChange={() => toggleColumn(id)}
                  />
                  {allHeaders[i]}
                </label>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={rows.length === 0}
          onClick={exportPdf}
        >
          {t('rapieres.export_pdf')}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={rows.length === 0}
          onClick={print}
        >
          {t('rapieres.print')}
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
