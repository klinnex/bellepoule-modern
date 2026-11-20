/**
 * BellePoule Modern - New Competition Modal
 * Licensed under GPL-3.0
 */

import React, { useEffect, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  Competition,
  CompetitionSpecialMode,
  CustomFormulaConfig,
  Weapon,
  Gender,
  Category,
} from '../../shared/types';
import { useTranslation } from '../hooks/useTranslation';
import { createDefaultCustomFormula } from '../../shared/utils/tournamentTemplates';
import { FormulaBuilder } from './formula/FormulaBuilder';
import { getActiveLocale } from '../../shared/utils/localeFormat';
import { Button } from './common/Button';
import { buildDefaultCompetitionSettings } from '../../shared/utils/defaultCompetitionSettings';
import CompetitionPropertiesModal from './CompetitionPropertiesModal';
import { Settings } from 'lucide-react';
import FederalImportPanel from './FederalImportPanel';
import { useFederalImport, type FederalCreationPayload } from '../hooks/useFederalImport';
import type { FederalNotice } from '../../shared/utils/fileParser/federalImport';

interface NewCompetitionModalProps {
  onClose: () => void;
  /** imported : tireurs, équipes et arbitres lus dans les fichiers de l'extranet (#1938) */
  onCreate: (data: Partial<Competition>, imported?: FederalCreationPayload) => void;
}

