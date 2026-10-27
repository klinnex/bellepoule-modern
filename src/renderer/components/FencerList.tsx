/**
 * BellePoule Modern - Fencer List Component
 * Licensed under GPL-3.0
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useVirtualList } from '../../shared/services/performanceService';
// qrcode chargé à la demande (génération du QR uniquement à l'affichage)
import { Fencer, FencerStatus } from '../../shared/types';
import EditFencerModal from './EditFencerModal';
import { MedicalCrossIcon } from './common/MedicalCrossIcon';
import { useTranslation } from '../hooks/useTranslation';
import { exportFencersToTXT, exportFencersToFFF } from '../../shared/utils/fencerExport';
import { isDns } from '../../shared/utils/forfeit';
// pdfExport (jsPDF) chargé à la demande pour alléger le bundle initial
import { useConfirm } from './ConfirmDialog';
import CoachMark from './CoachMark';
import { useDebounce } from '../hooks/useDebounce';
import { MENU_ITEM, SMALL_BTN, W250, DROPDOWN_WRAP } from './fencerList.styles';

type SortableCol = 'ref' | 'lastName' | 'firstName' | 'birthDate' | 'club' | 'ranking' | 'status';

const COLUMNS = [
  { id: 'ref' as SortableCol, labelKey: 'fencerList.col_ref', width: '50px' },
  { id: 'lastName' as SortableCol, labelKey: 'fencerList.col_last_name' },
  { id: 'firstName' as SortableCol, labelKey: 'fencerList.col_first_name' },
  { id: 'birthDate' as SortableCol, labelKey: 'fencerList.col_birth', width: '70px' },
  { id: 'club' as SortableCol, labelKey: 'fencerList.col_club' },
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
  onFencersImported?: () => void;
  /** URL de la page d'inscription distante (ex: http://192.168.x.x:8066/register) */
  registerUrl?: string;
  /** Callback pour recharger la liste après inscription distante */
  onFencersChanged?: () => void;
  /** Notifie le parent des tireurs triés/filtrés et des colonnes visibles actuels */
  onAppelStateChange?: (fencers: Fencer[], visibleColumns: string[]) => void;
  /** Consultation seule (appel d'un tour de poules terminé, #1051) */
  readOnly?: boolean;
  /** Libellés de colonnes remplacés (tournoi des rapières : Équipe, Tireurs, Niveau) */
  columnLabels?: Partial<Record<SortableCol, string>>;
  /** Colonnes masquées au départ */
  hiddenColumns?: SortableCol[];
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
  onFencersImported,
  registerUrl,
  onFencersChanged,
  onAppelStateChange,
  readOnly = false,
  columnLabels,
  hiddenColumns,
  onEditRequest,
}) => {
  const { t } = useTranslation();
  const { confirm } = useConfirm();

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
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => new Set(hiddenColumns ?? []));
  const [colOrder, setColOrder] = useState<SortableCol[]>(() => {
    try {
      const saved = localStorage.getItem('bellepoule-fencer-col-order');
      if (saved) {
        const parsed = JSON.parse(saved) as SortableCol[];
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

  // Recharger la liste toutes les 5 s si le modal QR est ouvert (inscription en cours)
  useEffect(() => {
    if (!showRegisterQR || !onFencersChanged) return;
    const id = setInterval(onFencersChanged, 5000);
    return () => clearInterval(id);
  }, [showRegisterQR, onFencersChanged]);

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
          case 'ranking':
            return dir * ((a.ranking ?? 99999) - (b.ranking ?? 99999));
          case 'status':
            return dir * a.status.localeCompare(b.status);
          default:
            return 0;
        }
      });
  }, [fencers, debouncedSearchTerm, sortBy, sortOrder]);

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
        const { count } = await window.electronAPI.file.exportPhotos(
          competitionId,
          result.filePath
        );
        showPhotoMessage(t('fencerList.photos_exported', { count }));
      } catch {
        showPhotoMessage(t('fencerList.export_error'));
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
        const { matched, total } = await window.electronAPI.file.importPhotos(
          competitionId,
          result.filePath
        );
        showPhotoMessage(
          t('fencerList.photos_imported', { count: total, matched: String(matched) })
        );
      } catch {
        showPhotoMessage(t('fencerList.import_error'));
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
        const { count } = await window.electronAPI.file.exportFencersArchive(
          competitionId,
          result.filePath
        );
        showPhotoMessage(t('fencerList.bpf_exported', { count }));
      } catch {
        showPhotoMessage(t('fencerList.bpf_export_error'));
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
        const { added, updated } = await window.electronAPI.file.importFencersArchive(
          competitionId,
          result.filePath
        );
        showPhotoMessage(
          t('fencerList.bpf_imported', { added: String(added), updated: String(updated) })
        );
        if (onFencersImported) onFencersImported();
      } catch {
        showPhotoMessage(t('fencerList.bpf_import_error'));
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

  const handleSetFencerStatus = async (
    id: string,
    status: FencerStatus,
    confirmationMessage?: string
  ) => {
    if (confirmationMessage) {
      if (await confirm(confirmationMessage)) {
        if (onSetFencerStatus) {
          onSetFencerStatus(id, status);
        }
      }
    } else {
      if (onSetFencerStatus) {
        onSetFencerStatus(id, status);
      }
    }
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
      <div
        className="flex justify-between items-center mb-4"
        style={{ position: 'relative', zIndex: 2 }}
      >
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>
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
                <button
                  className="btn btn-secondary"
                  onClick={onCheckInAll}
                  title={t('fencerList.check_in_all_title', { count: notCheckedInCount })}
                >
                  ✓ {t('actions.check_in_all')}
                </button>
              )}
              {checkedInCount > 0 && onUncheckAll && (
                <button
                  className="btn btn-secondary"
                  onClick={onUncheckAll}
                  title={t('fencer.uncheck_all')}
                >
                  ✗ {t('actions.uncheck_all')}
                </button>
              )}
              {onDeleteAllFencers && (
                <button
                  className="btn btn-danger"
                  onClick={async () => {
                    if (await confirm(t('messages.confirm_delete_fencer'))) {
                      onDeleteAllFencers();
                    }
                  }}
                  title={t('fencerList.delete_all_title', { count: fencers.length })}
                  style={{ padding: '0.4rem 0.6rem' }}
                >
                  🗑️
                </button>
              )}
              <div
                style={{
                  width: '1px',
                  height: '22px',
                  background: 'var(--border-color, rgba(255,255,255,0.15))',
                  margin: '0 0.125rem',
                  flexShrink: 0,
                }}
              />
            </>
          )}
          {customImport && !readOnly && (
            <button className="btn btn-secondary" onClick={customImport.onClick}>
              {customImport.label}
            </button>
          )}
          {onImport && !readOnly && (
            <div ref={importMenuRef} style={DROPDOWN_WRAP}>
              <button
                className="btn btn-secondary"
                onClick={() => setImportMenuOpen(o => !o)}
                title={t('actions.import')}
              >
                {t('fencerList.import_menu')}
              </button>
              {importMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '4px',
                    zIndex: 9999,
                    background: 'var(--bg-secondary, #2a2a3e)',
                    border: '1px solid var(--border-color, #444)',
                    borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    minWidth: '230px',
                    padding: '4px 0',
                    maxHeight: '60vh',
                    overflowY: 'auto',
                  }}
                >
                  <button
                    className="btn btn-ghost"
                    style={MENU_ITEM}
                    onClick={() => {
                      handleImportFencers('xml');
                      setImportMenuOpen(false);
                    }}
                  >
                    {t('fencerList.import_xml_bp')}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={MENU_ITEM}
                    onClick={() => {
                      handleImportFencers('fff');
                      setImportMenuOpen(false);
                    }}
                  >
                    {t('fencerList.import_fff')}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={MENU_ITEM}
                    onClick={() => {
                      handleImportFencers('ranking');
                      setImportMenuOpen(false);
                    }}
                  >
                    {t('fencerList.import_ranking')}
                  </button>
                  {onImportFFEConnect && (
                    <button
                      className="btn btn-ghost"
                      style={MENU_ITEM}
                      onClick={() => {
                        onImportFFEConnect();
                        setImportMenuOpen(false);
                      }}
                    >
                      {t('fencerList.import_ffe_connect')}
                    </button>
                  )}
                  {competitionId && (
                    <>
                      <button
                        className="btn btn-ghost"
                        style={MENU_ITEM}
                        onClick={() => {
                          handleImportFencersArchive();
                          setImportMenuOpen(false);
                        }}
                      >
                        {t('fencerList.import_bpf')}
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={MENU_ITEM}
                        onClick={() => {
                          handleImportPhotos();
                          setImportMenuOpen(false);
                        }}
                      >
                        {t('fencerList.import_photos')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {fencers.length > 0 && (
            <>
              <div ref={colMenuRef} style={DROPDOWN_WRAP}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setColMenuOpen(o => !o)}
                  title={t('fencerList.columns_title')}
                >
                  {t('fencerList.columns_menu')}
                </button>
                {colMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: '4px',
                      zIndex: 9999,
                      background: 'var(--bg-secondary, #2a2a3e)',
                      border: '1px solid var(--border-color, #444)',
                      borderRadius: '6px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                      minWidth: '160px',
                      padding: '4px 0',
                    }}
                  >
                    {COLUMNS.map(col => (
                      <label
                        key={col.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '6px 16px',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          color: 'var(--text-primary, #e2e8f0)',
                        }}
                      >
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
                    <div
                      style={{ borderTop: '1px solid var(--border-color, #444)', margin: '4px 0' }}
                    />
                    <button
                      className="btn btn-ghost"
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 16px',
                        borderRadius: 0,
                        fontSize: '0.8rem',
                        color: 'var(--text-muted, #94a3b8)',
                      }}
                      onClick={() => setColOrder(COLUMNS.map(c => c.id))}
                    >
                      {t('fencerList.reset_order')}
                    </button>
                  </div>
                )}
              </div>
              <div ref={exportMenuRef} style={DROPDOWN_WRAP}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setExportMenuOpen(o => !o)}
                  title={t('actions.export')}
                >
                  {t('fencerList.export_menu')}
                </button>
                {exportMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: '4px',
                      zIndex: 9999,
                      background: 'var(--bg-secondary, #2a2a3e)',
                      border: '1px solid var(--border-color, #444)',
                      borderRadius: '6px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                      minWidth: '160px',
                      padding: '4px 0',
                      maxHeight: '60vh',
                      overflowY: 'auto',
                    }}
                  >
                    <button
                      className="btn btn-ghost"
                      style={MENU_ITEM}
                      onClick={() => {
                        handleExportPDF();
                        setExportMenuOpen(false);
                      }}
                    >
                      {t('fencerList.export_pdf_appel')}
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={MENU_ITEM}
                      onClick={() => {
                        handleExportFencers('txt');
                        setExportMenuOpen(false);
                      }}
                    >
                      {t('fencerList.export_txt')}
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={MENU_ITEM}
                      onClick={() => {
                        handleExportFencers('fff');
                        setExportMenuOpen(false);
                      }}
                    >
                      {t('fencerList.export_fff')}
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={MENU_ITEM}
                      onClick={() => {
                        handleExportFencersArchive();
                        setExportMenuOpen(false);
                      }}
                    >
                      {t('fencerList.export_bpf')}
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={MENU_ITEM}
                      onClick={() => {
                        handleExportPhotos();
                        setExportMenuOpen(false);
                      }}
                    >
                      {t('fencerList.export_photos')}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {registerUrl && !readOnly && (
            <button
              className="btn btn-secondary"
              title={`Inscription tablette : ${registerUrl}`}
              onClick={() => setShowRegisterQR(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <span>📱</span> {t('fencerList.qr_register')}
            </button>
          )}
          {!readOnly && (
            <button className="btn btn-primary" onClick={onAddFencer}>
              + {t('fencer.add')}
            </button>
          )}
        </div>
      </div>

      {/* Modal QR code inscription distante */}
      {showRegisterQR && registerUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowRegisterQR(false)}
        >
          <div
            style={{
              background: 'var(--surface, #1e293b)',
              borderRadius: 16,
              padding: '2rem',
              textAlign: 'center',
              maxWidth: 300,
              width: '90%',
              border: '1px solid var(--border-color, #334155)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: '0.75rem', fontSize: '1.1rem', fontWeight: 700 }}>
              {t('fencerList.register_title')}
            </h3>
            <p
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted, #94a3b8)',
                marginBottom: '1rem',
              }}
            >
              {t('fencerList.register_hint')}
            </p>
            {registerQRDataUrl ? (
              <img
                src={registerQRDataUrl}
                alt={t('fencerList.register_qr_alt')}
                width={220}
                height={220}
                style={{ borderRadius: 8 }}
              />
            ) : (
              <div
                style={{
                  width: 220,
                  height: 220,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto',
                }}
              >
                {t('fencerList.generating')}
              </div>
            )}
            <code
              style={{
                display: 'block',
                marginTop: '0.75rem',
                fontSize: '0.7rem',
                wordBreak: 'break-all',
                color: 'var(--text-muted, #94a3b8)',
              }}
            >
              {registerUrl}
            </code>
            <button
              className="btn btn-secondary"
              style={{ marginTop: '1rem', width: '100%' }}
              onClick={() => setShowRegisterQR(false)}
            >
              {t('actions.close')}
            </button>
          </div>
        </div>
      )}

      {photoMessage && (
        <div
          className="alert alert-success mb-4"
          style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
        >
          {photoMessage}
        </div>
      )}

      {fencers.length > 0 && (
        <div className="mb-4">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              fontSize: '0.75rem',
              color: 'var(--text-muted, var(--color-text-light))',
              marginBottom: '5px',
            }}
          >
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
          <div
            style={{
              height: '8px',
              background: 'var(--border-color, var(--color-border))',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
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
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
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
            🔍
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
        <div className="empty-state">
          {fencers.length === 0 ? (
            <>
              <div className="empty-state-icon">🤺</div>
              <h2 className="empty-state-title">{t('fencerList.empty_title')}</h2>
              <p className="empty-state-description">{t('fencerList.empty_desc')}</p>
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
                    message={t('fencerList.import_formats_hint')}
                    position="bottom"
                  >
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleImportFencers('fff')}
                    >
                      {t('fencerList.empty_import_fff')}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleImportFencers('xml')}
                    >
                      {t('fencerList.empty_import_xml')}
                    </button>
                  </CoachMark>
                )}
                <button className="btn btn-primary" onClick={onAddFencer}>
                  + {t('fencer.add')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="empty-state-icon">🔍</div>
              <h2 className="empty-state-title">{t('fencerList.no_result_title')}</h2>
              <p className="empty-state-description">
                {t('fencerList.no_result_desc', { term: searchTerm })}
              </p>
            </>
          )}
        </div>
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
                              {fencer.birthDate ? new Date(fencer.birthDate).getFullYear() : '-'}
                            </td>
                          );
                        case 'club':
                          return (
                            <td key="club" className="text-sm text-muted">
                              {fencer.club || '-'}
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
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => openEdit(fencer)}
                            title={t('actions.edit')}
                            style={SMALL_BTN}
                          >
                            ✏️
                          </button>
                          <button
                            className={`btn btn-sm ${fencer.status === FencerStatus.CHECKED_IN ? 'btn-secondary' : 'btn-primary'}`}
                            onClick={() => onCheckIn(fencer.id)}
                            style={SMALL_BTN}
                          >
                            {fencer.status === FencerStatus.CHECKED_IN
                              ? t('fencerList.uncheck')
                              : t('fencerList.check')}
                          </button>
                          {onSetFencerStatus && fencer.status === FencerStatus.CHECKED_IN && (
                            <>
                              <button
                                className="btn btn-sm btn-warning"
                                onClick={() =>
                                  handleSetFencerStatus(
                                    fencer.id,
                                    FencerStatus.ABANDONED,
                                    t('messages.confirm_abandon', {
                                      name: `${fencer.lastName} ${fencer.firstName}`,
                                    })
                                  )
                                }
                                title={t('fencerList.abandon')}
                                style={SMALL_BTN}
                              >
                                <MedicalCrossIcon />
                              </button>
                              <button
                                className="btn btn-sm btn-warning"
                                onClick={() =>
                                  handleSetFencerStatus(
                                    fencer.id,
                                    FencerStatus.FORFAIT,
                                    t('messages.confirm_forfait', {
                                      name: `${fencer.lastName} ${fencer.firstName}`,
                                    })
                                  )
                                }
                                title={t('fencerList.forfeit')}
                                style={SMALL_BTN}
                              >
                                📋
                              </button>
                            </>
                          )}
                          {onSetFencerStatus &&
                            (fencer.status === FencerStatus.ABANDONED ||
                              fencer.status === FencerStatus.FORFAIT) && (
                              <button
                                className="btn btn-sm btn-success"
                                onClick={() =>
                                  handleSetFencerStatus(
                                    fencer.id,
                                    FencerStatus.CHECKED_IN,
                                    t('messages.confirm_reactivate', {
                                      name: `${fencer.lastName} ${fencer.firstName}`,
                                    })
                                  )
                                }
                                title={t('fencerList.reactivate')}
                                style={SMALL_BTN}
                              >
                                ✅
                              </button>
                            )}
                          {onDeleteFencer && (
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => handleDeleteFencer(fencer.id)}
                              title={t('actions.delete')}
                              style={SMALL_BTN}
                            >
                              🗑️
                            </button>
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
