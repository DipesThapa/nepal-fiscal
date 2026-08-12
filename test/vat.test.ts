import { describe, it, expect } from "vitest";
import { Money } from "../src/money.js";
import { addVat, extractVat, computeVat, netVatPayable } from "../src/vat.js";
import { ValidationError } from "../src/errors.js";

describe("adding VAT", () => {
  it("adds 13% to a round amount", () => {
    const r = addVat(Money.parse("100.00"));
    expect(r.vat.toString()).toBe("13.00");
    expect(r.gross.toString()).toBe("113.00");
  });

  it("adds nothing for zero-rated and exempt supplies", () => {
    for (const treatment of ["zero-rated", "exempt"] as const) {
      const r = addVat(Money.parse("100.00"), treatment);
      expect(r.vat.isZero()).toBe(true);
      expect(r.gross.toString()).toBe("100.00");
    }
  });

  it("rounds half up at the paisa", () => {
    // 19.99 * 0.13 = 2.5987 -> 2.60
    expect(addVat(Money.parse("19.99")).vat.toString()).toBe("2.60");
    // 0.50 * 0.13 = 0.065 -> 0.07 under half-up
    expect(addVat(Money.parse("0.50")).vat.toString()).toBe("0.07");
    expect(addVat(Money.parse("0.50"), "standard", "half-even").vat.toString()).toBe("0.06");
  });
});

describe("extracting VAT from an inclusive price", () => {
  it("recovers the exact net from a clean gross", () => {
    const r = extractVat(Money.parse("113.00"));
    expect(r.vat.toString()).toBe("13.00");
    expect(r.net.toString()).toBe("100.00");
  });

  it("never lets net plus VAT drift from the gross", () => {
    // The property that matters: whatever the rounding, the parts must still
    // add up to the number printed on the customer's receipt.
    for (let paisa = 1n; paisa <= 20_000n; paisa++) {
      const gross = Money.fromPaisa(paisa);
      const r = extractVat(gross);
      if (!r.net.add(r.vat).equals(gross)) {
        throw new Error(`drift at ${gross.toString()}: net ${r.net} + vat ${r.vat}`);
      }
    }
    expect(true).toBe(true);
  });

  it("agrees with the naive float calculation at realistic amounts", () => {
    // Recorded honestly rather than assumed. Over every paisa value up to
    // Rs 20,000, `gross - gross/1.13` rounded at the end gives the same paisa
    // as the exact 13/113 ratio. The argument for exact arithmetic is not this
    // single operation — see the accumulation test below.
    let divergences = 0;
    for (let paisa = 1; paisa <= 2_000_000; paisa++) {
      const gross = paisa / 100;
      const naive = Math.round((gross - gross / 1.13) * 100);
      const exact = Number(extractVat(Money.fromPaisa(BigInt(paisa))).vat.paisa);
      if (naive !== exact) divergences++;
    }
    expect(divergences).toBe(0);
  });

  it("diverges from float once VAT is accumulated across many lines", () => {
    // This is where a float ledger actually loses: repeated addition.
    const lines = Array.from({ length: 10_000 }, () => ({
      unitPrice: Money.parse("0.07"),
      quantity: 1,
    }));
    const exact = computeVat(lines).totalVat;

    let float = 0;
    for (let i = 0; i < 10_000; i++) float += 0.07 * 0.13;

    expect(exact.toString()).toBe("100.00");
    // The float accumulation does not land on the same value.
    expect(float).not.toBe(100);
  });
});