const NewCompetitionModal: React.FC<NewCompetitionModalProps> = ({ onClose, onCreate }) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [weapon, setWeapon] = useState<Weapon>(Weapon.EPEE);
  const [gender, setGender] = useState<Gender>(Gender.MALE);
  const [category, setCategory] = useState<Category>(Category.SENIOR);
  const [location, setLocation] = useState('');
  // Horaires appel / scratch / début (HH:MM), lus dans le fichier ou saisis (#1938)
  const [checkInTime, setCheckInTime] = useState('');
  const [scratchTime, setScratchTime] = useState('');
  const [startTime, setStartTime] = useState('');
  const federalImport = useFederalImport();
  const [unlocked, setUnlocked] = useState(false);
  const header = federalImport.result?.header ?? null;
  const [customFormula, setCustomFormula] = useState<CustomFormulaConfig>(
    createDefaultCustomFormula()
  );
  const [specialMode, setSpecialMode] = useState<CompetitionSpecialMode | undefined>(undefined);
  const [isTeamEvent, setIsTeamEvent] = useState(false);
  const [teamSize, setTeamSize] = useState(3);
  const [teamReserveCount, setTeamReserveCount] = useState(1);
  const [laserTeamMode, setLaserTeamMode] = useState<'touches' | 'points'>('touches');
  // Sabre Laser équipe uniquement : relais FIE classique (cible cumulée
  // progressive) ou format arène (assauts indépendants 5 touches/3min, score
  // = total de points, règlement épreuve par équipe Sabre Laser).
  const [teamFormat, setTeamFormat] = useState<'fie-relay' | 'laser-arena'>('fie-relay');
  // Propriétés saisies dans la modale « Propriétés » : brouillon local à cette création,
  // appliqué uniquement à la compétition créée (rien n'est écrit en base avant « Ajouter »)
  const [showProperties, setShowProperties] = useState(false);
  const [propsDraft, setPropsDraft] = useState<{
    organizer?: string;
    settings?: Competition['settings'];
  } | null>(null);

  // Fichiers de l'extranet lus : pré-remplissage du formulaire (#1938)
  useEffect(() => {
    const imp = federalImport.result;
    if (!imp) return;
    const fields = imp.header?.fields;
    const guess = imp.fileNameGuess;
    if (fields?.title) setTitle(fields.title);
    if (fields?.date) setDate(fields.date);
    const w = fields?.weapon ?? guess.weapon;
    if (w) setWeapon(w);
    const g = fields?.gender ?? guess.gender;
    if (g) setGender(g);
    const c = fields?.category ?? guess.category;
    if (c) setCategory(c);
    if (fields?.location) setLocation(fields.location);
    setCheckInTime(fields?.checkInTime ?? '');
    setScratchTime(fields?.scratchTime ?? '');
    setStartTime(fields?.startTime ?? '');
    if (fields) setIsTeamEvent(fields.isTeamEvent);
    if (fields?.isTeamEvent && imp.teams.length > 0) {
      // Relais FIE : 3 titulaires, les membres en plus sont réservistes
      const largest = Math.max(...imp.teams.map(t => t.members.length));
      setTeamSize(Math.min(3, largest));
      setTeamReserveCount(Math.max(0, largest - 3));
    }
    setUnlocked(false);
  }, [federalImport.result]);

  // Champs fédéraux verrouillés : présents dans l'en-tête XML, non déverrouillés
  const isLocked = (present: unknown) => !!header && !unlocked && !!present;
  const locks = {
    date: isLocked(header?.fields.date),
    weapon: isLocked(header?.fields.weapon),
    gender: isLocked(header?.fields.gender),
    category: isLocked(header?.fields.category),
    location: isLocked(header?.fields.location),
    team: isLocked(header),
  };
  const today = new Date().toISOString().split('T')[0];
  const extraNotices: FederalNotice[] =
    federalImport.result && date < today ? [{ code: 'pastDate' }] : [];

  const handleWeaponChange = (w: Weapon) => {
    setWeapon(w);
    if (w === Weapon.LASER) setGender(Gender.MIXED);
  };

  const buildSettings = () =>
    buildDefaultCompetitionSettings({
      weapon,
      category,
      isTeamEvent,
      teamSize,
      teamReserveCount,
      laserTeamMode,
      teamFormat,
      customFormula,
      specialMode,
    });

  // Objet transmis à la modale Propriétés : champs du formulaire + brouillon éventuel
  const draftCompetition = {
    id: '',
    title,
    date: new Date(date),
    weapon,
    gender,
    category,
    location,
    organizer: propsDraft?.organizer ?? '',
    settings: propsDraft?.settings ?? buildSettings(),
  } as Competition;

  const handlePropertiesSave = (updates: Partial<Competition>) => {
    if (updates.title !== undefined) setTitle(updates.title);
    if (updates.date) setDate(new Date(updates.date).toISOString().split('T')[0]);
    if (updates.location !== undefined) setLocation(updates.location);
    if (updates.weapon) setWeapon(updates.weapon);
    if (updates.gender !== undefined) setGender(updates.gender);
    if (updates.category) setCategory(updates.category);
    setPropsDraft({ organizer: updates.organizer, settings: updates.settings });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload = federalImport.payload ?? undefined;
    const baseSettings = propsDraft?.settings ?? buildSettings();
    const schedule = {
      ...(checkInTime ? { checkIn: checkInTime } : {}),
      ...(scratchTime ? { scratch: scratchTime } : {}),
      ...(startTime ? { start: startTime } : {}),
    };
    const settings = baseSettings && {
      ...baseSettings,
      ...(header
        ? { federal: { ...header.federal, ...(unlocked ? { unlocked: true } : {}) } }
        : {}),
      ...(Object.keys(schedule).length > 0 ? { schedule } : {}),
      // Niveau GREG proposé à l'import (fichier BellePoule ou Domaine fédéral), modifiable ensuite (#1328)
      ...(header?.fields.gregLevel ? { gregLevel: header.fields.gregLevel } : {}),
      // Arbitres importés : gestion des arbitres activée d'office (#1504)
      ...(payload && payload.referees.length > 0 ? { refereeFeatureEnabled: true } : {}),
    };
    const organizer = propsDraft?.organizer || header?.fields.organizer;

    onCreate(
      {
        title: title || `Compétition du ${new Date(date).toLocaleDateString(getActiveLocale())}`,
        date: new Date(date),
        weapon,
        gender,
        category,
        location,
        ...(organizer ? { organizer } : {}),
        color: getRandomColor(),
        // Tournoi des rapières : binômes gérés par le mode spécial, pas par les équipes classiques
        isTeamEvent: isTeamEvent && !(weapon === Weapon.CUSTOM && specialMode),
        ...(settings ? { settings } : {}),
      },
      payload
    );
  };

  const getRandomColor = () => {
    const colors = [
      '#3B82F6',
      '#10B981',
      '#F59E0B',
      '#EF4444',
      '#8B5CF6',
      '#EC4899',
      '#06B6D4',
      '#84CC16',
      '#F97316',
      '#6366F1',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const isCustom = weapon === Weapon.CUSTOM;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div
          ref={modalRef}
          className="modal"
          style={isCustom ? { maxWidth: '92vw', width: '1100px' } : undefined}
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-header">
            <h2 className="modal-title">{t('competition.new')}</h2>
            <button className="btn-close" onClick={onClose} aria-label={t('actions.close')}>
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <FederalImportPanel
                state={federalImport}
                extraNotices={extraNotices}
                locked={!unlocked}
                onUnlock={() => setUnlocked(true)}
              />

              <div className="form-group">
                <label className="form-label" htmlFor="new-competition-title">
                  {t('competition.title')}
                </label>
                <input
                  id="new-competition-title"
                  type="text"
                  className="form-input"
                  placeholder={t('newCompetition.title_ph')}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="new-competition-date">
                  {t('competition.date')}
                </label>
                <input
                  id="new-competition-date"
                  type="date"
                  className="form-input"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  disabled={locks.date}
                  required
                />
              </div>

              <div className="new-competition-modal-1">
                {(
                  [
                    ['check_in', checkInTime, setCheckInTime],
                    ['scratch', scratchTime, setScratchTime],
                    ['start', startTime, setStartTime],
                  ] as const
                ).map(([key, value, setValue]) => (
                  <div className="form-group" key={key}>
                    <label className="form-label" htmlFor={`new-competition-${key}`}>
                      {t(`federalImport.${key}`)}
                    </label>
                    <input
                      id={`new-competition-${key}`}
                      type="time"
                      className="form-input"
                      value={value}
                      onChange={e => setValue(e.target.value)}
                    />
                  </div>
                ))}
              </div>

              <div className="new-competition-modal-1">
                <div className="form-group">
                  <label className="form-label" htmlFor="new-competition-weapon">
                    {t('competition.weapon')}
                  </label>
                  <select
                    id="new-competition-weapon"
                    className="form-input form-select"
                    value={weapon}
                    onChange={e => handleWeaponChange(e.target.value as Weapon)}
                    disabled={locks.weapon}
                  >
                    <option value={Weapon.EPEE}>{t('weapons.epee')}</option>
                    <option value={Weapon.FOIL}>{t('weapons.foil')}</option>
                    <option value={Weapon.SABRE}>{t('weapons.sabre')}</option>
                    <option value={Weapon.LASER}>{t('weapons.laser')}</option>
                    <option value={Weapon.CUSTOM}>{t('newCompetition.custom')}</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="new-competition-gender">
                    {t('competition.gender')}
                  </label>
                  <select
                    id="new-competition-gender"
                    className="form-input form-select"
                    value={gender}
                    onChange={e => setGender(e.target.value as Gender)}
                    disabled={weapon === Weapon.LASER || locks.gender}
                  >
                    <option value={Gender.MALE}>{t('genders.male')}</option>
                    <option value={Gender.FEMALE}>{t('genders.female')}</option>
                    <option value={Gender.MIXED}>{t('genders.mixed')}</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="new-competition-category">
                    {t('competition.category')}
                  </label>
                  <select
                    id="new-competition-category"
                    className="form-input form-select"
                    value={category}
                    onChange={e => setCategory(e.target.value as Category)}
                    disabled={locks.category}
                  >
                    <option value={Category.U9}>{t('categories.U9')}</option>
                    <option value={Category.U11}>{t('categories.U11')}</option>
                    <option value={Category.U13}>{t('categories.U13')}</option>
                    <option value={Category.U15}>{t('categories.U15')}</option>
                    <option value={Category.U17}>{t('categories.U17')}</option>
                    <option value={Category.U20}>{t('categories.U20')}</option>
                    <option value={Category.SENIOR}>{t('categories.senior')}</option>
                    <option value={Category.V1}>{t('categories.V1')} (40-49)</option>
                    <option value={Category.V2}>{t('categories.V2')} (50-59)</option>
                    <option value={Category.V3}>{t('categories.V3')} (60-69)</option>
                    <option value={Category.V4}>{t('categories.V4')} (70+)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="u-row cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isTeamEvent}
                    onChange={e => setIsTeamEvent(e.target.checked)}
                    disabled={locks.team}
                  />
                  <span className="form-label new-competition-modal-2">
                    {t('newCompetition.team')}
                  </span>
                </label>
              </div>

              {isTeamEvent && (
                <div
                  className="form-group team-settings-panel"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: weapon === Weapon.LASER ? '1fr 1fr 1fr 1fr' : '1fr 1fr',
                    gap: '1rem',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                  }}
                >
                  <div className="form-group">
                    <label className="form-label" htmlFor="new-competition-starters">
                      {t('newCompetition.starters')}
                    </label>
                    <input
                      id="new-competition-starters"
                      type="number"
                      className="form-input"
                      min={1}
                      max={10}
                      value={teamSize}
                      onChange={e => setTeamSize(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="new-competition-reserves">
                      {t('newCompetition.reserves')}
                    </label>
                    <input
                      id="new-competition-reserves"
                      type="number"
                      className="form-input"
                      min={0}
                      max={5}
                      value={teamReserveCount}
                      onChange={e => setTeamReserveCount(Math.max(0, Number(e.target.value) || 0))}
                    />
                  </div>
                  {weapon === Weapon.LASER && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="new-competition-laser-target">
                        {t('newCompetition.laser_target')}
                      </label>
                      <select
                        id="new-competition-laser-target"
                        className="form-input form-select"
                        value={laserTeamMode}
                        onChange={e => setLaserTeamMode(e.target.value as 'touches' | 'points')}
                      >
                        <option value="touches">{t('newCompetition.touches')}</option>
                        <option value="points">{t('newCompetition.points')}</option>
                      </select>
                    </div>
                  )}
                  {weapon === Weapon.LASER && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="new-competition-format">
                        {t('newCompetition.format')}
                      </label>
                      <select
                        id="new-competition-format"
                        className="form-input form-select"
                        value={teamFormat}
                        onChange={e => setTeamFormat(e.target.value as 'fie-relay' | 'laser-arena')}
                      >
                        <option value="fie-relay">{t('newCompetition.fie_relay')}</option>
                        <option value="laser-arena">{t('newCompetition.laser_arena')}</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="new-competition-location">
                  {t('competition.location')} ({t('actions.default')})
                </label>
                <input
                  id="new-competition-location"
                  type="text"
                  className="form-input"
                  placeholder={t('newCompetition.location_ph')}
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  disabled={locks.location}
                />
              </div>

              {/* Constructeur de formule — visible uniquement pour arme CUSTOM */}
              {isCustom && (
                <div className="form-group custom-formula-section">
                  <label className="form-label new-competition-modal-3">
                    {t('newCompetition.formula_builder')}
                  </label>
                  <FormulaBuilder
                    formula={customFormula}
                    fencerCount={32}
                    onChange={setCustomFormula}
                    specialMode={specialMode}
                    onSpecialModeChange={setSpecialMode}
                  />
                </div>
              )}
            </div>

            <div className="modal-footer">
              <Button type="button" onClick={() => setShowProperties(true)}>
                <Settings size={14} /> {t('competitionHeader.properties')}
              </Button>
              <Button type="button" onClick={onClose}>
                {t('actions.cancel')}
              </Button>
              <Button type="submit" variant="primary">
                {t('newCompetition.submit')}
              </Button>
            </div>
          </form>
        </div>
      </div>
      {/* Frère (et non enfant) de l'overlay : les clics et Échap ne remontent pas à la création */}
      {showProperties && (
        <CompetitionPropertiesModal
          competition={draftCompetition}
          onSave={handlePropertiesSave}
          onClose={() => setShowProperties(false)}
        />
      )}
    </>
  );
};

export default React.memo(NewCompetitionModal);
