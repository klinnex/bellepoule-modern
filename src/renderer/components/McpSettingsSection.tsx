/**
 * BellePoule Modern - Paramètres → Système → Agent IA (MCP) (#1880)
 * Serveur MCP intégré : activation, port, jeton, configuration du client, dossiers
 * accessibles à l'agent (fichiers d'import lus, exports écrits).
 * Licensed under GPL-3.0
 */

import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import type { McpLogEntry, McpStatus } from '../../shared/types/mcp';
import type { AgentFolders } from '../../shared/types/settingsApi';
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

/** Derniers appels affichés (le main en garde 200) */
const LOG_SHOWN = 30;

const McpSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [port, setPort] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [folders, setFolders] = useState<AgentFolders>({ folders: [], defaults: [] });
  const api = window.electronAPI?.mcp;
  const settingsApi = window.electronAPI?.settings;

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

  useEffect(() => {
    settingsApi
      ?.getAgentFolders?.()
      .then(setFolders)
      .catch(() => undefined);
  }, [settingsApi]);

  /** Ajout par boîte de dialogue native du main ; retrait immédiat */
  const [log, setLog] = useState<McpLogEntry[]>([]);
  const refreshLog = () =>
    void api
      ?.getLog()
      .then(entries => setLog(entries.slice(-LOG_SHOWN).reverse()))
      .catch(() => undefined);
  useEffect(refreshLog, [api]);

  const changeFolders = (action: Promise<AgentFolders> | undefined) =>
    void action?.then(setFolders).catch(() => undefined);

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
          : status.error === 'token_unreadable'
            ? t('settings.mcp_token_unreadable')
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
          <label style={BOLD}>{t('settings.mcp_folders_title')}</label>
          <p style={HINT}>{t('settings.mcp_folders_hint')}</p>
          <ul className="mcp-folder-list">
            {folders.folders.length === 0
              ? folders.defaults.map(folder => (
                  <li key={folder} className="mcp-folder">
                    <code>{folder}</code>
                    <span className="mcp-folder-default">{t('settings.mcp_folders_default')}</span>
                  </li>
                ))
              : folders.folders.map(folder => (
                  <li key={folder} className="mcp-folder">
                    <code>{folder}</code>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={t('settings.mcp_folder_remove', { folder })}
                      onClick={() => changeFolders(settingsApi?.removeAgentFolder(folder))}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </Button>
                  </li>
                ))}
          </ul>
          <div className="u-row">
            <Button type="button" onClick={() => changeFolders(settingsApi?.addAgentFolder())}>
              {t('settings.mcp_folder_add')}
            </Button>
          </div>
          <div className="u-row">
            <label style={BOLD}>{t('settings.mcp_log_title')}</label>
            <Button type="button" variant="ghost" onClick={refreshLog}>
              {t('settings.mcp_log_refresh')}
            </Button>
          </div>
          {log.length === 0 ? (
            <p style={HINT}>{t('settings.mcp_log_empty')}</p>
          ) : (
            <table className="mcp-log">
              <tbody>
                {log.map((e, i) => (
                  <tr key={`${e.at}-${i}`}>
                    <td>{new Date(e.at).toLocaleTimeString()}</td>
                    <td>
                      <code>{e.tool ?? e.method}</code>
                    </td>
                    <td className={e.ok ? undefined : 'mcp-log-ko'}>
                      {t(e.ok ? 'settings.mcp_log_ok' : 'settings.mcp_log_ko')}
                    </td>
                    <td>{`${e.ms} ms`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
};

export default McpSettingsSection;
