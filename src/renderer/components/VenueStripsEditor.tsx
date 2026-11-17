/**
 * BellePoule Modern - Pistes d'une salle : libellé et appareil Cyrano (IPv4, port, mode) (#1880)
 * Licensed under GPL-3.0
 */

import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { HINT } from './settingsModal.styles';
import type { VenueStrip } from '../../shared/types/appSettings';
import {
  MAX_STRIP_LABEL,
  STRIP_MODES,
  isIpv4,
  isValidPort,
  stripToEdit,
  type StripEdit,
  type StripMode,
} from './venueStripsEdit';

interface Props {
  /** Pistes de la salle redimensionnées (numéros 1…n) */
  strips: VenueStrip[];
  edits: Record<number, StripEdit>;
  onChange: (number: number, edit: StripEdit) => void;
}

const VenueStripsEditor: React.FC<Props> = ({ strips, edits, onChange }) => {
  const { t } = useTranslation();
  return (
    <details className="venue-strips-editor">
      <summary>{t('venues.strips_title')}</summary>
      <p style={HINT}>{t('venues.strips_hint')}</p>
      {strips.map(strip => {
        const n = strip.number;
        const edit = edits[n] ?? stripToEdit(strip);
        const ipInvalid = edit.ip.trim() !== '' && !isIpv4(edit.ip);
        const set = (patch: Partial<StripEdit>) => onChange(n, { ...edit, ...patch });
        return (
          <div
            key={n}
            className="venue-strip-row"
            role="group"
            aria-label={t('venues.strip_row', { number: n })}
          >
            <span className="venue-strip-number">{n}</span>
            <input
              type="text"
              className="form-input"
              value={edit.label}
              maxLength={MAX_STRIP_LABEL}
              placeholder={t('venues.strip_label_placeholder', { number: n })}
              aria-label={t('venues.strip_label', { number: n })}
              onChange={e => set({ label: e.target.value })}
            />
            <input
              type="text"
              inputMode="decimal"
              className="form-input venue-strip-ip"
              value={edit.ip}
              placeholder={t('venues.strip_ip_placeholder')}
              aria-label={t('venues.strip_ip', { number: n })}
              aria-invalid={ipInvalid}
              onChange={e => set({ ip: e.target.value })}
            />
            <input
              type="text"
              inputMode="numeric"
              className="form-input venue-strip-port"
              value={edit.port}
              placeholder={t('venues.strip_port_placeholder')}
              aria-label={t('venues.strip_port', { number: n })}
              aria-invalid={!isValidPort(edit.port)}
              onChange={e => set({ port: e.target.value })}
            />
            <select
              className="form-select"
              value={edit.mode}
              aria-label={t('venues.strip_mode', { number: n })}
              onChange={e => set({ mode: e.target.value as StripMode })}
            >
              {STRIP_MODES.map(m => (
                <option key={m} value={m}>
                  {t(`rsm.cyrano_mode_${m}`)}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </details>
  );
};

export default VenueStripsEditor;
