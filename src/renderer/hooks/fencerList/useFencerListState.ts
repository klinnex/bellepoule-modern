/**
 * BellePoule Modern - Liste d'appel : tri, colonnes, filtrage, imports/exports et actions sur les tireurs
 * Licensed under GPL-3.0
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { actionableMessage } from '../../../shared/utils/actionableError';
import { useOperation } from '../../components/common/OperationProgress';
import { useVirtualList } from '../../../shared/services/performanceService';
// qrcode chargé à la demande (génération du QR uniquement à l'affichage)
import { Fencer, FencerStatus } from '../../../shared/types';
import { useTranslation } from '../useTranslation';
import { exportFencersToTXT, exportFencersToFFF } from '../../../shared/utils/fencerExport';
import { buildFencerImportTemplate } from '../../../shared/utils/fileParser';
// pdfExport (jsPDF) chargé à la demande pour alléger le bundle initial
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { useDebounce } from '../useDebounce';
import { SortableCol, COLUMNS, FencerListProps } from '../../components/fencerListShared';

type Ctx = FencerListProps;

/** Colonnes masquées de la liste d'appel (#1504) */
const HIDDEN_COLS_KEY = 'bellepoule-fencer-hidden-cols';

/** Liste d'appel : tri, colonnes, filtrage, imports/exports et actions sur les tireurs (extrait de FencerListComponent, #1599) */
export function useFencerListState(ctx: Ctx) {
  const {
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
  } = ctx;

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
    // Nationalité, région, département, latéralité : affichables, masquées par défaut (#1415, #1504)
    // Choix mémorisé : retrouvé en revenant sur l'onglet Appel (#1504)
    () => {
      if (hiddenColumns) return new Set(hiddenColumns);
      try {
        const saved = localStorage.getItem(HIDDEN_COLS_KEY);
        if (saved) return new Set(JSON.parse(saved) as string[]);
      } catch {
        /* stockage indisponible ou illisible : valeurs par défaut */
      }
      return new Set(['nationality', 'region', 'department', 'handedness']);
    }
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
        // Latéralité (#1504) : avant le classement
        if (!parsed.includes('handedness')) {
          const at = parsed.indexOf('ranking');
          parsed.splice(at >= 0 ? at : parsed.length, 0, 'handedness');
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

  useEffect(() => {
    if (hiddenColumns) return;
    try {
      localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify([...hiddenCols]));
    } catch {
      /* stockage indisponible : choix gardé pour la session */
    }
  }, [hiddenCols, hiddenColumns]);

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
          case 'handedness':
            return dir * (a.handedness ?? 'R').localeCompare(b.handedness ?? 'R');
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

  // Suppression annulable via le toast du parent (#1535) : pas de modale de confirmation
  const handleDeleteFencer = (id: string) => {
    if (editingFencer && editingFencer.id === id) {
      setEditingFencer(null);
    }
    onDeleteFencer?.(id);
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
    const { exportAppelToPDF } = await import('../../../shared/utils/pdfExport');
    await exportAppelToPDF(
      filteredFencers,
      visibleCols.map(c => c.id)
    );
  };

  return {
    fencers,
    competitionId,
    onCheckIn,
    onAddFencer,
    onDeleteFencer,
    onDeleteAllFencers,
    onCheckInAll,
    onUncheckAll,
    onSetFencerStatus,
    onImport,
    onImportFFEConnect,
    customImport,
    customImportTemplate,
    registerUrl,
    readOnly,
    columnLabels,
    cellValues,
    t,
    confirm,
    statusLabels,
    searchTerm,
    setSearchTerm,
    sortBy,
    sortOrder,
    hiddenCols,
    setHiddenCols,
    setColOrder,
    dragCol,
    dragOverCol,
    colMenuOpen,
    setColMenuOpen,
    colMenuRef,
    photoMessage,
    editingFencer,
    setEditingFencer,
    openEdit,
    exportMenuOpen,
    setExportMenuOpen,
    exportMenuRef,
    importMenuOpen,
    setImportMenuOpen,
    importMenuRef,
    showRegisterQR,
    setShowRegisterQR,
    registerQRDataUrl,
    handleColDragStart,
    handleColDragOver,
    handleColDrop,
    handleColDragEnd,
    filteredFencers,
    ROW_HEIGHT,
    CONTAINER_HEIGHT,
    virtual,
    useVirtual,
    checkedInCount,
    notCheckedInCount,
    handleEditSave,
    handleExportFencers,
    handleDownloadImportTemplate,
    handleImportFencers,
    handleExportPhotos,
    handleImportPhotos,
    handleExportFencersArchive,
    handleImportFencersArchive,
    handleDeleteFencer,
    handleSetFencerStatus,
    handleSort,
    visibleCols,
    colSpanTotal,
    handleExportPDF,
  };
}
