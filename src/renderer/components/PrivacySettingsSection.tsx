/**
 * BellePoule Modern - Paramètres → Confidentialité (RGPD, #1882)
 * Noms sur le réseau, durée de conservation, droits des personnes (accès, portabilité,
 * anonymisation, effacement) et archives .bpm chiffrées.
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';
import { Button } from './common/Button';
import { HINT, BOLD, SMALL_BTN, TOGGLE_LABEL } from './settingsModal.styles';
import type {
  NameMasking,
  PrivacyPerson,
  PrivacyPersonRef,
  PrivacySettings,
  RetentionCandidates,
} from '../../shared/types/privacy';
import { personalDataHtml, type PersonalDataLabels } from '../../shared/utils/personalDataPdf';

export type PrivacyItemId =
  'privacy_network' | 'privacy_retention' | 'privacy_person' | 'privacy_bpm';

const MASKINGS: NameMasking[] = ['full', 'initial', 'initials'];
const MIN_PASSWORD = 8;

const api = () => window.electronAPI?.privacy;

const refOf = (p: PrivacyPerson): PrivacyPersonRef => ({
  fencerIds: p.fencers.map(f => f.fencerId),
  memberIds: p.members.map(m => m.memberId),
});

const nameOf = (p: { lastName: string; firstName: string }) =>
  `${p.lastName} ${p.firstName}`.trim();

/** Réglages RGPD chargés depuis le main ; null hors Electron */
function usePrivacySettings() {
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  useEffect(() => {
    api()
      ?.getSettings?.()
      .then(setSettings)
      .catch(() => {
        // hors Electron (tests, navigateur)
      });
  }, []);
  const update = useCallback(async (patch: Partial<PrivacySettings>) => {
    const res = await api()?.setSettings(patch);
    if (res?.success && res.settings) setSettings(res.settings);
  }, []);
  return { settings, update };
}

