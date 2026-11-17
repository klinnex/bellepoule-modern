/**
 * BellePoule Modern - Mode Club (inventaire) : fiche d'un matériel (achat, garantie,
 * état, emplacement, numéro de série, quantité).
 * Licensed under GPL-3.0
 */
import React, { useMemo, useState } from 'react';
import type {
  ClubItem,
  ClubItemCategory,
  ClubItemCategoryDef,
  ClubItemCondition,
  ClubItemInput,
} from '../../../shared/types/club';
import { Weapon } from '../../../shared/types';
import {
  ITEM_CATEGORIES,
  ITEM_CONDITIONS,
  MAX_SERIES,
  normalizeItemInput,
  seriesNames,
} from '../../../shared/utils/clubInventory';
import { weaponLabel } from '../../../shared/utils/categoryLabel';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

const WEAPONS: Weapon[] = [Weapon.FOIL, Weapon.EPEE, Weapon.SABRE, Weapon.LASER];

interface ClubItemEditorProps {
  item: ClubItem | null;
  /** Catégories créées par le club, proposées après les standard */
  customCategories: ClubItemCategoryDef[];
  /** Catalogue de marques du club : suggestions (saisie libre aussi possible) */
  brands: string[];
  /** Lève une erreur (affichée) si l'enregistrement échoue */
  onSave: (data: ClubItemInput) => Promise<void>;
  /** Ajout en série (création seulement) : count fiches « Nom-01 … » */
  onSaveSeries?: (data: ClubItemInput, count: number) => Promise<void>;
  /** Noms déjà présents dans le club : aperçu de la série sans doublon */
  existingNames?: string[];
  onClose: () => void;
}

const numberOrUndef = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v));

