import { describe, it, expect } from "vitest";
import { Money } from "../src/money.js";
import { MoneyError } from "../src/errors.js";

describe("construction", () => {
  it("parses decimal strings exactly", () => {
    expect(Money.parse("1234.56").paisa).toBe(123456n);
    expect(Money.parse("0.01").paisa).toBe(1n);
    expect(Money.parse("0.1").paisa).toBe(10n);
    expect(Money.parse("100").paisa).toBe(10000n);
    expect(Money.parse("-5.25").paisa).toBe(-525n);
    expect(Money.parse("+5.25").paisa).toBe(525n);
  });

  it("handles amounts a double cannot hold", () => {
    const huge = Money.parse("123456789012345678.99");
    expect(huge.toString()).toBe("123456789012345678.99");
    // The same value through a double loses the low-order digits entirely.
    expect(String(123456789012345678.99)).not.toBe("123456789012345678.99");
  });

  it("refuses a third decimal place instead of silently rounding", () => {
    expect(() => Money.parse("1.234")).toThrow(MoneyError);
    expect(() => Money.parse("1.005")).toThrow(MoneyError);
  });

  it("refuses input that is not a number", () => {
    expect(() => Money.parse("")).toThrow(MoneyError);
    expect(() => Money.parse("abc")).toThrow(MoneyError);
    expect(() => Money.parse("1,234.56")).toThrow(MoneyError);
    expect(() => Money.parse("1e5")).toThrow(MoneyError);
    expect(() => Money.parse("NaN")).toThrow(MoneyError);
  });

  it("refuses fractional rupees where a whole number is expected", () => {
    expect(() => Money.fromRupees(10.5)).toThrow(MoneyError);
    expect(() => Money.fromPaisa(10.5)).toThrow(MoneyError);
  });

  it("names the lossy conversion so it can be found in review", () => {
    expect(Money.unsafeFromNumber(1234.56).toString()).toBe("1234.56");
    expect(() => Money.unsafeFromNumber(Infinity)).toThrow(MoneyError);
    expect(() => Money.unsafeFromNumber(NaN)).toThrow(MoneyError);
  });
});

describe("arithmetic", () => {
  it("adds and subtracts without drift", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in floating point.
    const sum = Money.parse("0.10").add(Money.parse("0.20"));
    expect(sum.toString()).toBe("0.30");
    expect(sum.equals(Money.parse("0.30"))).toBe(true);
  });

  it("stays exact over ten thousand additions", () => {
    let total = Money.zero;
    for (let i = 0; i < 10_000; i++) total = total.add(Money.parse("0.01"));
    expect(total.toString()).toBe("100.00");

    // The float equivalent does not land on 100.
    let float = 0;
    for (let i = 0; i < 10_000; i++) float += 0.01;
    expect(float).not.toBe(100);
  });

  it("multiplies by whole quantities", () => {
    expect(Money.parse("19.99").multiply(3).toString()).toBe("59.97");
    expect(() => Money.parse("10.00").multiply(1.5)).toThrow(MoneyError);
  });

  it("applies exact rational rates", () => {
    expect(Money.parse("100.00").applyRate(13, 100).toString()).toBe("13.00");
    expect(Money.parse("113.00").applyRate(13, 113).toString()).toBe("13.00");
    expect(() => Money.parse("100.00").applyRate(13, 0)).toThrow(MoneyError);
  });
});

describe("rounding", () => {
  it("rounds half away from zero by default", () => {
    // 2.505 -> half a paisa above 2.50
    expect(Money.parse("5.01").divide(2, "half-up").toString()).toBe("2.51");
    expect(Money.parse("-5.01").divide(2, "half-up").toString()).toBe("-2.51");
  });

  it("rounds half to even when asked", () => {
    expect(Money.parse("5.01").divide(2, "half-even").toString()).toBe("2.50");
    expect(Money.parse("5.03").divide(2, "half-even").toString()).toBe("2.52");
  });

  it("truncates toward zero on 'down'", () => {
    expect(Money.parse("5.09").divide(2, "down").toString()).toBe("2.54");
    expect(Money.parse("-5.09").divide(2, "down").toString()).toBe("-2.54");
  });

  it("rounds away from zero on 'up'", () => {
    expect(Money.parse("5.01").divide(2, "up").toString()).toBe("2.51");
    expect(Money.parse("-5.01").divide(2, "up").toString()).toBe("-2.51");
  });

  it("is symmetric about zero for half-up", () => {
    for (const s of ["0.01", "1.99", "12.34", "999.95"]) {
      const positive = Money.parse(s).applyRate(1, 3, "half-up");
      const negative = Money.parse(`-${s}`).applyRate(1, 3, "half-up");
      expect(negative.equals(positive.negate())).toBe(true);
    }
  });

  it("refuses division by zero", () => {
    expect(() => Money.parse("1.00").divide(0)).toThrow(MoneyError);
  });
});