const NetworkItem: React.FC<{
  settings: PrivacySettings;
  update: (p: Partial<PrivacySettings>) => void;
}> = ({ settings, update }) => {
  const { t } = useTranslation();
  return (
    <div className="form-group">
      <label style={BOLD}>{t('privacy.network_title')}</label>
      <p style={HINT}>{t('privacy.network_hint')}</p>
      <div role="radiogroup" aria-label={t('privacy.network_title')}>
        {MASKINGS.map(m => (
          <label key={m} className="u-row cursor-pointer">
            <input
              type="radio"
              name="privacy-masking"
              value={m}
              checked={settings.nameMasking === m}
              onChange={() => update({ nameMasking: m })}
            />
            <span style={TOGGLE_LABEL}>{t(`privacy.masking_${m}`)}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

const RetentionItem: React.FC<{
  settings: PrivacySettings;
  update: (p: Partial<PrivacySettings>) => Promise<void>;
}> = ({ settings, update }) => {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [candidates, setCandidates] = useState<RetentionCandidates | null>(null);

  const months = (v: string) => Math.max(0, Math.min(600, Math.floor(Number(v) || 0)));

  const check = async () => {
    try {
      setCandidates((await api()?.retentionCandidates()) ?? null);
    } catch {
      showToast(t('privacy.error'), 'error');
    }
  };

  const apply = async () => {
    if (!candidates) return;
    const counts = {
      competitions: candidates.competitions.length,
      members: candidates.members.length,
    };
    const ok = await confirm({
      message: t(
        settings.retentionAction === 'delete'
          ? 'privacy.retention_confirm_delete'
          : 'privacy.retention_confirm_anonymize',
        counts
      ),
      confirmLabel: t('privacy.retention_apply'),
    });
    if (!ok) return;
    try {
      const r = await api()!.applyRetention({
        competitionIds: candidates.competitions.map(c => c.id),
        memberIds: candidates.members.map(m => m.id),
      });
      showToast(t('privacy.retention_done', { ...r }), 'success');
      await check();
    } catch {
      showToast(t('privacy.error'), 'error');
    }
  };

  const total = candidates ? candidates.competitions.length + candidates.members.length : 0;

  return (
    <div className="form-group">
      <label style={BOLD}>{t('privacy.retention_title')}</label>
      <p style={HINT}>{t('privacy.retention_hint')}</p>
      <div className="privacy-fields">
        <label style={TOGGLE_LABEL}>
          {t('privacy.retention_competitions')}{' '}
          <input
            type="number"
            min={0}
            max={600}
            className="form-input privacy-months"
            value={settings.competitionRetentionMonths}
            onChange={e => void update({ competitionRetentionMonths: months(e.target.value) })}
          />
        </label>
        <label style={TOGGLE_LABEL}>
          {t('privacy.retention_members')}{' '}
          <input
            type="number"
            min={0}
            max={600}
            className="form-input privacy-months"
            value={settings.memberRetentionMonths}
            onChange={e => void update({ memberRetentionMonths: months(e.target.value) })}
          />
        </label>
        <label style={TOGGLE_LABEL}>
          {t('privacy.retention_action')}{' '}
          <select
            className="form-input form-select"
            value={settings.retentionAction}
            onChange={e =>
              void update({ retentionAction: e.target.value === 'delete' ? 'delete' : 'anonymize' })
            }
          >
            <option value="anonymize">{t('privacy.action_anonymize')}</option>
            <option value="delete">{t('privacy.action_delete')}</option>
          </select>
        </label>
      </div>
      <label className="u-row cursor-pointer">
        <input
          type="checkbox"
          checked={settings.autoPurge}
          onChange={e => void update({ autoPurge: e.target.checked })}
        />
        <span style={TOGGLE_LABEL}>{t('privacy.retention_auto')}</span>
      </label>
      <div className="u-row">
        <Button type="button" style={SMALL_BTN} onClick={() => void check()}>
          {t('privacy.retention_check')}
        </Button>
        {candidates && total > 0 && (
          <Button type="button" variant="danger" style={SMALL_BTN} onClick={() => void apply()}>
            {t('privacy.retention_apply')}
          </Button>
        )}
      </div>
      {candidates && (
        <div role="status" style={HINT}>
          {total === 0 ? (
            t('privacy.retention_none')
          ) : (
            <>
              {t('privacy.retention_found', {
                competitions: candidates.competitions.length,
                members: candidates.members.length,
              })}
              <ul>
                {candidates.competitions.map(c => (
                  <li key={c.id}>
                    {c.title} — {new Date(c.date).toLocaleDateString()}
                  </li>
                ))}
                {candidates.members.map(m => (
                  <li key={m.id}>
                    {nameOf(m)} ({m.clubName})
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const PersonItem: React.FC = () => {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PrivacyPerson[] | null>(null);

  const search = async (q: string) => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    try {
      setResults((await api()?.findPersons(q)) ?? []);
    } catch {
      showToast(t('privacy.error'), 'error');
    }
  };

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      await search(query);
    } catch {
      showToast(t('privacy.error'), 'error');
    }
  };

  const exportJson = (p: PrivacyPerson) =>
    run(async () => {
      const r = await api()!.exportPerson(refOf(p), nameOf(p));
      if (r.success) showToast(t('privacy.exported'), 'success');
    });

  const exportPdf = (p: PrivacyPerson) =>
    run(async () => {
      const data = await api()!.getPersonData(refOf(p));
      const labels: PersonalDataLabels = {
        heading: t('privacy.pdf_heading', { name: nameOf(p) }),
        generated: t('privacy.pdf_generated', { date: new Date().toLocaleString() }),
        identity: t('privacy.pdf_identity'),
        competitions: t('privacy.pdf_competitions'),
        club: t('privacy.pdf_club'),
        matches: t('privacy.pdf_matches'),
        attendance: t('privacy.pdf_attendance'),
        bouts: t('privacy.pdf_bouts'),
        raw: t('privacy.pdf_raw'),
      };
      const html = personalDataHtml(data, labels);
      const result = await window.electronAPI.dialog.saveFile({
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        defaultPath: `${nameOf(p).replace(/[^\p{L}\p{N}]+/gu, '_') || 'donnees'}.pdf`,
      });
      if (result?.filePath) {
        await window.electronAPI.file.printHtmlToPDF(html, result.filePath);
        showToast(t('privacy.exported'), 'success');
      }
    });

  const anonymize = async (p: PrivacyPerson) => {
    const ok = await confirm({
      message: t('privacy.confirm_anonymize', { name: nameOf(p) }),
      confirmLabel: t('privacy.anonymize'),
    });
    if (!ok) return;
    await run(async () => {
      const r = await api()!.anonymizePerson(refOf(p));
      showToast(t('privacy.anonymized', { pseudonym: r.pseudonym }), 'success');
    });
  };

  const erase = async (p: PrivacyPerson) => {
    const ok = await confirm({
      message: t('privacy.confirm_erase', { name: nameOf(p) }),
      confirmLabel: t('privacy.erase'),
    });
    if (!ok) return;
    await run(async () => {
      await api()!.erasePerson(refOf(p));
      showToast(t('privacy.erased'), 'success');
    });
  };

  return (
    <div className="form-group">
      <label htmlFor="privacy-person-search" style={BOLD}>
        {t('privacy.person_title')}
      </label>
      <p style={HINT}>{t('privacy.person_hint')}</p>
      <input
        id="privacy-person-search"
        type="search"
        className="form-input mb-2"
        placeholder={t('privacy.person_search')}
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          void search(e.target.value);
        }}
      />
      {results && results.length === 0 && <p style={HINT}>{t('privacy.person_none')}</p>}
      {results && results.length > 0 && (
        <ul className="privacy-person-list">
          {results.map(p => (
            <li key={p.key}>
              <div style={BOLD}>
                {nameOf(p)}
                {p.license ? ` — ${p.license}` : ''}
                {p.club ? ` — ${p.club}` : ''}
              </div>
              <div style={HINT}>
                {t('privacy.person_records', {
                  competitions: p.fencers.length,
                  members: p.members.length,
                })}
              </div>
              <div className="u-row privacy-actions">
                <Button type="button" style={SMALL_BTN} onClick={() => void exportJson(p)}>
                  {t('privacy.export_json')}
                </Button>
                <Button type="button" style={SMALL_BTN} onClick={() => void exportPdf(p)}>
                  {t('privacy.export_pdf')}
                </Button>
                <Button type="button" style={SMALL_BTN} onClick={() => void anonymize(p)}>
                  {t('privacy.anonymize')}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  style={SMALL_BTN}
                  onClick={() => void erase(p)}
                >
                  {t('privacy.erase')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const BpmItem: React.FC = () => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [competitions, setCompetitions] = useState<Array<{ id: string; title: string }>>([]);
  const [scope, setScope] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI?.db
      ?.getAllCompetitions?.()
      .then(list => setCompetitions(list.map(c => ({ id: c.id, title: c.title }))))
      .catch(() => {
        // hors Electron
      });
  }, []);

  const exportBpm = async () => {
    if (password.length < MIN_PASSWORD) return setError(t('privacy.bpm_too_short'));
    if (password !== password2) return setError(t('privacy.bpm_mismatch'));
    setError(null);
    try {
      const r = await api()!.exportEncryptedBpm(scope || null, password);
      if (r.success) {
        showToast(t('privacy.bpm_saved'), 'success');
        setPassword('');
        setPassword2('');
      } else if (!r.canceled) {
        showToast(t('privacy.error'), 'error');
      }
    } catch {
      showToast(t('privacy.error'), 'error');
    }
  };

  return (
    <div className="form-group">
      <label style={BOLD}>{t('privacy.bpm_title')}</label>
      <p style={HINT}>{t('privacy.bpm_hint')}</p>
      <label style={TOGGLE_LABEL} htmlFor="privacy-bpm-scope">
        {t('privacy.bpm_scope')}
      </label>
      <select
        id="privacy-bpm-scope"
        className="form-input form-select mb-2"
        value={scope}
        onChange={e => setScope(e.target.value)}
      >
        <option value="">{t('privacy.bpm_all')}</option>
        {competitions.map(c => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
      <input
        type="password"
        className="form-input mb-2"
        autoComplete="new-password"
        aria-label={t('privacy.bpm_password')}
        placeholder={t('privacy.bpm_password')}
        value={password}
        onChange={e => setPassword(e.target.value)}
      />
      <input
        type="password"
        className="form-input mb-2"
        autoComplete="new-password"
        aria-label={t('privacy.bpm_password_confirm')}
        placeholder={t('privacy.bpm_password_confirm')}
        value={password2}
        onChange={e => setPassword2(e.target.value)}
      />
      {error && (
        <p role="alert" style={HINT}>
          {error}
        </p>
      )}
      <Button type="button" onClick={() => void exportBpm()}>
        {t('privacy.bpm_export')}
      </Button>
    </div>
  );
};

const PrivacySettingsSection: React.FC<{ item: PrivacyItemId }> = ({ item }) => {
  const { settings, update } = usePrivacySettings();
  if (!api()) return null;
  switch (item) {
    case 'privacy_network':
      return settings ? <NetworkItem settings={settings} update={p => void update(p)} /> : null;
    case 'privacy_retention':
      return settings ? <RetentionItem settings={settings} update={update} /> : null;
    case 'privacy_person':
      return <PersonItem />;
    case 'privacy_bpm':
      return <BpmItem />;
    default:
      return null;
  }
};

export default PrivacySettingsSection;
