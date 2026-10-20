/**
 * BellePoule Modern - Competition List Component
 * Licensed under GPL-3.0
 */

import React from 'react';
import {
  ChevronRight,
  Download,
  FolderOpen,
  LayoutGrid,
  Medal,
  Plus,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import { Competition, Weapon, Gender, Category } from '../../shared/types';
import { useTranslation } from '../hooks/useTranslation';
import { categoryLabel } from '../../shared/utils/categoryLabel';
import { usePagination } from '../hooks/usePagination';
import { CompetitionCardSkeleton, SkeletonStyles } from './Skeleton';
import { useConfirm } from './ConfirmDialog';
import { getActiveLocale } from '../../shared/utils/localeFormat';

const OPEN_FILE_LABEL = 'Ouvrir…';
const OPEN_FILE_TITLE = 'Ouvrir un fichier .bpm, .db ou .cotcot';

interface CompetitionListProps {
  competitions: Competition[];
  isLoading: boolean;
  onSelect: (competition: Competition) => void;
  onDelete: (id: string) => void;
  /** Exporte la compétition en .bpm (#1117) */
  onExport?: (id: string) => void;
  onNewCompetition: () => void;
  /** Ouvre un fichier compétition existant (absent hors Electron) */
  onOpenFile?: () => void;
}

const CompetitionListComponent: React.FC<CompetitionListProps> = ({
  competitions,
  isLoading,
  onSelect,
  onDelete,
  onExport,
  onNewCompetition,
  onOpenFile,
}) => {
  const { t } = useTranslation();
  const { confirm } = useConfirm();

  const handleDelete = async (competition: Competition) => {
    const ok = await confirm({
      message: t('competition.delete_confirm', { title: competition.title }),
      confirmLabel: t('actions.delete'),
    });
    if (ok) onDelete(competition.id);
  };
  const {
    items: paginatedCompetitions,
    page,
    totalPages,
    totalItems,
    pageSize,
    hasNext,
    hasPrev,
    goToNext,
    goToPrev,
    goToFirst,
    goToLast,
    setPageSize,
    pageSizeOptions,
    startIndex,
    endIndex,
  } = usePagination(competitions, { defaultPageSize: 20 });

  if (isLoading) {
    return (
      <div className="content">
        <SkeletonStyles />
        <div className="flex justify-between items-center mb-4">
          <h1 className="page-title">{t('app.title')}</h1>
        </div>
        <div className="competition-grid">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <CompetitionCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (competitions.length === 0) {
    const steps = [
      { step: '1', Icon: Trophy, label: 'Créer', desc: 'une compétition' },
      { step: '2', Icon: Users, label: 'Ajouter', desc: 'les tireurs' },
      { step: '3', Icon: LayoutGrid, label: 'Générer', desc: 'les poules' },
      { step: '4', Icon: Medal, label: 'Publier', desc: 'les résultats' },
    ];
    return (
      <div className="content">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 'calc(100vh - 220px)',
            gap: '2.5rem',
          }}
        >
          <div className="text-center">
            <Swords
              size={56}
              strokeWidth={1.5}
              color="var(--color-primary)"
              aria-hidden="true"
              className="mb-4"
            />
            <h1
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                marginBottom: '0.5rem',
              }}
            >
              Bienvenue sur {t('app.title')}
            </h1>
            <p
              style={{
                color: 'var(--color-text-light)',
                fontSize: '1rem',
                maxWidth: '48ch',
                margin: '0 auto',
              }}
            >
              Gérez vos compétitions d&apos;escrime de l&apos;appel au podium.
            </p>
          </div>

          <ol
            aria-label="Étapes"
            style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'flex-start',
              listStyle: 'none',
              padding: 0,
              margin: 0,
            }}
          >
            {steps
              .map(({ step, Icon, label, desc }) => (
                <li
                  key={step}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5rem',
                    width: 100,
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                      color: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={22} strokeWidth={1.75} />
                  </div>
                  <div
                    style={{
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      color: 'var(--color-text-light)',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Étape {step}
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '0.8125rem', fontWeight: 600 }}>
                    {label}
                  </div>
                  <div
                    style={{
                      textAlign: 'center',
                      fontSize: '0.75rem',
                      color: 'var(--color-text-light)',
                    }}
                  >
                    {desc}
                  </div>
                </li>
              ))
              .reduce<React.ReactNode[]>((acc, el, i) => {
                if (i > 0)
                  acc.push(
                    <li
                      key={`arrow-${i}`}
                      aria-hidden="true"
                      style={{ color: 'var(--color-text-light)', marginTop: '0.875rem' }}
                    >
                      <ChevronRight size={20} />
                    </li>
                  );
                acc.push(el);
                return acc;
              }, [])}
          </ol>

          <div
            style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}
          >
            <button
              className="btn btn-primary btn-lg btn-icon-label"
              onClick={onNewCompetition}
              style={{ padding: '0.75rem 2rem' }}
            >
              <Plus size={18} />
              {t('menu.new_competition')}
            </button>
            {onOpenFile && (
              <button
                className="btn btn-secondary btn-lg btn-icon-label"
                onClick={onOpenFile}
                style={{ padding: '0.75rem 1.5rem' }}
                title={OPEN_FILE_TITLE}
              >
                <FolderOpen size={18} />
                {OPEN_FILE_LABEL}
              </button>
            )}
          </div>

          <p style={{ color: 'var(--color-text-light)', fontSize: '0.8125rem' }}>
            Astuce : appuyez sur <kbd>?</kbd> pour voir les raccourcis clavier, ou <kbd>Ctrl</kbd>+
            <kbd>K</kbd> pour ouvrir la palette de commandes.
          </p>
        </div>
      </div>
    );
  }

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString(getActiveLocale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <div className="content">
      <div className="flex justify-between items-center mb-4">
        <h1 className="page-title">{t('app.title')}</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {onOpenFile && (
            <button
              className="btn btn-secondary btn-lg btn-icon-label"
              onClick={onOpenFile}
              title={OPEN_FILE_TITLE}
            >
              <FolderOpen size={18} />
              {OPEN_FILE_LABEL}
            </button>
          )}
          <button className="btn btn-primary btn-lg" onClick={onNewCompetition}>
            + {t('menu.new_competition')}
          </button>
        </div>
      </div>

      <div className="competition-grid">
        {paginatedCompetitions.map(competition => (
          <div
            key={competition.id}
            className="card competition-card"
            onClick={() => onSelect(competition)}
            style={{ '--card-accent': competition.color || '#3B5BDB' } as React.CSSProperties}
          >
            <div className="comp-card-inner">
              <div className="comp-card-top">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="comp-card-title">{competition.title}</h3>
                  <p className="comp-card-date">{formatDate(competition.date)}</p>
                </div>
                {onExport && (
                  <button
                    className="btn btn-icon btn-secondary comp-card-delete"
                    onClick={e => {
                      e.stopPropagation();
                      onExport(competition.id);
                    }}
                    title={t('competition.export_bpm')}
                    aria-label={t('competition.export_bpm')}
                  >
                    <Download size={16} />
                  </button>
                )}
                <button
                  className="btn btn-icon btn-secondary comp-card-delete"
                  onClick={e => {
                    e.stopPropagation();
                    void handleDelete(competition);
                  }}
                  title={t('actions.delete')}
                >
                  🗑️
                </button>
              </div>

              <div className="comp-card-pills">
                <span className="comp-pill">{competition.weapon}</span>
                <span className="comp-pill">{categoryLabel(competition.category, t)}</span>
                <span className="comp-pill">{competition.gender}</span>
                {competition.location && (
                  <span className="comp-pill comp-pill-location">📍 {competition.location}</span>
                )}
              </div>

              <div className="comp-card-footer">
                <span className="comp-card-fencers">🤺 {competition.fencers.length} tireurs</span>
                <span className="comp-card-open">Ouvrir →</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {totalItems > pageSize && (
        <div
          className="pagination-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '1rem',
            justifyContent: 'center',
          }}
        >
          <button
            className="btn btn-secondary btn-sm"
            onClick={goToFirst}
            disabled={!hasPrev}
            title="Première page"
          >
            «
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={goToPrev}
            disabled={!hasPrev}
            title="Page précédente"
          >
            ‹
          </button>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {startIndex + 1}–{endIndex} / {totalItems}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={goToNext}
            disabled={!hasNext}
            title="Page suivante"
          >
            ›
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={goToLast}
            disabled={!hasNext}
            title="Dernière page"
          >
            »
          </button>
          <select
            className="form-select form-select-sm"
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            style={{ marginLeft: '0.5rem', fontSize: '0.875rem' }}
          >
            {pageSizeOptions.map(s => (
              <option key={s} value={s}>
                {s} / page
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

const CompetitionList = React.memo(CompetitionListComponent);
export default CompetitionList;
