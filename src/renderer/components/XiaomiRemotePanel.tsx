/**
 * BellePoule Modern - Xiaomi TV Remote Control Panel
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useTranslation } from '../hooks/useTranslation';
import type { ConnectedClient, TVCommand, KioskScreenConfig } from '@shared/types/preload';

interface XiaomiRemotePanelProps {
  competitionId: string;
  serverUrl: string;
  arenaCount: number;
  onClose: () => void;
}

function getOnlineStatus(lastSeen: string): 'online' | 'warn' | 'offline' {
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff < 35000) return 'online';
  if (diff < 120000) return 'warn';
  return 'offline';
}

function formatLastSeen(
  lastSeen: string,
  t: (key: string, params?: { [key: string]: string | number }) => string
): string {
  const diff = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000);
  if (diff < 10) return t('xiaomi.just_now');
  if (diff < 60) return t('xiaomi.seconds_ago', { s: diff });
  return t('xiaomi.minutes_ago', { m: Math.floor(diff / 60) });
}

const STATUS_COLORS: Record<string, string> = {
  online: '#22c55e',
  warn: '#f59e0b',
  offline: '#6b7280',
};

type AssignRole = 'affichage' | 'arbitre' | 'kiosk';

function buildAssignRoles(
  t: (key: string, params?: { [key: string]: string | number }) => string
): { value: AssignRole; label: string }[] {
  return [
    { value: 'affichage', label: `📺 ${t('remote_score.screen_type_display')}` },
    { value: 'arbitre', label: `🤺 ${t('referee.arbitre')}` },
    { value: 'kiosk', label: `🖥️ ${t('xiaomi.client_type_kiosk')}` },
  ];
}

function arenaNum(client: ConnectedClient): number {
  if (!client.arenaId) return 1;
  return parseInt(client.arenaId.replace('arena', ''), 10) || 1;
}

function defaultAssign(client: ConnectedClient): { role: AssignRole; arena: number } {
  if (client.clientType === 'referee') return { role: 'arbitre', arena: arenaNum(client) };
  if (client.clientType === 'kiosk') return { role: 'kiosk', arena: arenaNum(client) };
  if (client.clientType === 'arena') return { role: 'affichage', arena: arenaNum(client) };
  return { role: 'affichage', arena: 1 }; // lobby et autres
}

function assignUrl(base: string, role: AssignRole, arena: number): string {
  if (role === 'kiosk') return `${base}/kiosk`;
  if (role === 'arbitre') return `${base}/arene${arena}/arbitre`;
  return `${base}/arene${arena}`;
}

function clientDisplayUrl(base: string, client: ConnectedClient): string {
  if (client.clientType === 'referee') {
    const num = client.arenaId ? client.arenaId.replace('arena', '') : '1';
    return `${base}/arene${num}/arbitre`;
  }
  if (client.clientType === 'lobby' || !client.arenaId) return `${base}/lobby`;
  const num = client.arenaId.replace('arena', '');
  return `${base}/arene${num}`;
}

function clientLabel(
  client: ConnectedClient,
  t: (key: string, params?: { [key: string]: string | number }) => string
): string {
  if (client.label) return client.label;
  const typeLabels: Record<string, string> = {
    lobby: t('xiaomi.client_type_lobby'),
    kiosk: t('xiaomi.client_type_kiosk'),
    public: t('xiaomi.client_type_public'),
    pool: t('ui.poule'),
    dashboard: t('xiaomi.client_type_dashboard'),
    referee: t('referee.arbitre'),
  };
  const type =
    client.clientType === 'arena'
      ? t('xiaomi.arena_label')
      : (typeLabels[client.clientType] ?? client.clientType);
  if ((client.clientType === 'arena' || client.clientType === 'referee') && client.arenaId) {
    const num = client.arenaId.replace('arena', '');
    return `${type} ${num}`;
  }
  return type;
}

const DEFAULT_KIOSK_CONFIG: KioskScreenConfig = {
  poules: true,
  classement: true,
  final: false,
  direct: true,
  suivants: true,
  tableau: true,
  rotationSec: 15,
};

const KIOSK_CONFIG_STORAGE_KEY = 'bp_kiosk_config';

function loadKioskConfig(): KioskScreenConfig {
  try {
    const stored = localStorage.getItem(KIOSK_CONFIG_STORAGE_KEY);
    if (stored) return { ...DEFAULT_KIOSK_CONFIG, ...JSON.parse(stored) };
  } catch {
    /* ignore */
  }
  return DEFAULT_KIOSK_CONFIG;
}

