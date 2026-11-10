/**
 * BellePoule Modern - Fencer List Component
 * Licensed under GPL-3.0
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ClipboardList, Pencil, QrCode, RotateCcw, Search, Swords, Trash2 } from 'lucide-react';
import { Icon } from './common/Icon';
import EmptyState from './common/EmptyState';
import { actionableMessage } from '../../shared/utils/actionableError';
import { useOperation } from './common/OperationProgress';
import { useVirtualList } from '../../shared/services/performanceService';
// qrcode chargé à la demande (génération du QR uniquement à l'affichage)
import { Fencer, FencerStatus } from '../../shared/types';
import EditFencerModal from './EditFencerModal';
import { MedicalCrossIcon } from './common/MedicalCrossIcon';
import { useTranslation } from '../hooks/useTranslation';
import { exportFencersToTXT, exportFencersToFFF } from '../../shared/utils/fencerExport';
import { isDns } from '../../shared/utils/forfeit';
import { departmentLabel } from '../../shared/utils/departments';
import { buildFencerImportTemplate } from '../../shared/utils/fileParser';
// pdfExport (jsPDF) chargé à la demande pour alléger le bundle initial
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';
import CoachMark from './CoachMark';
import { useDebounce } from '../hooks/useDebounce';
import Flag from './common/Flag';
import { Button } from './common/Button';
import { MENU_ITEM, SMALL_BTN, W250, DROPDOWN_WRAP } from './fencerList.styles';

type SortableCol =
  | 'ref'
  | 'lastName'
  | 'firstName'
  | 'birthDate'
  | 'club'
  | 'nationality'
  | 'region'
  | 'department'
  | 'ranking'
  | 'status';

const COLUMNS = [
  { id: 'ref' as SortableCol, labelKey: 'fencerList.col_ref', width: '50px' },
  { id: 'lastName' as SortableCol, labelKey: 'fencerList.col_last_name' },
  { id: 'firstName' as SortableCol, labelKey: 'fencerList.col_first_name' },
  { id: 'birthDate' as SortableCol, labelKey: 'fencerList.col_birth', width: '70px' },
  { id: 'club' as SortableCol, labelKey: 'fencerList.col_club' },
  { id: 'nationality' as SortableCol, labelKey: 'fencerList.col_nationality', width: '110px' },
  { id: 'region' as SortableCol, labelKey: 'fencerList.col_region', width: '110px' },
  { id: 'department' as SortableCol, labelKey: 'fencerList.col_department', width: '140px' },
  { id: 'ranking' as SortableCol, labelKey: 'fencerList.col_ranking', width: '110px' },
  { id: 'status' as SortableCol, labelKey: 'fencerList.col_status', width: '90px' },
];

interface FencerListProps {
  fencers: Fencer[];
  competitionId?: string;
  onCheckIn: (id: string) => void;
  onAddFencer: () => void;
  onEditFencer?: (id: string, updates: Partial<Fencer>) => void;
  onDeleteFencer?: (id: string) => void;
  onDeleteAllFencers?: () => void;
  onCheckInAll?: () => void;
  onUncheckAll?: () => void;
  onSetFencerStatus?: (id: string, status: FencerStatus) => void;
  onImport?: (type: 'xml' | 'fff' | 'ranking') => void;
  onImportFFEConnect?: () => void;
  /** Import spécifique remplaçant le menu d'import (ex : équipes du tournoi des rapières) */
  customImport?: { label: string; onClick: () => void };
  /** Bouton « modèle » à côté de customImport (gabarit du fichier attendu) */
  customImportTemplate?: { label: string; onClick: () => void };
  onFencersImported?: () => void;
  /** URL de la page d'inscription distante (ex: http://192.168.x.x:8066/register) */
  registerUrl?: string;
  /** Notifie le parent des tireurs triés/filtrés et des colonnes visibles actuels */
  onAppelStateChange?: (fencers: Fencer[], visibleColumns: string[]) => void;
  /** Consultation seule (appel d'un tour de poules terminé, #1051) */
  readOnly?: boolean;
  /** Libellés de colonnes remplacés (tournoi des rapières : Équipe, Tireurs, Niveau) */
  columnLabels?: Partial<Record<SortableCol, string>>;
  /** Colonnes masquées au départ */
  hiddenColumns?: SortableCol[];
  /** Valeurs de cellule remplacées (tri + affichage) : rapières → niveau, catégorie d'équipe (#1441) */
  cellValues?: Partial<Record<SortableCol, (fencer: Fencer) => string>>;
  /** Édition gérée par le parent (fenêtre spécifique) au lieu de la fenêtre tireur */
  onEditRequest?: (fencer: Fencer) => void;
}

