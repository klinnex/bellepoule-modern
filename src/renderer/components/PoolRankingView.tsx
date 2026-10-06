/**
 * BellePoule Modern - Pool Ranking View Component
 * Shows ranking after pools with export/print functionality
 * Licensed under GPL-3.0
 */

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  PoolRanking,
  Pool,
  Weapon,
  FencerStatus,
  PostPoolSplitCriteria,
  Gender,
} from '../../shared/types';
// pdfExport (jsPDF) chargé à la demande pour alléger le bundle initial
import { usePdfTemplateStore } from '../../features/pdfTemplates/hooks/usePdfTemplateStore';
import { CENTER, W40, W50, W60, SM, FLEX_GAP } from './poolRankingView.styles';
import {
  formatRatio,
  formatIndex,
  calculateOverallRankingQuest,
  calculateOverallRanking,
  calculatePoolRanking,
  calculatePoolRankingQuest,
  getPoolWinnerIds,
  splitRankingByGender,
} from '../../shared/utils/poolCalculations';
import { useToast } from './Toast';
import { useColumnVisibility, RANKING_COLUMNS, ColumnId } from '../hooks/useColumnVisibility';
import {
  CollapseToggle,
  CollapsedRow,
  useCollapsed,
  COMPACT_ROW_COUNT,
} from './common/CollapseToggle';

interface PoolRankingViewProps {
  pools: Pool[];
  weapon?: Weapon;
  ranking?: PoolRanking[];
  isInitialRanking?: boolean;
  onGoToTableau?: (splitGroup?: string) => void;
  onGoToResults?: () => void;
  hasDirectElimination?: boolean;
  onExport?: (format: 'csv') => void;
  onPoolsChange?: (pools: Pool[], rankingChanged: boolean) => void;
  onRankingChange?: (ranking: PoolRanking[]) => void;
  poolWinnersOnly?: boolean;
  splitCriteria?: PostPoolSplitCriteria;
  /** Groupes déjà extraits dans une compétition séparée (genre → id compétition) */
  splitOffGroups?: Partial<Record<string, string>>;
  /** Extraire un groupe dans une compétition séparée (filles) */
  onSplitOff?: (group: string) => void;
}

