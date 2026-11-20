/**
 * BellePoule Modern - Competition Properties Modal
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  HINT,
  HINT_INDENT,
  CHECK_LABEL_SM,
  MR,
  SM,
  GRID2,
} from './competitionPropertiesModal.styles';
import {
  Competition,
  CustomFormulaConfig,
  Weapon,
  Gender,
  Category,
  CompetitionSettings,
} from '../../shared/types';
import { useTranslation } from '../hooks/useTranslation';
import { GREG_DEFAULT_LEVEL, GREG_LEVELS, GregLevel } from '../../shared/utils/gregPublication';
import { createDefaultCustomFormula } from '../../shared/utils/tournamentTemplates';
import {
  deriveSettingsFromFormula,
  isRapieresMode,
} from '../../shared/utils/customFormulaSettings';
import { FormulaBuilder } from './formula/FormulaBuilder';
import { Button } from './common/Button';
import { PropertiesFormulaTab } from './formula/PropertiesFormulaTab';
import {
  FormulaDraft,
  applyCoherence,
  draftCoherenceIssues,
  draftFromSettings,
  draftToSettings,
} from './formula/formulaDraft';

interface CompetitionPropertiesModalProps {
  competition: Competition;
  onSave: (updates: Partial<Competition>) => void;
  onClose: () => void;
}

const CompetitionPropertiesModal: React.FC<CompetitionPropertiesModalProps> = ({
  competition,
  onSave,
  onClose,
}) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const { t } = useTranslation();
  const [title, setTitle] = useState(competition.title);
  const [date, setDate] = useState(new Date(competition.date).toISOString().split('T')[0]);
  const [location, setLocation] = useState(competition.location || '');
  const [organizer, setOrganizer] = useState(competition.organizer || '');
  const [weapon, setWeapon] = useState<Weapon>(competition.weapon);
  const [gender, setGender] = useState<Gender>(competition.gender);
  const [category, setCategory] = useState<Category>(competition.category);

  // Formule : structure et réglages par phase (#2013), repli unifié
  const [formula, setFormula] = useState<FormulaDraft>(() =>
    draftFromSettings(competition.weapon, competition.category, competition.settings)
  );
  const patchFormula = (patch: Partial<FormulaDraft>) =>
    setFormula(prev => ({ ...prev, ...patch }));
  // Signature des matchs de tableau : onglet Arbitrage (#2013, Q10)
  const [signTableauMatches, setSignTableauMatches] = useState(
    competition.settings?.signTableauMatches ?? false
  );
  // Relevé après changement de catégorie / arme : « Garder » masque l'alerte
  const [coherenceKept, setCoherenceKept] = useState(false);

  const [refereeFeatureEnabled, setRefereeFeatureEnabled] = useState(
    competition.settings?.refereeFeatureEnabled ?? false
  );
  const [blackCardEnabled, setBlackCardEnabled] = useState(
    competition.settings?.blackCardEnabled ?? false
  );
  const [trainerCommentsEnabled, setTrainerCommentsEnabled] = useState(
    competition.settings?.trainerCommentsEnabled ?? false
  );
  const [expertMode, setExpertMode] = useState(competition.settings?.expertMode ?? true);
  // Dossier dédié aux sauvegardes de cette compétition (facultatif, vide = dossier global)
  const [backupDir, setBackupDir] = useState(competition.settings?.backupDir ?? '');
  // Niveau GREG de la publication des résultats (#1328) ; absent = Autre
  const [gregLevel, setGregLevel] = useState<GregLevel>(
    competition.settings?.gregLevel ?? GREG_DEFAULT_LEVEL
  );
  const chooseBackupDir = () => {
    void window.electronAPI?.backup?.pickCompetitionDir?.().then(dir => {
      if (dir) setBackupDir(dir);
    });
  };
  const [maxRefereesPerPool, setMaxRefereesPerPool] = useState(
    competition.settings?.maxRefereesPerPool ?? 1
  );
  const [maxRefereesPerMatch, setMaxRefereesPerMatch] = useState(
    competition.settings?.maxRefereesPerMatch ?? 1
  );

  // Formule personnalisée (arme CUSTOM)
  const [customFormula, setCustomFormula] = useState<CustomFormulaConfig>(
    competition.settings?.customFormula ?? createDefaultCustomFormula()
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setActiveTab('general');
      return;
    }

    const settings: CompetitionSettings = {
      ...(competition.settings || {}),
      ...draftToSettings(formula, weapon, competition.settings?.questConfig),
      signTableauMatches,
      manualRanking: competition.settings?.manualRanking ?? false,
      defaultRanking: competition.settings?.defaultRanking ?? 9999,
      randomScore: competition.settings?.randomScore ?? false,
      minTeamSize: competition.settings?.minTeamSize ?? 3,
      refereeFeatureEnabled,
      blackCardEnabled,
      trainerCommentsEnabled,
      expertMode,
      // Vide = pas de dossier dédié : clé retirée (JSON), le dossier global s'applique
      backupDir: backupDir || undefined,
      gregLevel,
      ...(expertMode ? { maxRefereesPerPool, maxRefereesPerMatch } : {}),
      ...(weapon === Weapon.CUSTOM ? { customFormula } : {}),
      // Formule personnalisée : ses réglages priment (#1125)
      ...(weapon === Weapon.CUSTOM ? deriveSettingsFromFormula(customFormula) : {}),
    };

    onSave({
      title,
      date: new Date(date),
      location,
      organizer,
      weapon,
      gender,
      category,
      settings,
    });
    onClose();
  };

  const isCustomWeapon = weapon === Weapon.CUSTOM;
  const coherenceIssues = isCustomWeapon ? [] : draftCoherenceIssues(formula, weapon, category);
  const contextChanged = category !== competition.category || weapon !== competition.weapon;

  type TabId = 'general' | 'formula' | 'refereeing';
  const TABS: { id: TabId; label: string }[] = [
    { id: 'general', label: t('properties.general_info') },
    { id: 'formula', label: t('properties.formula') },
    { id: 'refereeing', label: t('properties.refereeing') },
  ];
  const [activeTab, setActiveTab] = useState<TabId>('general');

  function renderGeneral() {
    return (
      <div>
        <div className="form-group">
          <label>{t('properties.backup_dir_label')}</label>
          <p style={HINT}>{t('properties.backup_dir_hint')}</p>
          <p style={HINT} data-testid="competition-backup-dir">
            <code>{backupDir || t('properties.backup_dir_none')}</code>
          </p>
          <div className="u-row">
            <Button type="button" style={SM} onClick={chooseBackupDir}>
              {t('properties.backup_dir_choose')}
            </Button>
            {backupDir && (
              <Button type="button" style={SM} onClick={() => setBackupDir('')}>
                {t('properties.backup_dir_clear')}
              </Button>
            )}
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="title">{t('competition.title')}</label>
          <input
            type="text"
            id="title"
            className="form-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
          />
        </div>

        <div style={GRID2}>
          <div className="form-group">
            <label htmlFor="date">{t('competition.date')}</label>
            <input
              type="date"
              id="date"
              className="form-input"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="location">{t('competition.location')}</label>
            <input
              type="text"
              id="location"
              className="form-input"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="organizer">{t('competition.organizer')}</label>
          <input
            type="text"
            id="organizer"
            className="form-input"
            value={organizer}
            onChange={e => setOrganizer(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="greg-level">{t('properties.greg_level_label')}</label>
          <select
            id="greg-level"
            className="form-input form-select"
            value={gregLevel}
            onChange={e => setGregLevel(e.target.value as GregLevel)}
          >
            {GREG_LEVELS.map(code => (
              <option key={code} value={code}>
                {t(`properties.greg_level_${code}`)}
              </option>
            ))}
          </select>
          <div style={HINT}>{t('properties.greg_level_hint')}</div>
        </div>
        <div className="is-80ae82">
          <div className="form-group">
            <label htmlFor="weapon">{t('competition.weapon')}</label>
            <select
              id="weapon"
              className="form-input form-select"
              value={weapon}
              onChange={e => {
                const w = e.target.value as Weapon;
                setWeapon(w);
                if (w === Weapon.LASER) setGender(Gender.MIXED);
              }}
            >
              <option value="E">{t('weapons.epee')}</option>
              <option value="F">{t('weapons.foil')}</option>
              <option value="S">{t('weapons.sabre')}</option>
              <option value="L">{t('weapons.laser')}</option>
              <option value="C">{t('properties.weapon_custom')}</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="gender">{t('competition.gender')}</label>
            <select
              id="gender"
              className="form-input form-select"
              value={gender}
              onChange={e => setGender(e.target.value as Gender)}
            >
              <option value="M">{t('genders.male')}</option>
              <option value="F">{t('genders.female')}</option>
              <option value="X">{t('genders.mixed')}</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="category">{t('competition.category')}</label>
            <select
              id="category"
              className="form-input form-select"
              value={category}
              onChange={e => setCategory(e.target.value as Category)}
            >
              <option value={Category.U9}>{t('categories.U9')}</option>
              <option value={Category.U11}>{t('categories.U11')}</option>
              <option value={Category.U13}>{t('categories.U13')}</option>
              <option value={Category.U15}>{t('categories.U15')}</option>
              <option value={Category.U17}>{t('categories.U17')}</option>
              <option value={Category.U20}>{t('categories.U20')}</option>
              <option value={Category.SENIOR}>{t('categories.senior')}</option>
              <option value={Category.V1}>{t('categories.V1')}</option>
              <option value={Category.V2}>{t('categories.V2')}</option>
              <option value={Category.V3}>{t('categories.V3')}</option>
              <option value={Category.V4}>{t('categories.V4')}</option>
            </select>
          </div>
        </div>
        {contextChanged && !coherenceKept && coherenceIssues.length > 0 && (
          <div
            className="formula-coherence has-issues"
            role="alert"
            data-testid="coherence-category-alert"
          >
            <p>{t('properties.coherence_category_changed', { count: coherenceIssues.length })}</p>
            <div className="u-row mt-2">
              <Button
                type="button"
                variant="primary"
                style={SM}
                onClick={() => patchFormula(applyCoherence(coherenceIssues))}
              >
                {t('properties.coherence_apply_all')}
              </Button>
              <Button type="button" style={SM} onClick={() => setCoherenceKept(true)}>
                {t('properties.coherence_keep')}
              </Button>
              <Button type="button" style={SM} onClick={() => setActiveTab('formula')}>
                {t('properties.coherence_show')}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderFormula() {
    return (
      <div>
        {isCustomWeapon && (
          <FormulaBuilder
            formula={customFormula}
            fencerCount={32}
            onChange={setCustomFormula}
            advancementDisabled={isRapieresMode(competition.weapon, competition.settings)}
            defaultRuleSet={
              isRapieresMode(competition.weapon, competition.settings) ? 'modern' : 'laser'
            }
          />
        )}
        {!isCustomWeapon && (
          <PropertiesFormulaTab
            draft={formula}
            onChange={patchFormula}
            weapon={weapon}
            category={category}
          />
        )}
      </div>
    );
  }

  function renderRefereeing() {
    return (
      <div>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={signTableauMatches}
              onChange={e => setSignTableauMatches(e.target.checked)}
              style={MR}
            />
            {t('competition.sign_tableau_matches_label')}
          </label>
          <small style={HINT_INDENT}>{t('competition.sign_tableau_matches_description')}</small>
        </div>
        <div className="form-group">
          <label style={CHECK_LABEL_SM}>
            <input
              type="checkbox"
              checked={refereeFeatureEnabled}
              onChange={e => setRefereeFeatureEnabled(e.target.checked)}
            />
            {t('properties.referees_enable')}
          </label>
          <small style={HINT_INDENT}>{t('properties.referees_enable_hint')}</small>
        </div>
        <div className="form-group is-342d98">
          <label style={CHECK_LABEL_SM}>
            <input
              type="checkbox"
              checked={blackCardEnabled}
              onChange={e => setBlackCardEnabled(e.target.checked)}
            />
            {t('properties.black_card_enable')}
          </label>
          <small style={HINT_INDENT}>{t('properties.black_card_hint')}</small>
        </div>
        <div className="form-group is-342d98">
          <label style={CHECK_LABEL_SM}>
            <input
              type="checkbox"
              checked={trainerCommentsEnabled}
              onChange={e => setTrainerCommentsEnabled(e.target.checked)}
            />
            {t('properties.trainers_enable')}
          </label>
          <small style={HINT_INDENT}>{t('properties.trainers_hint')}</small>
        </div>
        <div className="form-group is-342d98">
          <label style={CHECK_LABEL_SM}>
            <input
              type="checkbox"
              checked={expertMode}
              onChange={e => setExpertMode(e.target.checked)}
            />
            {t('properties.expert_mode')}
          </label>
          <small style={HINT_INDENT}>{t('properties.expert_mode_hint')}</small>
        </div>
        {expertMode && (
          <div className="is-70cddd">
            <div className="form-group">
              <label htmlFor="maxRefereesPerPool" style={{ ...SM, color: 'var(--color-text)' }}>
                {t('properties.max_referees_pool')}
              </label>
              <input
                type="number"
                id="maxRefereesPerPool"
                className="form-input"
                value={maxRefereesPerPool}
                min={1}
                max={10}
                onChange={e => setMaxRefereesPerPool(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="maxRefereesPerMatch" style={{ ...SM, color: 'var(--color-text)' }}>
                {t('properties.max_referees_match')}
              </label>
              <input
                type="number"
                id="maxRefereesPerMatch"
                className="form-input"
                value={maxRefereesPerMatch}
                min={1}
                max={10}
                onChange={e => setMaxRefereesPerMatch(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Clic extérieur sans effet : fermeture via ✕ / Échap (#1033)
  return (
    <div className="modal-overlay">
      <div
        ref={modalRef}
        className="modal properties-modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: weapon === Weapon.CUSTOM ? '96vw' : '800px',
          // Format à la carte : plus large pour que la simulation ne soit pas coupée (#1826)
          width: weapon === Weapon.CUSTOM ? '1280px' : undefined,
        }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2>{t('menu.competition_properties')}</h2>
          <button className="btn-close" aria-label={t('actions.close')} onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="settings-layout">
            <nav className="settings-nav" role="tablist" aria-orientation="vertical">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`properties-tab-${tab.id}`}
                  aria-selected={tab.id === activeTab}
                  aria-controls="properties-panel"
                  className={`settings-nav-item${tab.id === activeTab ? ' is-active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="settings-nav-label">{tab.label}</span>
                </button>
              ))}
            </nav>
            <div
              className="settings-panel"
              id="properties-panel"
              role="tabpanel"
              aria-labelledby={`properties-tab-${activeTab}`}
            >
              {activeTab === 'general' && renderGeneral()}
              {activeTab === 'formula' && renderFormula()}
              {activeTab === 'refereeing' && renderRefereeing()}
            </div>
          </div>

          <div className="modal-footer">
            <Button type="button" onClick={onClose}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('properties.save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default React.memo(CompetitionPropertiesModal);
