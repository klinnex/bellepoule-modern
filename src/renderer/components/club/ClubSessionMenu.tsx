/**
 * BellePoule Modern - Mode Club (#1872) : menu global des séances, visible depuis tous
 * les onglets du club. Séance ouverte (fermeture) et séances prévues à l'avance
 * (ouverture) ou passées (réouverture) ; la séance en cours est fermée d'abord, après
 * confirmation.
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, ClipboardList, Lock, Play, Unlock } from 'lucide-react';
import type { ClubSession } from '../../../shared/types/club';
import { weaponLabel } from '../../../shared/utils/categoryLabel';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useConfirm } from '../ConfirmDialog';
import { useToast } from '../Toast';
import { ageRangeText } from './ClubAgeRange';
import { switchClubSession } from './clubSessionSwitch';

interface ClubSessionMenuProps {
  clubId: string;
  /** Change quand les séances ont été modifiées ailleurs (onglet Séances) */
  revision: number;
  /** Séances modifiées depuis le menu */
  onChanged: () => void;
  /** Préparer une nouvelle séance (onglet Séances) */
  onPrepare: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const ClubSessionMenu: React.FC<ClubSessionMenuProps> = ({
  clubId,
  revision,
  onChanged,
  onPrepare,
}) => {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const api = window.electronAPI?.club;
  const [sessions, setSessions] = useState<ClubSession[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!api) return;
    setSessions(await api.listSessions(clubId));
  }, [api, clubId]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  if (!api) return null;

  const current = sessions.find(s => s.status === 'open') ?? null;
  const planned = sessions
    .filter(s => s.status === 'planned')
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = sessions
    .filter(s => s.status === 'closed')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const describe = (s: ClubSession) =>
    [s.label ?? '', ageRangeText(s, t), s.weapon ? weaponLabel(s.weapon, t) : '']
      .filter(Boolean)
      .join(' · ');

  /** Fermeture de la séance ouverte, combats en cours annulés après confirmation */
  const confirmClose = async (s: ClubSession, message: string, label: string) => {
    const bouts = await api.listBouts({ sessionId: s.id, includeUnfinished: true });
    const live = bouts.filter(b => b.status === 'pending' || b.status === 'in_progress').length;
    return confirm({
      message: `${message}\n${t('clubSession.close_confirm', { count: live })}`,
      confirmLabel: label,
    });
  };

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showToast(errText(e), 'error');
    } finally {
      setBusy(false);
      await load();
      onChanged();
    }
  };

  const closeCurrent = async () => {
    if (!current) return;
    if (!(await confirmClose(current, describe(current) || current.date, t('clubSession.close'))))
      return;
    await act(() => api.closeSession(current.id));
  };

  const start = async (s: ClubSession) => {
    if (current?.id === s.id) return;
    if (current) {
      const ok = await confirmClose(
        current,
        t('clubSessionMenu.switch_confirm', { from: current.date, to: s.date }),
        s.status === 'closed' ? t('clubSession.reopen') : t('clubSessionMenu.open')
      );
      if (!ok) return;
    }
    await act(async () => {
      await switchClubSession(api, current, s);
      showToast(t('clubSessionMenu.opened', { date: s.date }), 'success');
    });
  };

  const day = today();

  return (
    <>
      <Button
        variant={current ? 'primary' : 'secondary'}
        icon={<CalendarClock size={15} aria-hidden="true" />}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          void load();
        }}
      >
        {current
          ? t('clubSessionMenu.button_open', { date: current.date })
          : t('clubSessionMenu.button', { count: planned.length })}
      </Button>
      {open && (
        <Modal
          title={t('clubSessionMenu.title')}
          size="md"
          scroll
          onClose={() => setOpen(false)}
          footer={
            <Button
              icon={<ClipboardList size={15} aria-hidden="true" />}
              onClick={() => {
                setOpen(false);
                onPrepare();
              }}
            >
              {t('clubPlan.prepare')}
            </Button>
          }
        >
          <h3 className="club-card-title">{t('clubSessionMenu.current')}</h3>
          {current ? (
            <div className="club-row club-row--between club-session-menu-row">
              <span>
                <span className="font-medium">{current.date}</span>
                {describe(current) ? ` · ${describe(current)}` : ''}
              </span>
              <Button
                size="sm"
                variant="danger"
                icon={<Lock size={14} aria-hidden="true" />}
                loading={busy}
                onClick={() => void closeCurrent()}
              >
                {t('clubSession.close')}
              </Button>
            </div>
          ) : (
            <p className="club-muted">{t('clubSessionMenu.none_open')}</p>
          )}
          <h3 className="club-card-title">{t('clubPlan.upcoming')}</h3>
          {planned.length === 0 ? (
            <p className="club-muted">{t('clubPlan.none_planned')}</p>
          ) : (
            <ul className="club-session-menu-list">
              {planned.map(s => (
                <li
                  key={s.id}
                  className={
                    s.date === day
                      ? 'club-row club-row--between club-session-menu-row club-session-menu-row--today'
                      : 'club-row club-row--between club-session-menu-row'
                  }
                >
                  <span>
                    <span className="font-medium">{s.date}</span>
                    {s.date === day ? ` (${t('clubSessionMenu.today')})` : ''}
                    {describe(s) ? ` · ${describe(s)}` : ''}
                  </span>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Play size={14} aria-hidden="true" />}
                    disabled={busy}
                    onClick={() => void start(s)}
                  >
                    {t('clubSessionMenu.open')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {past.length > 0 && (
            <>
              <h3 className="club-card-title">{t('clubSession.past')}</h3>
              <ul className="club-session-menu-list">
                {past.map(s => (
                  <li key={s.id} className="club-row club-row--between club-session-menu-row">
                    <span>
                      <span className="font-medium">{s.date}</span>
                      {describe(s) ? ` · ${describe(s)}` : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Unlock size={14} aria-hidden="true" />}
                      disabled={busy}
                      onClick={() => void start(s)}
                    >
                      {t('clubSession.reopen')}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Modal>
      )}
    </>
  );
};
