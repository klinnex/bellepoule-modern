import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { Swords, Minus, Plus, Clock, Zap, Network, Shuffle } from 'lucide-react';
import { Weapon, TargetZone, ZONE_POINTS, ZONE_LABELS } from '../../../shared/types';
import type { TrainingCustomRules } from '../../../shared/types/preload';
import { Button } from '../common/Button';

interface Props {
  onClose: () => void;
  onLaunch: (
    weapon: string,
    strips: number,
    customRules: TrainingCustomRules,
    host: string
  ) => void;
  isLoading: boolean;
}

const WEAPON_LABELS: Record<string, string> = {
  [Weapon.EPEE]: 'weapons.epee',
  [Weapon.FOIL]: 'weapons.foil',
  [Weapon.SABRE]: 'weapons.sabre',
  [Weapon.LASER]: 'weapons.laser',
};

const ALL_ZONES: TargetZone[] = [TargetZone.ZONE_A, TargetZone.ZONE_B, TargetZone.ZONE_C];

const DURATION_PRESETS = [
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
  { label: '3 min', value: 180 },
  { label: '5 min', value: 300 },
];

const INTERFACE_STORAGE_KEY = 'bellepoule-training-interface';
const ALL_INTERFACES = '0.0.0.0';

function loadSavedInterface(): string {
  try {
    return localStorage.getItem(INTERFACE_STORAGE_KEY) ?? ALL_INTERFACES;
  } catch {
    return ALL_INTERFACES;
  }
}

