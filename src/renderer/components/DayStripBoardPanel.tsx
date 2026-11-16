/**
 * BellePoule Modern - Pistes d'une journée en temps réel (#1878) : occupation lue sur les
 * saisies distantes des épreuves, pistes libérées proposées au travail en attente (un clic ou
 * affectation automatique), réservation par piste (épreuves et phases autorisées).
 * Licensed under GPL-3.0
 */
import React, { useCallback, useEffect, useState } from 'react';
import type {
  DayStripBoard,
  DayStripStatus,
  StripCandidate,
  StripRule,
} from '../../shared/types/eventDay';
import {
  DEFAULT_STRIP_RULE,
  isDefaultStripRule,
  TABLEAU_LIMITS,
} from '../../shared/utils/stripRules';
import { useTranslation } from '../hooks/useTranslation';
import { Button } from './common/Button';

const POLL_MS = 5000;

interface Props {
  dayId: string;
  /** Épreuves de la journée (réservation par épreuve) */
  competitions: { id: string; title: string }[];
  /** Occupation lue en base (poules en cours) : affichée sans saisie distante ouverte */
  occupation: DayStripStatus[];
}

function occupationLabel(o: DayStripStatus | undefined, t: T): string | null {
  if (!o || o.free) return null;
  const vars = { n: o.number ?? 0, title: o.competitionTitle ?? '' };
  return o.kind === 'pool' ? t('eventDay.strips_pool', vars) : t('eventDay.strips_match', vars);
}

type T = ReturnType<typeof useTranslation>['t'];

export function candidateLabel(c: StripCandidate, t: T): string {
  if (c.kind === 'pool')
    return t('eventDay.strips_pool', { n: c.number ?? 0, title: c.competitionTitle });
  return t('eventDay.cand_match', {
    size: c.tableauSize ?? '?',
    fencers: c.fencers ?? '',
    title: c.competitionTitle,
  });
}

export function ruleSummary(rule: StripRule, titles: Map<string, string>, t: T): string | null {
  if (isDefaultStripRule(rule)) return null;
  const parts: string[] = [];
  if (rule.competitions)
    parts.push(
      rule.competitions.map(id => titles.get(id) ?? id).join(', ') || t('eventDay.res_none')
    );
  if (!rule.pools) parts.push(t('eventDay.res_no_pools'));
  if (!rule.tableau) parts.push(t('eventDay.res_no_tableau'));
  else if (rule.tableauMax) parts.push(t('eventDay.res_tableau_max', { n: rule.tableauMax }));
  return parts.join(' · ');
}

const RuleEditor: React.FC<{
  rule: StripRule;
  competitions: Props['competitions'];
  onSave: (rule: StripRule | null) => void;
}> = ({ rule, competitions, onSave }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<StripRule>(rule);
  const allowed = (id: string) => !draft.competitions || draft.competitions.includes(id);
  const toggleCompetition = (id: string, on: boolean) => {
    const current = draft.competitions ?? competitions.map(c => c.id);
    const next = on ? [...current, id] : current.filter(c => c !== id);
    setDraft({ ...draft, competitions: next.length === competitions.length ? null : next });
  };
  return (
    <div className="event-day-strip-rule">
      <span className="text-muted">{t('eventDay.res_competitions')}</span>
      {competitions.map(c => (
        <label key={c.id} className="event-day-check">
          <input
            type="checkbox"
            checked={allowed(c.id)}
            onChange={e => toggleCompetition(c.id, e.target.checked)}
          />
          {c.title}
        </label>
      ))}
      <label className="event-day-check">
        <input
          type="checkbox"
          checked={draft.pools}
          onChange={e => setDraft({ ...draft, pools: e.target.checked })}
        />
        {t('eventDay.res_pools')}
      </label>
      <label className="event-day-check">
        <input
          type="checkbox"
          checked={draft.tableau}
          onChange={e => setDraft({ ...draft, tableau: e.target.checked })}
        />
        {t('eventDay.res_tableau')}
      </label>
      <select
        className="form-input"
        aria-label={t('eventDay.res_tableau_limit')}
        disabled={!draft.tableau}
        value={draft.tableauMax ?? ''}
        onChange={e =>
          setDraft({ ...draft, tableauMax: e.target.value ? Number(e.target.value) : null })
        }
      >
        <option value="">{t('eventDay.res_all_tableaux')}</option>
        {TABLEAU_LIMITS.map(n => (
          <option key={n} value={n}>
            {t('eventDay.res_tableau_max', { n })}
          </option>
        ))}
      </select>
      <div className="event-day-strip-actions">
        <Button size="sm" variant="primary" onClick={() => onSave(draft)}>
          {t('eventDay.res_save')}
        </Button>
        <Button size="sm" onClick={() => onSave(null)}>
          {t('eventDay.res_reset')}
        </Button>
      </div>
    </div>
  );
};

