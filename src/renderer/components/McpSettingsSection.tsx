/**
 * BellePoule Modern - Paramètres → Système → Agent IA (MCP) (#1880)
 * Serveur MCP intégré en lecture : activation, port, jeton, configuration du client.
 * Licensed under GPL-3.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import type { McpStatus } from '../../shared/types/mcp';
import { HINT, BOLD, TOGGLE_LABEL } from './settingsModal.styles';
import { Button } from './common/Button';

/** Configuration à coller dans `.mcp.json` (Claude Code, plugin bellepoule) */
export function mcpClientConfig(status: Pick<McpStatus, 'port' | 'token'>): string {
  return JSON.stringify(
    {
      mcpServers: {
        bellepoule: {
          type: 'http',
          url: `http://127.0.0.1:${status.port}/mcp`,
          headers: { Authorization: `Bearer ${status.token}` },
        },
      },
    },
    null,
    2
  );
}

const McpSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [port, setPort] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const api = window.electronAPI?.mcp;

  const apply = (s: McpStatus) => {
    setStatus(s);
    setPort(String(s.port));
  };

  useEffect(() => {
    api
      ?.getStatus()
      .then(apply)
      .catch(() => undefined);
  }, [api]);

  if (!api || !status) return null;

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(mcpClientConfig(status));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  return (
    <div className="form-group">
      <label style={BOLD}>{t('settings.mcp_title')}</label>
      <p style={HINT}>{t('settings.mcp_hint')}</p>
      <label className="u-row" style={TOGGLE_LABEL}>
        <input
          type="checkbox"
          checked={status.enabled}
          onChange={e => void api.setSettings({ enabled: e.target.checked }).then(apply)}
        />
        {t('settings.mcp_enable')}
      </label>
      {status.enabled && (
        <label className="u-row" style={TOGGLE_LABEL}>
          <input
            type="checkbox"
            checked={status.allowWrite}
            onChange={e => void api.setSettings({ allowWrite: e.target.checked }).then(apply)}
          />
          {t('settings.mcp_allow_write')}
        </label>
      )}
      <div className="u-row">
        <label htmlFor="mcp-port">{t('settings.mcp_port')}</label>
        <input
          id="mcp-port"
          className="form-input mcp-port-input"
          type="number"
          min={1024}
          max={65535}
          value={port}
          onChange={e => setPort(e.target.value)}
          onBlur={() => void api.setSettings({ port: Number(port) }).then(apply)}
        />
      </div>
      <p style={HINT} role="status">
        {status.running && status.url
          ? t('settings.mcp_running', { url: status.url })
          : status.error
            ? t('settings.mcp_error', { error: status.error })
            : t('settings.mcp_stopped')}
      </p>
      {status.enabled && (
        <>
          <div className="u-row">
            <code className="mcp-token">
              {showToken ? status.token : '•'.repeat(Math.min(24, status.token.length))}
            </code>
            <Button type="button" variant="ghost" onClick={() => setShowToken(v => !v)}>
              {t(showToken ? 'settings.mcp_hide_token' : 'settings.mcp_show_token')}
            </Button>
            <Button type="button" onClick={() => void api.regenerateToken().then(apply)}>
              {t('settings.mcp_regenerate')}
            </Button>
          </div>
          <div className="u-row">
            <Button type="button" onClick={() => void copyConfig()}>
              {t(copied ? 'settings.mcp_copied' : 'settings.mcp_copy_config')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default McpSettingsSection;
