/**
 * BellePoule Modern - Invites RGPD globales (#1882)
 * - Mot de passe d'une archive .bpm chiffrée ouverte par Fichier → Ouvrir
 * - Rappel au démarrage des données dépassant la durée de conservation
 * Licensed under GPL-3.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useToast } from './Toast';
import { Button } from './common/Button';

const PrivacyPrompts: React.FC = () => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const api = window.electronAPI?.privacy;
    if (!api?.onEncryptedBpmRequest) return undefined;
    return api.onEncryptedBpmRequest(name => {
      setFileName(name);
      setPassword('');
      setError(null);
    });
  }, []);

  useEffect(() => {
    if (fileName) inputRef.current?.focus();
  }, [fileName]);

  // Rappel unique au démarrage : purge assistée (sans purge automatique)
  useEffect(() => {
    const api = window.electronAPI?.privacy;
    if (!api?.getSettings) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await api.getSettings();
        if (s.autoPurge || (!s.competitionRetentionMonths && !s.memberRetentionMonths)) return;
        const c = await api.retentionCandidates();
        if (cancelled || (c.competitions.length === 0 && c.members.length === 0)) return;
        showToast(
          t('privacy.retention_reminder', {
            competitions: c.competitions.length,
            members: c.members.length,
          }),
          'warning',
          { duration: 10000 }
        );
      } catch {
        // hors Electron ou base fermée
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!fileName) return null;

  const close = () => {
    void window.electronAPI?.privacy?.cancelEncryptedBpm();
    setFileName(null);
    setPassword('');
  };

  const open = async () => {
    if (!password || busy) return;
    setBusy(true);
    try {
      const r = await window.electronAPI.privacy.openEncryptedBpm(password);
      if (r.success) {
        setFileName(null);
        setPassword('');
      } else {
        setError(
          t(r.error === 'wrong_password' ? 'privacy.bpm_wrong_password' : 'privacy.bpm_open_failed')
        );
      }
    } catch {
      setError(t('privacy.bpm_open_failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-overlay privacy-dialog-overlay"
      onClick={close}
      onKeyDown={e => e.key === 'Escape' && close()}
    >
      <div
        className="modal privacy-dialog"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bpm-password-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="bpm-password-title">
            {t('privacy.bpm_open_title')}
          </h2>
        </div>
        <div className="modal-body">
          <p id="bpm-password-message" className="privacy-dialog-message">
            {t('privacy.bpm_open_message', { file: fileName })}
          </p>
          <input
            ref={inputRef}
            type="password"
            className="form-input w-full"
            autoComplete="current-password"
            aria-labelledby="bpm-password-message"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void open();
              }
            }}
          />
          {error && (
            <p role="alert" className="privacy-error">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <Button type="button" onClick={close}>
            {t('actions.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!password || busy}
            onClick={() => void open()}
          >
            {t('privacy.bpm_open')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPrompts;
