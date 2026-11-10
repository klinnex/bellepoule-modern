/**
 * BellePoule Modern - Onglets de groupe d'une compétition couplée (#1532)
 * Extrait de CompetitionView (plafond de longueur #1155).
 * Licensed under GPL-3.0
 */
import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { genderLabel } from '../common/GenderLabel';

interface SplitGroupTabsProps {
  groups: string[];
  active: string;
  onSelect: (group: string) => void;
}

export const SplitGroupTabs: React.FC<SplitGroupTabsProps> = ({ groups, active, onSelect }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface-2)',
      }}
    >
      {groups.map(g => (
        <button
          key={g}
          onClick={() => onSelect(g)}
          style={{
            padding: '0.375rem 0.875rem',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: g === active ? '700' : '400',
            background: g === active ? 'var(--color-primary)' : 'var(--color-border)',
            color: g === active ? 'white' : 'var(--color-text)',
            fontSize: '0.875rem',
          }}
        >
          {genderLabel(g, t)}
        </button>
      ))}
    </div>
  );
};
