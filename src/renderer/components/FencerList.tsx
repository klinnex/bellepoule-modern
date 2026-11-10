/**
 * BellePoule Modern - Fencer List Component
 * Licensed under GPL-3.0
 */

import React from 'react';
import { QrCode, Search, Trash2 } from 'lucide-react';
import { Icon } from './common/Icon';
// qrcode chargé à la demande (génération du QR uniquement à l'affichage)
import EditFencerModal from './EditFencerModal';
// pdfExport (jsPDF) chargé à la demande pour alléger le bundle initial
import { Button } from './common/Button';
import { MENU_ITEM, DROPDOWN_WRAP } from './fencerList.styles';
import { COLUMNS, FencerListProps } from './fencerListShared';
import { useFencerListState } from '../hooks/fencerList/useFencerListState';
import { FencerListTable } from './fencerList/FencerListTable';

const FencerListComponent: React.FC<FencerListProps> = (props: FencerListProps) => {
  const fencerListState = useFencerListState({ ...props });
  const {
    fencers,
    t,
    checkedInCount,
    notCheckedInCount,
    readOnly,
    onCheckInAll,
    onUncheckAll,
    onDeleteAllFencers,
    confirm,
    customImport,
    customImportTemplate,
    onImport,
    importMenuRef,
    setImportMenuOpen,
    importMenuOpen,
    handleImportFencers,
    handleDownloadImportTemplate,
    onImportFFEConnect,
    competitionId,
    handleImportFencersArchive,
    handleImportPhotos,
    colMenuRef,
    setColMenuOpen,
    colMenuOpen,
    hiddenCols,
    setHiddenCols,
    columnLabels,
    setColOrder,
    exportMenuRef,
    setExportMenuOpen,
    exportMenuOpen,
    handleExportPDF,
    handleExportFencers,
    handleExportFencersArchive,
    handleExportPhotos,
    registerUrl,
    setShowRegisterQR,
    onAddFencer,
    showRegisterQR,
    registerQRDataUrl,
    photoMessage,
    searchTerm,
    setSearchTerm,
    editingFencer,
    handleEditSave,
    setEditingFencer,
  } = { ...props, ...fencerListState };
  const ctx = { ...props, ...fencerListState };

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

      <FencerListTable ctx={ctx} />

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
