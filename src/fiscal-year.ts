import {
  type BsDate,
  type AdDate,
  adToBs,
  bsToAd,
  daysInBsMonth,
  formatBs,
  todayBs,
} from "./bs-date.js";
import { ValidationError } from "./errors.js";

/**
 * Nepal's fiscal year runs from 1 Shrawan to the last day of Ashadh.
 *
 * Shrawan is the 4th Bikram Sambat month, Ashadh the 3rd — so a fiscal year
 * spans two BS years, and is written with the second one abbreviated:
 * FY 2082/83 begins 1 Shrawan 2082 and ends on the last day of Ashadh 2083.
 */

/** The BS month a fiscal year opens in: Shrawan. */
export const FISCAL_YEAR_START_MONTH = 4;

/** The BS month a fiscal year closes in: Ashadh. */
export const FISCAL_YEAR_END_MONTH = 3;

export interface FiscalYear {
  /** The opening BS year. FY 2082/83 has startYear 2082. */
  readonly startYear: number;
  /** The closing BS year. FY 2082/83 has endYear 2083. */
  readonly endYear: number;
  /** Canonical label, e.g. "2082/83". */
  readonly label: string;
  /** First day: 1 Shrawan of startYear. */
  readonly start: BsDate;
  /** Last day: final day of Ashadh of endYear. */
  readonly end: BsDate;
}

/** Build a fiscal year from its opening BS year. */
export function fiscalYear(startYear: number): FiscalYear {
  if (!Number.isInteger(startYear)) {
    throw new ValidationError(`fiscal year must be an integer BS year, received ${startYear}`);
  }
  const endYear = startYear + 1;
  const start: BsDate = { year: startYear, month: FISCAL_YEAR_START_MONTH, day: 1 };
  const end: BsDate = {
    year: endYear,
    month: FISCAL_YEAR_END_MONTH,
    day: daysInBsMonth(endYear, FISCAL_YEAR_END_MONTH),
  };
  return { startYear, endYear, label: labelFor(startYear), start, end };
}

/** The fiscal year a Bikram Sambat date falls in. */
export function fiscalYearOf(date: BsDate): FiscalYear {
  const startYear = date.month >= FISCAL_YEAR_START_MONTH ? date.year : date.year - 1;
  return fiscalYear(startYear);
}

/** The fiscal year a Gregorian date falls in. */
export function fiscalYearOfAd(date: AdDate): FiscalYear {
  return fiscalYearOf(adToBs(date));
}

/** The fiscal year in progress right now, in Nepal Time. */
export function currentFiscalYear(now: Date = new Date()): FiscalYear {
  return fiscalYearOf(todayBs(now));
}

/**
 * Parse a fiscal year label. Accepts the forms in circulation:
 * "2082/83", "2082/2083", "2082-83", "2082.83", or a bare "2082".
 */
export function parseFiscalYear(label: string): FiscalYear {
  const trimmed = label.trim();
  const bare = /^(\d{4})$/.exec(trimmed);
  if (bare) return fiscalYear(Number(bare[1]));

  const match = /^(\d{4})\s*[/\-.]\s*(\d{2}|\d{4})$/.exec(trimmed);
  if (!match) {
    throw new ValidationError(
      `expected a fiscal year such as "2082/83", received ${JSON.stringify(label)}`,
    );
  }
  const startYear = Number(match[1]);
  const tail = match[2]!;
  const declaredEnd = tail.length === 2 ? Number(String(startYear + 1).slice(0, 2) + tail) : Number(tail);
  if (declaredEnd !== startYear + 1) {
    throw new ValidationError(
      `${JSON.stringify(label)} is not a valid fiscal year: ` +
        `${startYear} must be followed by ${startYear + 1}, not ${declaredEnd}`,
    );
  }
  return fiscalYear(startYear);
}

/** Canonical label for an opening BS year: 2082 -> "2082/83". */
export function labelFor(startYear: number): string {
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

/** True when the BS date falls inside the fiscal year. Boundaries included. */
export function isInFiscalYear(date: BsDate, fy: FiscalYear): boolean {
  const key = (d: BsDate) => d.year * 10_000 + d.month * 100 + d.day;
  return key(date) >= key(fy.start) && key(date) <= key(fy.end);
}

/** The four BS months of a fiscal quarter. Q1 is Shrawan-Ashwin. */
export function fiscalQuarterOf(date: BsDate): 1 | 2 | 3 | 4 {
  const offset = (date.month - FISCAL_YEAR_START_MONTH + 12) % 12;
  return (Math.floor(offset / 3) + 1) as 1 | 2 | 3 | 4;
}

/** Gregorian dates the fiscal year opens and closes on. */
export function fiscalYearRangeAd(fy: FiscalYear): { start: AdDate; end: AdDate } {
  return { start: bsToAd(fy.start), end: bsToAd(fy.end) };
}

/** The twelve BS months of the fiscal year, in order, as `{year, month}`. */
export function fiscalYearMonths(fy: FiscalYear): { year: number; month: number }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const raw = FISCAL_YEAR_START_MONTH + i;
    return raw <= 12
      ? { year: fy.startYear, month: raw }
      : { year: fy.endYear, month: raw - 12 };
  });
}

/** Human-readable span, e.g. "2082-04-01 to 2083-03-31". */
export function describeFiscalYear(fy: FiscalYear): string {
  return `${formatBs(fy.start)} to ${formatBs(fy.end)}`;
}
