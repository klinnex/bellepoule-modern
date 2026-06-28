import React, { useState } from 'react';
import { X, Swords, Minus, Plus, Clock, Zap } from 'lucide-react';
import { Weapon, TargetZone, ZONE_POINTS, ZONE_LABELS } from '../../../shared/types';
import type { TrainingCustomRules } from '../../../shared/types/preload';

interface Props {
  onClose: () => void;
  onLaunch: (weapon: string, strips: number, customRules: TrainingCustomRules) => void;
  isLoading: boolean;
}

const WEAPON_LABELS: Record<string, string> = {
  [Weapon.EPEE]: 'Épée',
  [Weapon.FOIL]: 'Fleuret',
  [Weapon.SABRE]: 'Sabre',
  [Weapon.LASER]: 'Sabre Laser',
};

const ALL_ZONES: TargetZone[] = [TargetZone.ZONE_A, TargetZone.ZONE_B, TargetZone.ZONE_C];

const DURATION_PRESETS = [
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
  { label: '3 min', value: 180 },
  { label: '5 min', value: 300 },
];

const TrainingLauncherModal: React.FC<Props> = ({ onClose, onLaunch, isLoading }) => {
  const [weapon, setWeapon] = useState<string>(Weapon.EPEE);
  const [strips, setStrips] = useState(1);
  const [matchDuration, setMatchDuration] = useState(180);
  const [allowedZones, setAllowedZones] = useState<TargetZone[]>([]);
  const [disableSuddenDeath, setDisableSuddenDeath] = useState(false);

  const isLaser = weapon === Weapon.LASER;

  const toggleZone = (zone: TargetZone) => {
    setAllowedZones(prev =>
      prev.includes(zone) ? prev.filter(z => z !== zone) : [...prev, zone]
    );
  };

  const handleWeaponChange = (w: string) => {
    setWeapon(w);
    if (w !== Weapon.LASER) {
      setAllowedZones([]);
      setDisableSuddenDeath(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLaunch(weapon, strips, {
      matchDurationSeconds: matchDuration,
      allowedZones: allowedZones.map(z => z as string),
      disableSuddenDeath,
    });
  };

  const durationMin = Math.floor(matchDuration / 60);
  const durationSec = matchDuration % 60;
  const durationLabel = durationSec === 0 ? `${durationMin} min` : `${durationMin}:${String(durationSec).padStart(2, '0')}`;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-xl)',
          width: '460px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '1.5rem',
          color: 'var(--color-text)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Swords size={18} /> Mode Entraînement
          </h2>
          <button className="btn btn-icon" onClick={onClose} title="Fermer"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Arme */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem', fontSize: '0.875rem' }}>
              Arme
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {Object.entries(WEAPON_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleWeaponChange(key)}
                  style={{
                    padding: '0.625rem 0.75rem',
                    borderRadius: '8px',
                    border: weapon === key ? '2px solid var(--color-primary)' : '2px solid var(--color-border)',
                    background: weapon === key ? 'var(--color-primary-soft, rgba(99,102,241,0.1))' : 'transparent',
                    color: weapon === key ? 'var(--color-primary)' : 'var(--color-text)',
                    fontWeight: weapon === key ? 600 : 400,
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Pistes */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem', fontSize: '0.875rem' }}>
              Nombre de pistes
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                onClick={() => setStrips(s => Math.max(1, s - 1))}
                disabled={strips <= 1}
              >
                <Minus size={14} />
              </button>
              <span style={{ fontSize: '1.5rem', fontWeight: 700, minWidth: '2rem', textAlign: 'center' }}>
                {strips}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                onClick={() => setStrips(s => Math.min(20, s + 1))}
                disabled={strips >= 20}
              >
                <Plus size={14} />
              </button>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginLeft: '0.25rem' }}>
                piste{strips > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Durée du combat */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 500, marginBottom: '0.5rem', fontSize: '0.875rem' }}>
              <Clock size={14} /> Durée du combat — <strong>{durationLabel}</strong>
            </label>
            <input
              type="range"
              min={30}
              max={600}
              step={30}
              value={matchDuration}
              onChange={e => setMatchDuration(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-primary)', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              {DURATION_PRESETS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setMatchDuration(p.value)}
                  style={{
                    padding: '0.25rem 0.6rem',
                    borderRadius: '6px',
                    border: matchDuration === p.value ? '2px solid var(--color-primary)' : '2px solid var(--color-border)',
                    background: matchDuration === p.value ? 'var(--color-primary-soft, rgba(99,102,241,0.1))' : 'transparent',
                    color: matchDuration === p.value ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    fontSize: '0.8125rem',
                    fontWeight: matchDuration === p.value ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Options Laser Sabre uniquement */}
          {isLaser && (
            <>
              {/* Zones autorisées */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                  Zones autorisées{' '}
                  <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
                    (vide = toutes)
                  </span>
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {ALL_ZONES.map(zone => {
                    const active = allowedZones.includes(zone);
                    const pts = ZONE_POINTS[zone];
                    const label = ZONE_LABELS[zone];
                    const colors: Record<TargetZone, string> = {
                      [TargetZone.ZONE_A]: '#60a5fa',
                      [TargetZone.ZONE_B]: '#a78bfa',
                      [TargetZone.ZONE_C]: '#f472b6',
                    };
                    return (
                      <button
                        key={zone}
                        type="button"
                        onClick={() => toggleZone(zone)}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          borderRadius: '8px',
                          border: `2px solid ${active ? colors[zone] : 'var(--color-border)'}`,
                          background: active ? `${colors[zone]}22` : 'transparent',
                          color: active ? colors[zone] : 'var(--color-text-muted)',
                          fontWeight: active ? 600 : 400,
                          cursor: 'pointer',
                          fontSize: '0.8125rem',
                          textAlign: 'center',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ fontSize: '1rem', fontWeight: 700 }}>Zone {zone}</div>
                        <div style={{ fontSize: '0.75rem' }}>{pts} pt{pts > 1 ? 's' : ''}</div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>{label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mort subite */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    cursor: 'pointer', userSelect: 'none',
                  }}
                >
                  <div
                    style={{
                      width: '40px', height: '22px',
                      borderRadius: '11px',
                      background: disableSuddenDeath ? 'var(--color-danger, #ef4444)' : 'var(--color-border)',
                      position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
                      flexShrink: 0,
                    }}
                    onClick={() => setDisableSuddenDeath(v => !v)}
                  >
                    <div style={{
                      position: 'absolute', top: '3px',
                      left: disableSuddenDeath ? '21px' : '3px',
                      width: '16px', height: '16px',
                      borderRadius: '50%', background: '#fff',
                      transition: 'left 0.2s',
                    }} />
                  </div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Zap size={14} />
                    Désactiver la mort subite
                  </span>
                </label>
                {disableSuddenDeath && (
                  <p style={{ margin: '0.35rem 0 0 3.25rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    Égalité à temps → fin du match sans prolongation.
                  </p>
                )}
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Démarrage…' : 'Lancer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TrainingLauncherModal;