const TrainingLauncherModal: React.FC<Props> = ({ onClose, onLaunch, isLoading }) => {
  const { t } = useTranslation();
  const [weapon, setWeapon] = useState<string>(Weapon.EPEE);
  const [strips, setStrips] = useState(1);
  const [matchDuration, setMatchDuration] = useState(180);
  const [allowedZones, setAllowedZones] = useState<TargetZone[]>([]);
  const [disableSuddenDeath, setDisableSuddenDeath] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [networkInterfaces, setNetworkInterfaces] = useState<{ name: string; address: string }[]>([
    { name: 'Toutes les interfaces', address: ALL_INTERFACES },
  ]);
  const [selectedInterface, setSelectedInterface] = useState<string>(loadSavedInterface);

  useEffect(() => {
    window.electronAPI?.remote
      ?.getNetworkInterfaces?.()
      .then(res => {
        const list = res?.success ? res.interfaces : undefined;
        if (list?.length) {
          setNetworkInterfaces(list);
          // Interface mémorisée disparue (câble débranché, Wi-Fi changé…) → repli sur toutes
          setSelectedInterface(prev =>
            list.some(i => i.address === prev) ? prev : ALL_INTERFACES
          );
        }
      })
      .catch(() => {
        /* garde la valeur par défaut */
      });
  }, []);

  const handleInterfaceChange = (address: string) => {
    setSelectedInterface(address);
    try {
      localStorage.setItem(INTERFACE_STORAGE_KEY, address);
    } catch {
      /* optionnel */
    }
  };

  const isLaser = weapon === Weapon.LASER;

  const toggleZone = (zone: TargetZone) => {
    setAllowedZones(prev => (prev.includes(zone) ? prev.filter(z => z !== zone) : [...prev, zone]));
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
    onLaunch(
      weapon,
      strips,
      {
        matchDurationSeconds: matchDuration,
        allowedZones: allowedZones.map(z => z as string),
        disableSuddenDeath,
        demo: demoMode,
      },
      selectedInterface
    );
  };

  const durationMin = Math.floor(matchDuration / 60);
  const durationSec = matchDuration % 60;
  const durationLabel =
    durationSec === 0
      ? `${durationMin} min`
      : `${durationMin}:${String(durationSec).padStart(2, '0')}`;

  return (
    <div
      className="training-launcher-modal-1"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="training-launcher-modal-2">
        <div className="training-launcher-modal-3">
          <h2 className="training-launcher-modal-4">
            <Swords size={18} /> {t('trainingLauncher.title')}
          </h2>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            title={t('actions.close')}
            aria-label={t('actions.close')}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Arme */}
          <div className="training-launcher-modal-5">
            <label className="training-launcher-modal-6">{t('trainingLauncher.weapon')}</label>
            <div className="training-launcher-modal-7">
              {Object.entries(WEAPON_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleWeaponChange(key)}
                  style={{
                    padding: '0.625rem 0.75rem',
                    borderRadius: '8px',
                    border:
                      weapon === key
                        ? '2px solid var(--color-primary)'
                        : '2px solid var(--color-border)',
                    background:
                      weapon === key
                        ? 'var(--color-primary-soft, rgba(99,102,241,0.1))'
                        : 'transparent',
                    color: weapon === key ? 'var(--color-primary)' : 'var(--color-text)',
                    fontWeight: weapon === key ? 600 : 400,
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    transition: 'all 0.15s',
                  }}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          </div>

          {/* Pistes */}
          <div className="training-launcher-modal-5">
            <label className="training-launcher-modal-6">{t('trainingLauncher.strips')}</label>
            <div className="training-launcher-modal-8">
              <Button
                aria-label={t('actions.decrease')}
                type="button"
                className="btn-icon"
                onClick={() => setStrips(s => Math.max(1, s - 1))}
                disabled={strips <= 1}
              >
                <Minus size={14} />
              </Button>
              <span className="training-launcher-modal-9">{strips}</span>
              <Button
                aria-label={t('actions.increase')}
                type="button"
                className="btn-icon"
                onClick={() => setStrips(s => Math.min(20, s + 1))}
                disabled={strips >= 20}
              >
                <Plus size={14} />
              </Button>
              <span className="training-launcher-modal-10">
                {t('trainingLauncher.strip_unit', { count: strips })}
              </span>
            </div>
          </div>

          {/* Durée du combat */}
          <div className="training-launcher-modal-5">
            <label className="training-launcher-modal-11">
              <Clock size={14} /> {t('trainingLauncher.duration')} <strong>{durationLabel}</strong>
            </label>
            <input
              type="range"
              min={30}
              max={600}
              step={30}
              value={matchDuration}
              onChange={e => setMatchDuration(Number(e.target.value))}
              className="training-launcher-modal-12"
            />
            <div className="training-launcher-modal-13">
              {DURATION_PRESETS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setMatchDuration(p.value)}
                  style={{
                    padding: '0.25rem 0.6rem',
                    borderRadius: '6px',
                    border:
                      matchDuration === p.value
                        ? '2px solid var(--color-primary)'
                        : '2px solid var(--color-border)',
                    background:
                      matchDuration === p.value
                        ? 'var(--color-primary-soft, rgba(99,102,241,0.1))'
                        : 'transparent',
                    color:
                      matchDuration === p.value
                        ? 'var(--color-primary)'
                        : 'var(--color-text-muted)',
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

          {/* Interface réseau */}
          <div className="training-launcher-modal-5">
            <label htmlFor="training-interface" className="training-launcher-modal-11">
              <Network size={14} /> {t('trainingLauncher.network')}
            </label>
            <select
              id="training-interface"
              value={selectedInterface}
              onChange={e => handleInterfaceChange(e.target.value)}
              disabled={isLoading}
              className="w-full"
            >
              {networkInterfaces.map(iface => (
                <option key={iface.address} value={iface.address}>
                  {iface.address === ALL_INTERFACES
                    ? t('trainingLauncher.all_interfaces')
                    : iface.name}
                </option>
              ))}
            </select>
          </div>

          {/* Options Laser Sabre uniquement */}
          {isLaser && (
            <>
              {/* Zones autorisées */}
              <div className="training-launcher-modal-5">
                <label className="training-launcher-modal-6">
                  {t('trainingLauncher.zones')}{' '}
                  <span className="training-launcher-modal-14">
                    {t('trainingLauncher.zones_hint')}
                  </span>
                </label>
                <div className="training-launcher-modal-15">
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
                        <div className="training-launcher-modal-16">
                          {t('trainingLauncher.zone_n', { z: zone })}
                        </div>
                        <div className="training-launcher-modal-17">
                          {t('trainingLauncher.pts', { count: pts })}
                        </div>
                        <div className="training-launcher-modal-18">{label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mort subite */}
              <div className="training-launcher-modal-5">
                <label className="training-launcher-modal-19">
                  <div
                    style={{
                      width: '40px',
                      height: '22px',
                      borderRadius: '11px',
                      background: disableSuddenDeath
                        ? 'var(--color-danger, #ef4444)'
                        : 'var(--color-border)',
                      position: 'relative',
                      transition: 'background 0.2s',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                    onClick={() => setDisableSuddenDeath(v => !v)}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: '3px',
                        left: disableSuddenDeath ? '21px' : '3px',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.2s',
                      }}
                    />
                  </div>
                  <span className="training-launcher-modal-20">
                    <Zap size={14} />
                    {t('trainingLauncher.no_sudden_death')}
                  </span>
                </label>
                {disableSuddenDeath && (
                  <p className="training-launcher-modal-21">
                    {t('trainingLauncher.no_sudden_death_hint')}
                  </p>
                )}
              </div>
              {/* Mode démo */}
              <div className="training-demo">
                <label className="training-demo-toggle">
                  <div
                    className={`training-demo-switch${demoMode ? ' is-on' : ''}`}
                    onClick={() => setDemoMode(v => !v)}
                  >
                    <div className="training-demo-knob" />
                  </div>
                  <span className="training-demo-label">
                    <Shuffle size={14} />
                    {t('trainingLauncher.demo_mode')}
                  </span>
                </label>
                {demoMode && (
                  <p className="training-demo-hint">{t('trainingLauncher.demo_mode_hint')}</p>
                )}
              </div>
            </>
          )}

          <div className="training-launcher-modal-22">
            <Button type="button" onClick={onClose}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading}>
              {isLoading ? t('trainingLauncher.starting') : t('trainingLauncher.launch')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TrainingLauncherModal;
