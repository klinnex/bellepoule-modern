/**
 * BellePoule Modern - Tournoi des rapières : classements filtrés (#1118)
 * Filtres cumulables sur les équipes (catégorie d'âge, niveau, sexe — #1441). Export PDF.
 * Utilisé après les poules (classement intermédiaire) et dans les résultats (final).
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { Funnel } from 'lucide-react';
import type { Fencer } from '../../shared/types';
import { useTranslation } from '../../renderer/hooks/useTranslation';
import { useToast } from '../../renderer/components/Toast';
import {
  RAPIERES_AGE_CATEGORIES,
  RAPIERES_LEVELS,
  RapieresAgeCategory,
  RapieresFencer,
  RapieresLevel,
  RapieresTeamGender,
  RapieresTeamInfo,
} from './rapieres.types';
import { filterRanking, RapieresRankingFilter } from './rapieresCalculations';
import {
  exportRapieresRankingToPDF,
  printRapieresRanking,
  RapieresColumnKind,
} from './rapieresPdf';

const HIDDEN_KEY = 'bellepoule_rapieres_ranking_hidden_columns';

/** Colonnes du classement d'équipes (#1441 : une ligne par équipe, colonne « Poule » optionnelle) */
const COLUMNS: { id: string; kind: RapieresColumnKind }[] = [
  { id: 'rank', kind: 'rank' },
  { id: 'team', kind: 'text' },
  { id: 'fencers', kind: 'text' },
  { id: 'pool', kind: 'num' },
  { id: 'level', kind: 'text' },
  { id: 'victories', kind: 'num' },
  { id: 'matches', kind: 'num' },
  { id: 'index', kind: 'index' },
  { id: 'touches', kind: 'num' },
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
  /** Numéro de poule par équipe : ajoute la colonne « Poule » (classement après poules) */
  poolOf?: Record<string, number>;
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
  poolOf,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const title = final
    ? t('rapieres.ranking_final')
    : wave > 0
      ? t('rapieres.ranking_intermediate_wave', { n: wave })
      : t('rapieres.ranking_intermediate');
  // Filtres cumulables sur les équipes : catégorie, niveau, sexe (vide = non pris en compte)
  const [category, setCategory] = useState<RapieresAgeCategory | ''>('');
  const [level, setLevel] = useState<RapieresLevel | ''>('');
  const [gender, setGender] = useState<RapieresTeamGender | ''>('');
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

  const genderLabel = (g: RapieresTeamGender) =>
    g === 'MIXED' ? t('rapieres.gender_mixed') : t(g === 'M' ? 'genders.male' : 'genders.female');
  const filter: RapieresRankingFilter = {
    ...(category ? { category } : {}),
    ...(level ? { level } : {}),
    ...(gender ? { gender } : {}),
  };
  const activeLabels = [
    category && t(`rapieres.cat_${category}`),
    level && t(`rapieres.level_${level}`),
    gender && genderLabel(gender),
  ].filter(Boolean);
  const filterLabel =
    activeLabels.length > 0 ? activeLabels.join(' · ') : t('rapieres.ranking_teams');

  const byId = new Map(fencers.map(f => [f.id, f]));
  const rows = filterRanking(ranked, teams, filter);
  const showPool = !!poolOf;

  const allHeaders: Record<string, string> = {
    rank: t('rapieres.rank'),
    team: t('rapieres.team'),
    fencers: t('rapieres.fencers'),
    pool: t('rapieres.pool'),
    level: t('rapieres.level'),
    victories: t('rapieres.victories'),
    matches: t('rapieres.matches'),
    index: t('rapieres.indice'),
    touches: t('rapieres.touches_given'),
  };
  const shown = COLUMNS.filter(c => (c.id !== 'pool' || showPool) && !hidden.includes(c.id));
  const headers = shown.map(c => allHeaders[c.id]);
  const kinds = shown.map(c => c.kind);
  const tableRows = rows.map(r => {
    const team = byId.get(r.teamId);
    const info = teams[r.teamId];
    const s = stats.get(r.teamId) ?? { victories: 0, matches: 0, index: 0, touchesGiven: 0 };
    const cells: Record<string, string | number> = {
      rank: r.rank,
      team: team?.lastName ?? '?',
      fencers: info ? info.fencers.map(fencerName).join(' · ') : (team?.firstName ?? ''),
      pool: poolOf?.[r.teamId] ?? '',
      level: info ? t(`rapieres.level_${info.level}`) : (team?.club ?? ''),
      victories: s.victories,
      matches: s.matches,
      index: s.index > 0 ? `+${s.index}` : String(s.index),
      touches: s.touchesGiven,
    };
    return shown.map(c => cells[c.id]);
  });

  const pdfTable = () => ({
    title: competitionTitle,
    subtitle: `${title} — ${filterLabel}`,
    headers,
    rows: tableRows,
    kinds,
  });

  const exportPdf = async () => {
    try {
      await exportRapieresRankingToPDF(
        pdfTable(),
        `classement-${title.replace(/\W+/g, '-').toLowerCase()}.pdf`
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
          aria-label={t('rapieres.category')}
          value={category}
          onChange={e => setCategory(e.target.value as RapieresAgeCategory | '')}
        >
          <option value="">{t('rapieres.filter_category_all')}</option>
          {RAPIERES_AGE_CATEGORIES.map(c => (
            <option key={c} value={c}>
              {t(`rapieres.cat_${c}`)}
            </option>
          ))}
        </select>
        <select
          className="form-input"
          style={{ width: 'auto' }}
          aria-label={t('rapieres.level')}
          value={level}
          onChange={e => setLevel(e.target.value as RapieresLevel | '')}
        >
          <option value="">{t('rapieres.filter_level_all')}</option>
          {RAPIERES_LEVELS.map(l => (
            <option key={l} value={l}>
              {t(`rapieres.level_${l}`)}
            </option>
          ))}
        </select>
        <select
          className="form-input"
          style={{ width: 'auto' }}
          aria-label={t('rapieres.gender')}
          value={gender}
          onChange={e => setGender(e.target.value as RapieresTeamGender | '')}
        >
          <option value="">{t('rapieres.filter_gender_all')}</option>
          {(['M', 'F', 'MIXED'] as RapieresTeamGender[]).map(g => (
            <option key={g} value={g}>
              {genderLabel(g)}
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
              {COLUMNS.filter(c => c.id !== 'pool' || showPool).map(c => (
                <label key={c.id} className="ranking-col-menu-item">
                  <input
                    type="checkbox"
                    checked={!hidden.includes(c.id)}
                    onChange={() => toggleColumn(c.id)}
                  />
                  {allHeaders[c.id]}
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
              <tr key={rows[i].teamId}>
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