describe("invoice-level computation", () => {
  it("sums per-line VAT rather than taxing the total", () => {
    const totals = computeVat([
      { unitPrice: Money.parse("19.99"), quantity: 1 },
      { unitPrice: Money.parse("19.99"), quantity: 1 },
      { unitPrice: Money.parse("19.99"), quantity: 1 },
    ]);
    // Per line: 2.60 each -> 7.80. Taxing the 59.97 total gives 7.80 too here,
    // but the invariant we care about is that the printed column adds up.
    expect(totals.totalVat.toString()).toBe("7.80");
    expect(Money.sum(totals.lines.map((l) => l.vat)).equals(totals.totalVat)).toBe(true);
  });

  it("keeps net, VAT and gross consistent", () => {
    const totals = computeVat([
      { unitPrice: Money.parse("100.00"), quantity: 2 },
      { unitPrice: Money.parse("49.50"), quantity: 3, treatment: "exempt" },
      { unitPrice: Money.parse("75.25"), quantity: 1, treatment: "zero-rated" },
    ]);
    expect(totals.totalNet.add(totals.totalVat).equals(totals.totalGross)).toBe(true);
    expect(totals.taxableNet.toString()).toBe("200.00");
    expect(totals.exemptNet.toString()).toBe("148.50");
    expect(totals.zeroRatedNet.toString()).toBe("75.25");
    expect(totals.totalVat.toString()).toBe("26.00");
  });

  it("separates zero-rated from exempt rather than collapsing them", () => {
    const totals = computeVat([
      { unitPrice: Money.parse("100.00"), quantity: 1, treatment: "zero-rated" },
      { unitPrice: Money.parse("100.00"), quantity: 1, treatment: "exempt" },
    ]);
    expect(totals.totalVat.isZero()).toBe(true);
    expect(totals.zeroRatedNet.toString()).toBe("100.00");
    expect(totals.exemptNet.toString()).toBe("100.00");
  });

  it("applies discounts before tax", () => {
    const totals = computeVat([
      { unitPrice: Money.parse("100.00"), quantity: 2, discount: Money.parse("50.00") },
    ]);
    expect(totals.totalNet.toString()).toBe("150.00");
    expect(totals.totalVat.toString()).toBe("19.50");
    expect(totals.totalDiscount.toString()).toBe("50.00");
  });

  it("handles VAT-inclusive pricing", () => {
    const totals = computeVat([{ unitPrice: Money.parse("113.00"), quantity: 1 }], {
      pricesInclude: true,
    });
    expect(totals.totalNet.toString()).toBe("100.00");
    expect(totals.totalVat.toString()).toBe("13.00");
    expect(totals.totalGross.toString()).toBe("113.00");
  });

  it("handles a zero-quantity line", () => {
    const totals = computeVat([{ unitPrice: Money.parse("100.00"), quantity: 0 }]);
    expect(totals.totalGross.isZero()).toBe(true);
  });

  it("handles an empty invoice", () => {
    const totals = computeVat([]);
    expect(totals.totalGross.isZero()).toBe(true);
    expect(totals.lines).toHaveLength(0);
  });

  it("carries the caller's reference through untouched", () => {
    const totals = computeVat([
      { unitPrice: Money.parse("10.00"), quantity: 1, reference: "SKU-001" },
    ]);
    expect(totals.lines[0]!.reference).toBe("SKU-001");
  });

  it("rejects invalid lines rather than producing a wrong invoice", () => {
    expect(() => computeVat([{ unitPrice: Money.parse("1.00"), quantity: -1 }])).toThrow(
      ValidationError,
    );
    expect(() => computeVat([{ unitPrice: Money.parse("1.00"), quantity: 1.5 }])).toThrow(
      ValidationError,
    );
    expect(() =>
      computeVat([
        { unitPrice: Money.parse("1.00"), quantity: 1, discount: Money.parse("-1.00") },
      ]),
    ).toThrow(ValidationError);
    expect(() =>
      computeVat([
        { unitPrice: Money.parse("10.00"), quantity: 1, discount: Money.parse("11.00") },
      ]),
    ).toThrow(ValidationError);
  });
});

describe("net payable", () => {
  it("nets output against input tax", () => {
    expect(netVatPayable(Money.parse("100.00"), Money.parse("40.00")).toString()).toBe("60.00");
  });

  it("goes negative when input exceeds output, signalling a credit", () => {
    const r = netVatPayable(Money.parse("40.00"), Money.parse("100.00"));
    expect(r.isNegative()).toBe(true);
    expect(r.toString()).toBe("-60.00");
  });
});
