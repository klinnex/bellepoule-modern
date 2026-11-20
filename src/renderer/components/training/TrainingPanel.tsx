import { Tooltip } from '../Tooltip';
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import {
  Swords,
  Clock,
  Trophy,
  Copy,
  QrCode,
  ChevronDown,
  ChevronUp,
  Check,
  Settings,
  Monitor,
  Printer,
} from 'lucide-react';
import type { TrainingMatchRecord } from '../../../shared/types/preload';
import TrainingPrintModal from './TrainingPrintModal';
import { getActiveLocale } from '../../../shared/utils/localeFormat';
import { Button } from '../common/Button';
import type { TrainingTheme } from '../../../shared/utils/trainingThemes';

// Thèmes intégrés (pas de thème personnalisé en entraînement) : piste, kiosk, arbitre et lobby
import { TRAINING_THEME_OPTIONS } from './trainingThemeOptions';

const WEAPON_LABELS: Record<string, string> = {
  E: 'weapons.epee',
  F: 'weapons.foil',
  S: 'weapons.sabre',
  L: 'weapons.laser',
  C: 'weapons.custom',
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Mini-composant : ligne URL + bouton Copier + QR inline ──────────────────
interface UrlRowProps {
  label: string;
  url: string;
  qrDataUrl: string | null;
}
const UrlRow: React.FC<UrlRowProps> = ({ label, url, qrDataUrl }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Presse-papiers asynchrone refusé (focus, permission) : repli execCommand (#991)
      const el = document.createElement('textarea');
      el.value = url;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="is-9de27a">
      {qrDataUrl ? (
        <img
          src={qrDataUrl}
          alt={`QR ${label}`}
          width={80}
          height={80}
          className="training-panel-1"
        />
      ) : (
        <div className="training-panel-2">…</div>
      )}
      <div className="training-panel-3">
        <div className="training-panel-4">{label}</div>
        <div className="training-panel-5">
          <code className="training-panel-6">{url}</code>
          <Tooltip content={t('trainingPanel.copy_url')}>
            <button
              onClick={handleCopy}
              aria-label={t('trainingPanel.copy_url')}
              className={`training-copy-btn${copied ? ' is-copied' : ''}`}
            >
              {copied ? <Check size={20} /> : <Copy size={16} />}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

// ── Bloc kiosk grand écran ───────────────────────────────────────────────────
interface KioskBlockProps {
  kioskUrl: string;
  title?: string;
  label?: string;
}
const KioskBlock: React.FC<KioskBlockProps> = ({ kioskUrl, title, label }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const QRCode = (await import('qrcode')).default;
      const r = await QRCode.toDataURL(kioskUrl, { width: 160, margin: 1 });
      if (!cancelled) setQr(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, kioskUrl]);

  return (
    <div className="training-panel-7">
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 0.75rem',
          background: open ? 'var(--color-surface-raised, rgba(0,0,0,0.04))' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text)',
        }}
      >
        <span className="training-panel-8">
          <Monitor size={13} /> {title ?? t('trainingPanel.kiosk_big')}
        </span>
        <div className="training-panel-9">
          <QrCode size={13} />
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </button>
      {open && (
        <div className="training-panel-10">
          <UrlRow label={label ?? t('trainingPanel.kiosk')} url={kioskUrl} qrDataUrl={qr} />
        </div>
      )}
    </div>
  );
};

// ── Bloc par arène : header cliquable + expand QR ───────────────────────────
interface ArenaBlockProps {
  number: number;
  refereeUrl: string;
  displayUrl: string;
}
const ArenaBlock: React.FC<ArenaBlockProps> = ({ number, refereeUrl, displayUrl }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [qrReferee, setQrReferee] = useState<string | null>(null);
  const [qrDisplay, setQrDisplay] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const QRCode = (await import('qrcode')).default;
      const [r, d] = await Promise.all([
        QRCode.toDataURL(refereeUrl, { width: 160, margin: 1 }),
        QRCode.toDataURL(displayUrl, { width: 160, margin: 1 }),
      ]);
      if (!cancelled) {
        setQrReferee(r);
        setQrDisplay(d);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, refereeUrl, displayUrl]);

  return (
    <div className="training-panel-7">
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 0.75rem',
          background: open ? 'var(--color-surface-raised, rgba(0,0,0,0.04))' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text)',
        }}
      >
        <span className="training-panel-11">{t('trainingPanel.strip_n', { n: number })}</span>
        <div className="training-panel-9">
          <QrCode size={13} />
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </button>

      {/* Expanded */}
      {open && (
        <div className="training-panel-12">
          <UrlRow label={t('trainingPanel.referee')} url={refereeUrl} qrDataUrl={qrReferee} />
          <div className="training-panel-13" />
          <UrlRow label={t('trainingPanel.display')} url={displayUrl} qrDataUrl={qrDisplay} />
        </div>
      )}
    </div>
  );
};

// ── Panel principal ─────────────────────────────────────────────────────────
interface Props {
  serverUrl: string;
  strips: number;
  weapon: string;
  onClose: () => void;
  onStop: () => void;
  onOpenSettings: () => void;
}

