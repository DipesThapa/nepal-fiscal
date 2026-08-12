import { describe, it, expect } from "vitest";
import {
  isWellFormedPan,
  normalisePan,
  parsePan,
  buyerPanRequired,
  canIssueTaxInvoice,
} from "../src/pan.js";
import {
  formatInvoiceNumber,
  parseInvoiceNumber,
  assertInvoiceDateInFiscalYear,
  InvoiceSequence,
} from "../src/invoice.js";
import { buildCbmsPayload, cbmsAmountsFromVat } from "../src/cbms.js";
import { fiscalYear } from "../src/fiscal-year.js";
import { computeVat } from "../src/vat.js";
import { Money } from "../src/money.js";
import { parseBs } from "../src/bs-date.js";
import { ValidationError } from "../src/errors.js";

describe("PAN", () => {
  it("accepts nine digits", () => {
    expect(isWellFormedPan("123456789")).toBe(true);
    expect(isWellFormedPan(" 123456789 ")).toBe(true);
  });

  it("rejects anything else", () => {
    for (const bad of ["12345678", "1234567890", "12345678a", "", "abcdefghi"]) {
      expect(isWellFormedPan(bad)).toBe(false);
    }
  });

  it("normalises the separators people type", () => {
    expect(normalisePan("123-456-789")).toBe("123456789");
    expect(normalisePan("123 456 789")).toBe("123456789");
    expect(parsePan("123-456-789")).toBe("123456789");
  });

  it("says how many characters it actually got when rejecting", () => {
    expect(() => parsePan("12345")).toThrow(/5 characters/);
  });

  it("takes the threshold as a parameter rather than baking in a stale figure", () => {
    expect(buyerPanRequired(10_000n, 10_000n)).toBe(true);
    expect(buyerPanRequired(9_999n, 10_000n)).toBe(false);
    expect(() => buyerPanRequired(1n, 0n)).toThrow(ValidationError);
  });

  it("only lets a VAT-registered taxpayer issue a tax invoice", () => {
    expect(canIssueTaxInvoice("vat")).toBe(true);
    expect(canIssueTaxInvoice("pan")).toBe(false);
  });
});

describe("invoice numbering", () => {
  const fy = fiscalYear(2082);

  it("formats with the fiscal year and zero padding", () => {
    expect(formatInvoiceNumber(fy, 123).formatted).toBe("2082/83-000123");
    expect(formatInvoiceNumber(fy, 1, { padding: 4 }).formatted).toBe("2082/83-0001");
    expect(formatInvoiceNumber(fy, 1, { prefix: "BR1" }).formatted).toBe("BR1-2082/83-000001");
  });

  it("rejects a sequence below one", () => {
    expect(() => formatInvoiceNumber(fy, 0)).toThrow(ValidationError);
    expect(() => formatInvoiceNumber(fy, -1)).toThrow(ValidationError);
    expect(() => formatInvoiceNumber(fy, 1.5)).toThrow(ValidationError);
  });

  it("round-trips through parse", () => {
    const n = formatInvoiceNumber(fy, 4567);
    expect(parseInvoiceNumber(n.formatted)).toEqual({ fiscalYear: "2082/83", sequence: 4567 });
  });

  it("catches an invoice dated into the wrong fiscal year", () => {
    expect(() => assertInvoiceDateInFiscalYear(parseBs("2083-04-01"), fy)).toThrow(
      /falls in fiscal year 2083\/84/,
    );
    expect(() => assertInvoiceDateInFiscalYear(parseBs("2082-04-01"), fy)).not.toThrow();
  });

  it("issues an unbroken ascending sequence", () => {
    const seq = new InvoiceSequence(fy);
    expect(seq.peek().sequence).toBe(1);
    const issued = Array.from({ length: 5 }, () => seq.issue().sequence);
    expect(issued).toEqual([1, 2, 3, 4, 5]);
    expect(seq.issued).toBe(5);
  });

  it("can resume from a stored counter", () => {
    const seq = new InvoiceSequence(fy, { startAt: 501 });
    expect(seq.issue().formatted).toBe("2082/83-000501");
    expect(() => new InvoiceSequence(fy, { startAt: 0 })).toThrow(ValidationError);
  });

  it("refuses to issue against a date in another fiscal year", () => {
    const seq = new InvoiceSequence(fy);
    expect(() => seq.issue(parseBs("2083-04-01"))).toThrow(ValidationError);
    // and does not burn the number
    expect(seq.peek().sequence).toBe(1);
  });
});

