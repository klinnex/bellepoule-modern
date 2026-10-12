/**
 * BellePoule Modern - TableauPendingSection
 * Section repliable d'un round dans la vue "Matchs en attente"
 * Licensed under GPL-3.0
 */

import React from 'react';
import { TableauMatch } from './tableauTypes';

interface TableauPendingSectionProps {
  round: number;
  matches: TableauMatch[];
  isExpanded: boolean;
  onToggle: (round: number) => void;
  renderMatch: (match: TableauMatch) => React.ReactNode;
}

const TableauPendingSectionComponent: React.FC<TableauPendingSectionProps> = ({
  round,
  matches,
  isExpanded,
  onToggle,
  renderMatch,
}) => {
  const roundMatches = matches
    .filter(m => m.round === round)
    .sort((a, b) => a.position - b.position);
  const roundName = round === 3 ? 'Petite Finale' : `Tableau de ${round}`;

  return (
    <div
      style={{
        background: 'var(--tableau-panel, white)',
        borderRadius: '8px',
        marginBottom: '0.5rem',
        overflow: 'hidden',
        border: '1px solid var(--tableau-border, #e5e7eb)',
      }}
    >
      <div
        onClick={() => onToggle(round)}
        style={{
          padding: '0.75rem 1rem',
          background: 'var(--tableau-panel-header, #f3f4f6)',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1rem' }}>{isExpanded ? '▼' : '▶'}</span>
          <span style={{ fontWeight: '600', color: 'var(--tableau-title, #374151)' }}>
            {roundName}
          </span>
        </div>
        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          {roundMatches.length} match{roundMatches.length !== 1 ? 's' : ''}
        </span>
      </div>
      {isExpanded && (
        <div style={{ padding: '0.5rem' }}>
          {roundMatches.map(match => (
            <div key={match.id} style={{ marginBottom: '0.5rem' }}>
              {renderMatch(match)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const TableauPendingSection = React.memo(TableauPendingSectionComponent);
export default TableauPendingSection;
