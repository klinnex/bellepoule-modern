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
  PlayCircle,
  Search,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { Competition } from '../../shared/types';
import { useTranslation } from '../hooks/useTranslation';
import { categoryLabel } from '../../shared/utils/categoryLabel';
import { usePagination } from '../hooks/usePagination';
import { filterCompetitions } from './competitionListSearch';
import {
  applyFilters,
  availableValues,
  emptyFilters,
  FILTER_GROUPS,
  hasActiveFilters,
  readSort,
  SORT_OPTIONS,
  sortCompetitions,
  writeSort,
  type CompetitionSort,
  type FilterGroup,
} from './competitionListFilters';
import { CompetitionCardSkeleton } from './Skeleton';
import { useConfirm } from './ConfirmDialog';
import { getActiveLocale } from '../../shared/utils/localeFormat';
import { restartGuidedTour } from './guidedTourFlags';
import EmptyState from './common/EmptyState';
import { BrandLogo } from './common/BrandLogo';
import { CompetitionExportPicker } from './CompetitionExportPicker';
import { Button } from './common/Button';

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
  /** Importe une compétition depuis un .bpm (absent hors Electron) */
  /** Démo autonome : matchs joués seuls + écrans distants (absent hors Electron) */
  onStartDemo?: () => void;
}

