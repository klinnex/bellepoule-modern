/**
 * BellePoule Modern - Mode Club (#1872) : choix des personnes à importer depuis un
 * fichier FFE (.fff / CSV / TXT / XML). Nouveaux et membres à compléter cochés par défaut ;
 * déjà présents et doublons du fichier non importables.
 * Licensed under GPL-3.0
 */

import React, { useMemo, useState } from 'react';
import type { ClubMemberInput } from '../../../shared/types/club';
import type { ClubImportRowStatus } from '../../../shared/utils/clubImport';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

interface ClubImportModalProps {
  fileName: string;
  rows: ClubMemberInput[];
  statuses: ClubImportRowStatus[];
  onConfirm: (rows: ClubMemberInput[]) => void;
  onClose: () => void;
}

const importable = (s: ClubImportRowStatus) => s.kind === 'new' || s.kind === 'update';

const BADGE: Record<ClubImportRowStatus['kind'], string> = {
  new: 'badge badge-success',
  update: 'badge badge-info',
  present: 'badge',
  duplicate: 'badge badge-warning',
};

export const ClubImportModal: React.FC<ClubImportModalProps> = ({
  fileName,
  rows,
  statuses,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(statuses.flatMap((s, i) => (importable(s) ? [i] : [])))
  );
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .map((r, i) => i)
      .filter(
        i =>
          !q ||
          `${rows[i].lastName} ${rows[i].firstName} ${rows[i].license ?? ''}`
            .toLowerCase()
            .includes(q)
      );
  }, [rows, search]);

  const toggle = (i: number) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const setVisible = (on: boolean) =>
    setSelected(prev => {
      const next = new Set(prev);
      for (const i of visible) {
        if (!importable(statuses[i])) continue;
        if (on) next.add(i);
        else next.delete(i);
      }
      return next;
    });

  const visibleImportable = visible.filter(i => importable(statuses[i]));
  const allVisibleSelected =
    visibleImportable.length > 0 && visibleImportable.every(i => selected.has(i));

  return (
    <Modal
      title={t('clubImport.title', { file: fileName })}
      onClose={onClose}
      size="xl"
      scroll
      footer={
        <>
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button
            variant="primary"
            disabled={selected.size === 0}
            onClick={() => onConfirm(rows.filter((_, i) => selected.has(i)))}
          >
            {t('clubImport.import_n', { count: selected.size })}
          </Button>
        </>
      }
    >
      <p className="club-muted">{t('clubImport.help')}</p>
      <div className="club-row">
        <input
          className="form-input club-grow"
          type="search"
          value={search}
          placeholder={t('club.search')}
          aria-label={t('club.search')}
          onChange={e => setSearch(e.target.value)}
        />
        <Button
          size="sm"
          disabled={visibleImportable.length === 0}
          onClick={() => setVisible(!allVisibleSelected)}
        >
          {allVisibleSelected ? t('clubImport.select_none') : t('clubImport.select_all')}
        </Button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">{t('clubImport.col_select')}</span>
            </th>
            <th scope="col">{t('fencerList.col_last_name')}</th>
            <th scope="col">{t('fencerList.col_first_name')}</th>
            <th scope="col">{t('fencerList.col_birth')}</th>
            <th scope="col">{t('fencer.license')}</th>
            <th scope="col">{t('clubImport.col_status')}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(i => {
            const r = rows[i];
            const st = statuses[i];
            const can = importable(st);
            return (
              <tr
                key={i}
                className={can ? 'club-clickable' : 'club-row-archived'}
                onClick={() => can && toggle(i)}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    disabled={!can}
                    aria-label={`${r.lastName} ${r.firstName}`}
                    onClick={e => e.stopPropagation()}
                    onChange={() => toggle(i)}
                  />
                </td>
                <td className="font-medium">{r.lastName}</td>
                <td>{r.firstName}</td>
                <td className="text-sm text-muted">{r.birthYear ?? '-'}</td>
                <td className="text-sm text-muted">{r.license || '-'}</td>
                <td>
                  <span className={BADGE[st.kind]}>{t(`clubImport.status_${st.kind}`)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
};
