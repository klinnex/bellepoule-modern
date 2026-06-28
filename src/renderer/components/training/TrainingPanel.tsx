import React, { useEffect, useState, useCallback } from 'react';
import { X, Swords, Clock, Trophy, Copy, QrCode, ChevronDown, ChevronUp, Check, Settings, Monitor } from 'lucide-react';
import type { TrainingMatchRecord } from '../../../shared/types/preload';

const WEAPON_LABELS: Record<string, string> = {
  E: 'Épée', F: 'Fleuret', S: 'Sabre', L: 'Laser', C: 'Custom',
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
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.375rem 0' }}>
      {qrDataUrl ? (
        <img src={qrDataUrl} alt={`QR ${label}`} width={80} height={80}
          style={{ border: '1px solid var(--color-border)', borderRadius: '6px', flexShrink: 0 }} />
      ) : (
        <div style={{ width: 80, height: 80, border: '1px solid var(--color-border)', borderRadius: '6px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>…</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
          {label}
        </div>
        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
          <code style={{
            fontSize: '0.7rem', background: 'var(--color-surface-raised, rgba(0,0,0,0.05))',
            padding: '0.125rem 0.375rem', borderRadius: '4px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }}>
            {url}
          </code>
          <button
            onClick={handleCopy}
            title="Copier l'URL"
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer', padding: '0.25rem',
              color: copied ? '#16a34a' : 'var(--color-text-muted)',
              display: 'flex', alignItems: 'center', flexShrink: 0,
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Bloc kiosk grand écran ───────────────────────────────────────────────────
interface KioskBlockProps { kioskUrl: string; }
const KioskBlock: React.FC<KioskBlockProps> = ({ kioskUrl }) => {
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
    return () => { cancelled = true; };
  }, [open, kioskUrl]);

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.5rem 0.75rem',
          background: open ? 'var(--color-surface-raised, rgba(0,0,0,0.04))' : 'transparent',
          border: 'none', cursor: 'pointer', color: 'var(--color-text)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Monitor size={13} /> Kiosk grand écran
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
          <QrCode size={13} />
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </button>
      {open && (
        <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid var(--color-border)' }}>
          <UrlRow label="Kiosk" url={kioskUrl} qrDataUrl={qr} />
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
      if (!cancelled) { setQrReferee(r); setQrDisplay(d); }
    })();
    return () => { cancelled = true; };
  }, [open, refereeUrl, displayUrl]);

  return (
    <div style={{
      border: '1px solid var(--color-border)',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.5rem 0.75rem',
          background: open ? 'var(--color-surface-raised, rgba(0,0,0,0.04))' : 'transparent',
          border: 'none', cursor: 'pointer', color: 'var(--color-text)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Piste {number}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
          <QrCode size={13} />
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </button>

      {/* Expanded */}
      {open && (
        <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <UrlRow label="Arbitre" url={refereeUrl} qrDataUrl={qrReferee} />
          <div style={{ height: '1px', background: 'var(--color-border)', margin: '0.25rem 0' }} />
          <UrlRow label="Affichage" url={displayUrl} qrDataUrl={qrDisplay} />
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

const TrainingPanel: React.FC<Props> = ({ serverUrl, strips, weapon, onClose, onStop, onOpenSettings }) => {
  const [history, setHistory] = useState<TrainingMatchRecord[]>([]);

  const refreshHistory = useCallback(async () => {
    const result = await window.electronAPI?.training?.getHistory();
    if (result?.success) setHistory(result.history ?? []);
  }, []);

  useEffect(() => {
    refreshHistory();
    const unsub = window.electronAPI?.onTrainingMatchFinished?.((data) => {
      const record = data?.record;
      if (record) setHistory(prev => [...prev, record]);
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [refreshHistory]);

  const arenas = Array.from({ length: strips }, (_, i) => ({
    number: i + 1,
    referee: `${serverUrl}/arene${i + 1}/arbitre`,
    display: `${serverUrl}/arene${i + 1}`,
  }));

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000,
    }}>
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-xl)',
        width: '560px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--color-text)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Swords size={18} />
            Entraînement — {WEAPON_LABELS[weapon] ?? weapon}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
              background: '#22c55e20', color: '#16a34a',
              padding: '0.125rem 0.5rem', borderRadius: '999px',
              fontSize: '0.75rem', fontWeight: 600, marginLeft: '0.25rem',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
              EN COURS
            </span>
          </h2>
          <button className="btn btn-icon" onClick={onClose} title="Fermer (l'entraînement continue)"><X size={16} /></button>
        </div>

        <div style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Kiosk */}
          <KioskBlock kioskUrl={`${serverUrl}/kiosk`} />

          {/* Pistes */}
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <QrCode size={13} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
              Pistes — {strips} piste{strips > 1 ? 's' : ''} (clic pour QR + copier)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {arenas.map(({ number, referee, display }) => (
                <ArenaBlock key={number} number={number} refereeUrl={referee} displayUrl={display} />
              ))}
            </div>
          </div>

          {/* Historique */}
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Trophy size={13} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
              Historique session ({history.length} combat{history.length !== 1 ? 's' : ''})
            </div>
            {history.length === 0 ? (
              <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', padding: '0.75rem', textAlign: 'center', background: 'var(--color-surface-raised, rgba(0,0,0,0.04))', borderRadius: '8px' }}>
                Aucun combat terminé
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '200px', overflowY: 'auto' }}>
                {[...history].reverse().map((rec, idx) => (
                  <div key={rec.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.375rem 0.75rem',
                    background: idx % 2 === 0 ? 'var(--color-surface-raised, rgba(0,0,0,0.03))' : 'transparent',
                    borderRadius: '6px', fontSize: '0.875rem',
                  }}>
                    <span style={{ minWidth: '4rem', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Piste {rec.arenaNumber}</span>
                    <span style={{ flex: 1, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{rec.scoreA} — {rec.scoreB}</span>
                    {rec.durationSec > 0 && (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={11} /> {formatDuration(rec.durationSec)}
                      </span>
                    )}
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                      {new Date(rec.finishedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn btn-secondary btn-icon-label" onClick={onOpenSettings} title="Paramètres">
            <Settings size={14} /> Paramètres
          </button>
          <button className="btn btn-danger" onClick={onStop}>Arrêter l'entraînement</button>
        </div>
      </div>
    </div>
  );
};

export default TrainingPanel;