const CompetitionListComponent: React.FC<CompetitionListProps> = ({
  competitions,
  isLoading,
  onSelect,
  onDelete,
  onExport,
  onNewCompetition,
  onOpenFile,
  onStartDemo,
}) => {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const [showExportPicker, setShowExportPicker] = React.useState(false);

  const handleDelete = async (competition: Competition) => {
    const ok = await confirm({
      message: t('competition.delete_confirm', { title: competition.title }),
      confirmLabel: t('actions.delete'),
    });
    if (ok) onDelete(competition.id);
  };
  const [query, setQuery] = React.useState('');
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [filters, setFilters] = React.useState(emptyFilters);
  const [sort, setSort] = React.useState<CompetitionSort>(readSort);
  const visibleCompetitions = React.useMemo(
    () => sortCompetitions(applyFilters(filterCompetitions(competitions, query), filters), sort),
    [competitions, query, filters, sort]
  );
  const toggleFilter = (group: FilterGroup, value: string) =>
    setFilters(prev => ({
      ...prev,
      [group]: prev[group].includes(value)
        ? prev[group].filter(v => v !== value)
        : [...prev[group], value],
    }));
  const filterLabel = (group: FilterGroup, value: string): string => {
    switch (group) {
      case 'weapon': {
        const key = (
          { E: 'epee', F: 'foil', S: 'sabre', L: 'laser', C: 'custom' } as Record<string, string>
        )[value];
        return key ? t(`weapons.${key}`) : value;
      }
      case 'gender': {
        const key = ({ M: 'male', F: 'female', X: 'mixed' } as Record<string, string>)[value];
        return key ? t(`genders.${key}`) : value;
      }
      case 'category':
        return categoryLabel(value, t);
      default:
        return t(`competitionList.status_${value}`);
    }
  };
  const filtersActive = hasActiveFilters(filters);
  const {
    items: paginatedCompetitions,
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
  } = usePagination(visibleCompetitions, { defaultPageSize: 20 });

  // Raccourci « / » : place le curseur dans la recherche (hors champs de saisie)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (isLoading) {
    return (
      <div className="content">
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
      {
        step: '1',
        Icon: Trophy,
        label: t('competitionList.s1_label'),
        desc: t('competitionList.s1_desc'),
      },
      {
        step: '2',
        Icon: Users,
        label: t('competitionList.s2_label'),
        desc: t('competitionList.s2_desc'),
      },
      {
        step: '3',
        Icon: LayoutGrid,
        label: t('competitionList.s3_label'),
        desc: t('competitionList.s3_desc'),
      },
      {
        step: '4',
        Icon: Medal,
        label: t('competitionList.s4_label'),
        desc: t('competitionList.s4_desc'),
      },
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
            <span className="brand-logo-wrap" aria-hidden="true">
              <BrandLogo size={72} className="mb-4" />
            </span>
            <h1
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                marginBottom: '0.5rem',
              }}
            >
              {t('competitionList.welcome', { app: t('app.title') })}
            </h1>
            <p
              style={{
                color: 'var(--color-text-light)',
                fontSize: '1rem',
                maxWidth: '48ch',
                margin: '0 auto',
              }}
            >
              {t('competitionList.tagline')}
            </p>
          </div>

          <ol
            aria-label={t('competitionList.steps')}
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
                    {t('competitionList.step_n', { n: step })}
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
            <Button
              variant="primary"
              size="lg"
              className="btn-icon-label"
              onClick={onNewCompetition}
              style={{ padding: '0.75rem 2rem' }}
            >
              <Plus size={18} />
              {t('menu.new_competition')}
            </Button>
            {onOpenFile && (
              <Button
                size="lg"
                className="btn-icon-label"
                onClick={onOpenFile}
                style={{ padding: '0.75rem 1.5rem' }}
                title={t('competitionList.open_file_title')}
              >
                <FolderOpen size={18} />
                {t('competitionList.open_file')}
              </Button>
            )}
          </div>

          {/* Parcours guidé (#1305) : réactivé même s'il a déjà été fermé */}
          <Button
            type="button"
            className="btn-icon-label"
            onClick={() => {
              restartGuidedTour();
              onNewCompetition();
            }}
          >
            <Sparkles size={16} />
            {t('competitionList.guided_start')}
          </Button>
          {onStartDemo && (
            <Button
              type="button"
              className="btn-icon-label"
              onClick={onStartDemo}
              title={t('demo.hint')}
            >
              <PlayCircle size={16} />
              {t('demo.button')}
            </Button>
          )}

          <p style={{ color: 'var(--color-text-light)', fontSize: '0.8125rem' }}>
            {t('competitionList.tip_1')} <kbd>?</kbd> {t('competitionList.tip_2')} <kbd>Ctrl</kbd>+
            <kbd>K</kbd> {t('competitionList.tip_3')}
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
          {onStartDemo && (
            <Button
              type="button"
              size="lg"
              className="btn-icon-label"
              onClick={onStartDemo}
              title={t('demo.hint')}
            >
              <PlayCircle size={18} />
              {t('demo.button')}
            </Button>
          )}
          {onExport && competitions.length > 0 && (
            <Button
              type="button"
              size="lg"
              className="btn-icon-label"
              onClick={() => setShowExportPicker(true)}
              title={t('competitionList.export_title')}
            >
              <Download size={18} />
              {t('competitionList.export')}
            </Button>
          )}
          {onOpenFile && (
            <Button
              size="lg"
              className="btn-icon-label"
              onClick={onOpenFile}
              title={t('competitionList.open_file_title')}
            >
              <FolderOpen size={18} />
              {t('competitionList.open_file')}
            </Button>
          )}
          <Button variant="primary" size="lg" onClick={onNewCompetition}>
            + {t('menu.new_competition')}
          </Button>
        </div>
      </div>

      <div className="competition-search">
        <input
          ref={searchRef}
          type="search"
          className="form-input competition-search-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('competitionList.search_placeholder')}
          aria-label={t('competitionList.search_aria')}
        />
        <select
          className="form-select competition-sort"
          value={sort}
          onChange={e => {
            const next = e.target.value as CompetitionSort;
            setSort(next);
            writeSort(next);
          }}
          aria-label={t('competitionList.sort_aria')}
        >
          {SORT_OPTIONS.map(o => (
            <option key={o} value={o}>
              {t(`competitionList.sort_${o}`)}
            </option>
          ))}
        </select>
        {(query || filtersActive) && (
          <span className="competition-search-count" aria-live="polite">
            {t('competitionList.search_count', {
              shown: visibleCompetitions.length,
              total: competitions.length,
            })}
          </span>
        )}
      </div>
      <div className="competition-filters">
        {FILTER_GROUPS.map(group => {
          const values = availableValues(competitions, group);
          if (values.length < 2) return null;
          return (
            <div
              key={group}
              className="competition-filter-group"
              role="group"
              aria-label={t(`competitionList.filter_${group}`)}
            >
              {values.map(v => (
                <button
                  key={v}
                  type="button"
                  className={`competition-chip${filters[group].includes(v) ? ' is-active' : ''}`}
                  aria-pressed={filters[group].includes(v)}
                  onClick={() => toggleFilter(group, v)}
                >
                  {filterLabel(group, v)}
                </button>
              ))}
            </div>
          );
        })}
        {filtersActive && (
          <Button size="sm" onClick={() => setFilters(emptyFilters())}>
            {t('competitionList.filters_reset')}
          </Button>
        )}
      </div>
      {visibleCompetitions.length === 0 && (
        <EmptyState
          icon={<Search size={24} />}
          title={t('competitionList.search_empty')}
          className="competition-search-empty"
        />
      )}

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
                  <Button
                    className="btn-icon comp-card-delete"
                    onClick={e => {
                      e.stopPropagation();
                      onExport(competition.id);
                    }}
                    title={t('competition.export_bpm')}
                    aria-label={t('competition.export_bpm')}
                  >
                    <Download size={16} />
                  </Button>
                )}
                <Button
                  className="btn-icon comp-card-delete"
                  onClick={e => {
                    e.stopPropagation();
                    void handleDelete(competition);
                  }}
                  title={t('actions.delete')}
                >
                  🗑️
                </Button>
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
                  {t('competitionList.fencers', { n: competition.fencers.length })}
                </span>
                <span className="comp-card-open">{t('competitionList.open')}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showExportPicker && onExport && (
        <CompetitionExportPicker
          competitions={competitions}
          onPick={id => {
            setShowExportPicker(false);
            onExport(id);
          }}
          onClose={() => setShowExportPicker(false)}
        />
      )}

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
          <Button
            size="sm"
            onClick={goToFirst}
            disabled={!hasPrev}
            title={t('competitionList.first_page')}
          >
            «
          </Button>
          <Button
            size="sm"
            onClick={goToPrev}
            disabled={!hasPrev}
            title={t('competitionList.prev_page')}
          >
            ‹
          </Button>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {startIndex + 1}–{endIndex} / {totalItems}
          </span>
          <Button
            size="sm"
            onClick={goToNext}
            disabled={!hasNext}
            title={t('competitionList.next_page')}
          >
            ›
          </Button>
          <Button
            size="sm"
            onClick={goToLast}
            disabled={!hasNext}
            title={t('competitionList.last_page')}
          >
            »
          </Button>
          <select
            className="form-select form-select-sm"
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            style={{ marginLeft: '0.5rem', fontSize: '0.875rem' }}
          >
            {pageSizeOptions.map(s => (
              <option key={s} value={s}>
                {t('competitionList.per_page', { n: s })}
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