const TrainingPanel: React.FC<Props> = ({
  serverUrl,
  strips,
  weapon,
  onClose,
  onStop,
  onOpenSettings,
}) => {
  const { t } = useTranslation();
  const [history, setHistory] = useState<TrainingMatchRecord[]>([]);
  const [printOpen, setPrintOpen] = useState(false);
  const [theme, setTheme] = useState<TrainingTheme>('dark');

  const handleThemeChange = async (next: TrainingTheme) => {
    const previous = theme;
    setTheme(next);
    const res = await window.electronAPI?.training?.setTheme(next);
    if (res && !res.success) setTheme(previous);
  };

  const refreshHistory = useCallback(async () => {
    const result = await window.electronAPI?.training?.getHistory();
    if (result?.success) setHistory(result.history ?? []);
  }, []);

  useEffect(() => {
    refreshHistory();
    const unsub = window.electronAPI?.onTrainingMatchFinished?.(data => {
      const record = data?.record;
      if (record) setHistory(prev => [...prev, record]);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [refreshHistory]);

  const arenas = Array.from({ length: strips }, (_, i) => ({
    number: i + 1,
    referee: `${serverUrl}/arene${i + 1}/arbitre`,
    display: `${serverUrl}/arene${i + 1}`,
  }));

  return (
    <div className="training-panel-14">
      <div className="training-panel-15">
        {/* Header */}
        <div className="training-panel-16">
          <h2 className="training-panel-17">
            <Swords size={18} />
            {t('trainingPanel.title', {
              weapon: WEAPON_LABELS[weapon] ? t(WEAPON_LABELS[weapon]) : weapon,
            })}
            <span className="training-panel-18">
              <span className="training-panel-19" />
              {t('trainingPanel.in_progress')}
            </span>
          </h2>
          <select
            aria-label={t('rsm.display_theme')}
            title={t('rsm.display_theme')}
            value={theme}
            onChange={e => handleThemeChange(e.target.value as TrainingTheme)}
            className="training-panel-20"
          >
            {TRAINING_THEME_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label ?? t(opt.labelKey!)}
              </option>
            ))}
          </select>
          <button
            className="btn-close"
            onClick={onClose}
            title={t('trainingPanel.close_title')}
            aria-label={t('actions.close')}
          >
            ×
          </button>
        </div>

        <div className="training-panel-21">
          {/* Kiosk */}
          <KioskBlock kioskUrl={`${serverUrl}/kiosk`} />
          <KioskBlock
            kioskUrl={`${serverUrl}/entrainement-lobby`}
            title={t('trainingPanel.lobby_big')}
            label={t('trainingPanel.lobby')}
          />

          {/* Pistes */}
          <div>
            <div className="training-panel-22">
              <QrCode size={13} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
              {t('trainingPanel.strips', { count: strips })}
            </div>
            <div className="training-panel-23">
              {arenas.map(({ number, referee, display }) => (
                <ArenaBlock
                  key={number}
                  number={number}
                  refereeUrl={referee}
                  displayUrl={display}
                />
              ))}
            </div>
          </div>

          {/* Historique */}
          <div>
            <div className="training-panel-22">
              <Trophy size={13} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
              {t('trainingPanel.history', { count: history.length })}
            </div>
            {history.length === 0 ? (
              <div className="training-panel-24">{t('trainingPanel.no_bout')}</div>
            ) : (
              <div className="training-panel-25">
                {[...history].reverse().map((rec, idx) => (
                  <div
                    key={rec.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.375rem 0.75rem',
                      background:
                        idx % 2 === 0
                          ? 'var(--color-surface-raised, rgba(0,0,0,0.03))'
                          : 'transparent',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                    }}
                  >
                    <span className="training-panel-26">
                      {t('trainingPanel.strip_n', { n: rec.arenaNumber })}
                    </span>
                    <span className="training-panel-27">
                      {rec.scoreA} — {rec.scoreB}
                    </span>
                    {rec.durationSec > 0 && (
                      <span className="training-panel-28">
                        <Clock size={11} /> {formatDuration(rec.durationSec)}
                      </span>
                    )}
                    <span className="training-panel-29">
                      {new Date(rec.finishedAt).toLocaleTimeString(getActiveLocale(), {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="training-panel-30">
          <div className="training-footer-left">
            <Button
              className="btn-icon-label"
              onClick={onOpenSettings}
              title={t('trainingPanel.settings')}
            >
              <Settings size={14} /> {t('trainingPanel.settings')}
            </Button>
            <Button
              className="btn-icon-label"
              onClick={() => setPrintOpen(true)}
              title={t('trainingPanel.print')}
              aria-label={t('trainingPanel.print')}
            >
              <Printer size={14} />
            </Button>
          </div>
          <Button variant="danger" onClick={onStop}>
            {t('trainingPanel.stop')}
          </Button>
        </div>
      </div>
      {printOpen && (
        <TrainingPrintModal
          serverUrl={serverUrl}
          strips={strips}
          onClose={() => setPrintOpen(false)}
        />
      )}
    </div>
  );
};

export default TrainingPanel;
