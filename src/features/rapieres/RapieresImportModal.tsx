/**
 * BellePoule Modern - Tournoi des rapières : sélection des équipes à importer (#1211)
 * Même principe que l'import de tireurs : liste du fichier, cases à cocher, import groupé.
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import Modal from '../../renderer/components/common/Modal';
import { useTranslation } from '../../renderer/hooks/useTranslation';
import {
  TD,
  TD_CENTER,
  TD_LEFT,
  TABLE,
  STICKY_HEAD,
} from '../../renderer/components/importModal.styles';
import { RapieresFencer } from './rapieres.types';
import { RapieresTeamDraft } from './RapieresTeamModal';

interface RapieresImportModalProps {
  filename: string;
  teams: RapieresTeamDraft[];
  /** Lignes ignorées (incomplètes) du fichier */
  skipped: number[];
  onImport: (teams: RapieresTeamDraft[]) => void | Promise<void>;
  onClose: () => void;
}

const RapieresImportModal: React.FC<RapieresImportModalProps> = ({
  filename,
  teams,
  skipped,
  onImport,
  onClose,
}) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<number>>(() => new Set(teams.map((_, i) => i)));
  const [busy, setBusy] = useState(false);

  const toggle = (index: number) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const allSelected = selected.size === teams.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(teams.map((_, i) => i)));

  const handleImport = async () => {
    setBusy(true);
    try {
      await onImport(teams.filter((_, i) => selected.has(i)));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const fencerCell = (f: RapieresFencer) => (
    <>
      {[f.lastName.toUpperCase(), f.firstName].filter(Boolean).join(' ')}
      <br />
      <small style={{ opacity: 0.8 }}>
        {t(`rapieres.cat_${f.category}`)}
        {f.gender ? ` · ${t(f.gender === 'M' ? 'genders.male' : 'genders.female')}` : ''}
      </small>
    </>
  );

  return (
    <Modal
      title={t('rapieres.import_teams')}
      onClose={onClose}
      size="lg"
      scroll
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            {t('actions.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={busy || selected.size === 0}
          >
            {t('rapieres.import_n', { n: String(selected.size) })}
          </button>
        </>
      }
    >
      <div
        style={{
          marginBottom: '1rem',
          padding: '0.75rem',
          background: 'var(--color-bg)',
          borderRadius: '6px',
        }}
      >
        <strong>{t('importModal.file')}</strong> {filename}
      </div>

      {skipped.length > 0 && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            background: '#fef3c7',
            borderRadius: '6px',
            color: '#d97706',
          }}
        >
          {t('rapieres.import_skipped', { lines: skipped.join(', ') })}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}
      >
        <span>{t('rapieres.import_found', { n: String(teams.length) })}</span>
        <button className="btn btn-secondary btn-sm" onClick={toggleAll}>
          {allSelected ? t('importModal.deselect_all') : t('importModal.select_all')}
        </button>
      </div>

      <div
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: '6px',
          maxHeight: '400px',
          overflow: 'auto',
        }}
      >
        <table style={TABLE}>
          <thead style={STICKY_HEAD}>
            <tr>
              <th style={{ padding: '0.5rem', textAlign: 'center', width: '40px' }}>✓</th>
              <th style={TD_LEFT}>{t('rapieres.team')}</th>
              <th style={TD_LEFT}>{t('rapieres.fencer')} 1</th>
              <th style={TD_LEFT}>{t('rapieres.fencer')} 2</th>
              <th style={TD_CENTER}>{t('rapieres.level')}</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team, index) => {
              const on = selected.has(index);
              return (
                <tr
                  key={index}
                  onClick={() => toggle(index)}
                  style={{
                    cursor: 'pointer',
                    background: on ? 'var(--color-primary)' : 'transparent',
                    color: on ? '#FFFFFF' : 'var(--color-text)',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <td style={TD_CENTER}>
                    <input
                      type="checkbox"
                      aria-label={team.name}
                      checked={on}
                      onClick={e => e.stopPropagation()}
                      onChange={() => toggle(index)}
                    />
                  </td>
                  <td style={TD}>{team.name}</td>
                  <td style={TD}>{fencerCell(team.info.fencers[0])}</td>
                  <td style={TD}>{fencerCell(team.info.fencers[1])}</td>
                  <td style={TD_CENTER}>{t(`rapieres.level_${team.info.level}`)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
};

export default RapieresImportModal;
