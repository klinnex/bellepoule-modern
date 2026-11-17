/**
 * BellePoule Modern - Paramètres → Salles et pistes (#1880)
 * Salles déclarées une fois (nom, nombre de pistes), reprises par les journées, le Mode Club,
 * le serveur d'arbitrage et Cyrano. Une salle est « par défaut ».
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';
import { Button } from './common/Button';
import { Icon } from './common/Icon';
import { HINT, BOLD, SMALL_BTN, TOGGLE_LABEL } from './settingsModal.styles';
import { MAX_VENUE_STRIPS, type Venue, type VenueInput } from '../../shared/types/appSettings';

const api = () => window.electronAPI?.settings;

interface Draft {
  id?: string;
  name: string;
  stripCount: number;
}

const EMPTY_DRAFT: Draft = { name: '', stripCount: 4 };

/** Pistes d'une salle redimensionnée : on garde libellés et appareils des pistes conservées */
export function resizeStrips(venue: Venue | undefined, count: number): VenueInput['strips'] {
  const kept = (venue?.strips ?? []).filter(s => s.number <= count);
  const byNumber = new Map(kept.map(s => [s.number, s]));
  return Array.from({ length: count }, (_, i) => byNumber.get(i + 1) ?? { number: i + 1 });
}

const VenueForm: React.FC<{
  draft: Draft;
  onChange: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  invalid: boolean;
}> = ({ draft, onChange, onSave, onCancel, invalid }) => {
  const { t } = useTranslation();
  return (
    <form
      className="venue-form"
      onSubmit={e => {
        e.preventDefault();
        onSave();
      }}
    >
      <label htmlFor="venue-name" style={TOGGLE_LABEL}>
        {t('venues.name')}
      </label>
      <input
        id="venue-name"
        type="text"
        className="form-input mb-2"
        value={draft.name}
        maxLength={120}
        aria-invalid={invalid}
        onChange={e => onChange({ ...draft, name: e.target.value })}
      />
      <label htmlFor="venue-strips" style={TOGGLE_LABEL}>
        {t('venues.strip_count')}
      </label>
      <input
        id="venue-strips"
        type="number"
        min={1}
        max={MAX_VENUE_STRIPS}
        className="form-input mb-2 venue-strips-input"
        value={draft.stripCount}
        onChange={e => {
          const n = Math.floor(Number(e.target.value) || 1);
          onChange({ ...draft, stripCount: Math.max(1, Math.min(MAX_VENUE_STRIPS, n)) });
        }}
      />
      {invalid && (
        <p className="form-error" role="alert">
          {t('venues.name_required')}
        </p>
      )}
      <div className="u-row">
        <Button type="submit" variant="primary" style={SMALL_BTN}>
          {t('venues.save')}
        </Button>
        <Button type="button" style={SMALL_BTN} onClick={onCancel}>
          {t('venues.cancel')}
        </Button>
      </div>
    </form>
  );
};

const VenuesSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nameInvalid, setNameInvalid] = useState(false);

  const reload = useCallback(async () => {
    setVenues(await api()!.listVenues());
  }, []);

  useEffect(() => {
    api()
      ?.listVenues?.()
      .then(setVenues)
      .catch(() => {
        // hors Electron (tests, navigateur)
      });
  }, []);

  /** Action sur les salles : rechargement + toast de succès ou d'erreur */
  const run = async (action: () => Promise<unknown>, successKey?: string): Promise<boolean> => {
    try {
      await action();
      await reload();
      if (successKey) showToast(t(successKey), 'success');
      return true;
    } catch {
      showToast(t('venues.failed'), 'error');
      return false;
    }
  };

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setNameInvalid(true);
      return;
    }
    const existing = venues?.find(v => v.id === draft.id);
    const input: VenueInput = {
      ...(draft.id ? { id: draft.id } : {}),
      name,
      strips: resizeStrips(existing, draft.stripCount),
    };
    if (await run(() => api()!.upsertVenue(input), 'venues.saved')) closeForm();
  };

  const remove = async (venue: Venue) => {
    const ok = await confirm({
      message: t('venues.delete_confirm', { name: venue.name }),
      confirmLabel: t('venues.delete'),
    });
    if (ok) await run(() => api()!.deleteVenue(venue.id), 'venues.deleted');
  };

  const openForm = (d: Draft) => {
    setNameInvalid(false);
    setDraft(d);
  };
  const closeForm = () => setDraft(null);

  if (!venues) return null;

  return (
    <div className="form-group">
      <label style={BOLD}>{t('venues.title')}</label>
      <p style={HINT}>{t('venues.hint')}</p>

      {venues.length === 0 ? (
        <p style={HINT}>{t('venues.empty')}</p>
      ) : (
        <ul className="venue-list" aria-label={t('venues.title')}>
          {venues.map(v => (
            <li key={v.id} className="venue-item">
              <span className="venue-name">{v.name}</span>
              <span style={HINT} className="venue-count">
                {t('venues.strips', { count: v.strips.length })}
              </span>
              {v.isDefault && <span className="badge venue-default">{t('venues.default')}</span>}
              <span className="venue-actions u-row">
                <Button
                  style={SMALL_BTN}
                  icon={<Icon icon={Pencil} />}
                  aria-label={`${t('venues.edit')} ${v.name}`}
                  onClick={() => openForm({ id: v.id, name: v.name, stripCount: v.strips.length })}
                >
                  {t('venues.edit')}
                </Button>
                {!v.isDefault && (
                  <Button
                    style={SMALL_BTN}
                    icon={<Icon icon={Star} />}
                    aria-label={`${t('venues.set_default')} ${v.name}`}
                    onClick={() => void run(() => api()!.setDefaultVenue(v.id))}
                  >
                    {t('venues.set_default')}
                  </Button>
                )}
                <Button
                  style={SMALL_BTN}
                  icon={<Icon icon={Trash2} />}
                  aria-label={`${t('venues.delete')} ${v.name}`}
                  onClick={() => void remove(v)}
                >
                  {t('venues.delete')}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <VenueForm
          draft={draft}
          invalid={nameInvalid}
          onChange={d => {
            setNameInvalid(false);
            setDraft(d);
          }}
          onSave={() => void save()}
          onCancel={closeForm}
        />
      ) : (
        <Button style={SMALL_BTN} icon={<Icon icon={Plus} />} onClick={() => openForm(EMPTY_DRAFT)}>
          {t('venues.add')}
        </Button>
      )}
    </div>
  );
};

export default VenuesSettingsSection;
