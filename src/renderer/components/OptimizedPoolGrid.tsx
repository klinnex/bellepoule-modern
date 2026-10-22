/**
 * BellePoule Modern - Optimized Pool Grid Component
 * Efficient rendering of pool results grid
 * Licensed under GPL-3.0
 */

import React, { memo } from 'react';
import { Fencer, Match, MatchStatus } from '../../shared/types';
import { translateStatic } from '../contexts/TranslationContext';

interface PoolGridProps {
  fencers: Fencer[];
  matches: Match[];
  maxScore: number;
  onMatchClick: (match: Match) => void;
}

const isFencerAbandoned = (fencer: Fencer | undefined | null): boolean => {
  if (!fencer) return false;
  return fencer.status === 'A' || fencer.status === 'F' || fencer.status === 'E';
};

const GridCell = memo(
  ({
    match,
    onClick,
    isDiagonal,
    rowFencer,
    colFencer,
  }: {
    match: Match | null;
    onClick: () => void;
    isDiagonal: boolean;
    rowFencer?: Fencer;
    colFencer?: Fencer;
  }) => {
    if (isDiagonal) {
      return (
        <td
          style={{
            backgroundColor: '#f3f4f6',
            textAlign: 'center',
            fontWeight: 'bold',
            border: '1px solid #d1d5db',
          }}
        >
          -
        </td>
      );
    }

    const isMatchForfait =
      match?.scoreA?.isForfait === true ||
      match?.scoreB?.isForfait === true ||
      match?.scoreA?.isAbstention === true ||
      match?.scoreB?.isAbstention === true ||
      match?.scoreA?.isExclusion === true ||
      match?.scoreB?.isExclusion === true;

    if (isFencerAbandoned(rowFencer) || isFencerAbandoned(colFencer) || isMatchForfait) {
      return (
        <td
          style={{
            backgroundColor: '#e5e7eb',
            textAlign: 'center',
            border: '1px solid #d1d5db',
            color: '#9ca3af',
            cursor: 'not-allowed',
          }}
          title={translateStatic('poolGrid.not_played')}
        >
          -
        </td>
      );
    }

    if (!match) {
      return (
        <td
          style={{
            backgroundColor: '#fafafa',
            textAlign: 'center',
            cursor: 'pointer',
            border: '1px solid #d1d5db',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = '#e5e7eb';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = '#fafafa';
          }}
          onClick={onClick}
        >
          -
        </td>
      );
    }

    const scoreA = match.scoreA?.value ?? 0;
    const scoreB = match.scoreB?.value ?? 0;
    const victoryA = match.scoreA?.isVictory;
    const victoryB = match.scoreB?.isVictory;
    const isFinished = match.status === 'finished';

    const cellStyle: React.CSSProperties = {
      textAlign: 'center',
      cursor: 'pointer',
      border: '1px solid #d1d5db',
      fontWeight: 'bold',
    };

    if (victoryA) {
      cellStyle.backgroundColor = '#dcfce7';
      cellStyle.color = '#166534';
    } else if (victoryB) {
      cellStyle.backgroundColor = '#dcfce7';
      cellStyle.color = '#166534';
    } else if (isFinished && scoreA > 0 && scoreB > 0) {
      cellStyle.backgroundColor = '#fef3c7';
    }

    const displayScore = victoryA ? 'V' : victoryB ? 'V' : `${scoreA}-${scoreB}`;

    return (
      <td style={cellStyle} onClick={onClick}>
        {displayScore}
      </td>
    );
  }
);

GridCell.displayName = 'GridCell';

const HeaderRow = memo(({ fencers }: { fencers: Fencer[] }) => (
  <tr>
    <th
      style={{
        backgroundColor: '#1f2937',
        color: 'white',
        padding: '8px',
        border: '1px solid #374151',
        fontSize: '0.75rem',
      }}
    >
      #
    </th>
    <th
      style={{
        backgroundColor: '#1f2937',
        color: 'white',
        padding: '8px',
        border: '1px solid #374151',
        fontSize: '0.75rem',
      }}
    >
      {translateStatic('poolGrid.fencer')}
    </th>
    {fencers.map(fencer => (
      <th
        key={fencer.id}
        style={{
          backgroundColor: isFencerAbandoned(fencer) ? '#6b7280' : '#1f2937',
          color: 'white',
          padding: '4px',
          border: '1px solid #374151',
          fontSize: '0.625rem',
          transform: 'rotate(-45deg)',
          transformOrigin: 'center',
          width: '30px',
          height: '30px',
        }}
      >
        {fencer.ref}
      </th>
    ))}
  </tr>
));

