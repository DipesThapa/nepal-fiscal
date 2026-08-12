/**
 * All errors thrown by this library extend NepalFiscalError, so callers can
 * distinguish a domain rejection from a programming fault in one catch.
 */
export class NepalFiscalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A Bikram Sambat date that is outside the supported range, or not a real date. */
export class InvalidBsDateError extends NepalFiscalError {}

/** A Gregorian date outside the range this library can convert. */
export class InvalidAdDateError extends NepalFiscalError {}

/** A monetary operation that cannot be represented exactly. */
export class MoneyError extends NepalFiscalError {}

/** A malformed fiscal year, PAN, or invoice input. */
export class ValidationError extends NepalFiscalError {}
