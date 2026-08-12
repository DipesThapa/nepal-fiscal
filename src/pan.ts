import { ValidationError } from "./errors.js";

/**
 * Permanent Account Number validation.
 *
 * A Nepali PAN is nine digits. The same nine-digit identifier serves as the VAT
 * registration number for a VAT-registered business — there is no separate VAT
 * number, only a flag on the registration.
 *
 * Deliberately absent: a checksum. Nepal's Inland Revenue Department has not
 * published a check-digit algorithm for the PAN, and several libraries in other
 * languages invent one. A validator that rejects real PANs is worse than one
 * that accepts a typo, so this checks structure only and says so.
 *
 * The authoritative check is the IRD taxpayer portal. `isWellFormedPan` tells
 * you whether it is worth asking; only the portal tells you whether it exists.
 */

/** Length of a Nepali PAN. */
export const PAN_LENGTH = 9;

/** True when the input is nine digits, ignoring surrounding whitespace. */
export function isWellFormedPan(pan: string): boolean {
  return /^\d{9}$/.test(pan.trim());
}

/** Strip spaces and hyphens people add when typing a PAN. */
export function normalisePan(pan: string): string {
  return pan.replace(/[\s-]/g, "");
}

/** Normalise and validate, or throw. Returns the canonical nine-digit form. */
export function parsePan(pan: string): string {
  const normalised = normalisePan(pan);
  if (!isWellFormedPan(normalised)) {
    throw new ValidationError(
      `a Nepali PAN is ${PAN_LENGTH} digits; received ${JSON.stringify(pan)} ` +
        `(${normalised.length} character${normalised.length === 1 ? "" : "s"} after normalising)`,
    );
  }
  return normalised;
}

/**
 * Whether a supply must carry the buyer's PAN on the invoice.
 *
 * Under the VAT Rules a registered seller must record the buyer's name, address
 * and PAN on a tax invoice where the transaction value reaches the prescribed
 * threshold. The threshold is set administratively and has changed more than
 * once, so it is a parameter here rather than a constant baked into the library
 * — passing last year's figure silently would be worse than making you look it
 * up.
 *
 * @param amount        transaction value in rupees
 * @param thresholdRupees current threshold, from the VAT Rules in force
 */
export function buyerPanRequired(amount: bigint, thresholdRupees: bigint): boolean {
  if (thresholdRupees <= 0n) {
    throw new ValidationError("threshold must be a positive rupee amount");
  }
  return amount >= thresholdRupees;
}

/** Registration status of a taxpayer, which changes what may be issued. */
export type TaxpayerMode =
  /** Registered for VAT: must issue tax invoices and charge output VAT. */
  | "vat"
  /** PAN-registered only: issues an abbreviated invoice, charges no VAT. */
  | "pan";

/**
 * Whether the seller may issue a tax invoice showing VAT.
 * A PAN-only taxpayer that shows VAT on an invoice is committing an offence,
 * so this is worth asserting before rendering.
 */
export function canIssueTaxInvoice(mode: TaxpayerMode): boolean {
  return mode === "vat";
}
