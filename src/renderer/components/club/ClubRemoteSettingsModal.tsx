/**
 * BellePoule Modern - Mode Club (#1872) : paramètres globaux de la saisie distante du club,
 * comme pour une compétition : interface réseau, port, HTTPS, thème des écrans et mot de
 * passe commun des pistes. Réseau appliqué au prochain démarrage ; thème et mot de passe
 * appliqués tout de suite si la saisie distante tourne.
 * Licensed under GPL-3.0
 */
import React, { useState } from 'react';
import type { TrainingTheme } from '../../../shared/utils/trainingThemes';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { TRAINING_THEME_OPTIONS } from '../training/trainingThemeOptions';
import {
  ALL_INTERFACES,
  isValidArenaPassword,
  isValidPort,
  networkChanged,
  type ClubRemoteSettings,
} from './clubRemoteSettings';

interface ClubRemoteSettingsModalProps {
  value: ClubRemoteSettings;
  password: string;
  interfaces: { name: string; address: string }[];
  /** Saisie distante en cours : les réglages réseau attendront le prochain démarrage */
  active: boolean;
  onSave: (settings: ClubRemoteSettings, password: string) => void;
  onClose: () => void;
}

export const ClubRemoteSettingsModal: React.FC<ClubRemoteSettingsModalProps> = ({
  value,
  password: initialPassword,
  interfaces,
  active,
  onSave,
  onClose,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ClubRemoteSettings>(value);
  const [portText, setPortText] = useState(String(value.port));
  const [password, setPassword] = useState(initialPassword);
  const port = Number(portText);
  const portOk = isValidPort(port);
  const pwdOk = isValidArenaPassword(password);
  const next = { ...draft, port: portOk ? port : draft.port };
  const set = <K extends keyof ClubRemoteSettings>(k: K, v: ClubRemoteSettings[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  return (
    <Modal
      title={t('clubRemote.title')}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!portOk || !pwdOk}
            onClick={() => onSave(next, password)}
          >
            {t('actions.save')}
          </Button>
        </>
      }
    >
      <div className="club-remote-settings">
        <fieldset className="club-fieldset">
          <legend>{t('rsm.section_network')}</legend>
          <label className="form-label">
            {t('trainingLauncher.network')}
            <select
              className="form-input"
              value={draft.iface}
              onChange={e => set('iface', e.target.value)}
            >
              <option value={ALL_INTERFACES}>{t('trainingLauncher.all_interfaces')}</option>
              {interfaces
                .filter(i => i.address !== ALL_INTERFACES)
                .map(i => (
                  <option key={i.address} value={i.address}>
                    {i.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="form-label">
            {t('clubRemote.port')}
            <input
              className="form-input club-strips-input"
              type="number"
              min={1}
              max={65535}
              value={portText}
              aria-invalid={!portOk}
              onChange={e => setPortText(e.target.value)}
            />
          </label>
          {!portOk && <p className="club-error">{t('rsm.port_invalid')}</p>}
          <label className="club-nowrap">
            <input
              type="checkbox"
              checked={draft.https}
              onChange={e => set('https', e.target.checked)}
            />{' '}
            {t('rsm.enable_https')}
          </label>
          <p className={draft.https ? 'club-muted' : 'club-error'}>
            {draft.https ? t('rsm.https_hint') : t('rsm.http_warning')}
          </p>
          {active && networkChanged(value, next) && (
            <p className="club-muted" role="status">
              {t('clubRemote.restart_hint')}
            </p>
          )}
        </fieldset>
        <fieldset className="club-fieldset">
          <legend>{t('clubRemote.screens')}</legend>
          <label className="form-label">
            {t('clubRemote.theme')}
            <select
              className="form-input"
              value={draft.theme}
              onChange={e => set('theme', e.target.value as TrainingTheme)}
            >
              {TRAINING_THEME_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label ?? t(opt.labelKey!)}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            {t('clubRemote.password')}
            <input
              className="form-input"
              type="password"
              autoComplete="new-password"
              value={password}
              placeholder={t('rsm.common_pwd_placeholder')}
              aria-invalid={!pwdOk}
              onChange={e => setPassword(e.target.value)}
            />
          </label>
          <p className={pwdOk ? 'club-muted' : 'club-error'}>{t('clubRemote.password_hint')}</p>
        </fieldset>
      </div>
    </Modal>
  );
};