const FencerListComponent: React.FC<FencerListProps> = ({
  fencers,
  competitionId,
  onCheckIn,
  onAddFencer,
  onEditFencer,
  onDeleteFencer,
  onDeleteAllFencers,
  onCheckInAll,
  onUncheckAll,
  onSetFencerStatus,
  onImport,
  onImportFFEConnect,
  customImport,
  customImportTemplate,
  onFencersImported,
  registerUrl,
  onAppelStateChange,
  readOnly = false,
  columnLabels,
  hiddenColumns,
  cellValues,
  onEditRequest,
}) => {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { runOperation } = useOperation();
  const { showToast } = useToast();

  const statusLabels: Record<FencerStatus, { label: string; color: string }> = {
    [FencerStatus.CHECKED_IN]: { label: t('status.checked_in'), color: 'badge-success' },
    [FencerStatus.NOT_CHECKED_IN]: { label: t('status.not_checked_in'), color: 'badge-warning' },
    [FencerStatus.QUALIFIED]: { label: t('status.qualified'), color: 'badge-success' },
    [FencerStatus.ELIMINATED]: { label: t('status.eliminated'), color: 'badge-danger' },
    [FencerStatus.ABANDONED]: { label: t('status.abandoned'), color: 'badge-danger' },
    [FencerStatus.EXCLUDED]: { label: t('status.excluded'), color: 'badge-danger' },
    [FencerStatus.FORFAIT]: { label: t('status.forfeit'), color: 'badge-danger' },
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortableCol>('ranking');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(
    // Nationalité, région, département : colonnes affichables, masquées par défaut (#1415, #1504)
    () => new Set(hiddenColumns ?? ['nationality', 'region', 'department'])
  );
  const [colOrder, setColOrder] = useState<SortableCol[]>(() => {
    try {
      const saved = localStorage.getItem('bellepoule-fencer-col-order');
      if (saved) {
        const parsed = (JSON.parse(saved) as SortableCol[]).filter(id =>
          COLUMNS.some(c => c.id === id)
        );
        // Colonne ajoutée depuis l'enregistrement (ex. nationalité) : insérée à sa place par défaut
        for (const added of ['nationality', 'region', 'department'] as SortableCol[]) {
          if (!parsed.includes(added) && parsed.includes('club'))
            parsed.splice(parsed.indexOf('club') + 1 + (added === 'nationality' ? 0 : 1), 0, added);
        }
        if (parsed.length === COLUMNS.length && COLUMNS.every(c => parsed.includes(c.id)))
          return parsed;
      }
    } catch {
      /* ignore */
    }
    return COLUMNS.map(c => c.id);
  });
  const [dragCol, setDragCol] = useState<SortableCol | null>(null);
  const [dragOverCol, setDragOverCol] = useState<SortableCol | null>(null);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [editingFencer, setEditingFencer] = useState<Fencer | null>(null);
  const openEdit = (fencer: Fencer) =>
    onEditRequest ? onEditRequest(fencer) : setEditingFencer(fencer);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const [showRegisterQR, setShowRegisterQR] = useState(false);
  const [registerQRDataUrl, setRegisterQRDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setImportMenuOpen(false);
      }
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Générer le QR code quand l'URL d'inscription change
  useEffect(() => {
    if (!registerUrl) {
      setRegisterQRDataUrl(null);
      return;
    }
    import('qrcode')
      .then(m => m.default.toDataURL(registerUrl, { width: 220, margin: 1 }))
      .then(setRegisterQRDataUrl)
      .catch(() => setRegisterQRDataUrl(null));
  }, [registerUrl]);

  useEffect(() => {
    localStorage.setItem('bellepoule-fencer-col-order', JSON.stringify(colOrder));
  }, [colOrder]);

  const handleColDragStart = (id: SortableCol) => setDragCol(id);
  const handleColDragOver = (e: React.DragEvent, id: SortableCol) => {
    e.preventDefault();
    setDragOverCol(id);
  };
  const handleColDrop = (targetId: SortableCol) => {
    if (!dragCol || dragCol === targetId) return;
    setColOrder(prev => {
      const next = [...prev];
      const from = next.indexOf(dragCol);
      const to = next.indexOf(targetId);
      next.splice(from, 1);
      next.splice(to, 0, dragCol);
      return next;
    });
    setDragCol(null);
    setDragOverCol(null);
  };
  const handleColDragEnd = () => {
    setDragCol(null);
    setDragOverCol(null);
  };

  const debouncedSearchTerm = useDebounce(searchTerm, 250);
  const filteredFencers = useMemo(() => {
    const dir = sortOrder === 'asc' ? 1 : -1;
    const search = debouncedSearchTerm.toLowerCase();
    return fencers
      .filter(f => {
        return (
          f.lastName.toLowerCase().includes(search) ||
          f.firstName.toLowerCase().includes(search) ||
          f.club?.toLowerCase().includes(search)
        );
      })
      .sort((a, b) => {
        const custom = cellValues?.[sortBy];
        if (custom) return dir * custom(a).localeCompare(custom(b));
        switch (sortBy) {
          case 'ref':
            return dir * (a.ref - b.ref);
          case 'lastName':
            return dir * a.lastName.localeCompare(b.lastName);
          case 'firstName':
            return dir * (a.firstName ?? '').localeCompare(b.firstName ?? '');
          case 'birthDate':
            return (
              dir * (new Date(a.birthDate ?? 0).getTime() - new Date(b.birthDate ?? 0).getTime())
            );
          case 'club':
            return dir * (a.club || '').localeCompare(b.club || '');
          case 'nationality':
            return dir * (a.nationality || '').localeCompare(b.nationality || '');
          case 'region':
            return dir * (a.region || '').localeCompare(b.region || '');
          case 'department':
            return dir * (a.department || '').localeCompare(b.department || '');
          case 'ranking':
            return dir * ((a.ranking ?? 99999) - (b.ranking ?? 99999));
          case 'status':
            return dir * a.status.localeCompare(b.status);
          default:
            return 0;
        }
      });
  }, [fencers, debouncedSearchTerm, sortBy, sortOrder, cellValues]);

  const VIRTUAL_THRESHOLD = 50;
  const ROW_HEIGHT = 52;
  const CONTAINER_HEIGHT = 520;

  const virtual = useVirtualList(filteredFencers, {
    itemHeight: ROW_HEIGHT,
    overscan: 5,
    containerHeight: CONTAINER_HEIGHT,
  });

  const useVirtual = filteredFencers.length > VIRTUAL_THRESHOLD;

  const { checkedInCount, notCheckedInCount } = useMemo(() => {
    let checkedIn = 0;
    let notCheckedIn = 0;
    for (const f of fencers) {
      if (f.status === FencerStatus.CHECKED_IN) checkedIn++;
      else if (f.status === FencerStatus.NOT_CHECKED_IN) notCheckedIn++;
    }
    return { checkedInCount: checkedIn, notCheckedInCount: notCheckedIn };
  }, [fencers]);

  const handleEditSave = (id: string, updates: Partial<Fencer>) => {
    if (onEditFencer) {
      onEditFencer(id, updates);
    }
    setEditingFencer(null);
  };

  const handleExportFencers = async (format: 'txt' | 'fff') => {
    const extension = format === 'fff' ? 'fff' : 'txt';
    const filterName = format === 'fff' ? 'Fichier FFE' : 'Fichier texte';

    const result = await window.electronAPI.dialog.saveFile({
      title: t('dialogs.exportFencers', { ext: extension }),
      defaultPath: `tireurs.${extension}`,
      filters: [
        { name: filterName, extensions: [extension] },
        { name: t('fencerList.all_files'), extensions: ['*'] },
      ],
    });

    if (result && !result.canceled && result.filePath) {
      const content = format === 'fff' ? exportFencersToFFF(fencers) : exportFencersToTXT(fencers);
      await window.electronAPI.file.writeContent(result.filePath, content);
    }
  };

  const handleDownloadImportTemplate = async () => {
    const result = await window.electronAPI.dialog.saveFile({
      title: t('fencerList.import_template'),
      defaultPath: 'modele-import-tireurs.csv',
      filters: [
        { name: 'CSV', extensions: ['csv'] },
        { name: t('fencerList.all_files'), extensions: ['*'] },
      ],
    });
    if (result && !result.canceled && result.filePath) {
      await window.electronAPI.file.writeContent(result.filePath, buildFencerImportTemplate());
    }
  };

  const handleImportFencers = (type: 'xml' | 'fff' | 'ranking') => {
    if (onImport) {
      onImport(type);
    }
  };

  const showPhotoMessage = (msg: string) => {
    setPhotoMessage(msg);
    setTimeout(() => setPhotoMessage(null), 4000);
  };

  const handleExportPhotos = async () => {
    if (!competitionId) return;
    const result = await window.electronAPI.dialog.saveFile({
      title: t('dialogs.exportPhotos'),
      defaultPath: 'photos-tireurs.zip',
      filters: [{ name: 'Archive ZIP', extensions: ['zip'] }],
    });
    if (result && !result.canceled && result.filePath) {
      try {
        const { count } = await runOperation('export', () =>
          window.electronAPI.file.exportPhotos(competitionId, result.filePath!)
        );
        showPhotoMessage(t('fencerList.photos_exported', { count }));
      } catch (err) {
        showPhotoMessage(actionableMessage(t, t('fencerList.export_error'), err));
      }
    }
  };

  const handleImportPhotos = async () => {
    if (!competitionId) return;
    const result = await window.electronAPI.dialog.openFile({
      title: t('dialogs.importPhotos'),
      filters: [{ name: 'Archive ZIP', extensions: ['zip'] }],
    });
    if (result && result.filePath) {
      try {
        const { matched, total } = await runOperation('import', () =>
          window.electronAPI.file.importPhotos(competitionId, result.filePath)
        );
        showPhotoMessage(
          t('fencerList.photos_imported', { count: total, matched: String(matched) })
        );
      } catch (err) {
        showPhotoMessage(actionableMessage(t, t('fencerList.import_error'), err));
      }
    }
  };

  const handleExportFencersArchive = async () => {
    if (!competitionId) return;
    const result = await window.electronAPI.dialog.saveFile({
      title: t('dialogs.exportFencersArchive'),
      defaultPath: 'tireurs.bpf',
      filters: [{ name: 'BellePoule Fencers', extensions: ['bpf'] }],
    });
    if (result && !result.canceled && result.filePath) {
      try {
        const { count } = await runOperation('export', () =>
          window.electronAPI.file.exportFencersArchive(competitionId, result.filePath!)
        );
        showPhotoMessage(t('fencerList.bpf_exported', { count }));
      } catch (err) {
        showPhotoMessage(actionableMessage(t, t('fencerList.bpf_export_error'), err));
      }
    }
  };

  const handleImportFencersArchive = async () => {
    if (!competitionId) return;
    const result = await window.electronAPI.dialog.openFile({
      title: t('fencerList.import_bpf'),
      filters: [{ name: 'BellePoule Fencers', extensions: ['bpf'] }],
    });
    if (result && result.filePath) {
      try {
        const { added, updated } = await runOperation('import', () =>
          window.electronAPI.file.importFencersArchive(competitionId, result.filePath)
        );
        showPhotoMessage(
          t('fencerList.bpf_imported', { added: String(added), updated: String(updated) })
        );
        if (onFencersImported) onFencersImported();
      } catch (err) {
        showPhotoMessage(actionableMessage(t, t('fencerList.bpf_import_error'), err));
      }
    }
  };

  const handleDeleteFencer = async (id: string) => {
    if (await confirm(t('messages.confirm_delete_fencer'))) {
      if (editingFencer && editingFencer.id === id) {
        setEditingFencer(null);
      }
      if (onDeleteFencer) {
        onDeleteFencer(id);
      }
    }
  };

  // Changement de statut réversible : pas de modale, toast avec « Annuler » (#1535)
  const handleSetFencerStatus = (id: string, status: FencerStatus, name?: string) => {
    if (!onSetFencerStatus) return;
    const previous = fencers.find(f => f.id === id)?.status;
    onSetFencerStatus(id, status);
    if (previous === undefined || !name) return;
    showToast(t('fencerList.status_changed', { name }), 'info', {
      duration: 5000,
      action: { label: t('fencerList.undo'), onClick: () => onSetFencerStatus(id, previous) },
    });
  };

  const handleSort = useCallback(
    (col: SortableCol) => {
      if (sortBy === col) {
        setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(col);
        setSortOrder('asc');
      }
    },
    [sortBy]
  );

  // Mémoïsé : une nouvelle référence à chaque rendu relançait onAppelStateChange → setState
  // parent → re-rendu → boucle infinie (#1083)
  const visibleCols = useMemo(
    () =>
      colOrder
        .map(id => COLUMNS.find(c => c.id === id)!)
        .filter(c => c && !hiddenCols.has(c.id))
        .map(c => ({ ...c, label: columnLabels?.[c.id] ?? t(c.labelKey) })),
    [colOrder, hiddenCols, columnLabels, t]
  );
  const colSpanTotal = visibleCols.length + 1;

  const visibleColIds = useMemo(() => visibleCols.map(c => c.id), [visibleCols]);
  useEffect(() => {
    onAppelStateChange?.(filteredFencers, visibleColIds);
  }, [filteredFencers, visibleColIds, onAppelStateChange]);

  const handleExportPDF = async () => {
    const { exportAppelToPDF } = await import('../../shared/utils/pdfExport');
    await exportAppelToPDF(
      filteredFencers,
      visibleCols.map(c => c.id)
    );
  };

  return (
    <div className="content">
      <div className="flex justify-between items-center mb-4 is-279168">
        <div>
          <h2 className="is-28d934">
            {fencers.length > 0
              ? t('fencerList.registered_count', { count: fencers.length })
              : t('fencerList.appel')}
          </h2>
          {fencers.length > 0 && (
            <p className="text-sm text-muted">
              {t('fencerList.checked_in_count', { count: checkedInCount })} ·{' '}
              {t('fencerList.waiting_count', { count: notCheckedInCount })}
            </p>
          )}
        </div>
        <div className="u-row">
          {fencers.length > 0 && !readOnly && (
            <>
              {notCheckedInCount > 0 && onCheckInAll && (
                <Button
                  data-tour="check-in-all"
                  onClick={onCheckInAll}
                  title={t('fencerList.check_in_all_title', { count: notCheckedInCount })}
                >
                  ✓ {t('actions.check_in_all')}
                </Button>
              )}
              {checkedInCount > 0 && onUncheckAll && (
                <Button onClick={onUncheckAll} title={t('fencer.uncheck_all')}>
                  ✗ {t('actions.uncheck_all')}
                </Button>
              )}
              {onDeleteAllFencers && (
                <Button
                  variant="danger"
                  className="is-83f1a0"
                  onClick={async () => {
                    if (await confirm(t('messages.confirm_delete_fencer'))) {
                      onDeleteAllFencers();
                    }
                  }}
                  title={t('fencerList.delete_all_title', { count: fencers.length })}
                >
                  <Icon icon={Trash2} />
                </Button>
              )}
              <div className="is-8ecdd8" />
            </>
          )}
          {customImport && !readOnly && (
            <Button onClick={customImport.onClick}>{customImport.label}</Button>
          )}
          {customImportTemplate && !readOnly && (
            <Button onClick={customImportTemplate.onClick}>{customImportTemplate.label}</Button>
          )}
          {onImport && !readOnly && (
            <div ref={importMenuRef} style={DROPDOWN_WRAP}>
              <Button
                data-tour="import"
                onClick={() => setImportMenuOpen(o => !o)}
                title={t('actions.import')}
              >
                {t('fencerList.import_menu')}
              </Button>
              {importMenuOpen && (
                <div className="is-5f1ae4">
                  <Button
                    variant="ghost"
                    style={MENU_ITEM}
                    onClick={() => {
                      handleImportFencers('xml');
                      setImportMenuOpen(false);
                    }}
                  >
                    {t('fencerList.import_xml_bp')}
                  </Button>
                  <Button
                    variant="ghost"
                    style={MENU_ITEM}
                    onClick={() => {
                      handleImportFencers('fff');
                      setImportMenuOpen(false);
                    }}
                  >
                    {t('fencerList.import_fff')}
                  </Button>
                  <Button
                    variant="ghost"
                    style={MENU_ITEM}
                    onClick={() => {
                      handleImportFencers('ranking');
                      setImportMenuOpen(false);
                    }}
                  >
                    {t('fencerList.import_ranking')}
                  </Button>
                  <Button
                    variant="ghost"
                    style={MENU_ITEM}
                    onClick={() => {
                      handleDownloadImportTemplate();
                      setImportMenuOpen(false);
                    }}
                  >
                    {t('fencerList.import_template')}
                  </Button>
                  {onImportFFEConnect && (
                    <Button
                      variant="ghost"
                      style={MENU_ITEM}
                      onClick={() => {
                        onImportFFEConnect();
                        setImportMenuOpen(false);
                      }}
                    >
                      {t('fencerList.import_ffe_connect')}
                    </Button>
                  )}
                  {competitionId && (
                    <>
                      <Button
                        variant="ghost"
                        style={MENU_ITEM}
                        onClick={() => {
                          handleImportFencersArchive();
                          setImportMenuOpen(false);
                        }}
                      >
                        {t('fencerList.import_bpf')}
                      </Button>
                      <Button
                        variant="ghost"
                        style={MENU_ITEM}
                        onClick={() => {
                          handleImportPhotos();
                          setImportMenuOpen(false);
                        }}
                      >
                        {t('fencerList.import_photos')}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {fencers.length > 0 && (
            <>
              <div ref={colMenuRef} style={DROPDOWN_WRAP}>
                <Button
                  onClick={() => setColMenuOpen(o => !o)}
                  title={t('fencerList.columns_title')}
                >
                  {t('fencerList.columns_menu')}
                </Button>
                {colMenuOpen && (
                  <div className="is-a36aa5">
                    {COLUMNS.map(col => (
                      <label key={col.id} className="is-80fd54">
                        <input
                          type="checkbox"
                          checked={!hiddenCols.has(col.id)}
                          onChange={() => {
                            setHiddenCols(prev => {
                              const next = new Set(prev);
                              if (next.has(col.id)) next.delete(col.id);
                              else next.add(col.id);
                              return next;
                            });
                          }}
                        />
                        {columnLabels?.[col.id] ?? t(col.labelKey)}
                      </label>
                    ))}
                    <div className="is-a6ae95" />
                    <Button
                      variant="ghost"
                      className="is-539e77"
                      onClick={() => setColOrder(COLUMNS.map(c => c.id))}
                    >
                      {t('fencerList.reset_order')}
                    </Button>
                  </div>
                )}
              </div>
              <div ref={exportMenuRef} style={DROPDOWN_WRAP}>
                <Button onClick={() => setExportMenuOpen(o => !o)} title={t('actions.export')}>
                  {t('fencerList.export_menu')}
                </Button>
                {exportMenuOpen && (
                  <div className="is-9a02fd">
                    <Button
                      variant="ghost"
                      style={MENU_ITEM}
                      onClick={() => {
                        handleExportPDF();
                        setExportMenuOpen(false);
                      }}
                    >
                      {t('fencerList.export_pdf_appel')}
                    </Button>
                    <Button
                      variant="ghost"
                      style={MENU_ITEM}
                      onClick={() => {
                        handleExportFencers('txt');
                        setExportMenuOpen(false);
                      }}
                    >
                      {t('fencerList.export_txt')}
                    </Button>
                    <Button
                      variant="ghost"
                      style={MENU_ITEM}
                      onClick={() => {
                        handleExportFencers('fff');
                        setExportMenuOpen(false);
                      }}
                    >
                      {t('fencerList.export_fff')}
                    </Button>
                    <Button
                      variant="ghost"
                      style={MENU_ITEM}
                      onClick={() => {
                        handleExportFencersArchive();
                        setExportMenuOpen(false);
                      }}
                    >
                      {t('fencerList.export_bpf')}
                    </Button>
                    <Button
                      variant="ghost"
                      style={MENU_ITEM}
                      onClick={() => {
                        handleExportPhotos();
                        setExportMenuOpen(false);
                      }}
                    >
                      {t('fencerList.export_photos')}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
          {registerUrl && !readOnly && (
            <Button
              className="is-5c17a8"
              title={`Inscription tablette : ${registerUrl}`}
              onClick={() => setShowRegisterQR(true)}
            >
              <Icon icon={QrCode} /> {t('fencerList.qr_register')}
            </Button>
          )}
          {!readOnly && (
            <Button variant="primary" data-tour="add-fencer" onClick={onAddFencer}>
              + {t('fencer.add')}
            </Button>
          )}
        </div>
      </div>

      {/* Modal QR code inscription distante */}
      {showRegisterQR && registerUrl && (
        <div className="is-dae1d9" onClick={() => setShowRegisterQR(false)}>
          <div className="is-280b34" onClick={e => e.stopPropagation()}>
            <h3 className="is-b1e24e">{t('fencerList.register_title')}</h3>
            <p className="is-b54b26">{t('fencerList.register_hint')}</p>
            {registerQRDataUrl ? (
              <img
                src={registerQRDataUrl}
                alt={t('fencerList.register_qr_alt')}
                width={220}
                height={220}
                className="is-76ed9a"
              />
            ) : (
              <div className="is-bc2a5d">{t('fencerList.generating')}</div>
            )}
            <code className="is-0fcdb7">{registerUrl}</code>
            <Button className="is-5d3107" onClick={() => setShowRegisterQR(false)}>
              {t('actions.close')}
            </Button>
          </div>
        </div>
      )}

      {photoMessage && <div className="alert alert-success mb-4 is-a9c15e">{photoMessage}</div>}

      {fencers.length > 0 && (
        <div className="mb-4">
          <div className="is-1e3d23">
            <span>{t('fencerList.checkin')}</span>
            <span
              style={{
                fontWeight: 600,
                color: checkedInCount === fencers.length ? '#22c55e' : 'inherit',
              }}
            >
              {checkedInCount} / {fencers.length} ·{' '}
              {Math.round((checkedInCount / fencers.length) * 100)} %
            </span>
          </div>
          <div className="is-782800">
            <div
              style={{
                height: '100%',
                width: `${(checkedInCount / fencers.length) * 100}%`,
                background: checkedInCount === fencers.length ? '#22c55e' : 'var(--color-primary)',
                borderRadius: '4px',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      )}

      {fencers.length > 0 && (
        <div className="is-022f27">
          <span
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '0.875rem',
              color: 'var(--text-muted, var(--color-text-light))',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            <Icon icon={Search} />
          </span>
          <input
            type="text"
            className="form-input"
            style={{ width: '100%', paddingLeft: '2.25rem', boxSizing: 'border-box' }}
            placeholder={t('fencerList.search_placeholder')}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      )}

      {filteredFencers.length === 0 ? (
        fencers.length === 0 ? (
          <EmptyState
            icon={<Icon icon={Swords} size={24} />}
            title={t('fencerList.empty_title')}
            description={t('fencerList.empty_desc')}
          >
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'center',
                flexWrap: 'wrap',
                marginTop: '1.25rem',
              }}
            >
              {onImport && (
                <CoachMark
                  id="import-fencers"
                  dismissLabel={t('competitionNav.coach_dismiss')}
                  message={t('fencerList.import_formats_hint')}
                  position="bottom"
                >
                  <Button data-tour="import" onClick={() => handleImportFencers('fff')}>
                    {t('fencerList.empty_import_fff')}
                  </Button>
                  <Button data-tour="import" onClick={() => handleImportFencers('xml')}>
                    {t('fencerList.empty_import_xml')}
                  </Button>
                  <Button
                    variant="secondary"
                    title={t('fencerList.import_template')}
                    onClick={handleDownloadImportTemplate}
                  >
                    {t('fencerList.empty_import_template')}
                  </Button>
                </CoachMark>
              )}
              <Button variant="primary" data-tour="add-fencer" onClick={onAddFencer}>
                + {t('fencer.add')}
              </Button>
            </div>
          </EmptyState>
        ) : (
          <EmptyState
            icon={<Icon icon={Search} size={24} />}
            title={t('fencerList.no_result_title')}
            description={t('fencerList.no_result_desc', { term: searchTerm })}
          />
        )
      ) : (
        <div className="card">
          {useVirtual && (
            <table className="table" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                {visibleCols.map(col => (
                  <col key={col.id} style={col.width ? { width: col.width } : undefined} />
                ))}
                <col style={W250} />
              </colgroup>
              <thead>
                <tr>
                  {visibleCols.map(col => (
                    <th
                      key={col.id}
                      draggable
                      onDragStart={() => handleColDragStart(col.id)}
                      onDragOver={e => handleColDragOver(e, col.id)}
                      onDrop={() => handleColDrop(col.id)}
                      onDragEnd={handleColDragEnd}
                      style={{
                        cursor: 'grab',
                        userSelect: 'none',
                        opacity: dragCol === col.id ? 0.4 : 1,
                        borderLeft:
                          dragOverCol === col.id && dragCol !== col.id
                            ? '2px solid var(--primary, #6366f1)'
                            : undefined,
                      }}
                      onClick={() => handleSort(col.id)}
                    >
                      {col.label}
                      {sortBy === col.id ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                  <th>{t('fencerList.actions')}</th>
                </tr>
              </thead>
            </table>
          )}
          <div
            ref={useVirtual ? virtual.containerRef : undefined}
            onScroll={useVirtual ? virtual.onScroll : undefined}
            style={useVirtual ? { height: CONTAINER_HEIGHT, overflowY: 'auto' } : undefined}
          >
            <table className="table" style={useVirtual ? { tableLayout: 'fixed' } : undefined}>
              {useVirtual && (
                <colgroup>
                  {visibleCols.map(col => (
                    <col key={col.id} style={col.width ? { width: col.width } : undefined} />
                  ))}
                  <col style={W250} />
                </colgroup>
              )}
              {!useVirtual && (
                <thead>
                  <tr>
                    {visibleCols.map(col => (
                      <th
                        key={col.id}
                        draggable
                        onDragStart={() => handleColDragStart(col.id)}
                        onDragOver={e => handleColDragOver(e, col.id)}
                        onDrop={() => handleColDrop(col.id)}
                        onDragEnd={handleColDragEnd}
                        style={{
                          width: col.width,
                          cursor: 'grab',
                          userSelect: 'none',
                          opacity: dragCol === col.id ? 0.4 : 1,
                          borderLeft:
                            dragOverCol === col.id && dragCol !== col.id
                              ? '2px solid var(--primary, #6366f1)'
                              : undefined,
                        }}
                        onClick={() => handleSort(col.id)}
                      >
                        {col.label}
                        {sortBy === col.id ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                    <th style={W250}>{t('fencerList.actions')}</th>
                  </tr>
                </thead>
              )}
              <tbody>
                {useVirtual && virtual.state.offsetY > 0 && (
                  <tr style={{ height: virtual.state.offsetY }}>
                    <td colSpan={colSpanTotal} />
                  </tr>
                )}
                {(useVirtual ? virtual.visibleItems : filteredFencers).map(fencer => (
                  <tr
                    key={fencer.id}
                    onDoubleClick={readOnly ? undefined : () => openEdit(fencer)}
                    style={readOnly ? undefined : { cursor: 'pointer' }}
                    title={readOnly ? undefined : t('fencerList.double_click_edit')}
                  >
                    {visibleCols.map(col => {
                      switch (col.id) {
                        case 'ref':
                          return (
                            <td key="ref" className="text-muted">
                              {fencer.ref}
                            </td>
                          );
                        case 'lastName':
                          return (
                            <td key="lastName" className="font-medium">
                              {fencer.lastName}
                            </td>
                          );
                        case 'firstName':
                          return <td key="firstName">{fencer.firstName}</td>;
                        case 'birthDate':
                          return (
                            <td key="birthDate" className="text-sm text-muted">
                              {cellValues?.birthDate
                                ? cellValues.birthDate(fencer) || '-'
                                : fencer.birthDate
                                  ? new Date(fencer.birthDate).getFullYear()
                                  : '-'}
                            </td>
                          );
                        case 'club':
                          return (
                            <td key="club" className="text-sm text-muted">
                              {(cellValues?.club ? cellValues.club(fencer) : fencer.club) || '-'}
                            </td>
                          );
                        case 'nationality':
                          return (
                            <td key="nationality" className="text-sm text-muted">
                              {fencer.nationality ? (
                                <>
                                  <Flag code={fencer.nationality} /> {fencer.nationality}
                                </>
                              ) : (
                                '-'
                              )}
                            </td>
                          );
                        case 'region':
                          return (
                            <td key="region" className="text-sm text-muted">
                              {fencer.region || '-'}
                            </td>
                          );
                        case 'department':
                          return (
                            <td key="department" className="text-sm text-muted">
                              {departmentLabel(fencer.department) || '-'}
                            </td>
                          );
                        case 'ranking':
                          return (
                            <td key="ranking" className="text-sm">
                              {fencer.ranking ? `#${fencer.ranking}` : '-'}
                            </td>
                          );
                        case 'status':
                          return (
                            <td key="status">
                              <span className={`badge ${statusLabels[fencer.status].color}`}>
                                {isDns(fencer)
                                  ? t(
                                      fencer.status === FencerStatus.ABANDONED
                                        ? 'status.medical_dns'
                                        : 'status.forfeit_dns'
                                    )
                                  : statusLabels[fencer.status].label}
                              </span>
                            </td>
                          );
                        default:
                          return null;
                      }
                    })}
                    <td onDoubleClick={e => e.stopPropagation()}>
                      {!readOnly && (
                        <div
                          style={{
                            display: 'flex',
                            gap: '0.25rem',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                          }}
                        >
                          <Button
                            size="sm"
                            onClick={() => openEdit(fencer)}
                            title={t('actions.edit')}
                            style={SMALL_BTN}
                          >
                            <Icon icon={Pencil} />
                          </Button>
                          <Button
                            variant={
                              fencer.status === FencerStatus.CHECKED_IN ? 'secondary' : 'primary'
                            }
                            size="sm"
                            data-tour="check-in"
                            onClick={() => onCheckIn(fencer.id)}
                            style={SMALL_BTN}
                          >
                            {fencer.status === FencerStatus.CHECKED_IN
                              ? t('fencerList.uncheck')
                              : t('fencerList.check')}
                          </Button>
                          {onSetFencerStatus && fencer.status === FencerStatus.CHECKED_IN && (
                            <>
                              <Button
                                variant="warning"
                                size="sm"
                                onClick={() =>
                                  handleSetFencerStatus(
                                    fencer.id,
                                    FencerStatus.ABANDONED,
                                    `${fencer.lastName} ${fencer.firstName}`
                                  )
                                }
                                title={t('fencerList.abandon')}
                                style={SMALL_BTN}
                              >
                                <MedicalCrossIcon />
                              </Button>
                              <Button
                                variant="warning"
                                size="sm"
                                onClick={() =>
                                  handleSetFencerStatus(
                                    fencer.id,
                                    FencerStatus.FORFAIT,
                                    `${fencer.lastName} ${fencer.firstName}`
                                  )
                                }
                                title={t('fencerList.forfeit')}
                                style={SMALL_BTN}
                              >
                                <Icon icon={ClipboardList} />
                              </Button>
                            </>
                          )}
                          {onSetFencerStatus &&
                            (fencer.status === FencerStatus.ABANDONED ||
                              fencer.status === FencerStatus.FORFAIT) && (
                              <Button
                                variant="success"
                                size="sm"
                                onClick={() =>
                                  handleSetFencerStatus(
                                    fencer.id,
                                    FencerStatus.CHECKED_IN,
                                    `${fencer.lastName} ${fencer.firstName}`
                                  )
                                }
                                title={t('fencerList.reactivate')}
                                style={SMALL_BTN}
                              >
                                <Icon icon={RotateCcw} />
                              </Button>
                            )}
                          {onDeleteFencer && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDeleteFencer(fencer.id)}
                              title={t('actions.delete')}
                              style={SMALL_BTN}
                            >
                              <Icon icon={Trash2} />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {useVirtual &&
                  (() => {
                    const bottomHeight =
                      virtual.state.totalHeight -
                      virtual.state.offsetY -
                      virtual.visibleItems.length * ROW_HEIGHT;
                    return bottomHeight > 0 ? (
                      <tr style={{ height: bottomHeight }}>
                        <td colSpan={colSpanTotal} />
                      </tr>
                    ) : null;
                  })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editingFencer && (
        <EditFencerModal
          fencer={editingFencer}
          onSave={handleEditSave}
          onClose={() => setEditingFencer(null)}
        />
      )}
    </div>
  );
};

const FencerList = React.memo(FencerListComponent);
export default FencerList;
