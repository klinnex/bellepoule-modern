import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Pool, Fencer, Score, MatchStatus, FencerStatus } from '../../../shared/types';
import { formatRatio, formatIndex } from '../../../shared/utils/poolCalculations';
import { ColumnId } from '../../hooks/useColumnVisibility';

interface PoolScoreMatrixProps {
  pool: Pool;
  isLaserSabre: boolean;
  isVisible: (columnId: ColumnId) => boolean;
  toggleColumn: (context: 'pool' | 'ranking', columnId: ColumnId) => void;
  onCellClick: (rowFencer: Fencer, colFencer: Fencer) => void;
  onFencerChangePool?: (fencer: Fencer) => void;
  onMatchReset?: (rowFencer: Fencer, colFencer: Fencer) => void;
  isLocked?: boolean;
  quickMouseScoring?: boolean;
  highlightedFencerIds?: Set<string>;
  onHoverCell?: (rowFencer: Fencer, colFencer: Fencer) => void;
  onHoverLeave?: () => void;
  onWheelScore?: (rowFencer: Fencer, colFencer: Fencer, shiftKey: boolean, delta: number) => void;
  simplifiedInputMode?: boolean;
  inlineEditKey?: string | null;
  inlineSingleScore?: string;
  cellScoreBuffer?: Record<string, number>;
  onInlineSingleScoreChange?: (value: string) => void;
  onInlineSubmit?: () => void;
  onInlineCancel?: () => void;
}

interface ScoreCellProps {
  rowFencer: Fencer;
  colFencer: Fencer;
  abandoned: boolean;
  score: Score | null;
  isFlashing: boolean;
  isLocked: boolean;
  onCellClick: (rowFencer: Fencer, colFencer: Fencer) => void;
  onMatchReset?: (rowFencer: Fencer, colFencer: Fencer) => void;
  isHighlighted?: boolean;
  quickMouseScoring?: boolean;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
  onWheelScore?: (shiftKey: boolean, delta: number) => void;
  isInlineEditing?: boolean;
  inlineSingleScore?: string;
  bufferedScore?: number;
  onInlineSingleScoreChange?: (value: string) => void;
  onInlineSubmit?: () => void;
  onInlineCancel?: () => void;
}