describe("CBMS payload", () => {
  const base = {
    sellerPan: "123456789",
    buyerPan: "987654321",
    buyerName: "Some Buyer Pvt. Ltd.",
    fiscalYear: fiscalYear(2082),
    invoiceNumber: "2082/83-000001",
    invoiceDate: parseBs("2082-04-01"),
    realTime: true,
    billPrinted: true,
    clientDateTime: new Date("2025-07-17T06:15:00Z"),
  };

  const amounts = {
    totalSales: Money.parse("113.00"),
    taxableSalesVat: Money.parse("100.00"),
    vat: Money.parse("13.00"),
    taxExemptedSales: Money.zero,
  };

  it("builds a payload with amounts as exact decimal strings", () => {
    const payload = buildCbmsPayload({ ...base, amounts });
    expect(payload.total_sales).toBe("113.00");
    expect(payload.taxable_sales_vat).toBe("100.00");
    expect(payload.vat).toBe("13.00");
    expect(payload.seller_pan).toBe("123456789");
    expect(payload.fiscal_year).toBe("2082/83");
  });

  it("converts the invoice date to Gregorian, which is what the endpoint takes", () => {
    const payload = buildCbmsPayload({ ...base, amounts });
    expect(payload.invoice_date).toBe("2025-07-17");
  });

  it("stamps the client time in Nepal Time", () => {
    const payload = buildCbmsPayload({ ...base, amounts });
    // 06:15 UTC + 05:45 = 12:00 NPT
    expect(payload.datetime_client).toBe("2025-07-17 12:00:00");
  });

  it("refuses a payload whose components do not reconstruct the total", () => {
    expect(() =>
      buildCbmsPayload({
        ...base,
        amounts: { ...amounts, totalSales: Money.parse("114.00") },
      }),
    ).toThrow(/do not reconcile/);
  });

  it("refuses negative amounts", () => {
    expect(() =>
      buildCbmsPayload({
        ...base,
        amounts: { ...amounts, vat: Money.parse("-13.00"), totalSales: Money.parse("87.00") },
      }),
    ).toThrow(ValidationError);
  });

  it("requires a buyer name whenever a buyer PAN is given", () => {
    expect(() =>
      buildCbmsPayload({ ...base, buyerName: undefined, amounts }),
    ).toThrow(/buyerName is required/);
  });

  it("allows a walk-in sale with no buyer PAN", () => {
    const payload = buildCbmsPayload({
      ...base,
      buyerPan: undefined,
      buyerName: undefined,
      amounts,
    });
    expect(payload.buyer_pan).toBe("");
    expect(payload.buyer_name).toBe("");
  });

  it("catches a buyer and seller PAN that are the same", () => {
    expect(() =>
      buildCbmsPayload({ ...base, buyerPan: base.sellerPan, amounts }),
    ).toThrow(/identical/);
  });

  it("refuses an empty invoice number", () => {
    expect(() => buildCbmsPayload({ ...base, invoiceNumber: "  ", amounts })).toThrow(
      ValidationError,
    );
  });

  it("derives reconciling amounts straight from a VAT computation", () => {
    const totals = computeVat([
      { unitPrice: Money.parse("19.99"), quantity: 3 },
      { unitPrice: Money.parse("45.00"), quantity: 1, treatment: "exempt" },
      { unitPrice: Money.parse("30.00"), quantity: 1, treatment: "zero-rated" },
    ]);
    const payload = buildCbmsPayload({ ...base, amounts: cbmsAmountsFromVat(totals) });
    expect(payload.total_sales).toBe(totals.totalGross.toString());
    expect(payload.vat).toBe(totals.totalVat.toString());
    expect(payload.tax_exempted_sales).toBe("45.00");
    expect(payload.export_sales).toBe("30.00");
  });

  it("marks a voided invoice inactive while keeping its number", () => {
    const payload = buildCbmsPayload({ ...base, billActive: false, amounts });
    expect(payload.is_bill_active).toBe(false);
    expect(payload.invoice_number).toBe("2082/83-000001");
  });
});
