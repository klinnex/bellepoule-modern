/**
 * BellePoule Modern - Mode Club (#1872) : identité du club (ClubIdentityCard), annuaire des
 * membres (ajout, archivage, effacement, nouveau code carte) et impression des cartes.
 * Licensed under GPL-3.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Download,
  IdCard,
  Pencil,
  Printer,
  QrCode,
  Plus,
  RefreshCw,
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
import { ClubMemberEditModal } from './ClubMemberEditModal';
import { ClubMemberQrModal } from './ClubMemberQrModal';
import { parseFFEFile, parseXMLFile } from '../../../shared/utils/fileParser';
import { resolveFencerFileFormat } from '../../../shared/utils/fileParser/detect';
import { exportClubMembersToFFF } from '../../../shared/utils/fencerExport';
import { parseDelimited } from '../../../shared/utils/clubInventoryIO';
import { toCsv } from '../../../shared/utils/clubInventory';
import { isMemberTable, membersToRows, rowsToMembers } from '../../../shared/utils/clubMembersIO';
import { ClubExchangeMenu } from './ClubExchangeMenu';
import { openMemberFile, saveSpreadsheetFile, saveTextFile } from './clubFiles';
import { exportClubCardsToPDF, printClubCards } from '../../../shared/utils/pdfExport/clubCardsPdf';
import { compareByAgeCategory, memberAgeCategory } from '../../../shared/utils/clubAge';
import { categoryLabel } from '../../../shared/utils/categoryLabel';
import { AgeCategoryFilter } from './ClubAgeRange';
import { FencerPhoto } from '../FencerPhoto';
import { ClubIdentityCard } from './ClubIdentityCard';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { ToggleChip } from '../common/ToggleChip';
import { useConfirm } from '../ConfirmDialog';
import { useToast } from '../Toast';

const today = () => new Date().toISOString().slice(0, 10);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface ClubMembersPanelProps {
  clubId: string;
  settings: ClubSettings;
  onSettingsChange: (s: ClubSettings) => void;
  /** Nombre de membres actifs après chaque chargement (parcours guidé) */
  onMembersLoaded?: (activeCount: number) => void;
  /** Cartes exportées (parcours guidé) */
  onCardsPrinted?: () => void;
}

