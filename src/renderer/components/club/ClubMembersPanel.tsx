/**
 * BellePoule Modern - Mode Club (#1872) : identité du club (nom, logo), annuaire des
 * membres (ajout, archivage, effacement, nouveau code carte) et impression des cartes.
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  IdCard,
  ImageUp,
  QrCode,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import type { ClubMember, ClubMemberInput, ClubSettings } from '../../../shared/types/club';
import { periodOf } from '../../../shared/utils/clubStats';
import {
  classifyClubImport,
  fencersToClubMembers,
  type ClubImportRowStatus,
} from '../../../shared/utils/clubImport';
import { ClubImportModal } from './ClubImportModal';
import { parseFFEFile, parseXMLFile } from '../../../shared/utils/fileParser';
import { decodeTextFile, resolveFencerFileFormat } from '../../../shared/utils/fileParser/detect';
import {
  exportArenaQrToPDF,
  exportClubCardsToPDF,
} from '../../../shared/utils/pdfExport/clubCardsPdf';
import { FencerPhoto } from '../FencerPhoto';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { useConfirm } from '../ConfirmDialog';
import { useToast } from '../Toast';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const today = () => new Date().toISOString().slice(0, 10);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface ClubMembersPanelProps {
  settings: ClubSettings;
  onSettingsChange: (s: ClubSettings) => void;
  /** Nombre de membres actifs après chaque chargement (parcours guidé) */
  onMembersLoaded?: (activeCount: number) => void;
  /** Cartes exportées (parcours guidé) */
  onCardsPrinted?: () => void;
}

