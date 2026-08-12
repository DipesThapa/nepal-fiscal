import {
  EPOCH_AD,
  FIRST_BS_YEAR,
  LAST_BS_YEAR,
  PROVISIONAL_BS_YEARS,
  monthLengths,
} from "./calendar-data.js";
import { InvalidAdDateError, InvalidBsDateError } from "./errors.js";

/** A Bikram Sambat calendar date. Months are 1-indexed: 1 = Baishakh. */
export interface BsDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** A proleptic Gregorian date. Months are 1-indexed. */
export interface AdDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** Nepali month names, index 0 = Baishakh. */
export const BS_MONTHS = [
  "Baishakh",
  "Jestha",
  "Ashadh",
  "Shrawan",
  "Bhadra",
  "Ashwin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
] as const;

/** Nepali month names in Devanagari, index 0 = बैशाख. */
export const BS_MONTHS_NP = [
  "बैशाख",
  "जेठ",
  "असार",
  "साउन",
  "भदौ",
  "असोज",
  "कात्तिक",
  "मंसिर",
  "पुष",
  "माघ",
  "फागुन",
  "चैत",
] as const;

const MS_PER_DAY = 86_400_000;
const EPOCH_MS = Date.UTC(EPOCH_AD.year, EPOCH_AD.month - 1, EPOCH_AD.day);

/** The inclusive range of Bikram Sambat years this library will convert. */
export const SUPPORTED_BS_YEARS = {
  first: FIRST_BS_YEAR,
  last: LAST_BS_YEAR,
} as const;

/**
 * True when the given BS year's month lengths rest on a two-of-three majority
 * rather than unanimous agreement between the three reference implementations.
 *
 * Dates in these years convert without complaint, but if you are computing a
 * statutory deadline that falls in one of them, confirm against the official
 * Nepali calendar before relying on it.
 */
export function isProvisionalYear(bsYear: number): boolean {
  return PROVISIONAL_BS_YEARS.includes(bsYear);
}

/** Number of days in a Bikram Sambat month. Throws if out of supported range. */
export function daysInBsMonth(bsYear: number, bsMonth: number): number {
  assertInt(bsYear, "year");
  assertInt(bsMonth, "month");
  if (bsMonth < 1 || bsMonth > 12) {
    throw new InvalidBsDateError(`BS month must be 1-12, received ${bsMonth}`);
  }
  const lengths = monthLengths(bsYear);
  if (lengths === undefined) {
    throw new InvalidBsDateError(
      `BS year ${bsYear} is outside the supported range ${FIRST_BS_YEAR}-${LAST_BS_YEAR}`,
    );
  }
  return lengths[bsMonth - 1]!;
}

/** Total days in a Bikram Sambat year (varies: 364-367). */
export function daysInBsYear(bsYear: number): number {
  const lengths = monthLengths(bsYear);
  if (lengths === undefined) {
    throw new InvalidBsDateError(
      `BS year ${bsYear} is outside the supported range ${FIRST_BS_YEAR}-${LAST_BS_YEAR}`,
    );
  }
  return lengths.reduce((a, b) => a + b, 0);
}

/** Throws unless the given BS date exists in the supported range. */
export function assertValidBsDate(date: BsDate): void {
  const max = daysInBsMonth(date.year, date.month);
  assertInt(date.day, "day");
  if (date.day < 1 || date.day > max) {
    throw new InvalidBsDateError(
      `BS ${date.year}-${pad(date.month)}-${pad(date.day)} does not exist: ` +
        `${BS_MONTHS[date.month - 1]} ${date.year} has ${max} days`,
    );
  }
}

/** True when the given BS date exists and is in range. Never throws. */
export function isValidBsDate(date: BsDate): boolean {
  try {
    assertValidBsDate(date);
    return true;
  } catch {
    return false;
  }
}

/** Days elapsed since BS 2000-01-01. Used internally; exported for testing. */
export function bsToDayNumber(date: BsDate): number {
  assertValidBsDate(date);
  let days = 0;
  for (let y = FIRST_BS_YEAR; y < date.year; y++) days += daysInBsYear(y);
  const lengths = monthLengths(date.year)!;
  for (let m = 0; m < date.month - 1; m++) days += lengths[m]!;
  return days + date.day - 1;
}

