/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: node scripts/generate-calendar.mjs
 *
 * Month lengths for the Bikram Sambat calendar, derived by consensus of three
 * independent implementations (bikram-sambat, nepali-date-converter,
 * @nakarmi23/bikram-sambat). Each year is encoded as 12 base-36 digits.
 *
 * Of BS 2000-2090: 87 years have full three-source agreement.
 * 4 years (2084, 2085, 2086, 2090) have only two-of-three agreement
 * and are flagged provisional — see README.
 */

/** AD date corresponding to BS 2000/01/01. */
export const EPOCH_AD = { year: 1943, month: 4, day: 14 } as const;

export const FIRST_BS_YEAR = 2000;
export const LAST_BS_YEAR = 2090;

/** Count of years with full three-source agreement. */
export const VERIFIED_YEAR_COUNT = 87;

/** Years where sources disagreed and a two-of-three majority was taken. */
export const PROVISIONAL_BS_YEARS: readonly number[] = [2084, 2085, 2086, 2090];

const ENCODED: readonly string[] = [
  "uwvwvuuututv", // 2000
  "vvwvvvututuu", // 2001
  "vvwwvuututuu", // 2002
  "vwvwvuuuttuv", // 2003
  "uwvwvuuututv", // 2004
  "vvwvvvututuu", // 2005
  "vvwwvuututuu", // 2006
  "vwvwvuuuttuv", // 2007
  "vvvwvvtuuttv", // 2008
  "vvwvvvututuu", // 2009
  "vvwwvuututuu", // 2010
  "vwvwvuuuttuv", // 2011
  "vvvwvvtuutuu", // 2012
  "vvwvvvututuu", // 2013
  "vvwwvuututuu", // 2014
  "vwvwvuuuttuv", // 2015
  "vvvwvvtuutuu", // 2016
  "vvwvvvututuu", // 2017
  "vwvwvuututuu", // 2018
  "vwvwvuuututv", // 2019
  "vvvwvvututuu", // 2020
  "vvwvvvututuu", // 2021
  "vwvwvuuuttuu", // 2022
  "vwvwvuuututv", // 2023
  "vvvwvvututuu", // 2024
  "vvwvvvututuu", // 2025
  "vwvwvuuuttuv", // 2026
  "uwvwvuuututv", // 2027
  "vvwvvvututuu", // 2028
  "vvwvwuututuu", // 2029
  "vwvwvuuuttuv", // 2030
  "uwvwvuuututv", // 2031
  "vvwvvvututuu", // 2032
  "vvwwvuututuu", // 2033
  "vwvwvuuuttuv", // 2034
  "uwvwvvtuuttv", // 2035
  "vvwvvvututuu", // 2036
  "vvwwvuututuu", // 2037
  "vwvwvuuuttuv", // 2038
  "vvvwvvtuutuu", // 2039
  "vvwvvvututuu", // 2040
  "vvwwvuututuu", // 2041
  "vwvwvuuuttuv", // 2042
  "vvvwvvtuutuu", // 2043
  "vvwvvvututuu", // 2044
  "vwvwvuututuu", // 2045
  "vwvwvuuuttuv", // 2046
  "vvvwvvututuu", // 2047
  "vvwvvvututuu", // 2048
  "vwvwvuuuttuu", // 2049
  "vwvwvuuututv", // 2050
  "vvvwvvututuu", // 2051
  "vvwvvvututuu", // 2052
  "vwvwvuuuttuu", // 2053
  "vwvwvuuututv", // 2054
  "vvwvvvututuu", // 2055
  "vvwvwuututuu", // 2056
  "vwvwvuuuttuv", // 2057
  "uwvwvuuututv", // 2058
  "vvwvvvututuu", // 2059
  "vvwwvuututuu", // 2060
  "vwvwvuuuttuv", // 2061
  "uwvwvvtututv", // 2062
  "vvwvvvututuu", // 2063
  "vvwwvuututuu", // 2064
  "vwvwvuuuttuv", // 2065
  "vvvwvvtuuttv", // 2066
  "vvwvvvututuu", // 2067
  "vvwwvuututuu", // 2068
  "vwvwvuuuttuv", // 2069
  "vvvwvvtuutuu", // 2070
  "vvwvvvututuu", // 2071
  "vwvwvuututuu", // 2072
  "vwvwvuuuttuv", // 2073
  "vvvwvvututuu", // 2074
  "vvwvvvututuu", // 2075
  "vwvwvuuuttuu", // 2076
  "vwvwvuuututv", // 2077
  "vvvwvvututuu", // 2078
  "vvwvvvututuu", // 2079
  "vwvwvuuuttuu", // 2080
  "vwvwvuuututv", // 2081
  "vvwvvvututuu", // 2082
  "vvwvvvututuu", // 2083
  "vvwvvuuutuuu", // 2084
  "vwvwuvuutuuu", // 2085
  "uwvwvuuutuuu", // 2086
  "vvwvvvuutuuu", // 2087
  "uvwwuvuutuuu", // 2088
  "uwvwvuuutuuu", // 2089
  "uwvwvuuutuuu", // 2090
];

export function monthLengths(bsYear: number): readonly number[] | undefined {
  const row = ENCODED[bsYear - FIRST_BS_YEAR];
  if (row === undefined) return undefined;
  const out: number[] = [];
  for (let i = 0; i < 12; i++) out.push(parseInt(row[i]!, 36));
  return out;
}