function buildKioskViews(
  t: (key: string, params?: { [key: string]: string | number }) => string
): { key: keyof KioskScreenConfig; label: string }[] {
  return [
    { key: 'poules', label: t('remote_score.view_pools') },
    { key: 'classement', label: t('remote_score.view_ranking') },
    { key: 'final', label: t('remote_score.view_final_ranking') },
    { key: 'direct', label: t('remote_score.view_live_matches') },
    { key: 'suivants', label: t('remote_score.view_next_matches') },
    { key: 'tableau', label: t('remote_score.view_bracket') },
  ];
}

const XiaomiRemotePanelComponent: React.FC<XiaomiRemotePanelProps> = ({
  competitionId,
  serverUrl,
  arenaCount,
  onClose,
}) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const { t } = useTranslation();
  const [clients, setClients] = useState<ConnectedClient[]>([]);
  const [message, setMessage] = useState('');
  const [msgDuration, setMsgDuration] = useState(5);
  const [openNav, setOpenNav] = useState<string | null>(null);
  const [swapSet, setSwapSet] = useState<Set<string>>(new Set());
  const navRef = useRef<HTMLDivElement>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [kioskTarget, setKioskTarget] = useState<string | null>(null);
  const [kioskConfig, setKioskConfig] = useState<KioskScreenConfig>(loadKioskConfig);
  const [locked, setLocked] = useState<boolean>(
    () => localStorage.getItem('bp_remote_locked') === '1'
  );
  const [assign, setAssign] = useState<Record<string, { role: AssignRole; arena: number }>>({});

  const toggleLock = () => {
    setLocked(prev => {
      const next = !prev;
      localStorage.setItem('bp_remote_locked', next ? '1' : '0');
      return next;
    });
  };

  const base = serverUrl.replace(/\/$/, '');
  const allNavTargets = buildNavTargets(base, arenaCount, t);
  const assignRoles = buildAssignRoles(t);
  const kioskViews = buildKioskViews(t);

  const fetchClients = useCallback(async () => {
    const res = await window.electronAPI.remote.getConnectedClients(competitionId);
    if (res.success) setClients(res.clients);
  }, [competitionId]);

  useEffect(() => {
    fetchClients();
    const interval = setInterval(fetchClients, 5000);
    const unsub = window.electronAPI.remote.onClientListUpdate(updated => setClients(updated));
    return () => {
      clearInterval(interval);
      unsub();
    };
  }, [fetchClients]);

  useEffect(() => {
    if (!openNav) return;
    const handler = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenNav(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openNav]);

  const sendCmd = useCallback(
    (socketId: string, cmd: TVCommand) => {
      window.electronAPI.remote.sendClientCommand(competitionId, socketId, cmd);
    },
    [competitionId]
  );

  const broadcastCmd = useCallback(
    (cmd: TVCommand) => {
      window.electronAPI.remote.broadcastCommand(competitionId, cmd);
    },
    [competitionId]
  );

  const toggleSwap = (socketId: string) => {
    setSwapSet(prev => {
      const next = new Set(prev);
      if (next.has(socketId)) {
        next.delete(socketId);
      } else if (next.size < 2) {
        next.add(socketId);
      }
      return next;
    });
  };

  const confirmSwap = () => {
    const [idA, idB] = [...swapSet];
    const clientA = clients.find(c => c.socketId === idA);
    const clientB = clients.find(c => c.socketId === idB);
    if (!clientA || !clientB) return;
    const urlA = clientDisplayUrl(base, clientA);
    const urlB = clientDisplayUrl(base, clientB);
    sendCmd(idA, { type: 'navigate', url: urlB });
    sendCmd(idB, { type: 'navigate', url: urlA });
    setSwapSet(new Set());
  };

  const commitRename = () => {
    if (renameTarget) {
      const lbl = renameValue.trim();
      window.electronAPI.remote.renameClient(competitionId, renameTarget, lbl);
    }
    setRenameTarget(null);
    setRenameValue('');
  };

  const sendKiosk = () => {
    if (!kioskTarget) return;
    try {
      localStorage.setItem(KIOSK_CONFIG_STORAGE_KEY, JSON.stringify(kioskConfig));
    } catch {
      /* ignore */
    }
    window.electronAPI.remote.setClientKioskMode(competitionId, kioskTarget, kioskConfig);
    setKioskTarget(null);
  };

  const sendMessage = () => {
    if (!message.trim()) return;
    broadcastCmd({ type: 'message', text: message.trim(), duration: msgDuration * 1000 });
  };

  const getAssign = (client: ConnectedClient) => assign[client.socketId] ?? defaultAssign(client);

  const applyAssign = (client: ConnectedClient, role: AssignRole, arena: number) => {
    setAssign(prev => ({ ...prev, [client.socketId]: { role, arena } }));
    sendCmd(client.socketId, { type: 'navigate', url: assignUrl(base, role, arena) });
  };

  const swapCandidates = clients.filter(c => swapSet.has(c.socketId));
  const canSwap = swapSet.size === 2;
  const isArenaOrLobby = (c: ConnectedClient) =>
    c.clientType === 'arena' || c.clientType === 'lobby';
  const isAssignable = (c: ConnectedClient) =>
    c.clientType === 'arena' ||
    c.clientType === 'lobby' ||
    c.clientType === 'referee' ||
    c.clientType === 'kiosk';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        style={{
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
          borderRadius: '12px',
          width: '600px',
          maxWidth: '96vw',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>📺</span>
          <span style={{ fontWeight: 600, fontSize: '1rem', flex: 1 }}>{t('xiaomi.title')}</span>
          <button
            className={`btn ${locked ? 'btn-primary' : 'btn-secondary'}`}
            onClick={toggleLock}
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
            title={locked ? t('xiaomi.unlock_tooltip') : t('xiaomi.lock_tooltip')}
          >
            {locked ? t('xiaomi.locked_label') : t('xiaomi.lock_label')}
          </button>
          <button
            className="btn btn-secondary"
            onClick={fetchClients}
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
            title={t('xiaomi.refresh')}
          >
            ↻
          </button>
          <button
            className="btn btn-primary"
            onClick={() => broadcastCmd({ type: 'refresh' })}
            disabled={locked}
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem', opacity: locked ? 0.4 : 1 }}
          >
            {t('xiaomi.refresh_all')}
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-light)',
              fontSize: '1.2rem',
              padding: '0 0.2rem',
            }}
          >
            ×
          </button>
        </div>

        {/* Lobby URL hint */}
        <div
          style={{
            padding: '0.55rem 1.25rem',
            background: 'rgba(56,189,248,0.1)',
            borderBottom: '1px solid var(--color-border)',
            fontSize: '0.78rem',
            color: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>💡</span>
          <span>
            {t('xiaomi.url_no_arena')} <strong>{base}/lobby</strong> {t('xiaomi.screens_waiting')}
          </span>
        </div>

        {/* Bandeau verrou */}
        {locked && (
          <div
            style={{
              padding: '0.55rem 1.25rem',
              background: 'rgba(34,197,94,0.1)',
              borderBottom: '1px solid rgba(34,197,94,0.3)',
              fontSize: '0.78rem',
              color: '#86efac',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>🔒</span>
            <span>{t('xiaomi.locked')}</span>
          </div>
        )}

        {/* Client list */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.75rem 1.25rem',
            pointerEvents: locked ? 'none' : 'auto',
            opacity: locked ? 0.55 : 1,
          }}
        >
          {clients.length === 0 ? (
            <div
              style={{
                color: 'var(--color-text-light)',
                textAlign: 'center',
                padding: '2rem',
                fontSize: '0.9rem',
              }}
            >
              {t('xiaomi.no_screen')}
              <br />
              <span style={{ fontSize: '0.8rem' }}>{t('xiaomi.connect_tv')}</span>
            </div>
          ) : (
            clients.map(client => {
              const status = getOnlineStatus(client.lastSeen);
              const inSwap = swapSet.has(client.socketId);
              const swapFull = swapSet.size >= 2 && !inSwap;
              return (
                <div
                  key={client.socketId}
                  style={{
                    background: inSwap ? 'rgba(249,115,22,0.12)' : 'var(--color-bg)',
                    border: `1px solid ${inSwap ? 'rgba(249,115,22,0.4)' : 'var(--color-border)'}`,
                    borderRadius: '8px',
                    padding: '0.6rem 0.85rem',
                    marginBottom: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: STATUS_COLORS[status],
                      flexShrink: 0,
                    }}
                  />

                  {/* Label + IP */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {renameTarget === client.socketId ? (
                      <input
                        autoFocus
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') {
                            setRenameTarget(null);
                            setRenameValue('');
                          }
                        }}
                        placeholder={t('xiaomi.screen_name')}
                        style={{
                          width: '100%',
                          padding: '0.2rem 0.4rem',
                          fontSize: '0.85rem',
                          background: 'var(--color-bg)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '5px',
                          color: 'inherit',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          fontWeight: 500,
                          fontSize: '0.88rem',
                          cursor: 'text',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                        title={t('xiaomi.click_rename')}
                        onClick={() => {
                          setRenameTarget(client.socketId);
                          setRenameValue(clientLabel(client, t));
                        }}
                      >
                        {clientLabel(client, t)}
                        <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>✎</span>
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: '0.73rem',
                        color: 'var(--color-text-light)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {client.ip} · {formatLastSeen(client.lastSeen, t)}
                    </div>
                  </div>

                  {/* Affecter : rôle + arène */}
                  {isAssignable(client) &&
                    (() => {
                      const a = getAssign(client);
                      return (
                        <>
                          <select
                            value={a.role}
                            onChange={e =>
                              applyAssign(client, e.target.value as AssignRole, a.arena)
                            }
                            style={{
                              padding: '0.2rem 0.3rem',
                              fontSize: '0.75rem',
                              background: 'var(--color-bg)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '5px',
                              color: 'inherit',
                            }}
                            title={t('xiaomi.tablet_role')}
                          >
                            {assignRoles.map(r => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                          {a.role !== 'kiosk' && (
                            <select
                              value={a.arena}
                              onChange={e => applyAssign(client, a.role, Number(e.target.value))}
                              style={{
                                padding: '0.2rem 0.3rem',
                                fontSize: '0.75rem',
                                background: 'var(--color-bg)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '5px',
                                color: 'inherit',
                              }}
                              title={t('xiaomi.arena')}
                            >
                              {Array.from({ length: arenaCount }, (_, i) => (
                                <option key={i + 1} value={i + 1}>
                                  {t('xiaomi.arena')} {i + 1}
                                </option>
                              ))}
                            </select>
                          )}
                        </>
                      );
                    })()}

                  {/* Identifier */}
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                    onClick={() =>
                      window.electronAPI.remote.identifyClient(competitionId, client.socketId)
                    }
                    title={t('xiaomi.blink')}
                  >
                    {t('remote_score.identify_button')}
                  </button>

                  {/* Renommer */}
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem' }}
                    onClick={() => {
                      setRenameTarget(client.socketId);
                      setRenameValue(client.label ?? '');
                    }}
                    title={t('xiaomi.rename')}
                  >
                    ✏️
                  </button>

                  {/* Mode kiosk */}
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem' }}
                    onClick={() => {
                      setKioskTarget(client.socketId);
                      setKioskConfig(loadKioskConfig());
                    }}
                    title={t('ui.configure_send_kiosk')}
                  >
                    🖥️
                  </button>

                  {/* Rafraîchir */}
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem' }}
                    onClick={() => sendCmd(client.socketId, { type: 'refresh' })}
                    title={t('xiaomi.refresh')}
                  >
                    ↻
                  </button>

                  {/* Naviguer (tous types) */}
                  <div
                    ref={openNav === client.socketId ? navRef : null}
                    style={{ position: 'relative' }}
                  >
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem' }}
                      onClick={() =>
                        setOpenNav(openNav === client.socketId ? null : client.socketId)
                      }
                    >
                      ▾
                    </button>
                    {openNav === client.socketId && (
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 'calc(100% + 4px)',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '8px',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                          minWidth: '170px',
                          zIndex: 300,
                          overflow: 'hidden',
                        }}
                      >
                        {allNavTargets.map(t => (
                          <button
                            key={t.url}
                            className="comp-header-dropdown-item"
                            style={{ width: '100%', textAlign: 'left', fontSize: '0.82rem' }}
                            onClick={() => {
                              sendCmd(client.socketId, { type: 'navigate', url: t.url });
                              setOpenNav(null);
                            }}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Intervertir toggle (arena/lobby only) */}
                  {isArenaOrLobby(client) && (
                    <button
                      className={`btn ${inSwap ? 'btn-primary' : 'btn-secondary'}`}
                      style={{
                        padding: '0.2rem 0.45rem',
                        fontSize: '0.75rem',
                        opacity: swapFull ? 0.4 : 1,
                      }}
                      onClick={() => !swapFull && toggleSwap(client.socketId)}
                      title={inSwap ? t('xiaomi.deselect_swap') : t('xiaomi.select_swap')}
                      disabled={swapFull}
                    >
                      ⇄
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bandeau intervertir */}
        {swapSet.size > 0 && (
          <div
            style={{
              padding: '0.65rem 1.25rem',
              background: 'rgba(249,115,22,0.12)',
              borderTop: '1px solid rgba(249,115,22,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <span style={{ fontSize: '0.88rem', flex: 1, color: '#ea580c' }}>
              {t('xiaomi.swap_label')}{' '}
              {swapCandidates
                .map(c => <strong key={c.socketId}>{clientLabel(c, t)}</strong>)
                .reduce(
                  (a, b) =>
                    (
                      <>
                        {a} <span style={{ color: '#94a3b8' }}>↔</span> {b}
                      </>
                    ) as any
                )}
              {swapSet.size === 1 && (
                <span style={{ color: '#94a3b8' }}> {t('xiaomi.select_2nd')}</span>
              )}
            </span>
            {canSwap && (
              <button
                className="btn btn-primary"
                style={{ padding: '0.3rem 0.75rem', fontSize: '0.82rem' }}
                onClick={confirmSwap}
              >
                {t('actions.confirm')}
              </button>
            )}
            <button
              className="btn btn-secondary"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.82rem' }}
              onClick={() => setSwapSet(new Set())}
            >
              {t('actions.cancel')}
            </button>
          </div>
        )}

        {/* Message global */}
        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderTop: '1px solid var(--color-border)',
            pointerEvents: locked ? 'none' : 'auto',
            opacity: locked ? 0.55 : 1,
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-light)',
              marginBottom: '0.4rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {t('xiaomi.global_message_label')}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') sendMessage();
              }}
              placeholder={t('xiaomi.bottom_text')}
              style={{
                flex: 1,
                padding: '0.4rem 0.6rem',
                fontSize: '0.85rem',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                color: 'inherit',
              }}
            />
            <select
              value={msgDuration}
              onChange={e => setMsgDuration(Number(e.target.value))}
              style={{
                padding: '0.4rem 0.3rem',
                fontSize: '0.82rem',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                color: 'inherit',
              }}
            >
              <option value={3}>3s</option>
              <option value={5}>5s</option>
              <option value={10}>10s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
            </select>
            <button
              className="btn btn-primary"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
              onClick={sendMessage}
            >
              {t('xiaomi.send')}
            </button>
          </div>
        </div>
      </div>

      {/* Modal config kiosk */}
      {kioskTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
          }}
          onClick={e => {
            if (e.target === e.currentTarget) setKioskTarget(null);
          }}
        >
          <div
            style={{
              background: 'var(--color-surface, #1e293b)',
              color: 'var(--color-text, #f1f5f9)',
              border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
              borderRadius: '12px',
              width: '360px',
              maxWidth: '94vw',
              padding: '1.25rem',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.85rem' }}>
              {t('ui.configure_kiosk')}
            </div>
            <div
              style={{
                fontSize: '0.82rem',
                color: 'var(--color-text-light, #94a3b8)',
                marginBottom: '0.5rem',
              }}
            >
              {t('ui.views_label')}
            </div>
            {kioskViews.map(({ key, label }) => (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  margin: '0.3rem 0',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={kioskConfig[key] as boolean}
                  onChange={e => setKioskConfig(c => ({ ...c, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}
            >
              <label
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--color-text-light, #94a3b8)',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('ui.rotation_label')}
              </label>
              <input
                type="number"
                min={3}
                max={300}
                value={kioskConfig.rotationSec}
                onChange={e =>
                  setKioskConfig(c => ({
                    ...c,
                    rotationSec: Math.max(3, parseInt(e.target.value) || 15),
                  }))
                }
                style={{
                  width: '5rem',
                  padding: '0.3rem 0.5rem',
                  borderRadius: '5px',
                  border: '1px solid var(--color-border, rgba(255,255,255,0.15))',
                  background: 'var(--color-bg, rgba(255,255,255,0.06))',
                  color: 'inherit',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={sendKiosk}>
                {t('ui.send_kiosk')}
              </button>
              <button className="btn btn-secondary" onClick={() => setKioskTarget(null)}>
                {t('actions.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function buildNavTargets(
  base: string,
  arenaCount: number,
  t: (key: string, params?: { [key: string]: string | number }) => string
) {
  const targets: { label: string; url: string }[] = [
    { label: t('xiaomi.nav_lobby'), url: `${base}/lobby` },
  ];
  for (let i = 1; i <= arenaCount; i++)
    targets.push({ label: t('xiaomi.nav_arena', { n: i }), url: `${base}/arene${i}` });
  targets.push({ label: t('xiaomi.nav_kiosk_public'), url: `${base}/kiosk` });
  targets.push({ label: t('xiaomi.nav_ranking'), url: `${base}/` });
  return targets;
}

export const XiaomiRemotePanel = React.memo(XiaomiRemotePanelComponent);
