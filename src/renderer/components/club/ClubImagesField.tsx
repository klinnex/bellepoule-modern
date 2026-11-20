/**
 * BellePoule Modern - Mode Club (#1872) : images d'un exercice (schémas, photos), 3 max.
 * Licensed under GPL-3.0
 */
import React, { useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { MAX_IMAGES, isValidImage } from '../../../shared/utils/clubPlan';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { useToast } from '../Toast';
import { imageFileToDataUrl } from './clubFiles';

interface ClubImagesFieldProps {
  images: string[];
  onChange: (images: string[]) => void;
  /** Libellé accessible (ex. « Images de l'exercice 2 ») */
  label: string;
}

export const ClubImagesField: React.FC<ClubImagesFieldProps> = ({ images, onChange, label }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const input = useRef<HTMLInputElement>(null);

  const add = async (files: FileList | null) => {
    if (!files) return;
    const next = [...images];
    for (const f of Array.from(files)) {
      if (next.length >= MAX_IMAGES) break;
      const url = await imageFileToDataUrl(f);
      if (isValidImage(url)) next.push(url);
      else showToast(t('clubImages.invalid'), 'error');
    }
    onChange(next);
  };

  return (
    <div className="club-images" role="group" aria-label={label}>
      {images.map((src, i) => (
        <span key={i} className="club-image-thumb">
          <img src={src} alt="" />
          <Button
            size="sm"
            variant="ghost"
            className="club-image-remove"
            icon={<X size={12} aria-hidden="true" />}
            aria-label={t('clubImages.remove', { n: i + 1 })}
            title={t('clubImages.remove', { n: i + 1 })}
            onClick={() => onChange(images.filter((_, j) => j !== i))}
          />
        </span>
      ))}
      {images.length < MAX_IMAGES && (
        <>
          <input
            ref={input}
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            aria-label={t('clubImages.add')}
            onChange={e => {
              void add(e.target.files);
              e.target.value = '';
            }}
          />
          <Button
            size="sm"
            icon={<ImagePlus size={14} aria-hidden="true" />}
            onClick={() => input.current?.click()}
          >
            {t('clubImages.add')}
          </Button>
        </>
      )}
    </div>
  );
};
