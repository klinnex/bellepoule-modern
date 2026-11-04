/**
 * BellePoule Modern - Nationalités (code fédéral/CIO -> code ISO 3166-1 alpha-2)
 * Licensed under GPL-3.0
 *
 * Le code à 3 lettres (FRA, GER…) est celui stocké dans Fencer.nationality ;
 * le code ISO alpha-2 sert au drapeau (emoji) et au nom localisé (Intl.DisplayNames).
 */

const COUNTRY_PAIRS: readonly (readonly [string, string])[] = [
  ['AFG', 'AF'],
  ['ALB', 'AL'],
  ['ALG', 'DZ'],
  ['AND', 'AD'],
  ['ANG', 'AO'],
  ['ARG', 'AR'],
  ['ARM', 'AM'],
  ['ARU', 'AW'],
  ['AUS', 'AU'],
  ['AUT', 'AT'],
  ['AZE', 'AZ'],
  ['BAH', 'BS'],
  ['BRN', 'BH'],
  ['BAN', 'BD'],
  ['BAR', 'BB'],
  ['BLR', 'BY'],
  ['BEL', 'BE'],
  ['BIZ', 'BZ'],
  ['BEN', 'BJ'],
  ['BER', 'BM'],
  ['BHU', 'BT'],
  ['BOL', 'BO'],
  ['BIH', 'BA'],
  ['BOT', 'BW'],
  ['BRA', 'BR'],
  ['BRU', 'BN'],
  ['BUL', 'BG'],
  ['BUR', 'BF'],
  ['BDI', 'BI'],
  ['CAM', 'KH'],
  ['CMR', 'CM'],
  ['CAN', 'CA'],
  ['CPV', 'CV'],
  ['CAF', 'CF'],
  ['CHA', 'TD'],
  ['CHI', 'CL'],
  ['CHN', 'CN'],
  ['COL', 'CO'],
  ['COM', 'KM'],
  ['CGO', 'CG'],
  ['COD', 'CD'],
  ['CRC', 'CR'],
  ['CIV', 'CI'],
  ['CRO', 'HR'],
  ['CUB', 'CU'],
  ['CYP', 'CY'],
  ['CZE', 'CZ'],
  ['DEN', 'DK'],
  ['DJI', 'DJ'],
  ['DOM', 'DO'],
  ['ECU', 'EC'],
  ['EGY', 'EG'],
  ['ESA', 'SV'],
  ['GEQ', 'GQ'],
  ['ERI', 'ER'],
  ['EST', 'EE'],
  ['ETH', 'ET'],
  ['FIJ', 'FJ'],
  ['FIN', 'FI'],
  ['FRA', 'FR'],
  ['GAB', 'GA'],
  ['GAM', 'GM'],
  ['GEO', 'GE'],
  ['GER', 'DE'],
  ['GHA', 'GH'],
  ['GBR', 'GB'],
  ['GRE', 'GR'],
  ['GRN', 'GD'],
  ['GUA', 'GT'],
  ['GUI', 'GN'],
  ['GBS', 'GW'],
  ['GUY', 'GY'],
  ['HAI', 'HT'],
  ['HON', 'HN'],
  ['HKG', 'HK'],
  ['HUN', 'HU'],
  ['ISL', 'IS'],
  ['IND', 'IN'],
  ['INA', 'ID'],
  ['IRI', 'IR'],
  ['IRQ', 'IQ'],
  ['IRL', 'IE'],
  ['ISR', 'IL'],
  ['ITA', 'IT'],
  ['JAM', 'JM'],
  ['JPN', 'JP'],
  ['JOR', 'JO'],
  ['KAZ', 'KZ'],
  ['KEN', 'KE'],
  ['PRK', 'KP'],
  ['KOR', 'KR'],
  ['KOS', 'XK'],
  ['KUW', 'KW'],
  ['KGZ', 'KG'],
  ['LAO', 'LA'],
  ['LAT', 'LV'],
  ['LBN', 'LB'],
  ['LES', 'LS'],
  ['LBR', 'LR'],
  ['LBA', 'LY'],
  ['LIE', 'LI'],
  ['LTU', 'LT'],
  ['LUX', 'LU'],
  ['MAC', 'MO'],
  ['MAD', 'MG'],
  ['MAW', 'MW'],
  ['MAS', 'MY'],
  ['MDV', 'MV'],
  ['MLI', 'ML'],
  ['MLT', 'MT'],
  ['MTN', 'MR'],
  ['MRI', 'MU'],
  ['MEX', 'MX'],
  ['MDA', 'MD'],
  ['MON', 'MC'],
  ['MGL', 'MN'],
  ['MNE', 'ME'],
  ['MAR', 'MA'],
  ['MOZ', 'MZ'],
  ['MYA', 'MM'],
  ['NAM', 'NA'],
  ['NEP', 'NP'],
  ['NED', 'NL'],
  ['NZL', 'NZ'],
  ['NCA', 'NI'],
  ['NIG', 'NE'],
  ['NGR', 'NG'],
  ['MKD', 'MK'],
  ['NOR', 'NO'],
  ['OMA', 'OM'],
  ['PAK', 'PK'],
  ['PLE', 'PS'],
  ['PAN', 'PA'],
  ['PNG', 'PG'],
  ['PAR', 'PY'],
  ['PER', 'PE'],
  ['PHI', 'PH'],
  ['POL', 'PL'],
  ['POR', 'PT'],
  ['PUR', 'PR'],
  ['QAT', 'QA'],
  ['ROU', 'RO'],
  ['RUS', 'RU'],
  ['RWA', 'RW'],
  ['SMR', 'SM'],
  ['STP', 'ST'],
  ['KSA', 'SA'],
  ['SEN', 'SN'],
  ['SRB', 'RS'],
  ['SEY', 'SC'],
  ['SLE', 'SL'],
  ['SGP', 'SG'],
  ['SVK', 'SK'],
  ['SLO', 'SI'],
  ['SOL', 'SB'],
  ['SOM', 'SO'],
  ['RSA', 'ZA'],
  ['SSD', 'SS'],
  ['ESP', 'ES'],
  ['SRI', 'LK'],
  ['SUD', 'SD'],
  ['SUR', 'SR'],
  ['SWZ', 'SZ'],
  ['SWE', 'SE'],
  ['SUI', 'CH'],
  ['SYR', 'SY'],
  ['TPE', 'TW'],
  ['TJK', 'TJ'],
  ['TAN', 'TZ'],
  ['THA', 'TH'],
  ['TLS', 'TL'],
  ['TOG', 'TG'],
  ['TGA', 'TO'],
  ['TTO', 'TT'],
  ['TUN', 'TN'],
  ['TUR', 'TR'],
  ['TKM', 'TM'],
  ['UGA', 'UG'],
  ['UKR', 'UA'],
  ['UAE', 'AE'],
  ['USA', 'US'],
  ['URU', 'UY'],
  ['UZB', 'UZ'],
  ['VAN', 'VU'],
  ['VEN', 'VE'],
  ['VIE', 'VN'],
  ['YEM', 'YE'],
  ['ZAM', 'ZM'],
  ['ZIM', 'ZW'],
];

