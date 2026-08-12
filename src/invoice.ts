import { type BsDate, formatBs } from "./bs-date.js";
import { type FiscalYear, fiscalYearOf, isInFiscalYear } from "./fiscal-year.js";
import { ValidationError } from "./errors.js";

/**
 * Invoice numbering.
 *
 * The Electronic Billing Directive requires invoice numbers to run in an
 * unbroken sequence that restarts each fiscal year, and forbids reusing or
 * reissuing a number. Two consequences shape this module:
 *
 *  - The sequence is scoped to a fiscal year, not a calendar year, so the
 *    counter resets on 1 Shrawan and not 1 Baishakh.
 *  - A cancelled invoice keeps its number. Nothing here lets you reclaim one.
 */

export interface InvoiceNumber {
  readonly fiscalYear: string;
  readonly sequence: number;
  /** Canonical rendering, e.g. "2082/83-000123". */
  readonly formatted: string;
}

export interface InvoiceNumberOptions {
  /** Digits to pad the sequence to. Default 6. */
  readonly padding?: number;
  /** Inserted between fiscal year and sequence. Default "-". */
  readonly separator?: string;
  /** Optional branch or terminal code, e.g. "BR1". */
  readonly prefix?: string;
}

/** Format a sequence number within a fiscal year. */
export function formatInvoiceNumber(
  fy: FiscalYear,
  sequence: number,
  options: InvoiceNumberOptions = {},
): InvoiceNumber {
  const { padding = 6, separator = "-", prefix } = options;
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new ValidationError(
      `invoice sequence must be a whole number from 1 upward, received ${sequence}`,
    );
  }
  const body = `${fy.label}${separator}${String(sequence).padStart(padding, "0")}`;
  return {
    fiscalYear: fy.label,
    sequence,
    formatted: prefix ? `${prefix}${separator}${body}` : body,
  };
}

/**
 * Assert that an invoice dated `date` belongs in fiscal year `fy`.
 *
 * Worth calling explicitly at the point of issue. The failure this catches —
 * an invoice issued on 32 Ashadh being numbered into the fiscal year that
 * starts the next day — is invisible until the annual return does not
 * reconcile, months later.
 */
export function assertInvoiceDateInFiscalYear(date: BsDate, fy: FiscalYear): void {
  if (!isInFiscalYear(date, fy)) {
    const actual = fiscalYearOf(date);
    throw new ValidationError(
      `invoice dated ${formatBs(date)} falls in fiscal year ${actual.label}, not ${fy.label}`,
    );
  }
}

/**
 * A monotonic per-fiscal-year counter.
 *
 * In-memory and single-process: it is a correctness helper, not a distributed
 * sequence. In production the authoritative counter belongs in the database,
 * behind a unique constraint on (fiscal_year, sequence). Use this to drive
 * that, or to test against it — do not make it the source of truth.
 */
export class InvoiceSequence {
  #next: number;
  readonly #fiscalYear: FiscalYear;
  readonly #options: InvoiceNumberOptions;

  constructor(fy: FiscalYear, options: InvoiceNumberOptions & { startAt?: number } = {}) {
    const { startAt = 1, ...rest } = options;
    if (!Number.isInteger(startAt) || startAt < 1) {
      throw new ValidationError(`startAt must be a whole number from 1 upward, received ${startAt}`);
    }
    this.#fiscalYear = fy;
    this.#next = startAt;
    this.#options = rest;
  }

  /** The number the next call to `issue` will produce. */
  peek(): InvoiceNumber {
    return formatInvoiceNumber(this.#fiscalYear, this.#next, this.#options);
  }

  /** Take the next number and advance. */
  issue(date?: BsDate): InvoiceNumber {
    if (date) assertInvoiceDateInFiscalYear(date, this.#fiscalYear);
    const number = formatInvoiceNumber(this.#fiscalYear, this.#next, this.#options);
    this.#next += 1;
    return number;
  }

  /** Count issued so far. */
  get issued(): number {
    return this.#next - 1;
  }
}

/** Parse a canonical invoice number back into its parts. */
export function parseInvoiceNumber(value: string): { fiscalYear: string; sequence: number } {
  const match = /(\d{4}\/\d{2})[-/](\d+)$/.exec(value.trim());
  if (!match) {
    throw new ValidationError(
      `expected an invoice number such as "2082/83-000123", received ${JSON.stringify(value)}`,
    );
  }
  return { fiscalYear: match[1]!, sequence: Number(match[2]) };
}