describe("allocation", () => {
  it("splits without losing a paisa", () => {
    const parts = Money.parse("10.00").allocate(3);
    expect(parts.map((p) => p.toString())).toEqual(["3.34", "3.33", "3.33"]);
    expect(Money.sum(parts).toString()).toBe("10.00");
  });

  it("preserves the total for every split from 1 to 100", () => {
    const total = Money.parse("1000.01");
    for (let n = 1; n <= 100; n++) {
      expect(Money.sum(total.allocate(n)).equals(total)).toBe(true);
    }
  });

  it("preserves the total for negative amounts", () => {
    const total = Money.parse("-10.00");
    const parts = total.allocate(3);
    expect(Money.sum(parts).equals(total)).toBe(true);
  });

  it("splits by weight without losing a paisa", () => {
    const parts = Money.parse("100.00").allocateBy([1, 1, 1]);
    expect(Money.sum(parts).toString()).toBe("100.00");
    expect(parts.map((p) => p.toString())).toEqual(["33.34", "33.33", "33.33"]);

    const weighted = Money.parse("100.00").allocateBy([70, 30]);
    expect(weighted.map((p) => p.toString())).toEqual(["70.00", "30.00"]);
    expect(Money.sum(weighted).toString()).toBe("100.00");
  });

  it("rejects nonsense allocations", () => {
    expect(() => Money.parse("1.00").allocate(0)).toThrow(MoneyError);
    expect(() => Money.parse("1.00").allocate(-1)).toThrow(MoneyError);
    expect(() => Money.parse("1.00").allocate(1.5)).toThrow(MoneyError);
    expect(() => Money.parse("1.00").allocateBy([])).toThrow(MoneyError);
    expect(() => Money.parse("1.00").allocateBy([0, 0])).toThrow(MoneyError);
    expect(() => Money.parse("1.00").allocateBy([-1, 2])).toThrow(MoneyError);
  });
});

describe("comparison and formatting", () => {
  it("compares", () => {
    const a = Money.parse("10.00");
    const b = Money.parse("20.00");
    expect(a.lessThan(b)).toBe(true);
    expect(b.greaterThan(a)).toBe(true);
    expect(a.compare(b)).toBe(-1);
    expect(b.compare(a)).toBe(1);
    expect(a.compare(a)).toBe(0);
    expect(Money.min(a, b).equals(a)).toBe(true);
    expect(Money.max(a, b).equals(b)).toBe(true);
  });

  it("always shows two decimal places", () => {
    expect(Money.fromRupees(5).toString()).toBe("5.00");
    expect(Money.fromPaisa(5n).toString()).toBe("0.05");
    expect(Money.zero.toString()).toBe("0.00");
  });

  it("groups in the Nepali 2-2-3 convention", () => {
    expect(Money.parse("1234567.89").format()).toBe("Rs 12,34,567.89");
    expect(Money.parse("100000.00").format()).toBe("Rs 1,00,000.00");
    expect(Money.parse("999.00").format()).toBe("Rs 999.00");
    expect(Money.parse("1234567.89").format({ grouping: "western" })).toBe("Rs 1,234,567.89");
    expect(Money.parse("-1234.50").format()).toBe("-Rs 1,234.50");
  });

  it("round-trips through JSON without loss", () => {
    const original = Money.parse("123456789012345678.99");
    const revived = Money.parse(JSON.parse(JSON.stringify({ v: original })).v);
    expect(revived.equals(original)).toBe(true);
  });
});