const PoolRankingView: React.FC<PoolRankingViewProps> = ({
  pools,
  weapon,
  ranking: externalRanking,
  isInitialRanking = false,
  onGoToTableau,
  onGoToResults,
  hasDirectElimination = true,
  onExport,
  onPoolsChange,
  onRankingChange,
  poolWinnersOnly = false,
  splitCriteria,
  splitOffGroups,
  onSplitOff,
}) => {
  const { showToast } = useToast();
  const { isColumnVisible, toggleColumn, getVisibleColumns } = useColumnVisibility();
  const rankingTemplate = usePdfTemplateStore(s => s.templates.ranking);
  const isLaserSabre = weapon === 'L';
  const [recalcKey, setRecalcKey] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editedRanking, setEditedRanking] = useState<PoolRanking[]>([]);
  const [rankDrafts, setRankDrafts] = useState<Record<string, string>>({});
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  const justSaved = useRef(false);
  // Mode compétition couplée : onglet actif ('all' | 'M' | 'F')
  const [splitTab, setSplitTab] = useState<'all' | string>('all');
  const isInSplitGroupTab = splitCriteria != null && splitTab !== 'all';

  // IDs des vainqueurs de poule (calculés une seule fois)
  const poolWinnerIds = useMemo(
    () => (poolWinnersOnly && pools.length > 0 ? getPoolWinnerIds(pools) : null),
    [poolWinnersOnly, pools]
  );

  // Groupes disponibles pour la séparation par genre
  const splitGroups = useMemo((): string[] => {
    if (splitCriteria !== 'gender') return [];
    const genders = new Set<string>();
    for (const r of editedRanking) {
      if (r.fencer.gender !== Gender.MIXED) genders.add(r.fencer.gender as string);
    }
    return Array.from(genders).sort();
  }, [splitCriteria, editedRanking]);

  // Calculer le classement général selon le type d'arme
  const computedRanking = useMemo(() => {
    // Utiliser recalcKey pour forcer le recalcul
    const _ = recalcKey;
    return isLaserSabre ? calculateOverallRankingQuest(pools) : calculateOverallRanking(pools);
  }, [pools, isLaserSabre, recalcKey]);

  // Utiliser le classement fourni par le parent s'il existe, sinon le calculé
  const overallRanking = externalRanking?.length ? externalRanking : computedRanking;

  // Classement filtré pour l'onglet courant (split par genre)
  const splitRankings = useMemo(
    () => (splitCriteria === 'gender' ? splitRankingByGender(overallRanking) : null),
    [splitCriteria, overallRanking]
  );

  // Recalculer les classements de toutes les poules
  const handleRecalculate = useCallback(() => {
    // Recalculer le classement de chaque poule
    const updatedPools = pools.map(pool => {
      const newRanking = isLaserSabre
        ? calculatePoolRankingQuest(pool)
        : calculatePoolRanking(pool);
      return {
        ...pool,
        ranking: newRanking,
      };
    });

    // Vérifier si le classement global a changé
    const newOverallRanking = isLaserSabre
      ? calculateOverallRankingQuest(updatedPools)
      : calculateOverallRanking(updatedPools);

    const rankingChanged =
      JSON.stringify(overallRanking.map(r => r.fencer.id)) !==
      JSON.stringify(newOverallRanking.map(r => r.fencer.id));

    // Mettre à jour les pools et le classement global dans le parent
    if (onPoolsChange) {
      onPoolsChange(updatedPools, rankingChanged);
    }
    onRankingChange?.(newOverallRanking);

    // Forcer le recalcul du classement général
    setRecalcKey(prev => prev + 1);

    if (rankingChanged) {
      showToast('Classement recalculé et modifié ! Le tableau sera régénéré.', 'warning');
    } else {
      showToast('Classement recalculé avec succès !', 'success');
    }
  }, [pools, isLaserSabre, onPoolsChange, onRankingChange, showToast, overallRanking]);

  // Initialiser le classement édité quand le classement global change
  useEffect(() => {
    if (!isEditing) {
      if (justSaved.current) {
        justSaved.current = false;
        return;
      }
      setEditedRanking(overallRanking);
    }
  }, [overallRanking, isEditing]);

  const isVisible = useCallback(
    (columnId: ColumnId): boolean => {
      if (columnId === 'quest' && !isLaserSabre) return false;
      return isColumnVisible('ranking', columnId);
    },
    [isLaserSabre, isColumnVisible]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
        setShowColumnMenu(false);
      }
    };
    if (showColumnMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColumnMenu]);

  useEffect(() => {
    if (isEditing) {
      setRankDrafts(Object.fromEntries(editedRanking.map(r => [r.fencer.id, String(r.rank)])));
    }
  }, [editedRanking, isEditing]);

  const handleExport = (format: 'csv') => {
    if (onExport) {
      onExport(format);
      return;
    }
    const content = generateCSV();
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'classement.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Export CSV réussi', 'success');
  };

  const handlePrint = () => {
    window.electronAPI.print();
  };

  const handleExportPDF = async () => {
    try {
      const logo = localStorage.getItem('bellepoule-logo') ?? undefined;
      const cols = getVisibleColumns('ranking').filter(col => col !== 'quest' || isLaserSabre);
      const { exportRankingToPDF } = await import('../../shared/utils/pdfExport');
      await exportRankingToPDF(
        overallRanking,
        'Classement Général',
        weapon,
        cols,
        logo,
        rankingTemplate
      );
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };

  // Déplacer un tireur vers le haut
  const moveUp = (index: number) => {
    if (index === 0) return;
    const newRanking = [...editedRanking];
    [newRanking[index], newRanking[index - 1]] = [newRanking[index - 1], newRanking[index]];
    // Mettre à jour les rangs
    newRanking.forEach((r, i) => (r.rank = i + 1));
    setEditedRanking(newRanking);
  };

  // Déplacer un tireur vers le bas
  const moveDown = (index: number) => {
    if (index === editedRanking.length - 1) return;
    const newRanking = [...editedRanking];
    [newRanking[index], newRanking[index + 1]] = [newRanking[index + 1], newRanking[index]];
    // Mettre à jour les rangs
    newRanking.forEach((r, i) => (r.rank = i + 1));
    setEditedRanking(newRanking);
  };

  // Déplacer un tireur directement à un rang cible (saisie clavier)
  const moveToRank = (fromIndex: number, newRank: number) => {
    const toIndex = Math.max(0, Math.min(editedRanking.length - 1, newRank - 1));
    if (toIndex === fromIndex) return;
    const newRanking = [...editedRanking];
    const [moved] = newRanking.splice(fromIndex, 1);
    newRanking.splice(toIndex, 0, moved);
    newRanking.forEach((r, i) => (r.rank = i + 1));
    setEditedRanking(newRanking);
  };

  // Sauvegarder les modifications et propager vers le parent
  const saveChanges = () => {
    const rankingChanged =
      JSON.stringify(overallRanking.map(r => r.fencer.id)) !==
      JSON.stringify(editedRanking.map(r => r.fencer.id));

    if (onPoolsChange) {
      // Propager rang ET questPoints dans chaque pool (les deux peuvent avoir changé)
      const fencerToGlobalRank = new Map(editedRanking.map(r => [r.fencer.id, r.rank]));
      const fencerToQuestPoints = new Map(editedRanking.map(r => [r.fencer.id, r.questPoints]));
      const updatedPools = pools.map(pool => ({
        ...pool,
        ranking: pool.ranking.map(pr => ({
          ...pr,
          rank: fencerToGlobalRank.get(pr.fencer.id) ?? pr.rank,
          questPoints: fencerToQuestPoints.get(pr.fencer.id) ?? pr.questPoints,
        })),
      }));
      onPoolsChange(updatedPools, rankingChanged);
    }

    onRankingChange?.(editedRanking);
    justSaved.current = true;
    setIsEditing(false);
    showToast(
      rankingChanged
        ? 'Classement modifié — le tableau sera régénéré avec le nouvel ordre.'
        : 'Classement sauvegardé (inchangé).',
      rankingChanged ? 'warning' : 'success'
    );
  };

  const generateCSV = () => {
    const headers = ['Rg', 'Nom', 'Prénom', 'Club', 'V', 'M', 'V/M', 'TD', 'TR', 'Statut'];
    if (isLaserSabre) {
      headers.push('Quest', 'Indice');
    } else {
      headers.push('Indice');
    }

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

    const rows = editedRanking.map(r => [
      r.rank,
      r.fencer.lastName,
      r.fencer.firstName,
      r.fencer.club || '',
      r.victories,
      r.victories + r.defeats,
      formatRatio(r.ratio),
      r.touchesScored,
      r.touchesReceived,
      getStatusLabel(r.fencer.status),
      ...(isLaserSabre ? [r.questPoints || 0, formatIndex(r.index)] : [formatIndex(r.index)]),
    ]);

    return [headers, ...rows].map(row => row.join(';')).join('\n');
  };

  const activeRanking =
    splitCriteria && splitTab !== 'all' ? (splitRankings?.get(splitTab) ?? []) : editedRanking;

  // Mode compact : seules les premières lignes sont affichées (désactivé en édition)
  const [collapsed, toggleCollapsed] = useCollapsed(
    isInitialRanking ? 'initial-ranking' : 'pool-ranking'
  );
  const isCompact = collapsed && !isEditing;
  const hiddenCount = isCompact ? Math.max(0, activeRanking.length - COMPACT_ROW_COUNT) : 0;
  const visibleColCount =
    (
      [
        'rank',
        'lastName',
        'firstName',
        'club',
        'victories',
        'matches',
        'ratio',
        'td',
        'tr',
        'quest',
        'index',
      ] as ColumnId[]
    ).filter(isVisible).length + (poolWinnersOnly ? 1 : 0);

  const getRankBadgeClass = (rank: number) => {
    if (rank === 1) return 'ranking-rank-badge ranking-rank-badge--gold';
    if (rank === 2) return 'ranking-rank-badge ranking-rank-badge--silver';
    if (rank === 3) return 'ranking-rank-badge ranking-rank-badge--bronze';
    return 'ranking-rank-badge';
  };

  return (
    <div className="content" style={{ padding: '1rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {isInitialRanking ? 'Classement initial' : 'Classement après poules'}
            {!isEditing && (
              <CollapseToggle
                collapsed={collapsed}
                onToggle={toggleCollapsed}
                hiddenCount={Math.max(0, activeRanking.length - COMPACT_ROW_COUNT)}
              />
            )}
          </h2>
          <p className="text-sm text-muted">
            {isInitialRanking
              ? `${editedRanking.length} tireur${editedRanking.length > 1 ? 's' : ''} • Classement de départ`
              : `${pools.length} poule${pools.length > 1 ? 's' : ''} • ${editedRanking.length} tireur${editedRanking.length > 1 ? 's' : ''}`}
            {isEditing && ' (mode édition)'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {!isInitialRanking && pools.length > 0 && (
            <button
              className="btn btn-secondary"
              onClick={handleRecalculate}
              title="Recalculer le classement"
              style={{ fontSize: '0.8rem' }}
            >
              Recalculer
            </button>
          )}
          <div
            style={{
              width: '1px',
              height: '22px',
              background: 'var(--color-border)',
              margin: '0 0.15rem',
            }}
          />
          <button
            className="btn btn-secondary"
            onClick={() => handleExport('csv')}
            style={{ fontSize: '0.8rem' }}
          >
            CSV
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleExportPDF}
            style={{ fontSize: '0.8rem' }}
          >
            PDF
          </button>
          <button
            className="btn btn-secondary"
            onClick={handlePrint}
            style={{ fontSize: '0.8rem' }}
          >
            Imprimer
          </button>
          <div
            style={{
              width: '1px',
              height: '22px',
              background: 'var(--color-border)',
              margin: '0 0.15rem',
            }}
          />
          {!isInSplitGroupTab && (
            <button
              className={`btn ${isEditing ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => (isEditing ? saveChanges() : setIsEditing(true))}
              style={{ fontSize: '0.8rem' }}
            >
              {isEditing ? 'Terminer' : 'Modifier'}
            </button>
          )}
          <div style={{ position: 'relative' }} ref={columnMenuRef}>
            <button
              onClick={() => setShowColumnMenu(!showColumnMenu)}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.375rem 0.65rem' }}
              title="Afficher/masquer les colonnes"
            >
              Colonnes
            </button>
            {showColumnMenu && (
              <div className="ranking-col-menu">
                <div className="ranking-col-menu-title">Colonnes à afficher</div>
                {RANKING_COLUMNS.filter(col => col.id !== 'quest' || isLaserSabre).map(col => (
                  <label key={col.id} className="ranking-col-menu-item">
                    <input
                      type="checkbox"
                      checked={isVisible(col.id)}
                      onChange={() => toggleColumn('ranking', col.id)}
                      style={{ cursor: 'pointer' }}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Onglets de séparation (compétition couplée) */}
      {splitCriteria && splitGroups.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <button
            className={splitTab === 'all' ? 'btn btn-primary' : 'btn btn-secondary'}
            style={SM}
            onClick={() => setSplitTab('all')}
          >
            🌐 Général
          </button>
          {splitGroups.map(g => (
            <button
              key={g}
              className={splitTab === g ? 'btn btn-primary' : 'btn btn-secondary'}
              style={SM}
              onClick={() => {
                if (isEditing) saveChanges();
                setSplitTab(g);
              }}
            >
              {g === Gender.MALE ? '♂ Hommes' : g === Gender.FEMALE ? '♀ Femmes' : g}
            </button>
          ))}
        </div>
      )}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              {isVisible('rank') && <th style={W50}>Rg</th>}
              {isVisible('lastName') && <th>Nom</th>}
              {isVisible('firstName') && <th>Prénom</th>}
              {isVisible('club') && <th>Club</th>}
              {isVisible('victories') && <th style={W40}>V</th>}
              {isVisible('matches') && <th style={W40}>M</th>}
              {isVisible('ratio') && <th style={W60}>V/M</th>}
              {isVisible('td') && <th style={W50}>TD</th>}
              {isVisible('tr') && <th style={W50}>TR</th>}
              {isVisible('quest') && isLaserSabre && (
                <th style={{ width: '70px', color: '#7c3aed' }}>Quest</th>
              )}
              {isVisible('index') && <th style={W60}>Indice</th>}
              {poolWinnersOnly && <th style={{ width: '70px' }}>Qualif.</th>}
            </tr>
          </thead>
          <tbody>
            {activeRanking.map((ranking, index) => {
              const prevRank = index > 0 ? activeRanking[index - 1].rank : null;
              const nextRank =
                index < activeRanking.length - 1 ? activeRanking[index + 1].rank : null;
              const isTied = prevRank === ranking.rank || nextRank === ranking.rank;
              const isQualified = poolWinnerIds?.has(ranking.fencer.id);
              const dimmed = poolWinnersOnly && poolWinnerIds && !isQualified;
              return (
                <tr
                  key={ranking.fencer.id}
                  className={
                    [
                      isTied && 'ranking-row--tie',
                      isCompact && index >= COMPACT_ROW_COUNT && 'collapse-row--hidden',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  style={dimmed ? { opacity: 0.45 } : undefined}
                >
                  {isVisible('rank') && (
                    <td>
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <input
                            type="number"
                            min={1}
                            max={editedRanking.length}
                            value={rankDrafts[ranking.fencer.id] ?? String(ranking.rank)}
                            onChange={e =>
                              setRankDrafts(prev => ({
                                ...prev,
                                [ranking.fencer.id]: e.target.value,
                              }))
                            }
                            onBlur={e => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val) && val >= 1 && val <= editedRanking.length) {
                                moveToRank(index, val);
                              } else {
                                setRankDrafts(prev => ({
                                  ...prev,
                                  [ranking.fencer.id]: String(ranking.rank),
                                }));
                              }
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              if (e.key === 'Escape') {
                                setRankDrafts(prev => ({
                                  ...prev,
                                  [ranking.fencer.id]: String(ranking.rank),
                                }));
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            style={{
                              width: '44px',
                              textAlign: 'center',
                              padding: '1px 4px',
                              fontWeight: '600',
                            }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <button
                              onClick={() => moveUp(index)}
                              disabled={index === 0}
                              className="pool-prep-btn-move"
                              style={{ opacity: index === 0 ? 0.3 : 1 }}
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moveDown(index)}
                              disabled={index === editedRanking.length - 1}
                              className="pool-prep-btn-move"
                              style={{ opacity: index === editedRanking.length - 1 ? 0.3 : 1 }}
                            >
                              ▼
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className={getRankBadgeClass(ranking.rank)}>{ranking.rank}</span>
                      )}
                    </td>
                  )}
                  {isVisible('lastName') && (
                    <td className="font-medium">
                      {ranking.fencer.lastName}
                      {ranking.fencer.status === FencerStatus.ABANDONED && (
                        <span className="ranking-status-badge ranking-status-badge--abandon">
                          A
                        </span>
                      )}
                      {ranking.fencer.status === FencerStatus.FORFAIT && (
                        <span className="ranking-status-badge ranking-status-badge--forfait">
                          F
                        </span>
                      )}
                      {ranking.fencer.status === FencerStatus.EXCLUDED && (
                        <span className="ranking-status-badge ranking-status-badge--exclu">X</span>
                      )}
                    </td>
                  )}
                  {isVisible('firstName') && <td>{ranking.fencer.firstName}</td>}
                  {isVisible('club') && (
                    <td className="text-sm text-muted">{ranking.fencer.club || '—'}</td>
                  )}
                  {isVisible('victories') && (
                    <td style={{ textAlign: 'center', fontWeight: '600' }}>{ranking.victories}</td>
                  )}
                  {isVisible('matches') && (
                    <td style={CENTER}>{ranking.victories + ranking.defeats}</td>
                  )}
                  {isVisible('ratio') && <td style={CENTER}>{formatRatio(ranking.ratio)}</td>}
                  {isVisible('td') && <td style={CENTER}>{ranking.touchesScored}</td>}
                  {isVisible('tr') && <td style={CENTER}>{ranking.touchesReceived}</td>}
                  {isVisible('quest') && isLaserSabre && (
                    <td style={{ textAlign: 'center', fontWeight: '600', color: '#7c3aed' }}>
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          value={ranking.questPoints ?? 0}
                          onChange={e => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setEditedRanking(prev =>
                              prev.map((r, i) => (i === index ? { ...r, questPoints: val } : r))
                            );
                          }}
                          style={{ width: '52px', textAlign: 'center', padding: '1px 4px' }}
                        />
                      ) : (
                        (ranking.questPoints ?? 0)
                      )}
                    </td>
                  )}
                  {isVisible('index') && (
                    <td
                      style={CENTER}
                      className={
                        ranking.index >= 0 ? 'ranking-index--positive' : 'ranking-index--negative'
                      }
                    >
                      {ranking.index > 0 ? '+' : ''}
                      {formatIndex(ranking.index)}
                    </td>
                  )}
                  {poolWinnersOnly && (
                    <td style={CENTER}>
                      {isQualified ? (
                        <span className="ranking-qualif-badge">Q</span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                          —
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {hiddenCount > 0 && (
              <CollapsedRow
                colSpan={visibleColCount}
                hiddenCount={hiddenCount}
                onExpand={toggleCollapsed}
              />
            )}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '2rem',
        }}
      >
        <div className="ranking-legend">
          {[
            ['V', 'Victoires'],
            ['M', 'Matchs'],
            ['V/M', 'Ratio'],
            ['TD', 'Touches données'],
            ['TR', 'Touches reçues'],
            ['Indice', 'TD − TR'],
            ...(isLaserSabre ? [['Quest', 'Points Sabre Laser']] : []),
          ].map(([abbr, full]) => (
            <span key={abbr} className="ranking-legend-pill">
              <strong>{abbr}</strong> {full}
            </span>
          ))}
          <span className="ranking-legend-pill">
            <span
              className="ranking-status-badge ranking-status-badge--abandon"
              style={{ marginLeft: 0 }}
            >
              A
            </span>{' '}
            Abandon
          </span>
          <span className="ranking-legend-pill">
            <span
              className="ranking-status-badge ranking-status-badge--forfait"
              style={{ marginLeft: 0 }}
            >
              F
            </span>{' '}
            Forfait
          </span>
          <span className="ranking-legend-pill">
            <span
              className="ranking-status-badge ranking-status-badge--exclu"
              style={{ marginLeft: 0 }}
            >
              X
            </span>{' '}
            Exclu
          </span>
        </div>
        <div style={FLEX_GAP}>
          {hasDirectElimination ? (
            splitCriteria && splitGroups.length > 1 ? (
              splitGroups.map(g =>
                g === Gender.FEMALE && onSplitOff ? (
                  <button key={g} className="btn btn-primary" onClick={() => onSplitOff(g)}>
                    {splitOffGroups?.[g]
                      ? 'Ouvrir la compétition ♀ Femmes →'
                      : 'Créer la compétition ♀ Femmes…'}
                  </button>
                ) : (
                  <button key={g} className="btn btn-primary" onClick={() => onGoToTableau?.(g)}>
                    Tableau {g === Gender.MALE ? '♂ Hommes' : '♀ Femmes'} →
                  </button>
                )
              )
            ) : (
              <button className="btn btn-primary" onClick={() => onGoToTableau?.()}>
                {poolWinnersOnly
                  ? `Tableau (${poolWinnerIds?.size ?? '?'} vainqueurs) →`
                  : 'Passer au tableau →'}
              </button>
            )
          ) : (
            <button className="btn btn-primary" onClick={onGoToResults}>
              Voir les résultats →
            </button>
          )}
        </div>
      </div>

      {/* CSS pour l'impression */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media print {
            .btn {
              display: none !important;
            }
            .card {
              border: none !important;
              box-shadow: none !important;
            }
            table {
              font-size: 12pt !important;
            }
            th, td {
              padding: 4px !important;
            }
          }
        `,
        }}
      />
    </div>
  );
};

export default React.memo(PoolRankingView);
