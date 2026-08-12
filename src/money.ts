import { MoneyError } from "./errors.js";

/**
 * Exact money for Nepali rupees.
 *
 * Amounts are held as an integer number of paisa in a bigint. There is no
 * floating point anywhere in this file, and no way to get a float into one
 * except by explicitly asking for it.
 *
 * Why this matters here specifically: an invoice transmitted to the CBMS must
 * reconcile against the tax authority's own arithmetic, and a ledger has to
 * balance after thousands of operations rather than one. A single multiplication
 * in a double is usually fine; it is summation, repeated splitting, and
 * cross-runtime reproducibility that a float ledger loses.
 */

const PAISA_PER_RUPEE = 100n;

/** Rounding modes. ROUND_HALF_UP is the default and matches IRD practice. */
export type RoundingMode =
  /** 0.5 rounds away from zero. 2.5 -> 3, -2.5 -> -3. */
  | "half-up"
  /** 0.5 rounds to the nearest even. 2.5 -> 2, 3.5 -> 4. */
  | "half-even"
  /** Always toward zero. */
  | "down"
  /** Always away from zero. */
  | "up";

export class Money {
  /** Integer paisa. 1 rupee = 100 paisa. */
  readonly paisa: bigint;

  private constructor(paisa: bigint) {
    this.paisa = paisa;
  }

  /** Zero rupees. */
  static readonly zero = new Money(0n);

  /** Construct from an integer number of paisa. */
  static fromPaisa(paisa: bigint | number): Money {
    if (typeof paisa === "number") {
      if (!Number.isInteger(paisa)) {
        throw new MoneyError(
          `paisa must be a whole number, received ${paisa}. ` +
            `Use Money.parse("12.34") for a rupee amount with decimals.`,
        );
      }
      if (!Number.isSafeInteger(paisa)) {
        throw new MoneyError(`${paisa} exceeds the safe integer range; pass a bigint instead`);
      }
      return new Money(BigInt(paisa));
    }
    return new Money(paisa);
  }

  /** Construct from a whole number of rupees. */
  static fromRupees(rupees: bigint | number): Money {
    if (typeof rupees === "number" && !Number.isInteger(rupees)) {
      throw new MoneyError(
        `fromRupees expects a whole number, received ${rupees}. ` +
          `Use Money.parse("${rupees}") to keep the decimal part exact.`,
      );
    }
    return Money.fromPaisa(BigInt(rupees) * PAISA_PER_RUPEE);
  }

  /**
   * Parse a decimal string such as "1234.56". This is the safe entry point for
   * amounts that arrive as text — from a form, a CSV, or a JSON payload.
   *
   * Rejects more than two decimal places rather than silently rounding, because
   * a third decimal place in a price usually means the caller has already lost
   * precision somewhere upstream and should be told.
   */
  static parse(value: string): Money {
    const trimmed = value.trim();
    const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
    if (!match) {
      throw new MoneyError(`cannot parse ${JSON.stringify(value)} as an amount`);
    }
    const [, sign, whole, fraction = ""] = match;
    if (fraction.length > 2) {
      throw new MoneyError(
        `${JSON.stringify(value)} has ${fraction.length} decimal places; ` +
          `rupee amounts carry at most 2. Round before parsing if that is intended.`,
      );
    }
    const paisa = BigInt(whole!) * PAISA_PER_RUPEE + BigInt(fraction.padEnd(2, "0") || "0");
    return new Money(sign === "-" ? -paisa : paisa);
  }