HeaderRow.displayName = 'HeaderRow';

const FencerRow = memo(
  ({
    fencer,
    fencers,
    rowIndex,
    fencerCount,
    matches,
    onMatchClick,
  }: {
    fencer: Fencer;
    fencers: Fencer[];
    rowIndex: number;
    fencerCount: number;
    matches: Match[];
    onMatchClick: (match: Match) => void;
  }) => {
    const getMatchForCell = (
      colIndex: number
    ): { match: Match | null; colFencer: Fencer | undefined } => {
      const colFencer = fencers[colIndex];
      const match =
        matches.find(
          match =>
            (match.fencerA?.id === fencer.id && match.fencerB?.id === colFencer?.id) ||
            (match.fencerB?.id === fencer.id && match.fencerA?.id === colFencer?.id)
        ) || null;
      return { match, colFencer };
    };

    return (
      <tr>
        <td
          style={{
            backgroundColor: isFencerAbandoned(fencer) ? '#e5e7eb' : '#f9fafb',
            textAlign: 'center',
            fontWeight: 'bold',
            border: '1px solid #d1d5db',
            padding: '8px',
          }}
        >
          {fencer.ref}
        </td>
        <td
          style={{
            backgroundColor: isFencerAbandoned(fencer) ? '#e5e7eb' : '#f9fafb',
            padding: '8px',
            border: '1px solid #d1d5db',
            fontSize: '0.75rem',
            textAlign: 'left',
            whiteSpace: 'nowrap',
          }}
        >
          {fencer.firstName} {fencer.lastName}
        </td>
        {Array.from({ length: fencerCount }, (_, colIndex) => {
          const { match, colFencer } = getMatchForCell(colIndex);
          const isDiagonal = rowIndex === colIndex;

          return (
            <GridCell
              key={`${fencer.id}-${colIndex}`}
              match={match}
              onClick={() => match && onMatchClick(match)}
              isDiagonal={isDiagonal}
              rowFencer={fencer}
              colFencer={colFencer}
            />
          );
        })}
      </tr>
    );
  }
);

FencerRow.displayName = 'FencerRow';

export const PoolGrid: React.FC<PoolGridProps> = memo(
  ({ fencers, matches, maxScore, onMatchClick }) => {
    const createMatch = (fencerAId: string, fencerBId: string, index: number): Match => {
      const fencerA = fencers.find(f => f.id === fencerAId);
      const fencerB = fencers.find(f => f.id === fencerBId);

      return {
        id: `temp-${fencerAId}-${fencerBId}`,
        number: index,
        fencerA: fencerA || null,
        fencerB: fencerB || null,
        scoreA: null,
        scoreB: null,
        maxScore,
        status: MatchStatus.NOT_STARTED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    };

    const getMatchForCell = (fencerAId: string, fencerBId: string): Match | null => {
      return (
        matches.find(
          match =>
            (match.fencerA?.id === fencerAId && match.fencerB?.id === fencerBId) ||
            (match.fencerB?.id === fencerAId && match.fencerA?.id === fencerBId)
        ) || null
      );
    };

    return (
      <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '8px' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            fontSize: '0.6875rem',
            minWidth: `${300 + fencers.length * 35}px`,
          }}
        >
          <thead>
            <HeaderRow fencers={fencers} />
          </thead>
          <tbody>
            {fencers.map((fencer, rowIndex) => (
              <FencerRow
                key={fencer.id}
                fencer={fencer}
                fencers={fencers}
                rowIndex={rowIndex}
                fencerCount={fencers.length}
                matches={matches}
                onMatchClick={onMatchClick}
              />
            ))}
          </tbody>
        </table>
      </div>
    );
  }
);

PoolGrid.displayName = 'PoolGrid';
