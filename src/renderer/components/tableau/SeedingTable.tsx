import React from 'react';
import { PoolRanking } from '../../../shared/types';
import { CollapseToggle, useCollapsed } from '../common/CollapseToggle';
import { translateStatic } from '../../contexts/TranslationContext';

interface SeedingTableProps {
  ranking: PoolRanking[];
  tableauSize: number;
}

const SeedingTable: React.FC<SeedingTableProps> = ({ ranking, tableauSize }) => {
  const [collapsed, toggleCollapsed] = useCollapsed('seeding-table');
  return (
    <div className="is-cee5c5">
      <h3 className="is-2f4235">
        {translateStatic('seedingTable.title')}
        <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} />
      </h3>
      {!collapsed && (
        <div className="is-ad112b">
          {ranking.slice(0, tableauSize).map((r, idx) => (
            <div
              key={r.fencer.id}
              style={{
                display: 'flex',
                gap: '0.5rem',
                padding: '0.25rem 0.5rem',
                // Clair : bleu / blanc ; sombre : dégradé bleu-gris (#1114)
                background: idx < 8 ? 'var(--color-seed-top-bg)' : 'var(--color-seed-bg)',
                color: 'var(--color-text)',
                borderRadius: '4px',
                fontSize: '0.875rem',
              }}
            >
              <span className="is-667334">{idx + 1}.</span>
              <div className="is-55ace1">
                <span>
                  {r.fencer.lastName} {r.fencer.firstName}
                </span>
                <span className="is-c2ff1b">
                  {r.fencer.club && r.fencer.club}
                  {r.fencer.birthDate && ` • ${new Date(r.fencer.birthDate).getFullYear()}`}
                  {r.fencer.ranking && ` • #${r.fencer.ranking}`}
                </span>
              </div>
              <span className="is-4b605b">{(r.ratio * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(SeedingTable);