export interface Country {
  /** Code fédéral/CIO à 3 lettres, stocké dans Fencer.nationality */
  code: string;
  /** ISO 3166-1 alpha-2 */
  iso2: string;
}

export const COUNTRIES: readonly Country[] = COUNTRY_PAIRS.map(([code, iso2]) => ({ code, iso2 }));

const BY_CODE = new Map<string, Country>(COUNTRIES.map(c => [c.code, c]));

/** Drapeau emoji d'un code pays (CIO alpha-3 ou ISO alpha-2) ; '' si inconnu. */
export function flagEmoji(code: string | undefined | null): string {
  if (!code) return '';
  const upper = code.trim().toUpperCase();
  const iso2 = upper.length === 2 ? upper : BY_CODE.get(upper)?.iso2;
  if (!iso2 || !/^[A-Z]{2}$/.test(iso2)) return '';
  return String.fromCodePoint(...[...iso2].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** Nom localisé du pays (repli : le code). */
export function countryName(code: string, locale = 'fr'): string {
  const country = BY_CODE.get(code.trim().toUpperCase());
  if (!country) return code;
  try {
    const bcp47 = locale === 'zh-HK' ? 'zh-HK' : locale;
    return new Intl.DisplayNames([bcp47], { type: 'region' }).of(country.iso2) ?? code;
  } catch {
    return code;
  }
}

/** Pays triés par nom localisé. */
export function listCountries(locale = 'fr'): (Country & { name: string; flag: string })[] {
  return COUNTRIES.map(c => ({
    ...c,
    name: countryName(c.code, locale),
    flag: flagEmoji(c.code),
  })).sort((a, b) => a.name.localeCompare(b.name, locale));
}

/** "🇫🇷 FRA" (drapeau omis si inconnu). */
export function formatNationality(code: string | undefined | null): string {
  if (!code) return '';
  const flag = flagEmoji(code);
  return flag ? `${flag} ${code}` : code;
}
