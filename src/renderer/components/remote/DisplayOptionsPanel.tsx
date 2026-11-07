/**
 * BellePoule Modern - Options d'affichage de la saisie distante (#1414)
 * Thème des écrans, fond d'écran d'attente et vues du kiosk (extrait de RemoteScoreManager).
 * Licensed under GPL-3.0
 */
import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

type DisplayTheme = 'dark' | 'light' | 'neon' | 'unicorn';
type KioskViews = { poules: boolean; classement: boolean; direct: boolean; suivants: boolean };

interface Props {
  competitionId: string;
  displayTheme: DisplayTheme;
  setDisplayTheme: (theme: DisplayTheme) => void;
  arenaWallpaper: string | null;
  setArenaWallpaper: (wallpaper: string | null) => void;
  kioskViews: KioskViews;
  setKioskViews: (views: KioskViews) => void;
}

const S = {
  themeSection: { margin: '0.5rem 0' } satisfies React.CSSProperties,
  themeTitle: {
    fontSize: '0.875rem',
    marginBottom: '0.4rem',
    color: 'inherit',
  } satisfies React.CSSProperties,
  themeRow: { display: 'flex', gap: '0.5rem' } satisfies React.CSSProperties,
  wallpaperSection: { margin: '0.5rem 0' } satisfies React.CSSProperties,
  wallpaperTitle: {
    fontSize: '0.875rem',
    marginBottom: '0.4rem',
    color: 'inherit',
  } satisfies React.CSSProperties,
  wallpaperRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap' as const,
  } satisfies React.CSSProperties,
  wallpaperImg: {
    width: 80,
    height: 45,
    objectFit: 'cover' as const,
    borderRadius: '0.25rem',
    border: '1px solid #475569',
  } satisfies React.CSSProperties,
  wallpaperImportLabel: {
    padding: '0.35rem 0.75rem',
    borderRadius: '0.375rem',
    border: '1px solid #475569',
    background: 'transparent',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: '0.8rem',
  } satisfies React.CSSProperties,
  wallpaperHiddenInput: { display: 'none' } satisfies React.CSSProperties,
  wallpaperDeleteBtn: {
    padding: '0.35rem 0.5rem',
    borderRadius: '0.375rem',
    border: '1px solid #475569',
    background: 'transparent',
    color: '#f87171',
    cursor: 'pointer',
    fontSize: '0.8rem',
  } satisfies React.CSSProperties,
  kioskViewsSection: { margin: '0.5rem 0' } satisfies React.CSSProperties,
  kioskViewsTitle: {
    fontSize: '0.875rem',
    marginBottom: '0.25rem',
    color: 'inherit',
  } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;

export const DisplayOptionsPanel: React.FC<Props> = ({
  competitionId,
  displayTheme,
  setDisplayTheme,
  arenaWallpaper,
  setArenaWallpaper,
  kioskViews,
  setKioskViews,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <div style={S.themeSection}>
        <div style={S.themeTitle}>{t('rsm.display_theme')}</div>
        <div style={S.themeRow}>
          {(
            [
              { value: 'dark', label: t('rsm.theme_dark'), icon: '🌙' },
              { value: 'light', label: t('rsm.theme_light'), icon: '☀️' },
              { value: 'neon', label: t('rsm.theme_neon'), icon: '⚡' },
              { value: 'unicorn', label: 'Unicorn', icon: '🦄' },
            ] as const
          ).map(({ value, label, icon }) => (
            <button
              key={value}
              onClick={async () => {
                setDisplayTheme(value);
                await window.electronAPI.remote.updateTheme(competitionId, value);
              }}
              style={{
                flex: 1,
                padding: '0.35rem 0.5rem',
                borderRadius: '0.375rem',
                border: `2px solid ${displayTheme === value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background:
                  displayTheme === value ? 'var(--color-primary-dark)' : 'var(--color-surface)',
                color: displayTheme === value ? '#fff' : 'var(--color-text)',
                cursor: 'pointer',
                fontWeight: displayTheme === value ? 700 : 400,
                fontSize: '0.8rem',
                transition: 'all 0.15s',
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>
      <div style={S.wallpaperSection}>
        <div style={S.wallpaperTitle}>{t('rsm.wallpaper_title')}</div>
        <div style={S.wallpaperRow}>
          {arenaWallpaper && (
            <img src={arenaWallpaper} alt={t('rsm.wallpaper_alt')} style={S.wallpaperImg} />
          )}
          <label style={S.wallpaperImportLabel}>
            {arenaWallpaper ? t('rsm.wallpaper_change') : t('rsm.wallpaper_import')}
            <input
              type="file"
              accept="image/*"
              style={S.wallpaperHiddenInput}
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async ev => {
                  const base64 = ev.target?.result as string;
                  setArenaWallpaper(base64);
                  await window.electronAPI.remote.setWallpaper(competitionId, base64);
                };
                reader.readAsDataURL(file);
                e.target.value = '';
              }}
            />
          </label>
          {arenaWallpaper && (
            <button
              onClick={async () => {
                setArenaWallpaper(null);
                await window.electronAPI.remote.setWallpaper(competitionId, null);
              }}
              style={S.wallpaperDeleteBtn}
            >
              {t('rsm.delete')}
            </button>
          )}
        </div>
      </div>
      <div style={S.kioskViewsSection}>
        <div style={S.kioskViewsTitle}>{t('rsm.kiosk_views')}</div>
        <div className="rsm-pills">
          {(
            [
              { key: 'poules', label: t('rsm.view_pools') },
              { key: 'classement', label: t('rsm.view_ranking') },
              { key: 'direct', label: t('rsm.view_live_matches') },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`rsm-pill${kioskViews[key] ? ' rsm-pill--on' : ''}`}
              aria-pressed={kioskViews[key]}
              onClick={async () => {
                const next = { ...kioskViews, [key]: !kioskViews[key] };
                setKioskViews(next);
                await window.electronAPI.remote.updateKioskViews(competitionId, next);
              }}
            >
              {kioskViews[key] ? '✓ ' : ''}
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};
