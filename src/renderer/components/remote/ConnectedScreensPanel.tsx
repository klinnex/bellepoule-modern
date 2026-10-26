/**
 * BellePoule Modern - Écrans connectés au serveur distant + envoi du mode kiosque (#1241)
 * Extrait de RemoteScoreManager : liste, renommage et modale kiosk gérés localement.
 * Licensed under GPL-3.0
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ConnectedClient, KioskScreenConfig } from '../../../shared/types/preload';
import { useTranslation } from '../../hooks/useTranslation';
import { useToast } from '../Toast';

interface ConnectedScreensPanelProps {
  competitionId: string;
  isRemoteActive: boolean;
}

export const ConnectedScreensPanel: React.FC<ConnectedScreensPanelProps> = React.memo(
  ({ competitionId, isRemoteActive }) => {
    const { t } = useTranslation();
    const { showToast } = useToast();
    // Écrans connectés
    const [connectedClients, setConnectedClients] = useState<ConnectedClient[]>([]);
    const [renameValues, setRenameValues] = useState<Record<string, string>>({});
    // kioskModal : socketId de l'écran pour lequel on configure le mode kiosk
    const [kioskModal, setKioskModal] = useState<string | null>(null);
    const [kioskModalConfig, setKioskModalConfig] = useState<KioskScreenConfig>({
      poules: true,
      classement: true,
      final: false,
      direct: true,
      suivants: true,
      tableau: true,
      rotationSec: 15,
      eta: true,
    });

    // Abonnement aux mises à jour de la liste des clients connectés
    useEffect(() => {
      if (!isRemoteActive) return;
      window.electronAPI.remote.getConnectedClients(competitionId).then((res: any) => {
        if (res.success) setConnectedClients(res.clients ?? []);
      });
      return window.electronAPI.remote.onClientListUpdate((clients: ConnectedClient[]) => {
        setConnectedClients(clients);
      });
    }, [isRemoteActive, competitionId]);

    return (
      <>
        {connectedClients.length > 0 && (
          <div className="arena-url-card mt-4">
            <div className="arena-url-header">
              <strong>{t('rsm.connected_screens', { count: connectedClients.length })}</strong>
            </div>
            {connectedClients.map(client => {
              const clientLabel =
                client.label || client.screenId?.slice(0, 8) || client.socketId.slice(0, 8);
              const typeLabel: Record<string, string> = {
                kiosk: 'Kiosk',
                arena: t('rsm.client_arena'),
                public: t('rsm.screen_public'),
                pool: t('rsm.screen_pool'),
                dashboard: 'Dashboard',
                lobby: 'Lobby',
                referee: t('rsm.screen_referee'),
              };
              return (
                <div
                  key={client.socketId}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid #1e293b',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.15rem 0.4rem',
                      borderRadius: '0.3rem',
                      background: '#1e3a5f',
                      color: '#7dd3fc',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {typeLabel[client.clientType] ?? client.clientType}
                  </span>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: '#e2e8f0',
                      minWidth: '6rem',
                    }}
                  >
                    {clientLabel}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{client.ip}</span>
                  {client.battery && (
                    <span
                      title={client.battery.charging ? t('rsm.charging') : t('rsm.on_battery')}
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.15rem 0.4rem',
                        borderRadius: '0.3rem',
                        background:
                          client.battery.level <= 0.2 && !client.battery.charging
                            ? '#7f1d1d'
                            : '#1e293b',
                        color:
                          client.battery.level <= 0.2 && !client.battery.charging
                            ? '#fca5a5'
                            : '#94a3b8',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {client.battery.charging ? '🔌' : '🔋'}{' '}
                      {Math.round(client.battery.level * 100)}%
                    </span>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.35rem',
                      marginLeft: 'auto',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      className="btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                      title={t('rsm.identify_title')}
                      onClick={() =>
                        window.electronAPI.remote.identifyClient(competitionId, client.socketId)
                      }
                    >
                      {t('rsm.identify')}
                    </button>
                    <input
                      type="text"
                      placeholder={t('rsm.rename_placeholder')}
                      value={renameValues[client.socketId] ?? ''}
                      onChange={e =>
                        setRenameValues(v => ({ ...v, [client.socketId]: e.target.value }))
                      }
                      onKeyDown={async e => {
                        if (e.key === 'Enter') {
                          const lbl = renameValues[client.socketId]?.trim();
                          if (lbl)
                            await window.electronAPI.remote.renameClient(
                              competitionId,
                              client.socketId,
                              lbl
                            );
                        }
                      }}
                      style={{
                        width: '8rem',
                        fontSize: '0.75rem',
                        padding: '0.2rem 0.4rem',
                        borderRadius: '0.3rem',
                        border: '1px solid #475569',
                        background: '#0f172a',
                        color: '#e2e8f0',
                      }}
                    />
                    <button
                      className="btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                      title={t('rsm.rename')}
                      onClick={async () => {
                        const lbl = renameValues[client.socketId]?.trim();
                        if (lbl)
                          await window.electronAPI.remote.renameClient(
                            competitionId,
                            client.socketId,
                            lbl
                          );
                      }}
                    >
                      ✓
                    </button>
                    <button
                      className="btn-primary"
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                      title={t('ui.configure_send_kiosk')}
                      onClick={() => {
                        setKioskModal(client.socketId);
                        setKioskModalConfig({
                          poules: true,
                          classement: true,
                          final: false,
                          direct: true,
                          suivants: true,
                          tableau: true,
                          rotationSec: 15,
                          eta: true,
                        });
                      }}
                    >
                      {t('rsm.kiosk_mode')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {kioskModal &&
          createPortal(
            <div className="qr-popup-overlay" onClick={() => setKioskModal(null)}>
              <div
                className="qr-popup"
                onClick={e => e.stopPropagation()}
                style={{ minWidth: '20rem', maxWidth: '26rem' }}
              >
                <strong style={{ fontSize: '1rem' }}>{t('rsm.kiosk_modal_title')}</strong>
                <div style={{ margin: '0.75rem 0', textAlign: 'left' }}>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                    {t('rsm.views_label')}
                  </div>
                  {(
                    [
                      { key: 'poules', label: t('rsm.view_pools') },
                      { key: 'classement', label: t('rsm.view_ranking') },
                      { key: 'final', label: t('rsm.view_final') },
                      { key: 'direct', label: t('rsm.view_live_matches') },
                      { key: 'suivants', label: t('rsm.view_next_matches') },
                      { key: 'tableau', label: t('rsm.view_bracket') },
                      { key: 'eta', label: t('rsm.view_eta') },
                    ] as const
                  ).map(({ key, label }) => (
                    <label
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        margin: '0.3rem 0',
                        cursor: 'pointer',
                        color: '#e2e8f0',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={kioskModalConfig[key] !== false}
                        onChange={e =>
                          setKioskModalConfig(c => ({ ...c, [key]: e.target.checked }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginTop: '0.75rem',
                    }}
                  >
                    <label style={{ fontSize: '0.85rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {t('rsm.rotation')}
                    </label>
                    <input
                      type="number"
                      min={3}
                      max={300}
                      value={kioskModalConfig.rotationSec}
                      onChange={e =>
                        setKioskModalConfig(c => ({
                          ...c,
                          rotationSec: Math.max(3, parseInt(e.target.value) || 15),
                        }))
                      }
                      style={{
                        width: '5rem',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '0.3rem',
                        border: '1px solid #475569',
                        background: '#0f172a',
                        color: '#e2e8f0',
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    className="btn btn-primary flex-1"
                    onClick={async () => {
                      await window.electronAPI.remote.setClientKioskMode(
                        competitionId,
                        kioskModal,
                        kioskModalConfig
                      );
                      setKioskModal(null);
                      showToast(t('rsm.kiosk_sent'), 'success');
                    }}
                  >
                    {t('rsm.send_kiosk')}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setKioskModal(null)}>
                    {t('rsm.cancel')}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
      </>
    );
  }
);
ConnectedScreensPanel.displayName = 'ConnectedScreensPanel';
