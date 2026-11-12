/**
 * BellePoule Modern - Panneau de configuration Cyrano EFP1/EFP1.1 (#1720)
 * Démarre/arrête le serveur UDP, gère la table IP↔piste, supervision en temps réel.
 * Licensed under GPL-3.0
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, RefreshCw, Wifi, WifiOff, AlertCircle, Circle } from 'lucide-react';
import { Icon } from '../common/Icon';
import { Button } from '../common/Button';
import { useTranslation } from '../../hooks/useTranslation';
import type { CyranoPisteConfigDTO, CyranoPisteStatusDTO } from '../../../shared/types/preload';

const PISTES_KEY = 'bellepoule-cyrano-pistes';
const PORT_KEY = 'bellepoule-cyrano-port';
const DEFAULT_PORT = 50100;
const POLL_MS = 5000;

function readPistes(): CyranoPisteConfigDTO[] {
  try {
    const raw = localStorage.getItem(PISTES_KEY);
    return raw ? (JSON.parse(raw) as CyranoPisteConfigDTO[]) : [];
  } catch {
    return [];
  }
}
function writePistes(p: CyranoPisteConfigDTO[]): void {
  try {
    localStorage.setItem(PISTES_KEY, JSON.stringify(p));
  } catch {
    /* noop */
  }
}
function readPort(): number {
  try {
    return parseInt(localStorage.getItem(PORT_KEY) ?? '', 10) || DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}
function writePort(p: number): void {
  try {
    localStorage.setItem(PORT_KEY, String(p));
  } catch {
    /* noop */
  }
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  online: <Wifi size={14} style={{ color: 'var(--success)' }} />,
  stale: <AlertCircle size={14} style={{ color: 'var(--warning)' }} />,
  offline: <WifiOff size={14} style={{ color: 'var(--danger)' }} />,
  never: <Circle size={14} style={{ color: 'var(--slate-400)' }} />,
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
  const [nameLength, setNameLength] = useState<10 | 12 | 15 | 20>(10);
  const [natSource, setNatSource] = useState<'auto' | 'country' | 'club' | 'region'>('auto');
  const [international, setInternational] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!window.electronAPI?.cyrano) return;
    const s = await window.electronAPI.cyrano.getStatus();
    setRunning(s.running);
    setStatuses(s.pistes);
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

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
    if (!window.electronAPI?.cyrano) return;
    const res = await window.electronAPI.cyrano.start({ port: udpPort });
    if (res.success) {
      await window.electronAPI.cyrano.setPistes(pistes.filter(p => p.piste && p.ip));
      await window.electronAPI.cyrano.setOptions({ nameLength, natSource, international });
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
    <div className="arena-url-card" style={{ marginTop: '1rem' }}>
      {/* ── Header ── */}
      <div className="arena-url-header u-row-between">
        <strong>{t('rsm.cyrano_card')}</strong>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span
            className={`rsm-status-dot rsm-status-dot--${running ? 'on' : 'off'}`}
            title={t(running ? 'rsm.cyrano_running' : 'rsm.cyrano_stopped')}
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--slate-400)' }}>
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
      <div className="arena-url-row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--slate-400)', whiteSpace: 'nowrap' }}>
          {t('rsm.cyrano_port')}
        </label>
        <input
          type="number"
          className="form-input"
          style={{ width: '90px', padding: '0.2rem 0.4rem', fontSize: '0.85rem' }}
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
            disabled={!portValid || pistes.filter(p => p.piste && p.ip).length === 0}
            onClick={() => {
              void handleStart();
            }}
          >
            {t('rsm.cyrano_start')}
          </Button>
        )}
      </div>

      {/* ── Table des pistes ── */}
      <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ color: 'var(--slate-400)', borderBottom: '1px solid var(--slate-700)' }}>
              <th style={{ textAlign: 'left', padding: '0.2rem 0.4rem', fontWeight: 600 }}>
                {t('rsm.cyrano_piste_id')}
              </th>
              <th style={{ textAlign: 'left', padding: '0.2rem 0.4rem', fontWeight: 600 }}>IP</th>
              <th style={{ textAlign: 'left', padding: '0.2rem 0.4rem', fontWeight: 600 }}>
                {t('rsm.cyrano_port_dev')}
              </th>
              <th style={{ textAlign: 'left', padding: '0.2rem 0.4rem', fontWeight: 600 }}>
                {t('rsm.cyrano_arena')}
              </th>
              <th style={{ textAlign: 'left', padding: '0.2rem 0.4rem', fontWeight: 600 }}>
                {t('rsm.cyrano_protocol')}
              </th>
              <th style={{ textAlign: 'left', padding: '0.2rem 0.4rem', fontWeight: 600 }}>
                {t('rsm.cyrano_status')}
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pistes.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    color: 'var(--slate-500)',
                    padding: '0.5rem 0.4rem',
                    fontStyle: 'italic',
                  }}
                >
                  {t('rsm.cyrano_no_pistes')}
                </td>
              </tr>
            )}
            {pistes.map((row, i) => {
              const st = statusOf(row.ip);
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--slate-800)' }}>
                  <td style={{ padding: '0.25rem 0.4rem' }}>
                    <input
                      className="form-input"
                      style={{ width: '70px', padding: '0.15rem 0.3rem', fontSize: '0.82rem' }}
                      maxLength={8}
                      placeholder="1"
                      value={row.piste}
                      onChange={e => updateRow(i, 'piste', e.target.value)}
                    />
                  </td>
                  <td style={{ padding: '0.25rem 0.4rem' }}>
                    <input
                      className="form-input"
                      style={{ width: '130px', padding: '0.15rem 0.3rem', fontSize: '0.82rem' }}
                      placeholder="192.168.1.100"
                      value={row.ip}
                      onChange={e => updateRow(i, 'ip', e.target.value)}
                    />
                  </td>
                  <td style={{ padding: '0.25rem 0.4rem' }}>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: '70px', padding: '0.15rem 0.3rem', fontSize: '0.82rem' }}
                      min={1}
                      max={65535}
                      value={row.port ?? DEFAULT_PORT}
                      onChange={e => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v)) updateRow(i, 'port', v);
                      }}
                    />
                  </td>
                  <td style={{ padding: '0.25rem 0.4rem' }}>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: '55px', padding: '0.15rem 0.3rem', fontSize: '0.82rem' }}
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
                  <td style={{ padding: '0.25rem 0.4rem' }}>
                    <select
                      className="form-input"
                      style={{ padding: '0.15rem 0.3rem', fontSize: '0.82rem' }}
                      value={row.protocol ?? 'auto'}
                      onChange={e => updateRow(i, 'protocol', e.target.value)}
                    >
                      <option value="auto">auto</option>
                      <option value="EFP1">EFP1</option>
                      <option value="EFP1.1">EFP1.1</option>
                    </select>
                  </td>
                  <td style={{ padding: '0.25rem 0.4rem' }}>
                    {st ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {STATUS_ICONS[st.status]}
                        <span style={{ color: 'var(--slate-400)', fontSize: '0.78rem' }}>
                          {st.detectedProtocol ?? ''}
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--slate-600)', fontSize: '0.78rem' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '0.25rem 0.4rem' }}>
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
        <div style={{ marginTop: '0.4rem' }}>
          <Button size="sm" onClick={addRow}>
            <Icon icon={Plus} /> {t('rsm.cyrano_add_piste')}
          </Button>
        </div>
      </div>

      {/* ── Options noms / nat ── */}
      <div
        style={{
          marginTop: '0.75rem',
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          fontSize: '0.82rem',
          color: 'var(--slate-300)',
        }}
      >
        <label style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
          {t('rsm.cyrano_name_length')}
          <select
            className="form-input"
            style={{ padding: '0.15rem 0.3rem', fontSize: '0.82rem' }}
            value={nameLength}
            onChange={e => {
              const v = parseInt(e.target.value, 10) as 10 | 12 | 15 | 20;
              setNameLength(v);
              if (running) void window.electronAPI?.cyrano?.setOptions({ nameLength: v });
            }}
          >
            {([10, 12, 15, 20] as const).map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
          {t('rsm.cyrano_nat_source')}
          <select
            className="form-input"
            style={{ padding: '0.15rem 0.3rem', fontSize: '0.82rem' }}
            value={natSource}
            onChange={e => {
              const v = e.target.value as typeof natSource;
              setNatSource(v);
              if (running) void window.electronAPI?.cyrano?.setOptions({ natSource: v });
            }}
          >
            <option value="auto">auto</option>
            <option value="country">{t('rsm.cyrano_nat_country')}</option>
            <option value="club">{t('rsm.cyrano_nat_club')}</option>
            <option value="region">{t('rsm.cyrano_nat_region')}</option>
          </select>
        </label>
        <label style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={international}
            onChange={e => {
              setInternational(e.target.checked);
              if (running)
                void window.electronAPI?.cyrano?.setOptions({ international: e.target.checked });
            }}
          />
          {t('rsm.cyrano_international')}
        </label>
      </div>
    </div>
  );
};
