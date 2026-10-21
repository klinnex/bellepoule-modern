/**
 * BellePoule Modern - Éditeur de zones de score personnalisées
 */

import React, { memo } from 'react';
import { CustomScoringConfig, CustomTouchZone } from '../../../shared/types';
import { useTranslation } from '../../hooks/useTranslation';

interface Props {
  scoring: CustomScoringConfig;
  onChange: (scoring: CustomScoringConfig) => void;
  readOnly?: boolean;
}

const DEFAULT_COLORS = [
  '#EF4444',
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
];

function newZone(index: number): CustomTouchZone {
  return {
    id: `zone_${Date.now()}_${index}`,
    label: `Zone ${index + 1}`,
    points: 1,
    color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
  };
}

const ScoringZoneEditor_: React.FC<Props> = ({ scoring, onChange, readOnly }) => {
  const { t } = useTranslation();
  const setType = (type: 'standard' | 'zones') => {
    if (type === 'zones') {
      onChange({
        ...scoring,
        type: 'zones',
        zones: scoring.zones?.length
          ? scoring.zones
          : [
              { id: 'zone_head', label: t('scoringZones.head'), points: 3, color: '#EF4444' },
              { id: 'zone_torso', label: t('scoringZones.torso'), points: 2, color: '#F59E0B' },
              { id: 'zone_arm', label: t('scoringZones.limbs'), points: 1, color: '#10B981' },
            ],
      });
    } else {
      onChange({ ...scoring, type: 'standard' });
    }
  };

  const updateZone = (index: number, partial: Partial<CustomTouchZone>) => {
    const zones = [...(scoring.zones ?? [])];
    zones[index] = { ...zones[index], ...partial };
    onChange({ ...scoring, zones });
  };

  const addZone = () => {
    const zones = [...(scoring.zones ?? [])];
    zones.push(newZone(zones.length));
    onChange({ ...scoring, zones });
  };

  const removeZone = (index: number) => {
    const zones = (scoring.zones ?? []).filter((_, i) => i !== index);
    onChange({ ...scoring, zones });
  };

  return (
    <div className="scoring-zone-editor">
      <div className="scoring-type-row">
        <label className="scoring-type-option">
          <input
            type="radio"
            name="scoring-type"
            value="standard"
            checked={scoring.type === 'standard'}
            onChange={() => setType('standard')}
            disabled={readOnly}
          />
          <span>{t('formula.scoring_standard')}</span>
        </label>
        <label className="scoring-type-option">
          <input
            type="radio"
            name="scoring-type"
            value="zones"
            checked={scoring.type === 'zones'}
            onChange={() => setType('zones')}
            disabled={readOnly}
          />
          <span>{t('formula.scoring_zones')}</span>
        </label>
      </div>

      {scoring.type === 'zones' && (
        <div className="zones-list">
          {(scoring.zones ?? []).map((zone, i) => (
            <div key={zone.id} className="zone-row">
              <input
                type="color"
                className="zone-color-picker"
                value={zone.color ?? '#3B82F6'}
                onChange={e => updateZone(i, { color: e.target.value })}
                disabled={readOnly}
                title={t('scoringZones.color')}
              />
              <input
                type="text"
                className="form-input zone-label-input"
                value={zone.label}
                onChange={e => updateZone(i, { label: e.target.value })}
                disabled={readOnly}
                placeholder={t('scoringZones.name_ph')}
              />
              <input
                type="number"
                className="form-input zone-points-input"
                min={1}
                max={99}
                value={zone.points}
                onChange={e => updateZone(i, { points: Number(e.target.value) })}
                disabled={readOnly}
              />
              <span className="zone-pts-label">{t('scoringZones.pts')}</span>
              {!readOnly && (
                <button
                  type="button"
                  className="btn btn-icon btn-secondary zone-remove-btn"
                  onClick={() => removeZone(i)}
                  title={t('scoringZones.remove')}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {!readOnly && (scoring.zones ?? []).length < 8 && (
            <button type="button" className="btn btn-secondary zone-add-btn" onClick={addZone}>
              {t('scoringZones.add')}
            </button>
          )}
          {(scoring.zones ?? []).length > 0 && (
            <p className="zone-preview-text">
              {t('scoringZones.max')}{' '}
              <strong>
                {Math.max(...(scoring.zones ?? []).map(z => z.points))} {t('scoringZones.pts')}
              </strong>
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export const ScoringZoneEditor = memo(ScoringZoneEditor_);
