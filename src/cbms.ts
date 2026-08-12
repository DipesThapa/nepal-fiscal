import { type BsDate, bsToAd } from "./bs-date.js";
import { type FiscalYear } from "./fiscal-year.js";
import { Money } from "./money.js";
import { parsePan } from "./pan.js";
import { type VatTotals } from "./vat.js";
import { ValidationError } from "./errors.js";

/**
 * Payload construction for the Central Billing Monitoring System.
 *
 * Scope, stated plainly: this module builds and validates the JSON body. It
 * does not send it, hold credentials, or retry. That is deliberate — the
 * transmit path needs your own persistence, because the Directive treats an
 * unacknowledged invoice as un-issued, and a retry loop that forgets what it
 * already sent creates duplicates the IRD will not let you delete.
 *
 * The recommended shape at the call site:
 *
 *   1. Persist the invoice with `synced = false`.
 *   2. Build the payload here and POST it.
 *   3. Only on a success response, set `synced = true` and store the response.
 *   4. Sweep unsynced invoices on a schedule, with a bounded backoff.
 *
 * Field names follow the published CBMS specification. Verify them against the
 * version your registration targets before going live — the spec has gained
 * fields over time, and an unexpected key is rejected rather than ignored.
 */

/** Amounts making up a CBMS submission, all exact. */
export interface CbmsAmounts {
  /** Invoice total including VAT. */
  readonly totalSales: Money;
  /** Net of supplies charged at the standard rate. */
  readonly taxableSalesVat: Money;
  /** VAT charged. */
  readonly vat: Money;
  /** Net of exempt supplies. */
  readonly taxExemptedSales: Money;
  /** Net of exports. Zero for a domestic invoice. */
  readonly exportSales?: Money;
  /** Amount subject to excise, if any. */
  readonly excisableAmount?: Money;
  /** Excise duty charged. */
  readonly excise?: Money;
}

export interface CbmsInvoiceInput {
  /** Seller's nine-digit PAN. */
  readonly sellerPan: string;
  /** Buyer's PAN. Omit for a walk-in sale below the threshold. */
  readonly buyerPan?: string;
  /** Buyer's registered name. Required when buyerPan is given. */
  readonly buyerName?: string;
  readonly fiscalYear: FiscalYear;
  /** Invoice number as printed on the document. */
  readonly invoiceNumber: string;
  /** Invoice date in Bikram Sambat. */
  readonly invoiceDate: BsDate;
  readonly amounts: CbmsAmounts;
  /** True when transmitted at the moment of sale rather than swept later. */
  readonly realTime: boolean;
  /** True once the customer's copy has been printed. */
  readonly billPrinted: boolean;
  /** False for a voided invoice. The number is retained either way. */
  readonly billActive?: boolean;
  /** Client-side timestamp. Defaults to now. */
  readonly clientDateTime?: Date;
}

/** The JSON body, with keys as the CBMS endpoint expects them. */
export interface CbmsPayload {
  readonly seller_pan: string;
  readonly buyer_pan: string;
  readonly buyer_name: string;
  readonly fiscal_year: string;
  readonly invoice_number: string;
  readonly invoice_date: string;
  readonly total_sales: string;
  readonly taxable_sales_vat: string;
  readonly vat: string;
  readonly excisable_amount: string;
  readonly excise: string;
  readonly taxable_sales_hst: string;
  readonly hst: string;
  readonly amount_for_esf: string;
  readonly esf: string;
  readonly export_sales: string;
  readonly tax_exempted_sales: string;
  readonly isrealtime: boolean;
  readonly is_bill_printed: boolean;
  readonly is_bill_active: boolean;
  readonly datetime_client: string;
}

/**
 * Build a CBMS payload from an invoice.
 *
 * Throws rather than transmitting anything the IRD would reject or, worse,
 * accept in a form that does not reconcile.
 */
export function buildCbmsPayload(input: CbmsInvoiceInput): CbmsPayload {
  const sellerPan = parsePan(input.sellerPan);

  if (input.buyerPan !== undefined && (input.buyerName === undefined || input.buyerName.trim() === "")) {
    throw new ValidationError("buyerName is required whenever buyerPan is supplied");
  }
  const buyerPan = input.buyerPan === undefined ? "" : parsePan(input.buyerPan);
  if (buyerPan !== "" && buyerPan === sellerPan) {
    throw new ValidationError("buyer and seller PAN are identical — check the invoice");
  }

  if (input.invoiceNumber.trim() === "") {
    throw new ValidationError("invoiceNumber cannot be empty");
  }

  const a = input.amounts;
  const zero = Money.zero;
  const exportSales = a.exportSales ?? zero;
  const excisableAmount = a.excisableAmount ?? zero;
  const excise = a.excise ?? zero;

  for (const [label, amount] of Object.entries({
    totalSales: a.totalSales,
    taxableSalesVat: a.taxableSalesVat,
    vat: a.vat,
    taxExemptedSales: a.taxExemptedSales,
    exportSales,
    excisableAmount,
    excise,
  })) {
    if (amount.isNegative()) {
      throw new ValidationError(`${label} cannot be negative on a CBMS submission`);
    }
  }

  // The components must reconstruct the total exactly. Catching this here beats
  // discovering it in an IRD reconciliation months later.
  const reconstructed = Money.sum([
    a.taxableSalesVat,
    a.vat,
    a.taxExemptedSales,
    exportSales,
    excise,
  ]);
  if (!reconstructed.equals(a.totalSales)) {
    throw new ValidationError(
      `CBMS totals do not reconcile: taxable ${a.taxableSalesVat} + VAT ${a.vat} + ` +
        `exempt ${a.taxExemptedSales} + export ${exportSales} + excise ${excise} = ` +
        `${reconstructed}, but totalSales is ${a.totalSales}`,
    );
  }

  const ad = bsToAd(input.invoiceDate);

  return {
    seller_pan: sellerPan,
    buyer_pan: buyerPan,
    buyer_name: input.buyerName?.trim() ?? "",
    fiscal_year: input.fiscalYear.label,
    invoice_number: input.invoiceNumber.trim(),
    invoice_date: `${ad.year}-${pad(ad.month)}-${pad(ad.day)}`,
    total_sales: a.totalSales.toString(),
    taxable_sales_vat: a.taxableSalesVat.toString(),
    vat: a.vat.toString(),
    excisable_amount: excisableAmount.toString(),
    excise: excise.toString(),
    taxable_sales_hst: "0.00",
    hst: "0.00",
    amount_for_esf: "0.00",
    esf: "0.00",
    export_sales: exportSales.toString(),
    tax_exempted_sales: a.taxExemptedSales.toString(),
    isrealtime: input.realTime,
    is_bill_printed: input.billPrinted,
    is_bill_active: input.billActive ?? true,
    datetime_client: formatClientDateTime(input.clientDateTime ?? new Date()),
  };
}

/** Derive CBMS amounts from a computed VAT breakdown. */
export function cbmsAmountsFromVat(totals: VatTotals): CbmsAmounts {
  return {
    totalSales: totals.totalGross,
    taxableSalesVat: totals.taxableNet,
    vat: totals.totalVat,
    taxExemptedSales: totals.exemptNet,
    exportSales: totals.zeroRatedNet,
  };
}

/** `YYYY-MM-DD HH:mm:ss` in Nepal Time, which is what the endpoint expects. */
function formatClientDateTime(instant: Date): string {
  const shifted = new Date(instant.getTime() + 5 * 3_600_000 + 45 * 60_000);
  const d = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  const t = `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
  return `${d} ${t}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
