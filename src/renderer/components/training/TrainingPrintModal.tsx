/**
 * BellePoule Modern - Impression des QR Codes du mode entraînement (#1500)
 * Sélection : kiosk, pistes arbitres, pistes affichage, lobby.
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useTranslation } from '../../hooks/useTranslation';
import { buildQrSheetsHTML, type QrCard } from '../ArenaQrCodesModal';
import { Button } from '../common/Button';

export interface TrainingQrSelection {
  kiosk: boolean;
  referees: boolean;
  displays: boolean;
  lobby: boolean;
}

export interface TrainingQrLabels {
  kiosk: string;
  lobby: string;
  referee: string;
  display: string;
  strip: (n: number) => string;
}

/** Cartes (sans image) à imprimer, dans l'ordre kiosk, arbitres, affichages, lobby. */
export function buildTrainingQrTargets(
  serverUrl: string,
  strips: number,
  sel: TrainingQrSelection,
  labels: TrainingQrLabels
): Array<Omit<QrCard, 'dataUrl'>> {
  const out: Array<Omit<QrCard, 'dataUrl'>> = [];
  if (sel.kiosk) out.push({ title: labels.kiosk, subtitle: '', url: `${serverUrl}/kiosk` });
  for (let n = 1; n <= strips; n++) {
    if (sel.referees)
      out.push({
        title: labels.strip(n),
        subtitle: labels.referee,
        url: `${serverUrl}/arene${n}/arbitre`,
      });
  }
  for (let n = 1; n <= strips; n++) {
    if (sel.displays)
      out.push({ title: labels.strip(n), subtitle: labels.display, url: `${serverUrl}/arene${n}` });
  }
  if (sel.lobby)
    out.push({ title: labels.lobby, subtitle: '', url: `${serverUrl}/entrainement-lobby` });
  return out;
}

interface Props {
  serverUrl: string;
  strips: number;
  onClose: () => void;
}

const TrainingPrintModal: React.FC<Props> = ({ serverUrl, strips, onClose }) => {
  const { t } = useTranslation();
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [sel, setSel] = useState<TrainingQrSelection>({
    kiosk: true,
    referees: true,
    displays: true,
    lobby: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const labels: TrainingQrLabels = {
    kiosk: t('trainingPanel.kiosk'),
    lobby: t('trainingPanel.lobby'),
    referee: t('trainingPanel.referee'),
    display: t('trainingPanel.display'),
    strip: n => t('trainingPanel.strip_n', { n }),
  };
  const count = buildTrainingQrTargets(serverUrl, strips, sel, labels).length;

  const toggle = (k: keyof TrainingQrSelection) => setSel(s => ({ ...s, [k]: !s[k] }));

  const handlePrint = async () => {
    if (count === 0) return;
    setBusy(true);
    setError('');
    try {
      const QRCode = (await import('qrcode')).default;
      const cards = await Promise.all(
        buildTrainingQrTargets(serverUrl, strips, sel, labels).map(async c => ({
          ...c,
          dataUrl: await QRCode.toDataURL(c.url, {
            width: 600,
            margin: 1,
            errorCorrectionLevel: 'M',
          }),
        }))
      );
      const res = await window.electronAPI?.file?.printHtml?.(
        buildQrSheetsHTML(
          cards,
          count >= 4 ? 4 : count >= 2 ? 2 : 1,
          t('trainingPanel.print_title')
        )
      );
      if (res && !res.success) setError(t('trainingPanel.print_error'));
      else onClose();
    } catch {
      setError(t('trainingPanel.print_error'));
    } finally {
      setBusy(false);
    }
  };

  const options: Array<[keyof TrainingQrSelection, string]> = [
    ['kiosk', 'trainingPanel.print_kiosk'],
    ['referees', 'trainingPanel.print_referees'],
    ['displays', 'trainingPanel.print_displays'],
    ['lobby', 'trainingPanel.print_lobby'],
  ];

  return (
    <div className="modal-overlay training-print-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal training-print-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="training-print-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="training-print-title">
            {t('trainingPanel.print_title')}
          </h2>
          <button className="btn-close" onClick={onClose} aria-label={t('actions.close')}>
            ×
          </button>
        </div>
        <div className="modal-body u-stack-4">
          {options.map(([key, label]) => (
            <label key={key} className="u-row">
              <input type="checkbox" checked={sel[key]} onChange={() => toggle(key)} />
              {t(label)}
            </label>
          ))}
          {error && <div role="alert">{error}</div>}
        </div>
        <div className="modal-footer">
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" onClick={handlePrint} disabled={busy || count === 0}>
            {t('trainingPanel.print_confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TrainingPrintModal;
