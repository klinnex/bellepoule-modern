/**
 * BellePoule Modern - Bouton « Colonnes » : afficher / masquer des colonnes (#1817)
 * Le choix est mémorisé par tableau (localStorage).
 * Licensed under GPL-3.0
 */

import React, { useCallback, useState } from 'react';
import { Columns3 } from 'lucide-react';
import { Icon } from '../common/Icon';
import { useTranslation } from '../../hooks/useTranslation';

export interface ColumnDef {
  id: string;
  label: string;
  /** Visible par défaut (true si absent) */
  defaultVisible?: boolean;
}

function readHidden(storageKey: string, columns: ColumnDef[]): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed.filter(x => typeof x === 'string'));
    }
  } catch {
    /* stockage indisponible : valeurs par défaut */
  }
  return new Set(columns.filter(c => c.defaultVisible === false).map(c => c.id));
}

/** Colonnes visibles + bascule, persistées sous `storageKey`. */
export function useColumnVisibility(storageKey: string, columns: ColumnDef[]) {
  const [hidden, setHidden] = useState<Set<string>>(() => readHidden(storageKey, columns));
  const toggle = useCallback(
    (id: string) =>
      setHidden(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          /* stockage indisponible : choix non mémorisé */
        }
        return next;
      }),
    [storageKey]
  );
  const isVisible = useCallback((id: string) => !hidden.has(id), [hidden]);
  return { isVisible, toggle };
}

export const ColumnsMenu: React.FC<{
  columns: ColumnDef[];
  isVisible: (id: string) => boolean;
  onToggle: (id: string) => void;
}> = ({ columns, isVisible, onToggle }) => {
  const { t } = useTranslation();
  return (
    <details className="columns-menu">
      <summary className="columns-menu__toggle">
        <Icon icon={Columns3} /> {t('analytics.columns')}
      </summary>
      <div className="columns-menu__panel" role="group" aria-label={t('analytics.columns')}>
        {columns.map(c => (
          <label key={c.id} className="columns-menu__item">
            <input type="checkbox" checked={isVisible(c.id)} onChange={() => onToggle(c.id)} />
            {c.label}
          </label>
        ))}
      </div>
    </details>
  );
};
