/**
 * BellePoule Modern - Drapeau (image SVG embarquée ; les emoji drapeaux ne s'affichent pas sous Windows)
 * Licensed under GPL-3.0
 */

import React from 'react';
import { flagIso } from '../../../shared/utils/countries';

interface FlagProps {
  /** Code CIO (FRA) ou ISO2 (FR) */
  code: string | undefined | null;
}

const Flag: React.FC<FlagProps> = ({ code }) => {
  const iso = flagIso(code);
  if (!iso) return null;
  return <img src={`flags/${iso}.svg`} alt="" aria-hidden="true" className="flag-img" />;
};

export default Flag;
