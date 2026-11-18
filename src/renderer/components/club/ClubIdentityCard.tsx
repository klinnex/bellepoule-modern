/**
 * BellePoule Modern - Mode Club (#1872) : identité du club (nom, logo, arme, pistes, QR des
 * pistes). Onglet Identité de l'espace club.
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { FileDown, QrCode, Save, Trash2 } from 'lucide-react';
import type { ClubSettings, ClubUpdate } from '../../../shared/types/club';
import { exportArenaQrToPDF, printArenaQr } from '../../../shared/utils/pdfExport/clubCardsPdf';
import { ClubWeaponSelect } from './ClubWeaponSelect';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { useToast } from '../Toast';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface ClubIdentityCardProps {
  clubId: string;
  settings: ClubSettings;
  onSettingsChange: (s: ClubSettings) => void;
}

export const ClubIdentityCard: React.FC<ClubIdentityCardProps> = ({
  clubId,
  settings,
  onSettingsChange,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const api = window.electronAPI?.club;
  // null = nom enregistré (pas d'édition en cours)
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const clubName = nameEdit ?? settings.name;

  if (!api) return null;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      showToast(errText(e), 'error');
    }
  };

  /** Enregistre l'identité du club et la remonte à la vue */
  const saveClub = async (data: ClubUpdate) => {
    const club = await api.updateClub(clubId, data);
    if (club) onSettingsChange(club);
  };

  const saveName = () =>
    run(async () => {
      await saveClub({ name: clubName });
      setNameEdit(null);
      showToast(t('club.settings_saved'), 'success');
    });

  const pickLogo = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      showToast(t('club.logo_too_big'), 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => void run(() => saveClub({ logo: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const printArenas = (mode: 'print' | 'pdf') =>
    run(() =>
      mode === 'pdf'
        ? exportArenaQrToPDF(settings.stripCount, settings)
        : printArenaQr(settings.stripCount, settings)
    );

  const body = (
    <>
      <div className="club-row club-row--align-end">
        <label className="form-label club-grow" data-tour="club-name">
          {t('club.name')}
          <input
            className="form-input"
            value={clubName}
            maxLength={100}
            onChange={e => setNameEdit(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void saveName();
            }}
          />
        </label>
        <Button icon={<Save size={15} aria-hidden="true" />} onClick={() => void saveName()}>
          {t('actions.save')}
        </Button>
      </div>
      <div className="club-row">
        <label className="form-label" data-tour="club-logo">
          {t('club.logo')}
          <input
            className="form-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={e => pickLogo(e.target.files?.[0])}
          />
        </label>
        {settings.logo && (
          <Button
            variant="ghost"
            icon={<Trash2 size={15} aria-hidden="true" />}
            onClick={() => void run(() => saveClub({ logo: null }))}
          >
            {t('club.logo_remove')}
          </Button>
        )}
      </div>
      <div className="club-row club-row--align-end">
        <ClubWeaponSelect
          value={settings.weapon}
          label={t('clubWeapon.club_label')}
          onChange={w => void run(() => saveClub({ weapon: w }))}
        />
        <label className="form-label club-field-stack" data-tour="club-strips">
          {t('club.strip_count')}
          <input
            className="form-input club-strips-input"
            type="number"
            min={1}
            max={99}
            value={settings.stripCount}
            onChange={e => void run(() => saveClub({ stripCount: Number(e.target.value) }))}
          />
        </label>
        <Button
          icon={<QrCode size={15} aria-hidden="true" />}
          data-tour="club-arena-qr"
          onClick={() => void printArenas('print')}
        >
          {t('club.print_arena_qr')}
        </Button>
        <Button
          variant="ghost"
          icon={<FileDown size={15} aria-hidden="true" />}
          aria-label={t('club.arena_qr_pdf')}
          title={t('club.arena_qr_pdf')}
          onClick={() => void printArenas('pdf')}
        />
      </div>
    </>
  );

  return (
    <section className="club-card" aria-labelledby="club-identity-title">
      <h2 id="club-identity-title" className="club-card-title">
        {t('club.identity')}
      </h2>
      {body}
    </section>
  );
};
