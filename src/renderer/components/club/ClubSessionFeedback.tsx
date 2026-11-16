/**
 * BellePoule Modern - Mode Club (#1872) : bilan de séance.
 * Note 1-5, ce qui a marché, à améliorer, et une remarque par tireur présent
 * (retrouvée ensuite dans sa fiche statistique).
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { Star } from 'lucide-react';
import type {
  ClubMember,
  ClubSession,
  ClubSessionFeedback as Feedback,
} from '../../../shared/types/club';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

interface ClubSessionFeedbackProps {
  session: ClubSession;
  /** Membres du club (noms des présents) */
  members: ClubMember[];
  onSave: (feedback: Feedback, memberFeedback: Record<string, string>) => void;
  onClose: () => void;
}

export const ClubSessionFeedbackModal: React.FC<ClubSessionFeedbackProps> = ({
  session,
  members,
  onSave,
  onClose,
}) => {
  const { t } = useTranslation();
  const [rating, setRating] = useState(session.feedback?.rating ?? 0);
  const [wentWell, setWentWell] = useState(session.feedback?.wentWell ?? '');
  const [toImprove, setToImprove] = useState(session.feedback?.toImprove ?? '');
  const [perMember, setPerMember] = useState<Record<string, string>>({
    ...session.memberFeedback,
  });
  const present = members.filter(m => session.attendeeIds.includes(m.id));

  return (
    <Modal
      title={t('clubFeedback.title', { date: session.date })}
      onClose={onClose}
      size="lg"
      scroll
      footer={
        <>
          <Button onClick={onClose}>{t('clubFeedback.later')}</Button>
          <Button
            variant="primary"
            onClick={() => onSave({ rating: rating || undefined, wentWell, toImprove }, perMember)}
          >
            {t('actions.save')}
          </Button>
        </>
      }
    >
      <fieldset className="club-rating">
        <legend className="form-label">{t('clubFeedback.rating')}</legend>
        {[1, 2, 3, 4, 5].map(n => (
          <Button
            key={n}
            size="sm"
            variant="ghost"
            className={n <= rating ? 'club-star is-on' : 'club-star'}
            aria-pressed={n <= rating}
            aria-label={t('clubFeedback.rating_n', { n })}
            title={t('clubFeedback.rating_n', { n })}
            icon={<Star size={20} aria-hidden="true" />}
            onClick={() => setRating(n === rating ? 0 : n)}
          />
        ))}
      </fieldset>
      <label className="form-label">
        {t('clubFeedback.went_well')}
        <textarea
          className="form-input club-textarea"
          rows={2}
          value={wentWell}
          onChange={e => setWentWell(e.target.value)}
        />
      </label>
      <label className="form-label">
        {t('clubFeedback.to_improve')}
        <textarea
          className="form-input club-textarea"
          rows={2}
          value={toImprove}
          onChange={e => setToImprove(e.target.value)}
        />
      </label>
      <h3 className="club-card-title">{t('clubFeedback.per_fencer')}</h3>
      {present.length === 0 ? (
        <p className="club-muted">{t('clubFeedback.no_present')}</p>
      ) : (
        <ul className="club-feedback-list">
          {present.map(m => (
            <li key={m.id}>
              <label className="form-label">
                {m.lastName} {m.firstName}
                <input
                  className="form-input"
                  value={perMember[m.id] ?? ''}
                  maxLength={1000}
                  placeholder={t('clubFeedback.fencer_ph')}
                  onChange={e => setPerMember(p => ({ ...p, [m.id]: e.target.value }))}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