export const ClubMembersPanel: React.FC<ClubMembersPanelProps> = ({
  settings,
  onSettingsChange,
  onMembersLoaded,
  onCardsPrinted,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const api = window.electronAPI?.club;

  const [members, setMembers] = useState<ClubMember[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  // null = nom enregistré (pas d'édition en cours)
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const clubName = nameEdit ?? settings.name;
  const [draft, setDraft] = useState({ firstName: '', lastName: '', license: '' });
  const [printing, setPrinting] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const [importDraft, setImportDraft] = useState<{
    fileName: string;
    rows: ClubMemberInput[];
    statuses: ClubImportRowStatus[];
  } | null>(null);

  const load = useCallback(async () => {
    if (!api) return;
    const list = await api.listMembers(showArchived);
    setMembers(list);
    onMembersLoaded?.(list.filter(m => m.active).length);
  }, [api, showArchived, onMembersLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (e) {
      showToast(errText(e), 'error');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m =>
      `${m.lastName} ${m.firstName} ${m.license ?? ''} ${m.cardCode}`.toLowerCase().includes(q)
    );
  }, [members, search]);

  if (!api) return null;

  const saveName = () =>
    run(async () => {
      onSettingsChange(await api.updateSettings({ name: clubName }));
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
    reader.onload = () =>
      void run(async () => {
        onSettingsChange(await api.updateSettings({ logo: String(reader.result) }));
      });
    reader.readAsDataURL(file);
  };

  const addMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.firstName.trim() && !draft.lastName.trim()) return;
    void run(async () => {
      await api.createMember(draft);
      setDraft({ firstName: '', lastName: '', license: '' });
    });
  };

  const removeMember = async (m: ClubMember) => {
    const ok = await confirm({
      message: t('club.delete_confirm', { name: `${m.firstName} ${m.lastName}` }),
      confirmLabel: t('actions.delete'),
    });
    if (ok) await run(() => api.deleteMember(m.id));
  };

  const regenerate = async (m: ClubMember) => {
    const ok = await confirm({
      message: t('club.regenerate_confirm', { name: `${m.firstName} ${m.lastName}` }),
      confirmLabel: t('club.regenerate'),
    });
    if (ok) await run(() => api.regenerateCardCode(m.id));
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const content = decodeTextFile(new Uint8Array(await file.arrayBuffer()));
      const parsed =
        resolveFencerFileFormat('fff', content) === 'xml'
          ? parseXMLFile(content)
          : parseFFEFile(content);
      const rows = fencersToClubMembers(parsed.fencers);
      if (rows.length === 0) {
        showToast(parsed.errors[0] ?? t('club.import_empty'), 'error');
        return;
      }
      // Sélection des personnes à importer (statut calculé sur tout l'annuaire, archivés compris)
      const statuses = classifyClubImport(await api.listMembers(true), rows);
      setImportDraft({ fileName: file.name, rows, statuses });
    } catch (e) {
      showToast(errText(e), 'error');
    }
  };

  const confirmImport = (selectedRows: ClubMemberInput[]) => {
    setImportDraft(null);
    void run(async () => {
      const r = await api.importMembers(selectedRows);
      showToast(t('club.import_done', { ...r }), 'success');
    });
  };

  const saveStrips = (n: number) =>
    run(async () => onSettingsChange(await api.updateSettings({ stripCount: n })));

  const printArenas = async () => {
    try {
      await exportArenaQrToPDF(settings.stripCount, settings);
    } catch (e) {
      showToast(errText(e), 'error');
    }
  };

  /** Photos par licence depuis un ZIP, comme dans la liste des tireurs */
  const importPhotos = async () => {
    const result = await window.electronAPI?.dialog?.openFile({
      title: t('dialogs.importPhotos'),
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (!result?.filePath) return;
    await run(async () => {
      const { matched, total } = await api.importPhotos(result.filePath);
      showToast(
        t('fencerList.photos_imported', { count: total, matched: String(matched) }),
        'success'
      );
    });
  };

  const printCards = async () => {
    const list = filtered.filter(m => m.active);
    if (list.length === 0) return;
    setPrinting(true);
    try {
      await exportClubCardsToPDF(list, settings, { season: periodOf(today(), 'season').key });
      onCardsPrinted?.();
    } catch (e) {
      showToast(errText(e), 'error');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="club-members">
      <section className="club-card" aria-labelledby="club-identity-title">
        <h2 id="club-identity-title" className="club-card-title">
          {t('club.identity')}
        </h2>
        <div className="club-row">
          <label className="form-label club-grow" data-tour="club-name">
            {t('club.name')}
            <input
              className="form-input"
              value={clubName}
              maxLength={100}
              onChange={e => setNameEdit(e.target.value)}
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
              onClick={() =>
                void run(async () => onSettingsChange(await api.updateSettings({ logo: null })))
              }
            >
              {t('club.logo_remove')}
            </Button>
          )}
        </div>
        <div className="club-row">
          <label className="form-label" data-tour="club-strips">
            {t('club.strip_count')}
            <input
              className="form-input club-strips-input"
              type="number"
              min={1}
              max={99}
              value={settings.stripCount}
              onChange={e => void saveStrips(Number(e.target.value))}
            />
          </label>
          <Button
            icon={<QrCode size={15} aria-hidden="true" />}
            data-tour="club-arena-qr"
            onClick={() => void printArenas()}
          >
            {t('club.print_arena_qr')}
          </Button>
        </div>
      </section>

      <section className="club-card" aria-labelledby="club-members-title">
        <div className="club-row club-row--between">
          <h2 id="club-members-title" className="club-card-title">
            {t('club.members_count', { count: members.length })}
          </h2>
          <input
            ref={importInput}
            className="sr-only"
            type="file"
            accept=".fff,.csv,.txt,.xml"
            aria-label={t('club.import')}
            onChange={e => {
              void importFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button
            icon={<ImageUp size={15} aria-hidden="true" />}
            onClick={() => void importPhotos()}
          >
            {t('fencerList.import_photos')}
          </Button>
          <Button
            icon={<Upload size={15} aria-hidden="true" />}
            data-tour="club-import"
            onClick={() => importInput.current?.click()}
          >
            {t('club.import')}
          </Button>
          <Button
            variant="primary"
            data-tour="club-print-cards"
            icon={<IdCard size={15} aria-hidden="true" />}
            loading={printing}
            disabled={!filtered.some(m => m.active)}
            onClick={() => void printCards()}
          >
            {t('club.print_cards')}
          </Button>
        </div>

        <form className="club-row club-row--end" onSubmit={addMember}>
          <label className="form-label">
            {t('club.first_name')}
            <input
              className="form-input"
              value={draft.firstName}
              placeholder={t('addFencer.first_name_ph')}
              onChange={e => setDraft(d => ({ ...d, firstName: e.target.value }))}
            />
          </label>
          <label className="form-label">
            {t('club.last_name')}
            <input
              className="form-input"
              value={draft.lastName}
              placeholder={t('addFencer.last_name_ph')}
              onChange={e => setDraft(d => ({ ...d, lastName: e.target.value }))}
            />
          </label>
          <label className="form-label">
            {t('club.license')}
            <input
              className="form-input"
              value={draft.license}
              onChange={e => setDraft(d => ({ ...d, license: e.target.value }))}
            />
          </label>
          <Button
            type="submit"
            variant="success"
            data-tour="club-add-member"
            icon={<Plus size={15} aria-hidden="true" />}
          >
            {t('actions.add')}
          </Button>
        </form>

        <div className="club-row">
          <input
            className="form-input club-grow"
            type="search"
            value={search}
            placeholder={t('club.search')}
            aria-label={t('club.search')}
            onChange={e => setSearch(e.target.value)}
          />
          <label className="club-nowrap">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
            />{' '}
            {t('club.show_archived')}
          </label>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title={t('club.no_members')} description={t('club.no_members_desc')} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">{t('club.photo')}</span>
                </th>
                <th scope="col">{t('fencerList.col_last_name')}</th>
                <th scope="col">{t('fencerList.col_first_name')}</th>
                <th scope="col">{t('fencerList.col_birth')}</th>
                <th scope="col">{t('fencerList.col_handedness')}</th>
                <th scope="col">{t('fencer.license')}</th>
                <th scope="col">{t('club.card_code')}</th>
                <th scope="col">
                  <span className="sr-only">{t('club.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id} className={m.active ? undefined : 'club-row-archived'}>
                  {/* Même présentation de l'identité que la liste des tireurs d'une compétition */}
                  <td>
                    <FencerPhoto
                      photo={m.photo}
                      firstName={m.firstName}
                      lastName={m.lastName}
                      size="small"
                      onPhotoChange={photo =>
                        void run(() => api.updateMember(m.id, { photo: photo ?? null }))
                      }
                    />
                  </td>
                  <td className="font-medium">{m.lastName}</td>
                  <td>{m.firstName}</td>
                  <td className="text-sm text-muted">{m.birthYear ?? '-'}</td>
                  <td className="text-sm text-muted">
                    {m.laterality
                      ? t(m.laterality === 'L' ? 'addFencer.left' : 'addFencer.right')
                      : '-'}
                  </td>
                  <td className="text-sm text-muted">{m.license || '-'}</td>
                  <td className="text-sm club-mono">{m.cardCode}</td>
                  <td className="club-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<RefreshCw size={14} aria-hidden="true" />}
                      aria-label={t('club.regenerate')}
                      title={t('club.regenerate')}
                      onClick={() => void regenerate(m)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={
                        m.active ? (
                          <Archive size={14} aria-hidden="true" />
                        ) : (
                          <ArchiveRestore size={14} aria-hidden="true" />
                        )
                      }
                      aria-label={m.active ? t('club.archive') : t('club.unarchive')}
                      title={m.active ? t('club.archive') : t('club.unarchive')}
                      onClick={() => void run(() => api.updateMember(m.id, { active: !m.active }))}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 size={14} aria-hidden="true" />}
                      aria-label={t('actions.delete')}
                      title={t('actions.delete')}
                      onClick={() => void removeMember(m)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {importDraft && (
        <ClubImportModal
          {...importDraft}
          onConfirm={confirmImport}
          onClose={() => setImportDraft(null)}
        />
      )}
    </div>
  );
};