/** Convert a Bikram Sambat date to the Gregorian calendar. */
export function bsToAd(date: BsDate): AdDate {
  const ms = EPOCH_MS + bsToDayNumber(date) * MS_PER_DAY;
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** Convert a Gregorian date to Bikram Sambat. */
export function adToBs(date: AdDate): BsDate {
  assertInt(date.year, "year");
  assertInt(date.month, "month");
  assertInt(date.day, "day");
  const ms = Date.UTC(date.year, date.month - 1, date.day);
  const probe = new Date(ms);
  if (
    probe.getUTCFullYear() !== date.year ||
    probe.getUTCMonth() + 1 !== date.month ||
    probe.getUTCDate() !== date.day
  ) {
    throw new InvalidAdDateError(
      `${date.year}-${pad(date.month)}-${pad(date.day)} is not a real Gregorian date`,
    );
  }

  let remaining = Math.round((ms - EPOCH_MS) / MS_PER_DAY);
  if (remaining < 0) {
    throw new InvalidAdDateError(
      `${date.year}-${pad(date.month)}-${pad(date.day)} is before the supported range ` +
        `(BS ${FIRST_BS_YEAR}-01-01 = ${EPOCH_AD.year}-${pad(EPOCH_AD.month)}-${pad(EPOCH_AD.day)})`,
    );
  }

  for (let y = FIRST_BS_YEAR; y <= LAST_BS_YEAR; y++) {
    const lengths = monthLengths(y)!;
    const yearLength = lengths.reduce((a, b) => a + b, 0);
    if (remaining >= yearLength) {
      remaining -= yearLength;
      continue;
    }
    for (let m = 0; m < 12; m++) {
      const len = lengths[m]!;
      if (remaining < len) return { year: y, month: m + 1, day: remaining + 1 };
      remaining -= len;
    }
  }

  throw new InvalidAdDateError(
    `${date.year}-${pad(date.month)}-${pad(date.day)} is after the supported range ` +
      `(BS ${LAST_BS_YEAR} ends before it)`,
  );
}

/** Convert a JS Date to Bikram Sambat, reading its UTC calendar fields. */
export function dateToBs(date: Date): BsDate {
  if (Number.isNaN(date.getTime())) {
    throw new InvalidAdDateError("received an Invalid Date");
  }
  return adToBs({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

/** Convert a Bikram Sambat date to a JS Date at UTC midnight. */
export function bsToDate(date: BsDate): Date {
  const ad = bsToAd(date);
  return new Date(Date.UTC(ad.year, ad.month - 1, ad.day));
}

/** Format a BS date as `YYYY-MM-DD`, the form the IRD expects in filings. */
export function formatBs(date: BsDate): string {
  assertValidBsDate(date);
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

/** Parse `YYYY-MM-DD` or `YYYY/MM/DD` into a validated BS date. */
export function parseBs(input: string): BsDate {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(input.trim());
  if (!match) {
    throw new InvalidBsDateError(
      `expected a BS date as YYYY-MM-DD or YYYY/MM/DD, received ${JSON.stringify(input)}`,
    );
  }
  const date: BsDate = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  assertValidBsDate(date);
  return date;
}

/** Add a whole number of days to a BS date, staying in the BS calendar. */
export function addBsDays(date: BsDate, days: number): BsDate {
  assertInt(days, "days");
  const ad = bsToAd(date);
  return adToBs(shiftAd(ad, days));
}

/** Today's date in Bikram Sambat, in Nepal Time (UTC+05:45). */
export function todayBs(now: Date = new Date()): BsDate {
  return dateToBs(toNepalCalendarDay(now));
}

/**
 * Shift a UTC instant onto the calendar day it falls on in Nepal Time.
 *
 * Nepal Standard Time is UTC+05:45 with no daylight saving, so this is a fixed
 * offset. The returned Date carries the correct calendar day in its UTC fields
 * and is not meaningful as an instant.
 */
export function toNepalCalendarDay(instant: Date): Date {
  return new Date(instant.getTime() + 5 * 3_600_000 + 45 * 60_000);
}

function shiftAd(date: AdDate, days: number): AdDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day) + days * MS_PER_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function assertInt(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new InvalidBsDateError(`${label} must be an integer, received ${value}`);
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