export const DayStripBoardPanel: React.FC<Props> = ({ dayId, competitions, occupation }) => {
  const { t } = useTranslation();
  const api = window.electronAPI?.eventDay;
  const [board, setBoard] = useState<DayStripBoard | null>(null);
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const titles = new Map(competitions.map(c => [c.id, c.title]));

  const load = useCallback(async () => {
    if (!api?.getStripBoard) return;
    setBoard(await api.getStripBoard(dayId).catch(() => null));
  }, [api, dayId]);

  useEffect(() => {
    // Premier chargement différé : pas de setState synchrone dans l'effet
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  if (!board || !api) return null;

  const assign = async (strip: number, key: string | undefined) => {
    if (key) await api.assignStrip(dayId, strip, key);
    await load();
  };
  const saveRule = async (strip: number, rule: StripRule | null) => {
    await api.setStripRule(dayId, strip, rule);
    setEditing(null);
    await load();
  };

  return (
    <div className="event-day-strip-board">
      <label className="event-day-check">
        <input
          type="checkbox"
          checked={board.autoAssign}
          onChange={async e => {
            await api.setAutoAssign(dayId, e.target.checked);
            await load();
          }}
        />
        {t('eventDay.auto_assign')}
      </label>
      {!board.live && <p className="text-muted">{t('eventDay.live_offline')}</p>}
      <ul className="event-day-strips">
        {board.strips.map(s => {
          const summary = ruleSummary(s.rule, titles, t);
          const planned = board.live
            ? null
            : occupationLabel(
                occupation.find(o => o.strip === s.strip),
                t
              );
          const busy = !!s.competitionId || !!planned;
          // Choix encore proposé ? sinon la première proposition (liste rafraîchie)
          const picked = s.candidates.some(c => c.key === choice[s.strip])
            ? choice[s.strip]
            : s.candidates[0]?.key;
          return (
            <li key={s.strip} className={`event-day-strip${busy ? ' event-day-strip--busy' : ''}`}>
              <strong>{t('eventDay.strip', { n: s.strip })}</strong>
              <span>{s.competitionTitle ?? planned ?? t('eventDay.free')}</span>
              {summary && (
                <span className="text-muted">{t('eventDay.reserved', { rule: summary })}</span>
              )}
              {!s.competitionId && board.live && s.candidates.length === 0 && (
                <span className="text-muted">{t('eventDay.nothing_waiting')}</span>
              )}
              {!s.competitionId && s.candidates.length > 0 && (
                <div className="event-day-strip-actions">
                  <select
                    className="form-input"
                    aria-label={t('eventDay.waiting_label', { n: s.strip })}
                    value={picked}
                    onChange={e => setChoice({ ...choice, [s.strip]: e.target.value })}
                  >
                    {s.candidates.map(c => (
                      <option key={c.key} value={c.key}>
                        {candidateLabel(c, t)}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="primary" onClick={() => void assign(s.strip, picked)}>
                    {t('eventDay.assign')}
                  </Button>
                </div>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(editing === s.strip ? null : s.strip)}
              >
                {t('eventDay.reservation')}
              </Button>
              {editing === s.strip && (
                <RuleEditor
                  rule={s.rule ?? DEFAULT_STRIP_RULE}
                  competitions={competitions}
                  onSave={rule => void saveRule(s.strip, rule)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default DayStripBoardPanel;
