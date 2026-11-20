/**
 * BellePoule Modern - TableauPendingSection
 * Section repliable d'un round dans la vue "Matchs en attente"
 * Licensed under GPL-3.0
 */

import React from 'react';
import { translateStatic } from '../../contexts/TranslationContext';
import { TableauMatch } from '../../../shared/domain/tableau/tableauTypes';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Icon } from '../common/Icon';

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
  const roundName =
    round === 3
      ? translateStatic('pdf.round_third_place')
      : translateStatic('pdf.round_table', { n: round });

  return (
    <div className="is-9c78b6">
      <div onClick={() => onToggle(round)} className="tableau-pending-section-1">
        <div className="u-row">
          <span className="tableau-pending-section-2">
            <Icon icon={isExpanded ? ChevronDown : ChevronRight} />
          </span>
          <span className="tableau-pending-section-3">{roundName}</span>
        </div>
        <span className="u-hint">
          {translateStatic(`pendingSection.matches_${roundMatches.length > 1 ? 'other' : 'one'}`, {
            count: roundMatches.length,
          })}
        </span>
      </div>
      {isExpanded && (
        <div className="tableau-pending-section-4">
          {roundMatches.map(match => (
            <div key={match.id} className="mb-2">
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