  /**
   * Convert from a JavaScript number. Explicitly named because it is the one
   * operation in this file that can lose precision, and you should be able to
   * grep for it during a review.
   *
   * The number is first rendered to a fixed decimal string, then rounded to
   * paisa exactly — so whatever error the double already carried is resolved
   * once, here, rather than propagating.
   */
  static unsafeFromNumber(rupees: number, mode: RoundingMode = "half-up"): Money {
    if (!Number.isFinite(rupees)) {
      throw new MoneyError(`cannot convert ${rupees} to an amount`);
    }
    const SCALE = 10;
    const text = rupees.toFixed(SCALE);
    const match = /^([+-]?)(\d+)\.(\d+)$/.exec(text);
    if (!match) throw new MoneyError(`cannot convert ${rupees} to an amount`);
    const [, sign, whole, fraction] = match;
    // Value scaled to 10 decimal places, exactly.
    const scaled = BigInt(whole!) * 10n ** BigInt(SCALE) + BigInt(fraction!);
    const paisa = divideRounded(scaled, 10n ** BigInt(SCALE - 2), mode);
    return new Money(sign === "-" ? -paisa : paisa);
  }

  add(other: Money): Money {
    return new Money(this.paisa + other.paisa);
  }

  subtract(other: Money): Money {
    return new Money(this.paisa - other.paisa);
  }

  /** Multiply by a whole number, such as a line-item quantity. */
  multiply(factor: bigint | number): Money {
    if (typeof factor === "number" && !Number.isInteger(factor)) {
      throw new MoneyError(
        `multiply expects a whole number, received ${factor}. ` +
          `Use applyRate(numerator, denominator) for percentages and fractional rates.`,
      );
    }
    return new Money(this.paisa * BigInt(factor));
  }

  /**
   * Multiply by an exact rational rate and round once, at the end.
   *
   * VAT at 13% is `applyRate(13, 100)`; extracting VAT from a tax-inclusive
   * price is `applyRate(13, 113)`. Expressing the rate as a ratio rather than a
   * decimal means 13/113 is never approximated.
   */
  applyRate(numerator: bigint | number, denominator: bigint | number, mode: RoundingMode = "half-up"): Money {
    const n = BigInt(numerator);
    const d = BigInt(denominator);
    if (d === 0n) throw new MoneyError("rate denominator cannot be zero");
    return new Money(divideRounded(this.paisa * n, d, mode));
  }

  /** Divide by a whole number, rounding once. */
  divide(divisor: bigint | number, mode: RoundingMode = "half-up"): Money {
    const d = BigInt(divisor);
    if (d === 0n) throw new MoneyError("cannot divide an amount by zero");
    return new Money(divideRounded(this.paisa, d, mode));
  }

  /**
   * Split into `parts` amounts that sum exactly back to this one.
   *
   * The remainder paisa are distributed one each to the leading parts, so
   * splitting Rs 10.00 three ways gives 3.34, 3.33, 3.33 — not three lots of
   * 3.33 and a lost paisa.
   */
  allocate(parts: number): Money[] {
    if (!Number.isInteger(parts) || parts < 1) {
      throw new MoneyError(`allocate expects a positive whole number of parts, received ${parts}`);
    }
    const n = BigInt(parts);
    const base = this.paisa / n;
    const remainder = this.paisa - base * n;
    const step = remainder >= 0n ? 1n : -1n;
    let left = remainder >= 0n ? remainder : -remainder;
    return Array.from({ length: parts }, () => {
      const extra = left > 0n ? step : 0n;
      if (left > 0n) left -= 1n;
      return new Money(base + extra);
    });
  }

  /** Split by exact integer weights, preserving the total. */
  allocateBy(weights: readonly (bigint | number)[]): Money[] {
    if (weights.length === 0) throw new MoneyError("allocateBy needs at least one weight");
    const w = weights.map((x) => BigInt(x));
    if (w.some((x) => x < 0n)) throw new MoneyError("weights cannot be negative");
    const total = w.reduce((a, b) => a + b, 0n);
    if (total === 0n) throw new MoneyError("weights must not sum to zero");

    const shares = w.map((weight) => (this.paisa * weight) / total);
    let remainder = this.paisa - shares.reduce((a, b) => a + b, 0n);
    const step = remainder >= 0n ? 1n : -1n;
    let left = remainder >= 0n ? remainder : -remainder;
    return shares.map((share) => {
      const extra = left > 0n ? step : 0n;
      if (left > 0n) left -= 1n;
      return new Money(share + extra);
    });
  }

