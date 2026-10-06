/**
 * BellePoule Modern - Interactive Bracket Component
 * SVG-based tournament bracket visualization
 * Licensed under GPL-3.0
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Fencer } from '../../shared/types';

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

const Bracket: React.FC<BracketProps> = ({
  matches,
  tableSize,
  onMatchClick,
  onScoreUpdate,
  thirdPlaceMatch = false,
  className = '',
}) => {
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
        <div style={{ flex: 1, padding: '4px 8px', minWidth: 0 }}>
          <div
            style={{
              fontWeight: isWinner ? 'bold' : 'normal',
              color: textColor,
              fontSize: '13px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {fencer ? `${fencer.lastName} ${fencer.firstName.charAt(0)}.` : 'TBD'}
          </div>
          {fencer?.club && <div style={{ fontSize: '10px', color: '#6c757d' }}>{fencer.club}</div>}
        </div>
        <div
          style={{
            width: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderLeft: `1px solid ${border}`,
            fontWeight: 'bold',
            fontSize: '14px',
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
      round === 1
        ? 'Finale'
        : round === 2
          ? 'Demi-finales'
          : round === 3
            ? 'Quarts'
            : round === 4
              ? '16èmes'
              : round === 5
                ? '32èmes'
                : round === 6
                  ? '64èmes'
                  : `Tour ${round}`;

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2rem',
          padding: '1rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <button
            onClick={expandAll}
            style={{
              background: '#10b981',
              color: 'white',
              border: 'none',
              padding: '0.25rem 0.75rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
          >
            Tout déplier
          </button>
          <button
            onClick={collapseAll}
            style={{
              background: '#6b7280',
              color: 'white',
              border: 'none',
              padding: '0.25rem 0.75rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
          >
            Tout replier
          </button>
        </div>
        {sortedRounds.map(round => {
          const roundMatches = rounds.get(round) || [];
          const isExpanded = expandedRounds.size === 0 || expandedRounds.has(round);

          return (
            <div
              key={round}
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '1rem',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
              }}
            >
              <div
                onClick={() => toggleRoundExpansion(round)}
                style={{
                  textAlign: 'center',
                  fontWeight: '600',
                  marginBottom: '1rem',
                  color: '#374151',
                  fontSize: '1.1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  userSelect: 'none',
                }}
              >
                <span style={{ fontSize: '0.8rem' }}>{isExpanded ? '▼' : '▶'}</span>
                {roundName(round)}
              </div>
              {isExpanded && (
                <div
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    alignItems: 'center',
                  }}
                >
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
                        {match.isBye && (
                          <div
                            style={{
                              textAlign: 'center',
                              fontSize: '10px',
                              color: '#6c757d',
                              marginBottom: '2px',
                            }}
                          >
                            EXEMPT
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
    <div className={`bracket-container ${className}`} style={{ overflow: 'auto' }}>
      {/* Layout toggle buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setLayoutMode('horizontal')}
          style={{
            background: layoutMode === 'horizontal' ? '#3b82f6' : '#e5e7eb',
            color: layoutMode === 'horizontal' ? 'white' : '#374151',
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
          title="Vue horizontale"
        >
          🔲 Vue horizontale
        </button>
        <button
          onClick={() => setLayoutMode('pyramid')}
          style={{
            background: layoutMode === 'pyramid' ? '#8b5cf6' : '#e5e7eb',
            color: layoutMode === 'pyramid' ? 'white' : '#374151',
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
          title="Vue pyramidale"
        >
          🔺 Vue pyramidale
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
                    EXEMPT
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
                    {match.position <= tableSize / 4 ? `1/${tableSize / 2}` : 'Finale'}
                  </text>
                )}
              </g>
            );
          })}

          {/* Round labels */}
          {Array.from(rounds.keys()).map(round => {
            const pos = calculateMatchPosition(round, 1);
            // round=1=Finale, round=2=Demi, round=3=Quarts, round=4=16èmes, ...
            const roundNames: Record<number, string> = {
              1: 'Finale',
              2: 'Demi-finales',
              3: 'Quarts',
              4: '16èmes',
              5: '32èmes',
              6: '64èmes',
              7: '128èmes',
            };

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
                {roundNames[round] || `Tour ${round}`}
              </text>
            );
          })}
        </svg>
      ) : (
        <div style={{ overflow: 'auto' }}>{renderPyramidLayout()}</div>
      )}
    </div>
  );
};

export default React.memo(Bracket);
