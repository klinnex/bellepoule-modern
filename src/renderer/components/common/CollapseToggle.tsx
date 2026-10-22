/**
 * BellePoule Modern - Bouton compacter/déplier pour les classements
 * Licensed under GPL-3.0
 */

import React, { useCallback, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

/** Nombre de lignes visibles en mode compact */
export const COMPACT_ROW_COUNT = 8;

const STORAGE_PREFIX = 'bellepoule-collapsed-';

/** État compact/déplié persistant (localStorage) par clé de vue */
export function useCollapsed(key: string, defaultCollapsed = false): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(STORAGE_PREFIX + key);
      return v === null ? defaultCollapsed : v === '1';
    } catch {
      return defaultCollapsed;
    }
  });
  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_PREFIX + key, next ? '1' : '0');
      } catch {
        /* stockage indisponible */
      }
      return next;
    });
  }, [key]);
  return [collapsed, toggle];
}

interface CollapseToggleProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Nombre de lignes masquées en mode compact (affiché dans l'infobulle) */
  hiddenCount?: number;
}

export const CollapseToggle: React.FC<CollapseToggleProps> = ({
  collapsed,
  onToggle,
  hiddenCount,
}) => {
  const { t } = useTranslation();
  const label = collapsed
    ? hiddenCount
      ? t('ui.expand_hidden', { count: hiddenCount })
      : t('ui.expand')
    : t('ui.compact');
  return (
    <button
      type="button"
      className="collapse-toggle-btn"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-expanded={!collapsed}
    >
      {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
    </button>
  );
};

interface CollapsedRowProps {
  colSpan: number;
  hiddenCount: number;
  onExpand: () => void;
}

/** Ligne de tableau « … N autres » affichée en mode compact */
export const CollapsedRow: React.FC<CollapsedRowProps> = ({ colSpan, hiddenCount, onExpand }) => {
  const { t } = useTranslation();
  return (
    <tr className="collapse-more-row">
      <td colSpan={colSpan}>
        <button type="button" className="collapse-more-btn" onClick={onExpand}>
          {t('ui.more_rows', { count: hiddenCount })}
        </button>
      </td>
    </tr>
  );
};

export default CollapseToggle;
