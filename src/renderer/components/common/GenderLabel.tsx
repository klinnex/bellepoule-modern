/**
 * BellePoule Modern - Libellé de genre avec icône lucide (#1532)
 * Licensed under GPL-3.0
 */

import React from 'react';
import { Mars, Venus } from 'lucide-react';
import { Gender } from '../../../shared/types';
import { Icon } from './Icon';

/** Masculin / Féminin avec icône ; toute autre valeur est affichée telle quelle */
export const genderLabel = (gender: string, t: (key: string) => string): React.ReactNode => {
  if (gender === Gender.MALE) {
    return (
      <>
        <Icon icon={Mars} /> {t('genders.male')}
      </>
    );
  }
  if (gender === Gender.FEMALE) {
    return (
      <>
        <Icon icon={Venus} /> {t('genders.female')}
      </>
    );
  }
  return gender;
};