export const ClubMembersPanel: React.FC<ClubMembersPanelProps> = ({
  clubId,
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
  const [creating, setCreating] = useState(false);
  const [ageFilter, setAgeFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'category'>('name');
  const [printing, setPrinting] = useState(false);
  const [qrMember, setQrMember] = useState<ClubMember | null>(null);
  const [editing, setEditing] = useState<ClubMember | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importDraft, setImportDraft] = useState<{
    fileName: string;
    rows: ClubMemberInput[];
    statuses: ClubImportRowStatus[];
  } | null>(null);

  const load = useCallback(async () => {
    if (!api) return;
    const list = await api.listMembers(clubId, showArchived);
    setMembers(list);
    // Sélection : seuls les membres encore présents restent cochés
    const ids = new Set(list.map(m => m.id));
    setSelected(prev => new Set([...prev].filter(id => ids.has(id))));
    onMembersLoaded?.(list.filter(m => m.active).length);
  }, [api, clubId, showArchived, onMembersLoaded]);

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

  /** Catégorie d'âge de chaque membre (date de naissance, saison en cours) */
  const ageCat = useMemo(() => new Map(members.map(m => [m.id, memberAgeCategory(m)])), [members]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = members.filter(
      m =>
        (!q ||
          `${m.lastName} ${m.firstName} ${m.license ?? ''} ${m.cardCode}`
            .toLowerCase()
            .includes(q)) &&
        (!ageFilter || ageCat.get(m.id) === ageFilter)
    );
    return sortBy === 'category'
      ? [...list].sort(compareByAgeCategory(m => ageCat.get(m.id)))
      : list;
  }, [members, search, ageFilter, sortBy, ageCat]);

  const selectedVisible = filtered.filter(m => selected.has(m.id));
  const allSelected = filtered.length > 0 && selectedVisible.length === filtered.length;

  if (!api) return null;

  /** 1er clic : coche tous les membres affichés ; 2e clic : décoche tout */
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map(m => m.id)));

  const toggleOne = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const removeSelected = async () => {
    const list = selectedVisible;
    if (list.length === 0) return;
    const ok = await confirm({
      message: t('club.delete_selected_confirm', { count: list.length }),
      confirmLabel: t('actions.delete'),
    });
    if (!ok) return;
    await run(async () => {
      for (const m of list) await api.deleteMember(m.id);
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

  /** Fichier choisi (FFE .fff / XML / TXT, CSV ou Excel) → personnes à importer */
  const importFile = async () => {
    try {
      const picked = await openMemberFile(t('club.import_menu'));
      if (!picked) return;
      const fileName = picked.filePath.split(/[\\/]/).pop() ?? '';
      const ext = fileName.toLowerCase().split('.').pop() ?? '';
      // CSV / Excel à colonnes « Nom » (format du club) ; sinon fichier FFE, comme avant
      const grid = ext === 'csv' || ext === 'xlsx' ? parseDelimited(picked.content) : [];
      let members: ClubMemberInput[];
      let error: string | undefined;
      if (isMemberTable(grid)) {
        ({ members, error } = rowsToMembers(grid));
      } else {
        const parsed =
          resolveFencerFileFormat('fff', picked.content) === 'xml'
            ? parseXMLFile(picked.content)
            : parseFFEFile(picked.content);
        members = fencersToClubMembers(parsed.fencers);
        error = parsed.errors[0];
      }
      if (members.length === 0) {
        showToast(error ?? t('club.import_empty'), 'error');
        return;
      }
      // Sélection des personnes à importer (statut calculé sur tout l'annuaire, archivés compris)
      const statuses = classifyClubImport(await api.listMembers(clubId, true), members);
      setImportDraft({ fileName, rows: members, statuses });
    } catch (e) {
      showToast(errText(e), 'error');
    }
  };

  const confirmImport = (selectedRows: ClubMemberInput[]) => {
    setImportDraft(null);
    void run(async () => {
      const r = await api.importMembers(clubId, selectedRows);
      showToast(t('club.import_done', { ...r }), 'success');
    });
  };

  /** Photos par licence depuis un ZIP, comme dans la liste des tireurs */
  const importPhotos = async () => {
    const result = await window.electronAPI?.dialog?.openFile({
      title: t('dialogs.importPhotos'),
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (!result?.filePath) return;
    await run(async () => {
      const { matched, total } = await api.importPhotos(clubId, result.filePath);
      showToast(
        t('fencerList.photos_imported', { count: total, matched: String(matched) }),
        'success'
      );
    });
  };

  /** Membres affichés (filtres appliqués) → FFF réimportable, CSV ou Excel */
  const exportMembers = async (kind: 'fff' | 'csv' | 'xlsx') => {
    if (filtered.length === 0) return;
    const name = `${(settings.name || 'club').replace(/[^\p{L}\p{N}_-]+/gu, '_')}-membres.${kind}`;
    const title = t('club.export_menu');
    try {
      const done =
        kind === 'xlsx'
          ? await saveSpreadsheetFile(name, membersToRows(filtered), title)
          : await saveTextFile(
              name,
              kind === 'csv'
                ? toCsv(membersToRows(filtered))
                : exportClubMembersToFFF(settings.name, filtered),
              title,
              kind
            );
      if (done) showToast(t('club.export_done', { count: filtered.length }), 'success');
    } catch (e) {
      showToast(errText(e), 'error');
    }
  };

  /** Cartes des membres affichés : boîte d'impression, ou fichier PDF */
  const printCards = async (mode: 'print' | 'pdf', only?: ClubMember) => {
    const list = (only ? [only] : filtered).filter(m => m.active);
    if (list.length === 0) return;
    setPrinting(true);
    try {
      const opts = { season: periodOf(today(), 'season').key };
      if (mode === 'pdf') await exportClubCardsToPDF(list, settings, opts);
      else await printClubCards(list, settings, opts);
      onCardsPrinted?.();
    } catch (e) {
      showToast(errText(e), 'error');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="club-members">
      <ClubIdentityCard clubId={clubId} settings={settings} onSettingsChange={onSettingsChange} />

      <section className="club-card" aria-labelledby="club-members-title">
        <div className="club-row club-row--between">
          <div className="club-title-group">
            <h2 id="club-members-title" className="club-card-title">
              {t('club.members_count', { count: members.length })}
            </h2>
            <Button
              variant="success"
              data-tour="club-add-member"
              icon={<Plus size={15} aria-hidden="true" />}
              onClick={() => setCreating(true)}
            >
              {t('club.new_member')}
            </Button>
          </div>
          <ClubExchangeMenu
            label={t('club.import_menu')}
            icon={<Upload size={15} aria-hidden="true" />}
            dataTour="club-import"
            items={[
              { key: 'members', label: t('club.import'), onSelect: () => void importFile() },
              {
                key: 'photos',
                label: t('fencerList.import_photos'),
                onSelect: () => void importPhotos(),
              },
            ]}
          />
          <ClubExchangeMenu
            label={t('club.export_menu')}
            icon={<Download size={15} aria-hidden="true" />}
            disabled={filtered.length === 0}
            items={[
              { key: 'fff', label: t('club.export'), onSelect: () => void exportMembers('fff') },
              {
                key: 'csv',
                label: t('club.export_csv'),
                onSelect: () => void exportMembers('csv'),
              },
              {
                key: 'xlsx',
                label: t('club.export_excel'),
                onSelect: () => void exportMembers('xlsx'),
              },
            ]}
          />
          <Button
            variant="primary"
            data-tour="club-print-cards"
            icon={<Printer size={15} aria-hidden="true" />}
            loading={printing}
            disabled={!filtered.some(m => m.active)}
            onClick={() => void printCards('print')}
          >
            {t('club.print_cards')}
          </Button>
          <Button
            variant="ghost"
            icon={<IdCard size={15} aria-hidden="true" />}
            aria-label={t('club.cards_pdf')}
            title={t('club.cards_pdf')}
            disabled={printing || !filtered.some(m => m.active)}
            onClick={() => void printCards('pdf')}
          />
        </div>

        <div className="club-row">
          <input
            className="form-input club-grow"
            type="search"
            value={search}
            placeholder={t('club.search')}
            aria-label={t('club.search')}
            onChange={e => setSearch(e.target.value)}
          />
          <AgeCategoryFilter value={ageFilter} onChange={setAgeFilter} />
          <label className="form-label">
            {t('club.sort_by')}
            <select
              className="form-input"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'name' | 'category')}
            >
              <option value="name">{t('club.sort_name')}</option>
              <option value="category">{t('club.sort_category')}</option>
            </select>
          </label>
          <ToggleChip pressed={showArchived} onToggle={setShowArchived}>
            {t('club.show_archived')}
          </ToggleChip>
        </div>

        {filtered.length > 0 && (
          <div className="club-row">
            <Button size="sm" onClick={toggleAll}>
              {allSelected ? t('club.select_none') : t('club.select_all')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 size={14} aria-hidden="true" />}
              disabled={selectedVisible.length === 0}
              onClick={() => void removeSelected()}
            >
              {t('club.delete_selected_n', { count: selectedVisible.length })}
            </Button>
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState title={t('club.no_members')} description={t('club.no_members_desc')} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">{t('club.selection')}</span>
                </th>
                <th scope="col">
                  <span className="sr-only">{t('club.photo')}</span>
                </th>
                <th scope="col">{t('fencerList.col_last_name')}</th>
                <th scope="col">{t('fencerList.col_first_name')}</th>
                <th scope="col">{t('fencerList.col_birth')}</th>
                <th scope="col">{t('clubAge.category')}</th>
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
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(m.id)}
                      aria-label={t('club.select_member', {
                        name: `${m.firstName} ${m.lastName}`,
                      })}
                      onChange={() => toggleOne(m.id)}
                    />
                  </td>
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
                  <td className="text-sm text-muted">
                    <input
                      className="form-input club-date-input"
                      type="date"
                      value={m.birthDate ?? ''}
                      max={today()}
                      title={
                        m.birthDate ? undefined : m.birthYear ? String(m.birthYear) : undefined
                      }
                      aria-label={t('club.birth_date_of', { name: `${m.firstName} ${m.lastName}` })}
                      onChange={e =>
                        e.target.value &&
                        void run(() => api.updateMember(m.id, { birthDate: e.target.value }))
                      }
                    />
                    {!m.birthDate && m.birthYear ? (
                      <span className="club-muted"> {m.birthYear}</span>
                    ) : null}
                  </td>
                  <td className="text-sm">
                    {ageCat.get(m.id) ? categoryLabel(ageCat.get(m.id), t) : '-'}
                  </td>
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
                      icon={<Pencil size={14} aria-hidden="true" />}
                      aria-label={t('actions.edit')}
                      title={t('actions.edit')}
                      onClick={() => setEditing(m)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<QrCode size={14} aria-hidden="true" />}
                      aria-label={t('club.show_qr')}
                      title={t('club.show_qr')}
                      disabled={!m.cardCode}
                      onClick={() => setQrMember(m)}
                    />
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
      {creating && (
        <ClubMemberEditModal
          onCreate={async data => {
            await api.createMember(clubId, data);
            await load();
          }}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <ClubMemberEditModal
          member={editing}
          onSave={async (id, data) => {
            await api.updateMember(id, data);
            await load();
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {qrMember && (
        <ClubMemberQrModal
          member={qrMember}
          printing={printing}
          onPrint={mode => printCards(mode, qrMember)}
          onClose={() => setQrMember(null)}
        />
      )}
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
