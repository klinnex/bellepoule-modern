/**
 * BellePoule Modern - En-tête de la saisie distante : état du serveur, URLs et options
 * Licensed under GPL-3.0
 */

import React from 'react';
import { Icon } from '../common/Icon';
import { Square } from 'lucide-react';
// qrcode chargé à la demande (génération du QR uniquement à l'affichage)
import { RSM_STYLES } from './rsmStyles';
import type { RemoteScoreManagerCtx } from '../remote/remoteScoreManagerCtx';

/** En-tête de la saisie distante : état du serveur, URLs et options (extrait de RemoteScoreManager, #1599) */
export function RemoteHeaderSection({ ctx }: { ctx: RemoteScoreManagerCtx }) {
  const {
    t,
    isExpert,
    serverUrl,
    certFingerprint,
    competition,
    remotePort,
    handlePortChange,
    isLoading,
    handleChangePort,
    handleStopRemote,
  } = ctx;

  return (
    <>
      <div className="remote-header">
        <div className="remote-status active rsm-hero">
          <span className="rsm-status-dot rsm-status-dot--on" aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="rsm-hero-title">{t('remote.active_title')}</h3>
            {isExpert && (
              <>
                <p className="rsm-hero-desc">
                  {t('rsm.server')} <strong>{serverUrl}</strong>
                </p>
                {certFingerprint ? (
                  <p
                    style={{
                      fontSize: '0.75rem',
                      color: '#94a3b8',
                      margin: '0.25rem 0 0',
                      wordBreak: 'break-all',
                    }}
                  >
                    {t('rsm.cert_fingerprint')}{' '}
                    <code style={{ fontSize: '0.7rem' }}>{certFingerprint}</code>
                  </p>
                ) : (
                  serverUrl.startsWith('http://') && (
                    <p role="alert" style={RSM_STYLES.httpWarning}>
                      {t('rsm.http_warning_active')}
                    </p>
                  )
                )}
                <div style={RSM_STYLES.portActiveRow}>
                  <label
                    htmlFor={`remote-port-active-${competition.id}`}
                    style={RSM_STYLES.portActiveLabel}
                  >
                    {t('rsm.port')}
                  </label>
                  <input
                    id={`remote-port-active-${competition.id}`}
                    type="number"
                    min={1}
                    max={65535}
                    value={remotePort}
                    onChange={e => handlePortChange(parseInt(e.target.value, 10))}
                    style={RSM_STYLES.portActiveInput}
                    disabled={isLoading}
                  />
                  <button
                    className="btn-secondary"
                    onClick={handleChangePort}
                    disabled={isLoading}
                    title={t('rsm.restart_port_title')}
                    style={RSM_STYLES.portActiveBtn}
                  >
                    {t('rsm.reload')}
                  </button>
                </div>
              </>
            )}
            {!isExpert && !certFingerprint && serverUrl.startsWith('http://') && (
              <p role="alert" style={RSM_STYLES.httpWarning}>
                {t('rsm.http_warning_active')}
              </p>
            )}
          </div>
        </div>
        <button
          className="rsm-start-btn rsm-stop-btn"
          onClick={handleStopRemote}
          disabled={isLoading}
        >
          {isLoading ? <span className="rsm-spinner" /> : <Icon icon={Square} />}
          {t('rsm.stop')}
        </button>
      </div>
    </>
  );
}
