/**
 * BellePoule Modern - Interactive Bracket Component
 * SVG-based tournament bracket visualization
 * Licensed under GPL-3.0
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Fencer } from '../../shared/types';
import { useTranslation } from '../hooks/useTranslation';
import { ChevronDown, ChevronRight, LayoutGrid, Triangle } from 'lucide-react';
import { Icon } from './common/Icon';

interface BracketMatch {
  id: string;
  round: number;
  position: number;
  fencerA: Fencer | null;
  fencerB: Fencer | null;
  scoreA: number | null;
  scoreB: number | null;
  winnerId?: string;
  isBye?: boolean;
}

interface BracketProps {
  matches: BracketMatch[];
  tableSize: number;
  onMatchClick?: (match: BracketMatch) => void;
  onScoreUpdate?: (matchId: string, scoreA: number, scoreB: number) => void;
  thirdPlaceMatch?: boolean;
  className?: string;
}

interface MatchPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MATCH_WIDTH = 200;
const MATCH_HEIGHT = 70;
const HORIZONTAL_GAP = 80;
const VERTICAL_GAP = 10;

/** Libellé des tours (1 = finale, 2 = demi-finales…) */
const ROUND_KEYS: Record<number, string> = {
  1: 'bracket.final',
  2: 'bracket.semis',
  3: 'bracket.quarters',
  4: 'bracket.r16',
  5: 'bracket.r32',
  6: 'bracket.r64',
  7: 'bracket.r128',
};

