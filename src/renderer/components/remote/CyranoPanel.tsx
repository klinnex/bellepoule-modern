/**
 * BellePoule Modern - Panneau de configuration Cyrano EFP1/EFP1.1 (#1720)
 * Démarre/arrête le serveur UDP, gère la table IP↔piste, supervision en temps réel.
 * Licensed under GPL-3.0
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertCircle,
  AlertTriangle,
  Circle,
} from 'lucide-react';
import { Icon } from '../common/Icon';
import { Button } from '../common/Button';
import { useTranslation } from '../../hooks/useTranslation';
import type {
  CyranoFrameLogDTO,
  CyranoPisteConfigDTO,
  CyranoPisteStatusDTO,
} from '../../../shared/types/preload';
import {
  DEFAULT_PORT,
  formatCyranoLog,
  readAutoStart,
  readHost,
  readOptions,
  readPistes,
  readPort,
  startCyranoFromSaved,
  writeAutoStart,
  writeHost,
  writeOptions,
  writePistes,
  writePort,
  type CyranoOptions,
} from './cyranoSettings';

const POLL_MS = 5000;
const LOG_LINES = 200;

const STATUS_ICONS: Record<string, React.ReactNode> = {
  online: <Wifi size={14} className="cyrano-st cyrano-st--online" />,
  stale: <AlertCircle size={14} className="cyrano-st cyrano-st--stale" />,
  offline: <WifiOff size={14} className="cyrano-st cyrano-st--offline" />,
  never: <Circle size={14} className="cyrano-st cyrano-st--never" />,
};

const EMPTY_ROW: CyranoPisteConfigDTO = {
  piste: '',
  ip: '',
  port: DEFAULT_PORT,
  arena: undefined,
  protocol: 'auto',
};

export const CyranoPanel: React.FC = () => {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [udpPort, setUdpPort] = useState<number>(readPort);
  const [pistes, setPistes] = useState<CyranoPisteConfigDTO[]>(readPistes);
  const [statuses, setStatuses] = useState<CyranoPisteStatusDTO[]>([]);
  const [options, setOptionsState] = useState<CyranoOptions>(readOptions);
  const { nameLength, natSource, international } = options;
  const [host, setHost] = useState<string>(readHost);
  const [interfaces, setInterfaces] = useState<{ name: string; address: string }[]>([]);
  const [autoStart, setAutoStart] = useState<boolean>(readAutoStart);
  const [showLog, setShowLog] = useState(false);
  const [log, setLog] = useState<CyranoFrameLogDTO[]>([]);
  const [startError, setStartError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showLogRef = useRef(showLog);
  useEffect(() => {
    showLogRef.current = showLog;
  }, [showLog]);
  const refreshStatus = useCallback(async () => {
    if (!window.electronAPI?.cyrano) return;
    const s = await window.electronAPI.cyrano.getStatus();
    setRunning(s.running);
    setStatuses(s.pistes);
    if (showLogRef.current) setLog((await window.electronAPI.cyrano.getLog?.()) ?? []);
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Interfaces réseau locales : choix de l'interface d'écoute (#1829)
  useEffect(() => {
    window.electronAPI?.remote
      ?.getNetworkInterfaces?.()
      .then(res => {
        if (res?.success && res.interfaces) setInterfaces(res.interfaces);
      })
      .catch(() => {});
  }, []);

  const updateOptions = (patch: Partial<CyranoOptions>) => {
    const next = { ...options, ...patch };
    setOptionsState(next);
    writeOptions(next);
    if (running) void window.electronAPI?.cyrano?.setOptions(patch);
  };

  const toggleLog = async () => {
    const next = !showLog;
    setShowLog(next);
    if (next && window.electronAPI?.cyrano) setLog(await window.electronAPI.cyrano.getLog());
  };

  const exportLog = async () => {
    const entries = (await window.electronAPI?.cyrano?.getLog()) ?? log;
    const blob = new Blob([formatCyranoLog(entries) + '\n'], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cyrano-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pisteAction = async (piste: string, action: 'ack' | 'next' | 'resync') => {
    await window.electronAPI?.cyrano?.pisteAction(piste, action);
    void refreshStatus();
  };

  useEffect(() => {
    if (!running) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = setInterval(() => {
      void refreshStatus();
    }, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [running, refreshStatus]);

  const handleStart = async () => {
    if (!window.electronAPI?.cyrano) {
      setStartError('electronAPI.cyrano indisponible');
      return;
    }
    setStartError(null);
    try {
      // Réglages déjà mémorisés à chaque modification : même démarrage que l'automatique
      const res = await startCyranoFromSaved();
      if (!res.success) setStartError(res.error ?? 'start_failed');
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    }
    void refreshStatus();
  };

  const handleStop = async () => {
    if (!window.electronAPI?.cyrano) return;
    await window.electronAPI.cyrano.stop();
    void refreshStatus();
  };

  const applyPistes = async (next: CyranoPisteConfigDTO[]) => {
    setPistes(next);
    writePistes(next);
    if (running && window.electronAPI?.cyrano) {
      await window.electronAPI.cyrano.setPistes(next.filter(p => p.piste && p.ip));
    }
  };

  const addRow = () => {
    void applyPistes([...pistes, { ...EMPTY_ROW }]);
  };
  const removeRow = (i: number) => {
    void applyPistes(pistes.filter((_, j) => j !== i));
  };
  const updateRow = (i: number, field: keyof CyranoPisteConfigDTO, value: unknown) => {
    const next = pistes.map((r, j) => (j === i ? { ...r, [field]: value } : r));
    void applyPistes(next);
  };

  const statusOf = (ip: string): CyranoPisteStatusDTO | undefined =>
    statuses.find(s => s.ip === ip);

  const portValid = udpPort >= 1 && udpPort <= 65535;

  return (
    <div className="arena-url-card cyrano-panel">
      {/* ── Header ── */}
      <div className="arena-url-header u-row-between">
        <strong>{t('rsm.cyrano_card')}</strong>
        <div className="cyrano-inline">
          <span
            className={`rsm-status-dot rsm-status-dot--${running ? 'on' : 'off'}`}
            title={t(running ? 'rsm.cyrano_running' : 'rsm.cyrano_stopped')}
          />
          <span className="cyrano-muted">
            {t(running ? 'rsm.cyrano_running' : 'rsm.cyrano_stopped')}
          </span>
          <button
            className="btn-copy"
            onClick={() => {
              void refreshStatus();
            }}
            title={t('rsm.cyrano_refresh')}
          >
            <Icon icon={RefreshCw} />
          </button>
        </div>
      </div>

      {/* ── Port + démarrer/arrêter ── */}
      <div className="arena-url-row cyrano-port-row">
        <label className="cyrano-muted cyrano-nowrap">{t('rsm.cyrano_port')}</label>
        <input
          type="number"
          className="form-input cyrano-input cyrano-w-port"
          min={1}
          max={65535}
          value={udpPort}
          disabled={running}
          onChange={e => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) {
              setUdpPort(v);
              writePort(v);
            }
          }}
        />
        {running ? (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              void handleStop();
            }}
          >
            {t('rsm.cyrano_stop')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            disabled={!portValid}
            onClick={() => {
              void handleStart();
            }}
          >
            {t('rsm.cyrano_start')}
          </Button>
        )}
      </div>
      {startError && !running && (
        <div className="cyrano-error" role="alert">
          <Icon icon={AlertCircle} /> {startError}
        </div>
      )}

      {/* ── Interface d'écoute + démarrage automatique (#1829) ── */}
      <div className="cyrano-options">
        <label className="cyrano-option">
          {t('rsm.cyrano_interface')}
          <select
            className="form-input cyrano-input"
            value={host}
            disabled={running}
            onChange={e => {
              setHost(e.target.value);
              writeHost(e.target.value);
            }}
          >
            <option value="">{t('rsm.cyrano_interface_all')}</option>
            {host && !interfaces.some(i => i.address === host) && (
              <option value={host}>{host}</option>
            )}
            {interfaces.map(i => (
              <option key={`${i.name}-${i.address}`} value={i.address}>
                {i.address} ({i.name})
              </option>
            ))}
          </select>
        </label>
        <label className="cyrano-option">
          <input
            type="checkbox"
            checked={autoStart}
            onChange={e => {
              setAutoStart(e.target.checked);
              writeAutoStart(e.target.checked);
            }}
          />
          {t('rsm.cyrano_autostart')}
        </label>
      </div>

      {/* ── Table des pistes ── */}
      <div className="cyrano-table-wrap">
        <table className="cyrano-table">
          <thead>
            <tr>
              <th>{t('rsm.cyrano_piste_id')}</th>
              <th>IP</th>
              <th>{t('rsm.cyrano_port_dev')}</th>
              <th>{t('rsm.cyrano_arena')}</th>
              <th>{t('rsm.cyrano_protocol')}</th>
              <th>{t('rsm.cyrano_status')}</th>
              <th>{t('rsm.cyrano_actions')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pistes.length === 0 && (
              <tr>
                <td colSpan={8} className="cyrano-empty">
                  {t('rsm.cyrano_no_pistes')}
                </td>
              </tr>
            )}
            {pistes.map((row, i) => {
              const st = statusOf(row.ip);
              return (
                <tr key={i}>
                  <td>
                    <input
                      className="form-input cyrano-input cyrano-w-sm"
                      maxLength={8}
                      placeholder="1"
                      value={row.piste}
                      onChange={e => updateRow(i, 'piste', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="form-input cyrano-input cyrano-w-ip"
                      placeholder="192.168.1.100"
                      value={row.ip}
                      onChange={e => updateRow(i, 'ip', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="form-input cyrano-input cyrano-w-sm"
                      min={1}
                      max={65535}
                      value={row.port ?? DEFAULT_PORT}
                      onChange={e => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v)) updateRow(i, 'port', v);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="form-input cyrano-input cyrano-w-xs"
                      min={1}
                      max={99}
                      placeholder="—"
                      value={row.arena ?? ''}
                      onChange={e => {
                        const v = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                        updateRow(i, 'arena', isNaN(v as number) ? undefined : v);
                      }}
                    />
                  </td>
                  <td>
                    <select
                      className="form-input cyrano-input"
                      value={row.protocol ?? 'auto'}
                      onChange={e => updateRow(i, 'protocol', e.target.value)}
                    >
                      <option value="auto">{t('rsm.cyrano_auto')}</option>
                      <option value="EFP1">{'EFP1'}</option>
                      <option value="EFP1.1">{'EFP1.1'}</option>
                    </select>
                  </td>
                  <td>
                    {st ? (
                      <span className="cyrano-status">
                        {STATUS_ICONS[st.status]}
                        <span className="cyrano-muted cyrano-small">
                          {st.detectedProtocol ?? ''}
                        </span>
                        {st.alert?.kind === 'bad_match' && (
                          <span
                            className="cyrano-alert"
                            title={t('rsm.cyrano_bad_match_hint', { device: st.alert.device })}
                          >
                            <Icon icon={AlertTriangle} /> {t('rsm.cyrano_bad_match')}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="cyrano-dim cyrano-small">—</span>
                    )}
                  </td>
                  <td>
                    {/* Actions de secours (#1829) : serveur démarré, piste déclarée */}
                    {running && st && (
                      <span className="cyrano-inline">
                        {(['ack', 'next', 'resync'] as const).map(action => (
                          <Button
                            key={action}
                            size="sm"
                            title={t(`rsm.cyrano_action_${action}_title`)}
                            onClick={() => {
                              void pisteAction(st.piste, action);
                            }}
                          >
                            {t(`rsm.cyrano_action_${action}`)}
                          </Button>
                        ))}
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn-copy"
                      onClick={() => removeRow(i)}
                      title={t('rsm.cyrano_remove_piste')}
                    >
                      <Icon icon={Trash2} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="cyrano-add">
          <Button size="sm" onClick={addRow}>
            <Icon icon={Plus} /> {t('rsm.cyrano_add_piste')}
          </Button>
        </div>
      </div>

      {/* ── Options noms / nat ── */}
      <div className="cyrano-options">
        <label className="cyrano-option">
          {t('rsm.cyrano_name_length')}
          <select
            className="form-input cyrano-input"
            value={nameLength}
            onChange={e => {
              updateOptions({ nameLength: parseInt(e.target.value, 10) as 10 | 12 | 15 | 20 });
            }}
          >
            {([10, 12, 15, 20] as const).map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="cyrano-option">
          {t('rsm.cyrano_nat_source')}
          <select
            className="form-input cyrano-input"
            value={natSource}
            onChange={e => {
              updateOptions({ natSource: e.target.value as typeof natSource });
            }}
          >
            <option value="auto">{t('rsm.cyrano_auto')}</option>
            <option value="country">{t('rsm.cyrano_nat_country')}</option>
            <option value="club">{t('rsm.cyrano_nat_club')}</option>
            <option value="region">{t('rsm.cyrano_nat_region')}</option>
          </select>
        </label>
        <label className="cyrano-option">
          <input
            type="checkbox"
            checked={international}
            onChange={e => {
              updateOptions({ international: e.target.checked });
            }}
          />
          {t('rsm.cyrano_international')}
        </label>
      </div>

      {/* ── Journal des trames (#1829) ── */}
      <div className="cyrano-options">
        <Button
          size="sm"
          aria-expanded={showLog}
          onClick={() => {
            void toggleLog();
          }}
        >
          {t('rsm.cyrano_log')}
        </Button>
        <Button
          size="sm"
          onClick={() => {
            void exportLog();
          }}
        >
          {t('rsm.cyrano_log_export')}
        </Button>
      </div>
      {showLog && (
        <pre className="cyrano-log" aria-label={t('rsm.cyrano_log')}>
          {log.length === 0 ? t('rsm.cyrano_log_empty') : formatCyranoLog(log.slice(-LOG_LINES))}
        </pre>
      )}
    </div>
  );
};
