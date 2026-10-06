/**
 * BellePoule Modern - Éditeur de critères de classement drag-reorderable
 */

import React, { useRef, useState, memo } from 'react';
import { RankingCriterion, RankingCriterionId } from '../../../shared/types';

const CRITERION_LABELS: Record<RankingCriterionId, string> = {
  vm_ratio: 'V/M (ratio victoires)',
  index: 'Indice (TD − TR)',
  touches_scored: 'Touches données',
  touches_received: 'Touches reçues',
  direct_bout: 'Confrontation directe',
  initial_ranking: 'Classement initial',
  custom_points: 'Points personnalisés',
};

interface Props {
  criteria: RankingCriterion[];
  onChange: (criteria: RankingCriterion[]) => void;
  readOnly?: boolean;
}

const RankingCriteriaEditor_: React.FC<Props> = ({ criteria, onChange, readOnly }) => {
  const dragIndex = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === dropIndex) {
      setDragOver(null);
      return;
    }
    const reordered = [...criteria];
    const [moved] = reordered.splice(dragIndex.current, 1);
    reordered.splice(dropIndex, 0, moved);
    onChange(reordered);
    dragIndex.current = null;
    setDragOver(null);
  };

  const handleDragEnd = () => {
    dragIndex.current = null;
    setDragOver(null);
  };

  const toggleEnabled = (index: number) => {
    const updated = [...criteria];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    onChange(updated);
  };

  const toggleDirection = (index: number) => {
    const updated = [...criteria];
    updated[index] = {
      ...updated[index],
      direction: updated[index].direction === 'desc' ? 'asc' : 'desc',
    };
    onChange(updated);
  };

  const activePriority = (index: number): number => {
    let count = 0;
    for (let i = 0; i <= index; i++) {
      if (criteria[i].enabled) count++;
    }
    return criteria[index].enabled ? count : 0;
  };

  return (
    <div className="ranking-criteria-editor">
      <div className="ranking-criteria-list">
        {criteria.map((criterion, index) => (
          <div
            key={criterion.id}
            className={`ranking-criterion-row ${!criterion.enabled ? 'disabled' : ''} ${dragOver === index ? 'drag-over' : ''}`}
            draggable={!readOnly}
            onDragStart={e => handleDragStart(e, index)}
            onDragOver={e => handleDragOver(e, index)}
            onDrop={e => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
          >
            {/* Grip + priorité */}
            <div className="criterion-grip" title="Glisser pour réordonner">
              <span className="criterion-priority">
                {criterion.enabled ? activePriority(index) : '—'}
              </span>
              {!readOnly && <span className="grip-icon">⠿</span>}
            </div>

            {/* Label */}
            <span className="criterion-label">{CRITERION_LABELS[criterion.id]}</span>

            {/* Direction */}
            {!readOnly && criterion.enabled && (
              <button
                type="button"
                className="btn-direction"
                onClick={() => toggleDirection(index)}
                title={criterion.direction === 'desc' ? 'Décroissant' : 'Croissant'}
              >
                {criterion.direction === 'desc' ? '↓' : '↑'}
              </button>
            )}

            {/* Toggle */}
            {!readOnly && (
              <label
                className="criterion-toggle"
                title={criterion.enabled ? 'Désactiver' : 'Activer'}
              >
                <input
                  type="checkbox"
                  checked={criterion.enabled}
                  onChange={() => toggleEnabled(index)}
                />
                <span className="toggle-slider" />
              </label>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export const RankingCriteriaEditor = memo(RankingCriteriaEditor_);