const Bracket: React.FC<BracketProps> = ({
  matches,
  tableSize,
  onMatchClick,
  onScoreUpdate,
  thirdPlaceMatch = false,
  className = '',
}) => {
  const { t } = useTranslation();
  const [hoveredMatch, setHoveredMatch] = useState<string | null>(null);
  const [editingMatch, setEditingMatch] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'pyramid'>('horizontal');
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());

  const toggleRoundExpansion = (round: number) => {
    setExpandedRounds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(round)) {
        newSet.delete(round);
      } else {
        newSet.add(round);
      }
      return newSet;
    });
  };

  const expandAll = () => setExpandedRounds(new Set(Array.from(rounds.keys())));
  const collapseAll = () => setExpandedRounds(new Set());

  const rounds = useMemo(() => {
    const roundMap = new Map<number, BracketMatch[]>();
    matches.forEach(match => {
      if (!roundMap.has(match.round)) {
        roundMap.set(match.round, []);
      }
      roundMap.get(match.round)!.push(match);
    });
    return roundMap;
  }, [matches]);

  const maxRound = Math.max(...Array.from(rounds.keys()));
  const svgWidth = (maxRound + 1) * (MATCH_WIDTH + HORIZONTAL_GAP) + 100;
  const matchesPerRound = tableSize / 2;
  const svgHeight = Math.max(400, matchesPerRound * (MATCH_HEIGHT + VERTICAL_GAP) + 100);

  const calculateMatchPosition = useCallback(
    (round: number, position: number): MatchPosition => {
      const matchesInRound = rounds.get(round)?.length || 0;
      const baseY = svgHeight / 2;

      const roundSpacing = MATCH_HEIGHT + VERTICAL_GAP;

      let yOffset = 0;
      // Avec round=1=Finale, round=N=premier tour → 2^(round-1) matchs par round
      const totalMatchesForRound = Math.pow(2, round - 1);
      const matchesCount = Math.max(matchesInRound, totalMatchesForRound);

      if (matchesCount > 1) {
        const index = position - 1;
        const totalHeight = (matchesCount - 1) * roundSpacing;
        yOffset = -totalHeight / 2 + index * roundSpacing;
      }

      return {
        x: 50 + (maxRound - round) * (MATCH_WIDTH + HORIZONTAL_GAP),
        y: baseY + yOffset,
        width: MATCH_WIDTH,
        height: MATCH_HEIGHT,
      };
    },
    [rounds, maxRound, svgHeight, tableSize]
  );

  const renderFencerBox = (
    fencer: Fencer | null,
    score: number | null,
    isWinner: boolean,
    isTop: boolean
  ) => {
    const bgColor = isWinner ? '#d4edda' : fencer ? '#f8f9fa' : '#e9ecef';
    const textColor = fencer ? '#212529' : '#6c757d';
    const borderColor = isWinner ? '#28a745' : '#dee2e6';

    return (
      <g>
        <rect
          x={0}
          y={isTop ? 0 : MATCH_HEIGHT / 2}
          width={MATCH_WIDTH - 40}
          height={MATCH_HEIGHT / 2}
          fill={bgColor}
          stroke={borderColor}
          strokeWidth={1}
        />
        <text
          x={10}
          y={isTop ? MATCH_HEIGHT / 4 + 4 : (MATCH_HEIGHT * 3) / 4 + 4}
          fill={textColor}
          fontSize={12}
          fontWeight={isWinner ? 'bold' : 'normal'}
        >
          {fencer ? `${fencer.lastName} ${fencer.firstName.charAt(0)}.` : 'TBD'}
        </text>
        {fencer?.club && (
          <text
            x={10}
            y={isTop ? MATCH_HEIGHT / 4 + 16 : (MATCH_HEIGHT * 3) / 4 + 16}
            fill="#6c757d"
            fontSize={9}
          >
            {fencer.club}
          </text>
        )}
        <rect
          x={MATCH_WIDTH - 40}
          y={isTop ? 0 : MATCH_HEIGHT / 2}
          width={40}
          height={MATCH_HEIGHT / 2}
          fill={bgColor}
          stroke={borderColor}
          strokeWidth={1}
        />
        <text
          x={MATCH_WIDTH - 20}
          y={isTop ? MATCH_HEIGHT / 4 + 4 : (MATCH_HEIGHT * 3) / 4 + 4}
          fill={textColor}
          fontSize={14}
          fontWeight="bold"
          textAnchor="middle"
        >
          {score !== null ? score : '-'}
        </text>
      </g>
    );
  };

  const renderConnectionLines = (match: BracketMatch, pos: MatchPosition) => {
    // round=1=Finale, round=N=premier tour. Les feeders ont round+1 (plus à gauche).
    const feederRound = match.round + 1;
    if (!rounds.has(feederRound)) return null;

    const parentPositionA = match.position * 2 - 1;
    const parentPositionB = match.position * 2;

    const parentPosA = calculateMatchPosition(feederRound, parentPositionA);
    const parentPosB = calculateMatchPosition(feederRound, parentPositionB);

    return (
      <g>
        {/* Line from feeder A (left) to current match (right) */}
        <path
          d={`M ${parentPosA.x + MATCH_WIDTH} ${parentPosA.y + MATCH_HEIGHT / 2}
              L ${pos.x} ${pos.y + MATCH_HEIGHT / 2}`}
          stroke="#adb5bd"
          strokeWidth={2}
          fill="none"
        />
        {/* Line from feeder B (left) to current match (right) */}
        <path
          d={`M ${parentPosB.x + MATCH_WIDTH} ${parentPosB.y + MATCH_HEIGHT / 2}
              L ${pos.x} ${pos.y + MATCH_HEIGHT / 2}`}
          stroke="#adb5bd"
          strokeWidth={2}
          fill="none"
        />
      </g>
    );
  };

  const handleMatchClick = (match: BracketMatch) => {
    if (match.fencerA && match.fencerB && !match.isBye) {
      setEditingMatch(match.id);
      onMatchClick?.(match);
    }
  };

  const renderFencerRow = (fencer: Fencer | null, score: number | null, isWinner: boolean) => {
    const bg = isWinner ? '#d4edda' : fencer ? '#f8f9fa' : '#e9ecef';
    const border = isWinner ? '#28a745' : '#dee2e6';
    const textColor = fencer ? '#212529' : '#6c757d';

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          border: `1px solid ${border}`,
          backgroundColor: bg,
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <div className="bracket-1">
          <div
            style={{
              fontWeight: isWinner ? 'bold' : 'normal',
              color: textColor,
              fontSize: '0.8125rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {fencer ? `${fencer.lastName} ${fencer.firstName.charAt(0)}.` : 'TBD'}
          </div>
          {fencer?.club && <div className="bracket-2">{fencer.club}</div>}
        </div>
        <div
          style={{
            width: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderLeft: `1px solid ${border}`,
            fontWeight: 'bold',
            fontSize: '0.875rem',
            color: textColor,
            flexShrink: 0,
          }}
        >
          {score !== null ? score : '-'}
        </div>
      </div>
    );
  };

  // Render a bracket in pyramid layout
  const renderPyramidLayout = () => {
    const sortedRounds = Array.from(rounds.keys()).sort((a, b) => b - a);

    // round=1=Finale, round=2=Demi, round=3=Quarts, round=4=16èmes, ...
    const roundName = (round: number) =>
      ROUND_KEYS[round] && round <= 6 ? t(ROUND_KEYS[round]) : t('bracket.round_n', { n: round });

    return (
      <div className="bracket-3">
        <div className="bracket-4">
          <button onClick={expandAll} className="bracket-5">
            {t('bracket.expand_all')}
          </button>
          <button onClick={collapseAll} className="bracket-6">
            {t('bracket.collapse_all')}
          </button>
        </div>
        {sortedRounds.map(round => {
          const roundMatches = rounds.get(round) || [];
          const isExpanded = expandedRounds.size === 0 || expandedRounds.has(round);

          return (
            <div key={round} className="bracket-7">
              <div onClick={() => toggleRoundExpansion(round)} className="bracket-8">
                <span className="bracket-9">
                  <Icon icon={isExpanded ? ChevronDown : ChevronRight} />
                </span>
                {roundName(round)}
              </div>
              {isExpanded && (
                <div className="bracket-10">
                  {roundMatches.map(match => {
                    const isHovered = hoveredMatch === match.id;
                    const isEditing = editingMatch === match.id;
                    const winner = match.winnerId;
                    const isA = winner === match.fencerA?.id;
                    const isB = winner === match.fencerB?.id;

                    return (
                      <div
                        key={match.id}
                        style={{
                          width: '280px',
                          cursor: match.isBye ? 'default' : 'pointer',
                          borderRadius: '6px',
                          outline: isEditing ? '2px solid #2196f3' : undefined,
                          backgroundColor: isHovered ? '#e3f2fd' : 'white',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                          padding: '4px',
                        }}
                        onMouseEnter={() => setHoveredMatch(match.id)}
                        onMouseLeave={() => setHoveredMatch(null)}
                        onClick={() => handleMatchClick(match)}
                      >
                        {match.isBye && <div className="bracket-11">{t('bracket.bye')}</div>}
                        <div className="bracket-12">
                          {renderFencerRow(match.fencerA, match.scoreA, isA)}
                          {renderFencerRow(match.fencerB, match.scoreB, isB)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`bracket-container ${className} bracket-13`}>
      {/* Layout toggle buttons */}
      <div className="bracket-14">
        <button
          onClick={() => setLayoutMode('horizontal')}
          style={{
            background:
              layoutMode === 'horizontal' ? 'var(--color-primary)' : 'var(--color-border)',
            color: layoutMode === 'horizontal' ? 'white' : 'var(--color-text)',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
          title={t('bracket.horizontal')}
        >
          <Icon icon={LayoutGrid} /> {t('bracket.horizontal')}
        </button>
        <button
          onClick={() => setLayoutMode('pyramid')}
          style={{
            background: layoutMode === 'pyramid' ? '#8b5cf6' : 'var(--color-border)',
            color: layoutMode === 'pyramid' ? 'white' : 'var(--color-text)',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
          title={t('bracket.pyramid')}
        >
          <Icon icon={Triangle} /> {t('bracket.pyramid')}
        </button>
      </div>

      {layoutMode === 'horizontal' ? (
        <svg width={svgWidth} height={svgHeight} style={{ minWidth: svgWidth }}>
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#adb5bd" />
            </marker>
          </defs>

          {/* Render connection lines first (behind matches) */}
          {matches.map(match => {
            const pos = calculateMatchPosition(match.round, match.position);
            return <g key={`line-${match.id}`}>{renderConnectionLines(match, pos)}</g>;
          })}

          {/* Render matches */}
          {matches.map(match => {
            const pos = calculateMatchPosition(match.round, match.position);
            const isHovered = hoveredMatch === match.id;
            const isEditing = editingMatch === match.id;
            const winner = match.winnerId;
            const isA = winner === match.fencerA?.id;
            const isB = winner === match.fencerB?.id;

            return (
              <g
                key={match.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{ cursor: match.isBye ? 'default' : 'pointer' }}
                onMouseEnter={() => setHoveredMatch(match.id)}
                onMouseLeave={() => setHoveredMatch(null)}
                onClick={() => handleMatchClick(match)}
              >
                {/* Match background */}
                <rect
                  x={-5}
                  y={-5}
                  width={MATCH_WIDTH + 10}
                  height={MATCH_HEIGHT + 10}
                  fill={isHovered ? '#e3f2fd' : 'transparent'}
                  stroke={isEditing ? '#2196f3' : 'transparent'}
                  strokeWidth={2}
                  rx={4}
                />

                {/* Bye indicator */}
                {match.isBye && (
                  <text
                    x={MATCH_WIDTH / 2}
                    y={-10}
                    textAnchor="middle"
                    fill="#6c757d"
                    fontSize={10}
                  >
                    {t('bracket.bye')}
                  </text>
                )}

                {/* Fencer boxes */}
                {renderFencerBox(match.fencerA, match.scoreA, isA, true)}
                {renderFencerBox(match.fencerB, match.scoreB, isB, false)}

                {/* Round label for first round */}
                {match.round === 1 && (
                  <text
                    x={MATCH_WIDTH / 2}
                    y={MATCH_HEIGHT + 20}
                    textAnchor="middle"
                    fill="#6c757d"
                    fontSize={10}
                  >
                    {match.position <= tableSize / 4 ? `1/${tableSize / 2}` : t('bracket.final')}
                  </text>
                )}
              </g>
            );
          })}

          {/* Round labels */}
          {Array.from(rounds.keys()).map(round => {
            const pos = calculateMatchPosition(round, 1);
            // round=1=Finale, round=2=Demi, round=3=Quarts, round=4=16èmes, ...
            const roundNames: Record<number, string> = Object.fromEntries(
              Object.entries(ROUND_KEYS).map(([r, key]) => [r, t(key)])
            );

            return (
              <text
                key={`label-${round}`}
                x={pos.x + MATCH_WIDTH / 2}
                y={30}
                textAnchor="middle"
                fill="#495057"
                fontSize={12}
                fontWeight="bold"
              >
                {roundNames[round] || t('bracket.round_n', { n: round })}
              </text>
            );
          })}
        </svg>
      ) : (
        <div className="bracket-13">{renderPyramidLayout()}</div>
      )}
    </div>
  );
};

export default React.memo(Bracket);