  negate(): Money {
    return new Money(-this.paisa);
  }

  abs(): Money {
    return this.paisa < 0n ? new Money(-this.paisa) : this;
  }

  isZero(): boolean {
    return this.paisa === 0n;
  }

  isNegative(): boolean {
    return this.paisa < 0n;
  }

  isPositive(): boolean {
    return this.paisa > 0n;
  }

  equals(other: Money): boolean {
    return this.paisa === other.paisa;
  }

  /** -1, 0 or 1. Suitable for Array.prototype.sort. */
  compare(other: Money): -1 | 0 | 1 {
    return this.paisa < other.paisa ? -1 : this.paisa > other.paisa ? 1 : 0;
  }

  greaterThan(other: Money): boolean {
    return this.paisa > other.paisa;
  }

  lessThan(other: Money): boolean {
    return this.paisa < other.paisa;
  }

  /** Exact decimal string, always two places: "1234.56". */
  toString(): string {
    const negative = this.paisa < 0n;
    const abs = negative ? -this.paisa : this.paisa;
    const rupees = abs / PAISA_PER_RUPEE;
    const paisa = abs % PAISA_PER_RUPEE;
    return `${negative ? "-" : ""}${rupees}.${String(paisa).padStart(2, "0")}`;
  }

  /** Grouped for display: "Rs 12,34,567.89" in the Nepali 2-2-3 convention. */
  format(options: { symbol?: string; grouping?: "nepali" | "western" } = {}): string {
    const { symbol = "Rs", grouping = "nepali" } = options;
    const negative = this.paisa < 0n;
    const abs = negative ? -this.paisa : this.paisa;
    const rupees = String(abs / PAISA_PER_RUPEE);
    const paisa = String(abs % PAISA_PER_RUPEE).padStart(2, "0");
    const grouped = grouping === "nepali" ? groupNepali(rupees) : groupWestern(rupees);
    return `${negative ? "-" : ""}${symbol} ${grouped}.${paisa}`;
  }

  /** Serialises as an exact decimal string, so JSON round-trips without loss. */
  toJSON(): string {
    return this.toString();
  }

  /**
   * Lossy by construction — a rupee amount above ~90 trillion cannot be held
   * exactly in a double. Use only at a display or charting boundary.
   */
  unsafeToNumber(): number {
    return Number(this.paisa) / 100;
  }

  static sum(amounts: Iterable<Money>): Money {
    let total = 0n;
    for (const amount of amounts) total += amount.paisa;
    return new Money(total);
  }

  static min(...amounts: Money[]): Money {
    if (amounts.length === 0) throw new MoneyError("min needs at least one amount");
    return amounts.reduce((a, b) => (a.paisa <= b.paisa ? a : b));
  }

  static max(...amounts: Money[]): Money {
    if (amounts.length === 0) throw new MoneyError("max needs at least one amount");
    return amounts.reduce((a, b) => (a.paisa >= b.paisa ? a : b));
  }
}

/** Integer division of `value / divisor` with the given rounding mode. */
function divideRounded(value: bigint, divisor: bigint, mode: RoundingMode): bigint {
  const negative = value < 0n !== divisor < 0n;
  const a = value < 0n ? -value : value;
  const b = divisor < 0n ? -divisor : divisor;

  const quotient = a / b;
  const remainder = a % b;
  if (remainder === 0n) return negative ? -quotient : quotient;

  const twice = remainder * 2n;
  let rounded: bigint;
  switch (mode) {
    case "down":
      rounded = quotient;
      break;
    case "up":
      rounded = quotient + 1n;
      break;
    case "half-even":
      rounded =
        twice > b || (twice === b && quotient % 2n === 1n) ? quotient + 1n : quotient;
      break;
    case "half-up":
    default:
      rounded = twice >= b ? quotient + 1n : quotient;
      break;
  }
  return negative ? -rounded : rounded;
}

/** 1234567 -> "12,34,567" — last three digits, then pairs. */
function groupNepali(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
}

function groupWestern(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
