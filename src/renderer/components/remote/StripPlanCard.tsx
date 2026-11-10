/**
 * BellePoule Modern - Plan des pistes (#1501)
 * Carte repliable (repliée par défaut) : une case par piste de l'intervalle ;
 * un clic bascule la piste en indisponible (case rouge).
 * Licensed under GPL-3.0
 */
import { Tooltip } from '../Tooltip';
import React, { useState } from 'react';
import { stripNumbers } from '../../../shared/utils/stripRange';
import { useTranslation } from '../../hooks/useTranslation';
import { useStripAvailability } from '../../hooks/useStripAvailability';

interface StripPlanCardProps {
  start: number;
  end: number;
}

export const StripPlanCard: React.FC<StripPlanCardProps> = ({ start, end }) => {
  const { t } = useTranslation();
  const unavailable = useStripAvailability(s => s.unavailable);
  const onToggle = useStripAvailability(s => s.toggle);
  const [expanded, setExpanded] = useState(false);
  const count = stripNumbers(start, end).filter(n => unavailable.includes(n)).length;
  return (
    <div className="strip-plan">
      <button
        type="button"
        className="strip-plan-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded(v => !v)}
      >
        {expanded ? '▾' : '▸'} {t('rsm.strip_plan')}
        {count > 0 && (
          <span className="strip-plan-count">{t('rsm.strip_plan_unavailable', { count })}</span>
        )}
      </button>
      {expanded && (
        <>
          <p className="u-hint">{t('rsm.strip_plan_hint')}</p>
          <div className="strip-plan-grid">
            {stripNumbers(start, end).map(n => {
              const off = unavailable.includes(n);
              return (
                <Tooltip
                  key={n}
                  content={
                    off ? t('rsm.strip_plan_make_available') : t('rsm.strip_plan_make_unavailable')
                  }
                >
                  <button
                    type="button"
                    className={`strip-plan-cell${off ? ' is-unavailable' : ''}`}
                    aria-pressed={off}
                    aria-label={
                      off
                        ? t('rsm.strip_plan_make_available')
                        : t('rsm.strip_plan_make_unavailable')
                    }
                    onClick={() => onToggle(n)}
                  >
                    {n}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
