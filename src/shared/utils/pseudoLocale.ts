/**
 * Pseudo-localisation (debug i18n) : transforme une chaîne traduite en
 * `[!! Ŝçöŕé~~ !!]` (chaîne allongée d'environ 40 % pour révéler les
 * débordements sans traduction). Tout texte affiché sans ce marquage provient d'une chaîne
 * en dur, non passée par t().
 *
 * Activation : Paramètres → « Debug traductions » (effet immédiat), ou en
 * console `localStorage.setItem('bellepoule-pseudo-locale', '1')` puis recharger.
 */

export const PSEUDO_LOCALE_STORAGE_KEY = 'bellepoule-pseudo-locale';

const ACCENTED: Record<string, string> = {
  a: 'á',
  b: 'ƀ',
  c: 'ç',
  d: 'ð',
  e: 'é',
  f: 'ƒ',
  g: 'ĝ',
  h: 'ĥ',
  i: 'í',
  j: 'ĵ',
  k: 'ķ',
  l: 'ĺ',
  m: 'ɱ',
  n: 'ñ',
  o: 'ö',
  p: 'þ',
  q: 'ǫ',
  r: 'ŕ',
  s: 'š',
  t: 'ŧ',
  u: 'ü',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ý',
  z: 'ž',
  A: 'Á',
  B: 'Ɓ',
  C: 'Ç',
  D: 'Ð',
  E: 'É',
  F: 'Ƒ',
  G: 'Ĝ',
  H: 'Ĥ',
  I: 'Í',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ĺ',
  M: 'Ṁ',
  N: 'Ñ',
  O: 'Ö',
  P: 'Þ',
  Q: 'Ǫ',
  R: 'Ŕ',
  S: 'Ŝ',
  T: 'Ŧ',
  U: 'Ü',
  V: 'Ṽ',
  W: 'Ŵ',
  X: 'Ẋ',
  Y: 'Ý',
  Z: 'Ž',
};

/** Allongement simulé (~40 %) : les langues longues (de, ru, br…) dépassent le français d'autant. */
export const PSEUDO_STRETCH_RATIO = 0.4;

/** Accentue les lettres ASCII, préserve les paramètres `{{nom}}`, allonge de ~40 % (`~`), encadre de `[!! … !!]`. */
export function pseudoLocalize(value: string): string {
  const visibleLength = value.replace(/\{\{\w+\}\}/g, '').length;
  const pad = '~'.repeat(Math.ceil(visibleLength * PSEUDO_STRETCH_RATIO));
  const body = value
    .split(/(\{\{\w+\}\})/)
    .map(part =>
      /^\{\{\w+\}\}$/.test(part) ? part : part.replace(/[a-zA-Z]/g, c => ACCENTED[c] ?? c)
    )
    .join('');
  return `[!! ${body}${pad} !!]`;
}

/** Lit le drapeau d'activation (tolère un stockage indisponible). */
export function isPseudoLocaleEnabled(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    return storage?.getItem(PSEUDO_LOCALE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