// Cellule mémoïsée : seules les cellules dont le score/flash change re-rendent
// (la grille est O(n²), un re-rendu global coûte cher sur les grandes poules).
const ScoreCell = React.memo<ScoreCellProps>(
  ({ rowFencer, colFencer, abandoned, score, isFlashing, isLocked, onCellClick, onMatchReset,
     isHighlighted, quickMouseScoring, onHoverIn, onHoverOut, onWheelScore,
     isInlineEditing, inlineSingleScore, bufferedScore, onInlineSingleScoreChange, onInlineSubmit, onInlineCancel }) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (isInlineEditing) {
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }, [isInlineEditing]);

    if (abandoned) {
      return (
        <div
          className="pool-cell pool-cell-forfeit"
          style={{
            cursor: 'not-allowed',
            backgroundColor: '#e5e7eb',
            color: '#9ca3af',
          }}
          title="Match non disputé (abandon/forfait)"
        >
          <span>-</span>
        </div>
      );
    }

    const cellClass = score
      ? score.isVictory
        ? 'pool-cell-victory'
        : 'pool-cell-defeat'
      : 'pool-cell-editable';

    const highlightStyle = isHighlighted
      ? { outline: '2px solid rgba(59,130,246,0.55)', outlineOffset: '-2px', background: 'rgba(59,130,246,0.10)' }
      : {};

    const inlineInputStyle: React.CSSProperties = {
      width: '26px',
      textAlign: 'center',
      fontSize: '0.7rem',
      padding: '1px 2px',
      border: '1px solid #3b82f6',
      borderRadius: '2px',
      outline: 'none',
      background: 'white',
      color: '#111',
      MozAppearance: 'textfield',
    };

    if (isInlineEditing) {
      return (
        <div
          className={`pool-cell pool-cell-editable pool-cell-inline-editing`}
          style={{ cursor: 'default', position: 'relative', padding: '2px', background: 'rgba(59,130,246,0.08)', outline: '2px solid #3b82f6', outlineOffset: '-2px' }}
          onClick={e => e.stopPropagation()}
        >
          <input
            ref={inputRef}
            type="number"
            min={0}
            value={inlineSingleScore ?? ''}
            onChange={e => onInlineSingleScoreChange?.(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); onInlineSubmit?.(); }
              if (e.key === 'Escape') { e.preventDefault(); onInlineCancel?.(); }
            }}
            style={{ ...inlineInputStyle, width: '36px', fontSize: '0.85rem' }}
          />
        </div>
      );
    }

    return (
      <div
        className={`pool-cell ${cellClass} ${isFlashing ? 'pool-cell-flash' : ''}`}
        onClick={() => !isLocked && onCellClick(rowFencer, colFencer)}
        onKeyDown={e => {
          if (!isLocked && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onCellClick(rowFencer, colFencer);
          }
        }}
        onMouseEnter={quickMouseScoring ? onHoverIn : undefined}
        onMouseLeave={quickMouseScoring ? onHoverOut : undefined}
        onWheel={quickMouseScoring && onWheelScore && !isLocked ? e => {
          e.preventDefault();
          e.stopPropagation();
          const delta = e.deltaY > 0 ? -1 : 1;
          onWheelScore(e.shiftKey, delta);
        } : undefined}
        role="button"
        tabIndex={isLocked ? -1 : 0}
        aria-label={`${rowFencer.lastName} ${rowFencer.firstName} contre ${colFencer.lastName} ${colFencer.firstName}${
          score ? ` : ${score.isVictory ? 'victoire ' : 'défaite '}${score.value}` : ', saisir le score'
        }`}
        style={{ cursor: isLocked ? 'default' : 'pointer', position: 'relative', ...highlightStyle }}
      >
        {score ? (
          <>
            <span>
              {score.isVictory ? 'V' : ''}
              {score.value}
            </span>
            {onMatchReset && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onMatchReset(rowFencer, colFencer);
                }}
                title="Annuler ce résultat"
                aria-label="Annuler ce résultat"
                className="pool-cell-reset-btn"
                style={{
                  position: 'absolute',
                  top: '1px',
                  right: '1px',
                  padding: '0 2px',
                  fontSize: '0.55rem',
                  lineHeight: 1,
                  background: 'rgba(239,68,68,0.15)',
                  border: 'none',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  opacity: 0,
                  transition: 'opacity 0.15s',
                  color: '#dc2626',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
              >
                ↺
              </button>
            )}
          </>
        ) : bufferedScore !== undefined ? (
          <span style={{ color: '#3b82f6', fontStyle: 'italic', fontSize: '0.85rem' }}>{bufferedScore}</span>
        ) : (
          <span style={{ color: '#9CA3AF' }}>-</span>
        )}
      </div>
    );
  }
);
ScoreCell.displayName = 'ScoreCell';