export const ClubItemEditor: React.FC<ClubItemEditorProps> = ({
  item,
  customCategories,
  brands,
  onSave,
  onSaveSeries,
  existingNames = [],
  onClose,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<ClubItemCategory>(item?.category ?? 'mask');
  const [brand, setBrand] = useState(item?.brand ?? '');
  const [model, setModel] = useState(item?.model ?? '');
  const [serialNumber, setSerialNumber] = useState(item?.serialNumber ?? '');
  const [weapon, setWeapon] = useState<string>(item?.weapon ?? '');
  const [size, setSize] = useState(item?.size ?? '');
  const [color, setColor] = useState(item?.color ?? '');
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [purchaseDate, setPurchaseDate] = useState(item?.purchaseDate ?? '');
  const [purchasePrice, setPurchasePrice] = useState(
    item?.purchasePrice !== undefined ? String(item.purchasePrice) : ''
  );
  const [supplier, setSupplier] = useState(item?.supplier ?? '');
  const [invoiceRef, setInvoiceRef] = useState(item?.invoiceRef ?? '');
  const [warrantyUntil, setWarrantyUntil] = useState(item?.warrantyUntil ?? '');
  const [condition, setCondition] = useState<ClubItemCondition>(item?.condition ?? 'good');
  const [location, setLocation] = useState(item?.location ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [series, setSeries] = useState(false);
  const [seriesCount, setSeriesCount] = useState('10');
  const [error, setError] = useState<string | null>(null);
  const canSeries = !item && !!onSaveSeries;
  const isSeries = canSeries && series;
  const count = Number.parseInt(seriesCount, 10);
  const countOk = Number.isFinite(count) && count >= 1 && count <= MAX_SERIES;
  const preview = useMemo(() => {
    if (!isSeries || !countOk || !name.trim()) return '';
    try {
      const names = seriesNames(name, count, existingNames);
      return names.length > 1 ? `${names[0]} … ${names[names.length - 1]}` : names[0];
    } catch {
      return '';
    }
  }, [isSeries, countOk, count, name, existingNames]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    let data: ClubItemInput;
    try {
      // Même validation que le dépôt, pour afficher l'erreur avant l'aller-retour IPC
      data = normalizeItemInput({
        name,
        category,
        brand,
        model,
        serialNumber,
        weapon: (weapon || undefined) as Weapon | undefined,
        size,
        color,
        quantity: isSeries ? 1 : numberOrUndef(quantity),
        purchaseDate: purchaseDate || undefined,
        purchasePrice: numberOrUndef(purchasePrice),
        supplier,
        invoiceRef,
        warrantyUntil: warrantyUntil || undefined,
        condition,
        location,
        notes,
        retired: item?.retired ?? false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setSaving(true);
    try {
      if (isSeries && onSaveSeries) await onSaveSeries(data, count);
      else await onSave(data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={item ? t('clubInventory.edit_title') : t('clubInventory.new_title')}
      onClose={onClose}
      size="lg"
      scroll
      footer={
        <>
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button
            variant="primary"
            disabled={saving || !name.trim() || (isSeries && !countOk)}
            onClick={() => void submit()}
          >
            {t('actions.save')}
          </Button>
        </>
      }
    >
      <div className="club-grid-form">
        <label className="form-label club-grow">
          {t('clubInventory.name')} *
          <input
            className="form-input"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
        </label>
        {canSeries && (
          <div className="club-grow">
            <label className="club-nowrap">
              <input type="checkbox" checked={series} onChange={e => setSeries(e.target.checked)} />
              {t('clubInventory.series_toggle')}
            </label>
            {series && (
              <>
                <label className="form-label">
                  {t('clubInventory.series_count')}
                  <input
                    className="form-input"
                    type="number"
                    min={1}
                    max={MAX_SERIES}
                    value={seriesCount}
                    onChange={e => setSeriesCount(e.target.value)}
                  />
                </label>
                <p className="club-muted">
                  {preview
                    ? t('clubInventory.series_preview', { names: preview })
                    : t('clubInventory.series_help', { max: MAX_SERIES })}
                </p>
              </>
            )}
          </div>
        )}
        <label className="form-label">
          {t('clubInventory.category')}
          <select
            className="form-input"
            value={category}
            onChange={e => setCategory(e.target.value as ClubItemCategory)}
          >
            <optgroup label={t('clubInventory.categories_group_standard')}>
              {ITEM_CATEGORIES.map(c => (
                <option key={c} value={c}>
                  {t(`clubInventory.cat_${c}`)}
                </option>
              ))}
            </optgroup>
            {customCategories.length > 0 && (
              <optgroup label={t('clubInventory.categories_group_custom')}>
                {customCategories.map(c => (
                  <option key={c.key} value={c.key}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label className="form-label">
          {t('clubInventory.weapon')}
          <select className="form-input" value={weapon} onChange={e => setWeapon(e.target.value)}>
            <option value="">{t('clubInventory.any_weapon')}</option>
            {WEAPONS.map(w => (
              <option key={w} value={w}>
                {weaponLabel(w, t)}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label">
          {t('clubInventory.brand')}
          <input
            className="form-input"
            list="club-item-brands"
            value={brand}
            onChange={e => setBrand(e.target.value)}
          />
          <datalist id="club-item-brands">
            {brands.map(b => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        <label className="form-label">
          {t('clubInventory.model')}
          <input className="form-input" value={model} onChange={e => setModel(e.target.value)} />
        </label>
        <label className="form-label">
          {t('clubInventory.serial')}
          <input
            className="form-input"
            value={serialNumber}
            onChange={e => setSerialNumber(e.target.value)}
          />
        </label>
        <label className="form-label">
          {t('clubInventory.size')}
          <input className="form-input" value={size} onChange={e => setSize(e.target.value)} />
        </label>
        <label className="form-label">
          {t('clubInventory.color')}
          <input className="form-input" value={color} onChange={e => setColor(e.target.value)} />
        </label>
        <label className="form-label">
          {t('clubInventory.quantity')}
          <input
            className="form-input"
            type="number"
            min={1}
            max={999}
            value={isSeries ? '1' : quantity}
            disabled={isSeries}
            onChange={e => setQuantity(e.target.value)}
          />
        </label>
        <label className="form-label">
          {t('clubInventory.purchase_date')}
          <input
            className="form-input"
            type="date"
            value={purchaseDate}
            onChange={e => setPurchaseDate(e.target.value)}
          />
        </label>
        <label className="form-label">
          {t('clubInventory.purchase_price')}
          <input
            className="form-input"
            type="number"
            min={0}
            step="0.01"
            value={purchasePrice}
            onChange={e => setPurchasePrice(e.target.value)}
          />
        </label>
        <label className="form-label">
          {t('clubInventory.warranty_until')}
          <input
            className="form-input"
            type="date"
            value={warrantyUntil}
            onChange={e => setWarrantyUntil(e.target.value)}
          />
        </label>
        <label className="form-label">
          {t('clubInventory.supplier')}
          <input
            className="form-input"
            value={supplier}
            onChange={e => setSupplier(e.target.value)}
          />
        </label>
        <label className="form-label">
          {t('clubInventory.invoice')}
          <input
            className="form-input"
            value={invoiceRef}
            onChange={e => setInvoiceRef(e.target.value)}
          />
        </label>
        <label className="form-label">
          {t('clubInventory.condition')}
          <select
            className="form-input"
            value={condition}
            onChange={e => setCondition(e.target.value as ClubItemCondition)}
          >
            {ITEM_CONDITIONS.map(c => (
              <option key={c} value={c}>
                {t(`clubInventory.cond_${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label">
          {t('clubInventory.location')}
          <input
            className="form-input"
            value={location}
            onChange={e => setLocation(e.target.value)}
          />
        </label>
        <label className="form-label club-grow">
          {t('clubInventory.notes')}
          <textarea
            className="form-input"
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="club-error">
          {error}
        </p>
      )}
    </Modal>
  );
};
