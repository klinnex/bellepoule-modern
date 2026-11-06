/**
 * BellePoule Modern - Formulaire du connecteur FTP (#1331)
 * Mémorise l'URL et l'identifiant (jamais le mot de passe).
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import type { FtpPublishConfig } from '../../hooks/useExport';

const STORAGE_KEY = 'bellepoule-ftp-config';
// Adresse proposée par l'ancien BellePoule : elle part vers GREG (voir isGregUrl), sans identifiant
const DEFAULT_URL = 'escrime-info.com';
// Exemple d'adresse, non traduisible
const URL_EXAMPLE = 'ftp://serveur/dossier';

interface SavedFields {
  url: string;
  user: string;
}

const loadSaved = (): SavedFields => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedFields>;
      return {
        url: typeof parsed.url === 'string' ? parsed.url : '',
        user: typeof parsed.user === 'string' ? parsed.user : '',
      };
    }
  } catch {
    // stockage indisponible : on repart d'un formulaire vide
  }
  return { url: DEFAULT_URL, user: '' };
};

const saveFields = (fields: SavedFields): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
  } catch {
    // stockage indisponible : rien à mémoriser
  }
};

interface FtpPublishFormProps {
  onPublish: (config: FtpPublishConfig) => Promise<void> | void;
}

const FtpPublishForm: React.FC<FtpPublishFormProps> = ({ onPublish }) => {
  const { t } = useTranslation();
  const [saved] = useState<SavedFields>(loadSaved);
  const [url, setUrl] = useState(saved.url);
  const [user, setUser] = useState(saved.user);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handlePublish = async () => {
    if (!url.trim()) return;
    saveFields({ url: url.trim(), user: user.trim() });
    setBusy(true);
    try {
      await onPublish({ url: url.trim(), user: user.trim(), password });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="form-group mb-2">
        <label className="form-label">{t('exportCenter.ftp_url')}</label>
        <input
          className="form-input"
          type="text"
          placeholder={URL_EXAMPLE}
          value={url}
          onChange={e => setUrl(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="form-group mb-2">
        <label className="form-label">{t('exportCenter.ftp_user')}</label>
        <input
          className="form-input"
          type="text"
          autoComplete="username"
          value={user}
          onChange={e => setUser(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="form-group mb-2">
        <label className="form-label">{t('exportCenter.ftp_password')}</label>
        <input
          className="form-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          disabled={busy}
        />
      </div>
      <button className="btn btn-secondary" onClick={handlePublish} disabled={busy || !url.trim()}>
        {t('exportCenter.ftp_publish')}
      </button>
    </div>
  );
};

export default FtpPublishForm;
