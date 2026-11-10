/**
 * BellePoule Modern - Grille des pistes : URL, mot de passe et thème de chaque écran
 * Licensed under GPL-3.0
 */

import { TipButton } from '../Tooltip';
import React from 'react';
import { Icon } from '../common/Icon';
import { CopyUrlLabel } from './CopyUrlLabel';
import { Camera, LockOpen, Moon, Pencil, Smartphone, Sun, Zap } from 'lucide-react';
// qrcode chargé à la demande (génération du QR uniquement à l'affichage)
import type { RemoteScoreManagerCtx } from '../remote/remoteScoreManagerCtx';

/** Grille des pistes : URL, mot de passe et thème de chaque écran (extrait de RemoteScoreManager, #1599) */
export function RemoteArenaGrid({ ctx }: { ctx: RemoteScoreManagerCtx }) {
  const {
    arenaUrls,
    arenaThemes,
    arenaScreenTab,
    t,
    savedThemes,
    setArenaScreenTab,
    handleArenaThemeChange,
    setThemeEditorScreenType,
    setThemeEditorTarget,
    handleClearArenaThemeOverride,
    handleClearArenaScreenTheme,
    handleArenaScreenThemeChange,
    copyToClipboard,
    copiedIndex,
    setActiveQR,
    arenaPasswords,
    setArenaPasswords,
    applyArenaPassword,
  } = ctx;

  return (
    <>
      <div className="arena-url-grid">
        {arenaUrls.map(arena => {
          const arenaId = `arena${arena.number}`;
          const arenaTheme = arenaThemes[arenaId];
          const screenTab = arenaScreenTab[arenaId] ?? 'arena';
          const screenThemeTypes = [
            { value: 'arena' as const, label: t('rsm.screen_display') },
            { value: 'public' as const, label: t('rsm.screen_public') },
            { value: 'referee' as const, label: t('rsm.screen_referee') },
            { value: 'pool' as const, label: t('rsm.screen_pool') },
          ] as const;
          const filteredForScreen = savedThemes.filter(
            t => (t.targetType ?? 'arena') === screenTab
          );
          return (
            <div key={arena.number} className="arena-url-card">
              <div className="arena-url-header">
                <strong>{t('rsm.strip_n', { number: arena.number })}</strong>
              </div>
              {/* Onglets type d'écran */}
              <div style={{ display: 'flex', gap: '0.25rem', margin: '0.4rem 0 0.25rem' }}>
                {screenThemeTypes.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setArenaScreenTab(prev => ({ ...prev, [arenaId]: value }))}
                    style={{
                      padding: '0.15rem 0.45rem',
                      fontSize: '0.7rem',
                      borderRadius: '0.25rem',
                      border: `1px solid ${screenTab === value ? 'var(--color-primary)' : '#475569'}`,
                      background: screenTab === value ? 'var(--color-primary-dark)' : 'transparent',
                      color: screenTab === value ? '#fff' : '#94a3b8',
                      cursor: 'pointer',
                      fontWeight: screenTab === value ? 700 : 400,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Sélecteur de thème selon l'onglet */}
              <div className="arena-theme-picker">
                {screenTab === 'arena' ? (
                  <>
                    {[
                      { value: 'dark' as const, icon: Moon, title: t('rsm.theme_dark') },
                      { value: 'light' as const, icon: Sun, title: t('rsm.theme_light') },
                      { value: 'neon' as const, icon: Zap, title: t('rsm.theme_neon') },
                    ].map(({ value, icon, title }) => (
                      <TipButton
                        key={value}
                        tip={title}
                        className={`arena-theme-btn ${arenaTheme?.theme === value ? 'active' : ''}`}
                        onClick={() => handleArenaThemeChange(arenaId, value)}
                      >
                        <Icon icon={icon} />
                      </TipButton>
                    ))}
                    <TipButton
                      tip={t('rsm.theme_custom')}
                      className={`arena-theme-btn ${arenaTheme?.theme === 'custom' ? 'active' : ''}`}
                      onClick={() => {
                        setThemeEditorScreenType('arena');
                        setThemeEditorTarget(arenaId);
                      }}
                    >
                      <Icon icon={Pencil} />
                    </TipButton>
                    {arenaThemes[arenaId] && (
                      <TipButton
                        tip={t('rsm.unlock_theme')}
                        className="arena-theme-btn"
                        style={{ color: '#f59e0b', borderColor: '#f59e0b' }}
                        onClick={() => void handleClearArenaThemeOverride(arenaId)}
                      >
                        <Icon icon={LockOpen} />
                      </TipButton>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      title={t('rsm.customize_screen', { screen: screenTab })}
                      className={`arena-theme-btn ${arenaTheme?.screenThemes?.[screenTab] ? 'active' : ''}`}
                      onClick={() => {
                        setThemeEditorScreenType(screenTab);
                        setThemeEditorTarget(arenaId);
                      }}
                    >
                      <Icon icon={Pencil} /> {arenaTheme?.screenThemes?.[screenTab] ? '●' : ''}
                    </button>
                    {arenaTheme?.screenThemes?.[screenTab] && (
                      <TipButton
                        tip={t('rsm.unlock_theme')}
                        className="arena-theme-btn"
                        style={{ color: '#f59e0b', borderColor: '#f59e0b' }}
                        onClick={() => void handleClearArenaScreenTheme(arenaId, screenTab)}
                      >
                        <Icon icon={LockOpen} />
                      </TipButton>
                    )}
                  </>
                )}
                {filteredForScreen.length > 0 && (
                  <select
                    title={t('rsm.apply_saved_theme')}
                    value=""
                    onChange={async e => {
                      const t = savedThemes.find(x => x.id === e.target.value);
                      if (!t) return;
                      if (screenTab === 'arena') {
                        await handleArenaThemeChange(arenaId, 'custom', t);
                      } else {
                        await handleArenaScreenThemeChange(arenaId, screenTab, t);
                      }
                      e.currentTarget.value = '';
                    }}
                    style={{
                      padding: '0.2rem 0.4rem',
                      borderRadius: '0.3rem',
                      border: '1px solid #475569',
                      background: '#1e293b',
                      color: '#e2e8f0',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      maxWidth: 110,
                    }}
                  >
                    <option value="">{t('rsm.themes_option')}</option>
                    {filteredForScreen.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="arena-url-row">
                <span className="arena-url-label">{t('rsm.screen_referee')}</span>
                <TipButton
                  className="btn-copy btn-wide"
                  onClick={() => copyToClipboard(arena.refereeUrl, arena.number * 10)}
                  tip={t('rsm.copy_url')}
                >
                  <CopyUrlLabel copied={copiedIndex === arena.number * 10} t={t} />
                </TipButton>
                <button
                  className="btn-qr btn-wide"
                  onClick={() =>
                    setActiveQR({
                      url: arena.refereeUrl,
                      label: t('rsm.qr_label', {
                        number: arena.number,
                        screen: t('rsm.screen_referee'),
                      }),
                    })
                  }
                  title={t('rsm.qr_code')}
                >
                  <Icon icon={Smartphone} /> {t('rsm.qr_code')}
                </button>
              </div>
              <div className="arena-url-row">
                <span className="arena-url-label">{t('rsm.screen_display')}</span>
                <TipButton
                  className="btn-copy btn-wide"
                  onClick={() => copyToClipboard(arena.displayUrl, arena.number * 10 + 1)}
                  tip={t('rsm.copy_url')}
                >
                  <CopyUrlLabel copied={copiedIndex === arena.number * 10 + 1} t={t} />
                </TipButton>
                <button
                  className="btn-qr btn-wide"
                  onClick={() =>
                    setActiveQR({
                      url: arena.displayUrl,
                      label: t('rsm.qr_label', {
                        number: arena.number,
                        screen: t('rsm.screen_display'),
                      }),
                    })
                  }
                  title={t('rsm.qr_code')}
                >
                  <Icon icon={Smartphone} /> {t('rsm.qr_code')}
                </button>
              </div>
              <div className="arena-url-row">
                <span className="arena-url-label">{t('rsm.screen_pool')}</span>
                <TipButton
                  className="btn-copy btn-wide"
                  onClick={() => copyToClipboard(arena.poolUrl, arena.number * 10 + 2)}
                  tip={t('rsm.copy_url')}
                >
                  <CopyUrlLabel copied={copiedIndex === arena.number * 10 + 2} t={t} />
                </TipButton>
                <button
                  className="btn-qr btn-wide"
                  onClick={() =>
                    setActiveQR({
                      url: arena.poolUrl,
                      label: t('rsm.qr_label', {
                        number: arena.number,
                        screen: t('rsm.screen_pool'),
                      }),
                    })
                  }
                  title={t('rsm.qr_code')}
                >
                  <Icon icon={Smartphone} /> {t('rsm.qr_code')}
                </button>
              </div>
              <div className="arena-url-row">
                <span className="arena-url-label" title={t('rsm.matches_title')}>
                  {t('rsm.matches')}
                </span>
                <TipButton
                  className="btn-copy btn-wide"
                  onClick={() => copyToClipboard(arena.matchOrderUrl, arena.number * 10 + 5)}
                  tip={t('rsm.copy_url')}
                >
                  <CopyUrlLabel copied={copiedIndex === arena.number * 10 + 5} t={t} />
                </TipButton>
                <button
                  className="btn-qr btn-wide"
                  onClick={() =>
                    setActiveQR({
                      url: arena.matchOrderUrl,
                      label: t('rsm.qr_label', {
                        number: arena.number,
                        screen: t('rsm.match_order'),
                      }),
                    })
                  }
                  title={t('rsm.qr_code')}
                >
                  <Icon icon={Smartphone} /> {t('rsm.qr_code')}
                </button>
              </div>
              <div className="arena-url-row">
                <span className="arena-url-label">{t('rsm.screen_public')}</span>
                <TipButton
                  className="btn-copy btn-wide"
                  onClick={() => copyToClipboard(arena.publicUrl, arena.number * 10 + 3)}
                  tip={t('rsm.copy_url')}
                >
                  <CopyUrlLabel copied={copiedIndex === arena.number * 10 + 3} t={t} />
                </TipButton>
                <button
                  className="btn-qr btn-wide"
                  onClick={() =>
                    setActiveQR({
                      url: arena.publicUrl,
                      label: t('rsm.qr_label', {
                        number: arena.number,
                        screen: t('rsm.screen_public'),
                      }),
                    })
                  }
                  title={t('rsm.qr_code')}
                >
                  <Icon icon={Smartphone} /> {t('rsm.qr_code')}
                </button>
              </div>
              <div className="arena-url-row">
                <span className="arena-url-label" title={t('rsm.overlay_title')}>
                  <Icon icon={Camera} /> Overlay
                </span>
                <TipButton
                  className="btn-copy btn-wide"
                  onClick={() => copyToClipboard(arena.overlayUrl, arena.number * 10 + 4)}
                  tip={t('rsm.overlay_copy_title')}
                >
                  <CopyUrlLabel copied={copiedIndex === arena.number * 10 + 4} t={t} />
                </TipButton>
                <button
                  className="btn-qr btn-wide"
                  onClick={() =>
                    setActiveQR({
                      url: arena.overlayUrl,
                      label: t('rsm.qr_label', {
                        number: arena.number,
                        screen: t('rsm.overlay_stream'),
                      }),
                    })
                  }
                  title={t('rsm.qr_code')}
                >
                  <Icon icon={Smartphone} /> {t('rsm.qr_code')}
                </button>
              </div>
              <div className="arena-url-row">
                <span className="arena-url-label">{t('rsm.pwd')}</span>
                <input
                  type="password"
                  className="arena-password-input"
                  placeholder={t('rsm.strip_pwd_placeholder')}
                  value={arenaPasswords[`arena${arena.number}`] ?? ''}
                  onChange={e =>
                    setArenaPasswords(p => ({
                      ...p,
                      [`arena${arena.number}`]: e.target.value,
                    }))
                  }
                  onKeyDown={e => {
                    if (e.key === 'Enter') void applyArenaPassword(arena.number);
                  }}
                />
                <button
                  className="btn-copy"
                  title={t('rsm.set_pwd')}
                  onClick={() => void applyArenaPassword(arena.number)}
                >
                  ✓
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
