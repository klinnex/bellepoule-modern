/**
 * BellePoule Modern - Paramètres → Système → Proxy réseau
 * Licensed under GPL-3.0
 *
 * Appliqué par le process principal à toute l'app (mises à jour, webhooks…).
 * La machine locale (serveur d'arbitrage) reste toujours en direct.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import type { ProxySettingsDTO } from '../../shared/types/preload';
import { HINT, BOLD, SMALL_BTN, TOGGLE_LABEL } from './settingsModal.styles';
import { Button } from './common/Button';

type Mode = ProxySettingsDTO['mode'];
type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'saved' }
  | { kind: 'invalid' }
  | { kind: 'test'; ok: boolean; resolved: string };

const MODES: Mode[] = ['system', 'direct', 'manual'];

const ProxySettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('system');
  const [server, setServer] = useState('');
  const [bypass, setBypass] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    window.electronAPI?.proxy
      ?.get?.()
      .then(s => {
        setMode(s.mode);
        setServer(s.server ?? '');
        setBypass(s.bypass ?? '');
        setAvailable(true);
      })
      .catch(() => {
        // hors Electron (tests, navigateur)
      });
  }, []);

  const save = async (next: ProxySettingsDTO) => {
    setStatus({ kind: 'busy' });
    try {
      const res = await window.electronAPI.proxy.set(next);
      setStatus(res.success ? { kind: 'saved' } : { kind: 'invalid' });
    } catch {
      setStatus({ kind: 'invalid' });
    }
  };

  const handleMode = (m: Mode) => {
    setMode(m);
    // Système / aucun : appliqué tout de suite ; manuel : après saisie du serveur
    if (m !== 'manual') void save({ mode: m });
    else setStatus({ kind: 'idle' });
  };

  const handleTest = async () => {
    setStatus({ kind: 'busy' });
    try {
      const r = await window.electronAPI.proxy.test();
      setStatus({ kind: 'test', ok: r.ok, resolved: r.resolved });
    } catch {
      setStatus({ kind: 'test', ok: false, resolved: '' });
    }
  };

  if (!available) return null;
  const busy = status.kind === 'busy';

  return (
    <div className="form-group">
      <label style={BOLD}>{t('settings.proxy_title')}</label>
      <p style={HINT}>{t('settings.proxy_hint')}</p>

      <div role="radiogroup" aria-label={t('settings.proxy_title')}>
        {MODES.map(m => (
          <label key={m} className="u-row cursor-pointer">
            <input
              type="radio"
              name="proxy-mode"
              value={m}
              checked={mode === m}
              disabled={busy}
              onChange={() => handleMode(m)}
            />
            <span style={TOGGLE_LABEL}>{t(`settings.proxy_mode_${m}`)}</span>
          </label>
        ))}
      </div>

      {mode === 'manual' && (
        <div className="proxy-manual">
          <label htmlFor="proxy-server" style={TOGGLE_LABEL}>
            {t('settings.proxy_server')}
          </label>
          <input
            id="proxy-server"
            type="text"
            className="form-input mb-2"
            placeholder={t('settings.proxy_server_placeholder')}
            value={server}
            spellCheck={false}
            onChange={e => setServer(e.target.value)}
          />
          <label htmlFor="proxy-bypass" style={TOGGLE_LABEL}>
            {t('settings.proxy_bypass')}
          </label>
          <input
            id="proxy-bypass"
            type="text"
            className="form-input mb-2"
            placeholder={t('settings.proxy_bypass_placeholder')}
            value={bypass}
            spellCheck={false}
            onChange={e => setBypass(e.target.value)}
          />
          <Button
            variant="primary"
            style={SMALL_BTN}
            disabled={busy || !server.trim()}
            onClick={() => void save({ mode: 'manual', server, bypass })}
          >
            {t('settings.proxy_apply')}
          </Button>
        </div>
      )}

      <div className="u-row proxy-actions">
        <Button style={SMALL_BTN} disabled={busy} onClick={handleTest}>
          {busy ? t('settings.proxy_testing') : t('settings.proxy_test')}
        </Button>
      </div>

      <p className={`proxy-status proxy-status--${statusTone(status)}`} role="status">
        {statusText(status, t)}
      </p>
    </div>
  );
};

function statusTone(s: Status): 'ok' | 'error' | 'neutral' {
  if (s.kind === 'saved' || (s.kind === 'test' && s.ok)) return 'ok';
  if (s.kind === 'invalid' || (s.kind === 'test' && !s.ok)) return 'error';
  return 'neutral';
}

function statusText(s: Status, t: (k: string, p?: Record<string, string>) => string): string {
  switch (s.kind) {
    case 'saved':
      return t('settings.proxy_saved');
    case 'invalid':
      return t('settings.proxy_invalid');
    case 'test':
      return s.ok
        ? t('settings.proxy_test_ok', { route: s.resolved || 'DIRECT' })
        : t('settings.proxy_test_fail', { route: s.resolved || '?' });
    default:
      return '';
  }
}

export default ProxySettingsSection;
