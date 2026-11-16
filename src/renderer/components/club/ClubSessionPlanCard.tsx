/**
 * BellePoule Modern - Mode Club (#1872) : plan de cours pendant la séance.
 * Objectifs, exercices à cocher au fil de la séance, notes / compte rendu.
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { ClipboardList, FileDown, Pencil, Printer, Save } from 'lucide-react';
import type { ClubSession } from '../../../shared/types/club';
import { formatMinutes, planDuration } from '../../../shared/utils/clubPlan';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';

interface ClubSessionPlanCardProps {
  session: ClubSession;
  onToggle: (itemId: string, done: boolean) => void;
  onSaveNotes: (notes: string) => void;
  onEdit: () => void;
  onExportPdf: () => void;
  onPrint: () => void;
}

export const ClubSessionPlanCard: React.FC<ClubSessionPlanCardProps> = ({
  session,
  onToggle,
  onSaveNotes,
  onEdit,
  onExportPdf,
  onPrint,
}) => {
  const { t } = useTranslation();
  // null = notes enregistrées (pas d'édition en cours)
  const [draft, setDraft] = useState<string | null>(null);
  const notes = draft ?? session.notes ?? '';
  const done = session.plan.filter(it => it.done).length;

  return (
    <section className="club-card" aria-labelledby="club-plan-title">
      <div className="club-row club-row--between">
        <h2 id="club-plan-title" className="club-card-title">
          <ClipboardList size={16} aria-hidden="true" /> {t('clubPlan.plan')}
          {session.plan.length > 0 && (
            <span className="club-muted">
              {' '}
              · {t('clubPlan.progress', { done, total: session.plan.length })} ·{' '}
              {formatMinutes(planDuration(session.plan))}
            </span>
          )}
        </h2>
        <span className="club-row">
          <Button icon={<FileDown size={15} aria-hidden="true" />} onClick={onExportPdf}>
            {t('clubPlan.export_pdf')}
          </Button>
          <Button icon={<Printer size={15} aria-hidden="true" />} onClick={onPrint}>
            {t('clubPlan.print')}
          </Button>
          <Button icon={<Pencil size={15} aria-hidden="true" />} onClick={onEdit}>
            {t('clubPlan.edit')}
          </Button>
        </span>
      </div>
      {session.objectives && (
        <p className="club-objectives">
          <strong>{t('clubPlan.objectives')} : </strong>
          {session.objectives}
        </p>
      )}
      {session.plan.length === 0 ? (
        <p className="club-muted">{t('clubPlan.empty')}</p>
      ) : (
        <ol className="club-plan">
          {session.plan.map(it => (
            <li key={it.id} className={it.done ? 'is-done' : undefined}>
              <label className="club-plan-check">
                <input
                  type="checkbox"
                  checked={!!it.done}
                  onChange={e => onToggle(it.id, e.target.checked)}
                />
                <span className="font-medium">{it.title}</span>
                <span className="club-muted">{formatMinutes(it.minutes)}</span>
              </label>
              {it.details && <p className="club-plan-details">{it.details}</p>}
            </li>
          ))}
        </ol>
      )}
      <label className="form-label">
        {t('clubPlan.notes')}
        <textarea
          className="form-input club-textarea"
          rows={3}
          value={notes}
          placeholder={t('clubPlan.notes_ph')}
          onChange={e => setDraft(e.target.value)}
        />
      </label>
      {draft !== null && (
        <div className="club-row">
          <Button
            variant="primary"
            size="sm"
            icon={<Save size={14} aria-hidden="true" />}
            onClick={() => {
              onSaveNotes(draft);
              setDraft(null);
            }}
          >
            {t('clubPlan.save_notes')}
          </Button>
        </div>
      )}
    </section>
  );
};
