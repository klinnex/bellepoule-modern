/**
 * BellePoule Modern - Competition List Component
 * Licensed under GPL-3.0
 */

import React from 'react';
import { Competition, Weapon, Gender, Category } from '../../shared/types';
import { useTranslation } from '../hooks/useTranslation';
import { categoryLabel } from '../../shared/utils/categoryLabel';
import { usePagination } from '../hooks/usePagination';
import { CompetitionCardSkeleton, SkeletonStyles } from './Skeleton';

interface CompetitionListProps {
  competitions: Competition[];
  isLoading: boolean;
  onSelect: (competition: Competition) => void;
  onDelete: (id: string) => void;
  onNewCompetition: () => void;
}

const CompetitionListComponent: React.FC<CompetitionListProps> = ({
  competitions,
  isLoading,
  onSelect,
  onDelete,
  onNewCompetition,
}) => {
  const { t } = useTranslation();
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
    return (
      <div className="content">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '70vh',
            gap: '3rem',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🤺</div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
              Bienvenue sur BellePoule
            </h1>
            <p style={{ color: 'var(--color-text-light)', fontSize: '1rem', maxWidth: '36ch', margin: '0 auto' }}>
              Gérez vos compétitions d&apos;escrime de l&apos;appel au podium.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            {[
              { step: '1', icon: '🏆', label: 'Créer', desc: 'une compétition' },
              { step: '2', icon: '🤺', label: 'Ajouter', desc: 'les tireurs' },
              { step: '3', icon: '🎯', label: 'Générer', desc: 'les poules' },
              { step: '4', icon: '🏅', label: 'Publier', desc: 'les résultats' },
            ].map(({ step, icon, label, desc }) => (
              <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: 100 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'var(--color-primary)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.25rem', fontWeight: 700, boxShadow: '0 4px 12px var(--color-primary-glow)',
                }}>
                  {icon}
                </div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Étape {step}
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.8125rem', fontWeight: 600 }}>{label}</div>
                <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-light)' }}>{desc}</div>
              </div>
            )).reduce<React.ReactNode[]>((acc, el, i) => {
              if (i > 0) acc.push(
                <div key={`arrow-${i}`} style={{ color: 'var(--color-border-dark)', marginTop: '1rem', fontSize: '1.25rem' }}>→</div>
              );
              acc.push(el);
              return acc;
            }, [])}
          </div>

          <button className="btn btn-primary btn-lg" onClick={onNewCompetition} style={{ padding: '0.75rem 2rem' }}>
            + {t('menu.new_competition')}
          </button>

          <p style={{ color: 'var(--color-text-light)', fontSize: '0.75rem' }}>
            Astuce : appuyez sur <kbd>?</kbd> pour voir les raccourcis clavier, ou{' '}
            <kbd>Ctrl</kbd>+<kbd>K</kbd> pour ouvrir la palette de commandes.
          </p>
        </div>
      </div>
    );
  }

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('fr-FR', {
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
        <button className="btn btn-primary btn-lg" onClick={onNewCompetition}>
          + {t('menu.new_competition')}
        </button>
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
                <button
                  className="btn btn-icon btn-secondary comp-card-delete"
                  onClick={e => { e.stopPropagation(); onDelete(competition.id); }}
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
                <span className="comp-card-fencers">
                  🤺 {competition.fencers.length} tireurs
                </span>
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
