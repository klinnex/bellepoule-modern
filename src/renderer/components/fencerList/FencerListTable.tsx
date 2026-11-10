/**
 * BellePoule Modern - Tableau des tireurs de la liste d'appel (lignes, tri, actions)
 * Licensed under GPL-3.0
 */

import React from 'react';
import { ClipboardList, Pencil, RotateCcw, Search, Swords, Trash2 } from 'lucide-react';
import { Icon } from '../common/Icon';
import EmptyState from '../common/EmptyState';
// qrcode chargé à la demande (génération du QR uniquement à l'affichage)
import { FencerStatus } from '../../../shared/types';
import { MedicalCrossIcon } from '../common/MedicalCrossIcon';
import { isDns } from '../../../shared/utils/forfeit';
import { departmentLabel } from '../../../shared/utils/departments';
// pdfExport (jsPDF) chargé à la demande pour alléger le bundle initial
import CoachMark from '../CoachMark';
import Flag from '../common/Flag';
import { Button } from '../common/Button';
import { SMALL_BTN, W250 } from '../fencerList.styles';
import type { FencerListCtx } from '../fencerListCtx';

/** Tableau des tireurs de la liste d'appel (lignes, tri, actions) (extrait de FencerListComponent, #1599) */
export function FencerListTable({ ctx }: { ctx: FencerListCtx }) {
  const {
    filteredFencers,
    fencers,
    t,
    onImport,
    handleImportFencers,
    handleDownloadImportTemplate,
    onAddFencer,
    searchTerm,
    useVirtual,
    visibleCols,
    handleColDragStart,
    handleColDragOver,
    handleColDrop,
    handleColDragEnd,
    dragCol,
    dragOverCol,
    handleSort,
    sortBy,
    sortOrder,
    virtual,
    CONTAINER_HEIGHT,
    colSpanTotal,
    readOnly,
    openEdit,
    cellValues,
    statusLabels,
    onCheckIn,
    onSetFencerStatus,
    handleSetFencerStatus,
    onDeleteFencer,
    handleDeleteFencer,
    ROW_HEIGHT,
  } = ctx;

  return (
    <>
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
    </>
  );
}