const PoolScoreMatrix: React.FC<PoolScoreMatrixProps> = ({
  pool,
  isLaserSabre,
  isVisible,
  toggleColumn,
  onCellClick,
  onFencerChangePool,
  onMatchReset,
  isLocked = false,
  quickMouseScoring = false,
  highlightedFencerIds,
  onHoverCell,
  onHoverLeave,
  onWheelScore,
  simplifiedInputMode = false,
  inlineEditKey,
  inlineSingleScore,
  cellScoreBuffer,
  onInlineSingleScoreChange,
  onInlineSubmit,
  onInlineCancel,
}) => {
  const fencers = pool.fencers;
  const [flashCell, setFlashCell] = useState<string | null>(null);
  const prevMatchesRef = useRef<typeof pool.matches>(pool.matches);

  useEffect(() => {
    const prev = prevMatchesRef.current;
    for (const match of pool.matches) {
      const old = prev.find(m => m.id === match.id);
      if (old && match.status === MatchStatus.FINISHED && old.status !== MatchStatus.FINISHED) {
        const key = `${match.fencerA?.id}-${match.fencerB?.id}`;
        setFlashCell(key);
        setTimeout(() => setFlashCell(null), 900);
        break;
      }
    }
    prevMatchesRef.current = pool.matches;
  }, [pool.matches]);

  // Index unique des matchs terminés : O(m) au lieu de O(n²·m) par rendu.
  const scoreMap = useMemo(() => {
    const map = new Map<string, Score | null>();
    for (const m of pool.matches) {
      if (m.status !== MatchStatus.FINISHED) continue;
      const a = m.fencerA?.id;
      const b = m.fencerB?.id;
      if (!a || !b) continue;
      map.set(`${a}-${b}`, m.scoreA ?? null);
      map.set(`${b}-${a}`, m.scoreB ?? null);
    }
    return map;
  }, [pool.matches]);

  type Stats = { v: number; d: number; td: number; tr: number; index: number; ratio: number };
  const statsMap = useMemo(() => {
    const map = new Map<string, Stats>();
    const ensure = (id: string) =>
      map.get(id) ?? map.set(id, { v: 0, d: 0, td: 0, tr: 0, index: 0, ratio: 0 }).get(id)!;
    for (const match of pool.matches) {
      if (match.status !== MatchStatus.FINISHED) continue;
      const a = match.fencerA?.id;
      const b = match.fencerB?.id;
      if (a) {
        const s = ensure(a);
        if (match.scoreA?.isVictory) s.v++;
        else s.d++;
        s.td += match.scoreA?.value || 0;
        s.tr += match.scoreB?.value || 0;
      }
      if (b) {
        const s = ensure(b);
        if (match.scoreB?.isVictory) s.v++;
        else s.d++;
        s.td += match.scoreB?.value || 0;
        s.tr += match.scoreA?.value || 0;
      }
    }
    for (const s of map.values()) {
      s.index = s.td - s.tr;
      s.ratio = s.v + s.d > 0 ? s.v / (s.v + s.d) : 0;
    }
    return map;
  }, [pool.matches]);

  const getScore = (fencerA: Fencer, fencerB: Fencer): Score | null =>
    scoreMap.get(`${fencerA.id}-${fencerB.id}`) ?? null;

  const calculateFencerStats = (fencer: Fencer): Stats =>
    statsMap.get(fencer.id) ?? { v: 0, d: 0, td: 0, tr: 0, index: 0, ratio: 0 };

  // Tireurs hors-jeu (abandon/forfait/exclusion) : lookup O(1) dans la grille.
  const abandonedIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of fencers) {
      if (
        f.status === FencerStatus.ABANDONED ||
        f.status === FencerStatus.FORFAIT ||
        f.status === FencerStatus.EXCLUDED
      ) {
        set.add(f.id);
      }
    }
    return set;
  }, [fencers]);

  // Données par ligne précalculées : sparkline + rang. Évite un filtre O(n·m) par rendu.
  const rowDataMap = useMemo(() => {
    const rankById = new Map(pool.ranking?.map(r => [r.fencer.id, r]) ?? []);
    const sparkById = new Map<string, boolean[]>();
    for (const f of fencers) sparkById.set(f.id, []);
    for (const m of pool.matches) {
      if (m.status !== MatchStatus.FINISHED) continue;
      if (m.fencerA?.id && sparkById.has(m.fencerA.id)) {
        sparkById.get(m.fencerA.id)!.push(!!m.scoreA?.isVictory);
      }
      if (m.fencerB?.id && sparkById.has(m.fencerB.id)) {
        sparkById.get(m.fencerB.id)!.push(!!m.scoreB?.isVictory);
      }
    }
    return { rankById, sparkById };
  }, [pool.matches, pool.ranking, fencers]);

  return (
    <div className="pool-grid">
      <div className="pool-row">
        <div className="pool-cell pool-cell-header pool-cell-name"></div>
        {fencers.map((f, i) => {
          const colHighlighted = quickMouseScoring && !!highlightedFencerIds?.has(f.id);
          return (
            <div
              key={f.id}
              className="pool-cell pool-cell-header"
              style={colHighlighted ? { background: 'rgba(59,130,246,0.15)', fontWeight: 700, color: 'var(--primary, #3b82f6)' } : undefined}
            >
              {i + 1}
            </div>
          );
        })}
        {isVisible('victories') && (
          <div
            className="pool-cell pool-cell-header"
            onContextMenu={e => { e.preventDefault(); toggleColumn('pool', 'victories'); }}
            title="Clic droit pour masquer"
          >
            V
          </div>
        )}
        {isVisible('ratio') && (
          <div
            className="pool-cell pool-cell-header"
            onContextMenu={e => { e.preventDefault(); toggleColumn('pool', 'ratio'); }}
            title="Clic droit pour masquer"
          >
            V/M
          </div>
        )}
        {isVisible('td') && (
          <div
            className="pool-cell pool-cell-header"
            onContextMenu={e => { e.preventDefault(); toggleColumn('pool', 'td'); }}
            title="Clic droit pour masquer"
          >
            TD
          </div>
        )}
        {isVisible('tr') && (
          <div
            className="pool-cell pool-cell-header"
            onContextMenu={e => { e.preventDefault(); toggleColumn('pool', 'tr'); }}
            title="Clic droit pour masquer"
          >
            TR
          </div>
        )}
        {isVisible('quest') && isLaserSabre && (
          <div
            className="pool-cell pool-cell-header"
            style={{ color: '#7c3aed' }}
            onContextMenu={e => { e.preventDefault(); toggleColumn('pool', 'quest'); }}
            title="Clic droit pour masquer"
          >
            Quest
          </div>
        )}
        {isVisible('index') && (
          <div
            className="pool-cell pool-cell-header"
            onContextMenu={e => { e.preventDefault(); toggleColumn('pool', 'index'); }}
            title="Clic droit pour masquer"
          >
            Ind
          </div>
        )}
        {isVisible('rank') && (
          <div
            className="pool-cell pool-cell-header"
            onContextMenu={e => { e.preventDefault(); toggleColumn('pool', 'rank'); }}
            title="Clic droit pour masquer"
          >
            Rg
          </div>
        )}
        {isVisible('club') && (
          <div
            className="pool-cell pool-cell-header"
            onContextMenu={e => { e.preventDefault(); toggleColumn('pool', 'club'); }}
            title="Clic droit pour masquer"
          >
            Club
          </div>
        )}
        {isVisible('nation') && (
          <div
            className="pool-cell pool-cell-header"
            onContextMenu={e => { e.preventDefault(); toggleColumn('pool', 'nation'); }}
            title="Clic droit pour masquer"
          >
            Nat
          </div>
        )}
        {isVisible('region') && (
          <div
            className="pool-cell pool-cell-header"
            onContextMenu={e => { e.preventDefault(); toggleColumn('pool', 'region'); }}
            title="Clic droit pour masquer"
          >
            Rég
          </div>
        )}
      </div>

      {fencers.map((rowFencer, rowIndex) => {
        const stats = calculateFencerStats(rowFencer);
        const rankEntry = rowDataMap.rankById.get(rowFencer.id);
        const rankRatio = (rankEntry?.rank ?? fencers.length) / fencers.length;
        const rowBg =
          rankRatio <= 0.4
            ? 'rgba(16,185,129,0.12)'
            : rankRatio <= 0.75
              ? 'rgba(245,158,11,0.10)'
              : 'rgba(239,68,68,0.10)';

        const sparkBars = rowDataMap.sparkById.get(rowFencer.id) ?? [];

        return (
          <div key={rowFencer.id} className="pool-row" style={{ backgroundColor: rowBg }}>
            <div
              className="pool-cell pool-cell-header pool-cell-name"
              title={`${rowFencer.firstName} ${rowFencer.lastName}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem',
                ...(quickMouseScoring && highlightedFencerIds?.has(rowFencer.id)
                  ? { background: 'rgba(59,130,246,0.12)', fontWeight: 700 }
                  : {}),
              }}
            >
              {(() => {
                const avatarColor =
                  rankRatio <= 0.4 ? '#059669' : rankRatio <= 0.75 ? '#3b82f6' : '#dc2626';
                const initials = `${rowFencer.firstName?.charAt(0) ?? ''}${rowFencer.lastName?.charAt(0) ?? ''}`.toUpperCase();
                return (
                  <div style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: avatarColor,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {initials}
                  </div>
                );
              })()}
              <span className="truncate" style={{ flex: 1, fontSize: '0.8rem' }}>
                <span style={{ fontWeight: 700 }}>{rowFencer.lastName}</span>
                <span style={{ fontSize: '0.7rem', color: '#6b7280', marginLeft: '0.25rem' }}>
                  {rowFencer.firstName?.charAt(0)}.
                </span>
              </span>
              {sparkBars.length > 0 && (
                <svg width="28" height="14" style={{ flexShrink: 0 }} aria-hidden="true">
                  {sparkBars.map((won, i) => (
                    <rect
                      key={i}
                      x={i * (28 / sparkBars.length) + 0.5}
                      y={won ? 0 : 6}
                      width={Math.max(1, 28 / sparkBars.length - 1.5)}
                      height={won ? 14 : 8}
                      rx="1"
                      fill={won ? '#22c55e' : '#ef4444'}
                    />
                  ))}
                </svg>
              )}
              {onFencerChangePool && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onFencerChangePool(rowFencer);
                  }}
                  title="Changer de poule"
                  aria-label={`Changer ${rowFencer.lastName} de poule`}
                  style={{
                    padding: '0.125rem 0.25rem',
                    fontSize: '0.625rem',
                    background: '#e5e7eb',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    opacity: 0.6,
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
                >
                  ↔
                </button>
              )}
            </div>

            {fencers.map((colFencer, colIndex) => {
              if (rowIndex === colIndex) {
                return <div key={colFencer.id} className="pool-cell pool-cell-diagonal"></div>;
              }

              const cellKey = `${rowFencer.id}-${colFencer.id}`;
              const mirrorKey = `${colFencer.id}-${rowFencer.id}`;

              const isHighlighted = quickMouseScoring
                ? (!!highlightedFencerIds?.has(rowFencer.id) && !!highlightedFencerIds?.has(colFencer.id))
                : false;

              return (
                <ScoreCell
                  key={colFencer.id}
                  rowFencer={rowFencer}
                  colFencer={colFencer}
                  abandoned={abandonedIds.has(rowFencer.id) || abandonedIds.has(colFencer.id)}
                  score={getScore(rowFencer, colFencer)}
                  isFlashing={flashCell === cellKey || flashCell === mirrorKey}
                  isLocked={isLocked}
                  onCellClick={onCellClick}
                  onMatchReset={onMatchReset}
                  isHighlighted={isHighlighted}
                  quickMouseScoring={quickMouseScoring}
                  onHoverIn={onHoverCell ? () => onHoverCell(rowFencer, colFencer) : undefined}
                  onHoverOut={onHoverLeave}
                  onWheelScore={onWheelScore ? (shiftKey, delta) => onWheelScore(rowFencer, colFencer, shiftKey, delta) : undefined}
                  isInlineEditing={simplifiedInputMode && inlineEditKey === cellKey}
                  inlineSingleScore={inlineSingleScore}
                  bufferedScore={cellScoreBuffer?.[cellKey]}
                  onInlineSingleScoreChange={onInlineSingleScoreChange}
                  onInlineSubmit={onInlineSubmit}
                  onInlineCancel={onInlineCancel}
                />
              );
            })}

            {isVisible('victories') && (
              <div className="pool-cell" style={{ fontWeight: 600 }}>
                {stats.v}
              </div>
            )}
            {isVisible('ratio') && (
              <div className="pool-cell text-sm">{formatRatio(stats.ratio)}</div>
            )}
            {isVisible('td') && <div className="pool-cell">{stats.td}</div>}
            {isVisible('tr') && <div className="pool-cell">{stats.tr}</div>}
            {isVisible('quest') && isLaserSabre && (
              <div className="pool-cell" style={{ fontWeight: 600, color: '#7c3aed' }}>
                {rankEntry?.questPoints ?? '-'}
              </div>
            )}
            {isVisible('index') && (
              <div
                className="pool-cell"
                style={{ color: stats.index >= 0 ? '#059669' : '#DC2626' }}
              >
                {formatIndex(stats.index)}
              </div>
            )}
            {isVisible('rank') && (
              <div className="pool-cell" style={{ fontWeight: 600 }}>
                {rankEntry?.rank || '-'}
              </div>
            )}
            {isVisible('club') && (
              <div className="pool-cell" style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {rowFencer.club ?? ''}
              </div>
            )}
            {isVisible('nation') && (
              <div className="pool-cell" style={{ fontWeight: 600, textTransform: 'uppercase' }}>
                {rowFencer.nationality ?? ''}
              </div>
            )}
            {isVisible('region') && (
              <div className="pool-cell" style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {rowFencer.region ?? ''}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(PoolScoreMatrix);
