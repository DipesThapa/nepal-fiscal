import { describe, it, expect } from "vitest";
import {
  fiscalYear,
  fiscalYearOf,
  fiscalYearOfAd,
  parseFiscalYear,
  labelFor,
  isInFiscalYear,
  fiscalQuarterOf,
  fiscalYearMonths,
  fiscalYearRangeAd,
  describeFiscalYear,
  currentFiscalYear,
} from "../src/fiscal-year.js";
import { parseBs, daysInBsMonth } from "../src/bs-date.js";
import { ValidationError } from "../src/errors.js";

describe("fiscal year construction", () => {
  it("runs Shrawan to Ashadh", () => {
    const fy = fiscalYear(2082);
    expect(fy.label).toBe("2082/83");
    expect(fy.start).toEqual({ year: 2082, month: 4, day: 1 });
    expect(fy.end).toEqual({ year: 2083, month: 3, day: daysInBsMonth(2083, 3) });
  });

  it("labels the century rollover correctly", () => {
    expect(labelFor(2099)).toBe("2099/00");
    expect(labelFor(2082)).toBe("2082/83");
  });

  it("rejects a non-integer year", () => {
    expect(() => fiscalYear(2082.5)).toThrow(ValidationError);
  });
});

describe("locating a date in a fiscal year", () => {
  it("puts Shrawan in the year that opens", () => {
    expect(fiscalYearOf(parseBs("2082-04-01")).label).toBe("2082/83");
  });

  it("puts Ashadh in the year that closes", () => {
    expect(fiscalYearOf(parseBs("2083-03-15")).label).toBe("2082/83");
  });

  it("puts Baishakh, the first BS month, in the closing year", () => {
    // This is the trap: BS year 2083 starts in Baishakh, but Baishakh 2083
    // belongs to fiscal year 2082/83, not 2083/84.
    expect(fiscalYearOf(parseBs("2083-01-01")).label).toBe("2082/83");
  });

  it("flips on the last day of Ashadh", () => {
    const lastDay = daysInBsMonth(2083, 3);
    expect(fiscalYearOf({ year: 2083, month: 3, day: lastDay }).label).toBe("2082/83");
    expect(fiscalYearOf({ year: 2083, month: 4, day: 1 }).label).toBe("2083/84");
  });

  it("works from a Gregorian date", () => {
    // Mid-July 2025 is Shrawan 2082 -> FY 2082/83.
    expect(fiscalYearOfAd({ year: 2025, month: 8, day: 1 }).label).toBe("2082/83");
  });

  it("computes a current fiscal year without throwing", () => {
    expect(currentFiscalYear().label).toMatch(/^\d{4}\/\d{2}$/);
  });
});

describe("parsing labels", () => {
  it("accepts the forms actually in circulation", () => {
    for (const input of ["2082/83", "2082/2083", "2082-83", "2082.83", "2082", " 2082/83 "]) {
      expect(parseFiscalYear(input).label).toBe("2082/83");
    }
  });

  it("rejects a label whose halves do not follow each other", () => {
    expect(() => parseFiscalYear("2082/84")).toThrow(ValidationError);
    expect(() => parseFiscalYear("2082/82")).toThrow(ValidationError);
  });

  it("rejects malformed input", () => {
    expect(() => parseFiscalYear("")).toThrow(ValidationError);
    expect(() => parseFiscalYear("FY2082")).toThrow(ValidationError);
    expect(() => parseFiscalYear("82/83")).toThrow(ValidationError);
  });
});

describe("membership and structure", () => {
  it("includes both boundaries", () => {
    const fy = fiscalYear(2082);
    expect(isInFiscalYear(fy.start, fy)).toBe(true);
    expect(isInFiscalYear(fy.end, fy)).toBe(true);
    expect(isInFiscalYear({ year: 2082, month: 3, day: 30 }, fy)).toBe(false);
    expect(isInFiscalYear({ year: 2083, month: 4, day: 1 }, fy)).toBe(false);
  });

  it("lists twelve months starting at Shrawan", () => {
    const months = fiscalYearMonths(fiscalYear(2082));
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ year: 2082, month: 4 });
    // Chaitra, the last BS month, still sits in the opening BS year...
    expect(months[8]).toEqual({ year: 2082, month: 12 });
    // ...and the fiscal year then rolls into Baishakh of the next BS year.
    expect(months[9]).toEqual({ year: 2083, month: 1 });
    expect(months[11]).toEqual({ year: 2083, month: 3 });
  });

  it("assigns quarters from Shrawan", () => {
    expect(fiscalQuarterOf({ year: 2082, month: 4, day: 1 })).toBe(1);
    expect(fiscalQuarterOf({ year: 2082, month: 6, day: 1 })).toBe(1);
    expect(fiscalQuarterOf({ year: 2082, month: 7, day: 1 })).toBe(2);
    expect(fiscalQuarterOf({ year: 2082, month: 10, day: 1 })).toBe(3);
    expect(fiscalQuarterOf({ year: 2083, month: 1, day: 1 })).toBe(4);
    expect(fiscalQuarterOf({ year: 2083, month: 3, day: 1 })).toBe(4);
  });

  it("covers exactly the fiscal year with no gap between consecutive years", () => {
    const a = fiscalYear(2082);
    const b = fiscalYear(2083);
    const endAd = fiscalYearRangeAd(a).end;
    const startAd = fiscalYearRangeAd(b).start;
    const gap =
      (Date.UTC(startAd.year, startAd.month - 1, startAd.day) -
        Date.UTC(endAd.year, endAd.month - 1, endAd.day)) /
      86_400_000;
    expect(gap).toBe(1);
  });

  it("describes its span", () => {
    expect(describeFiscalYear(fiscalYear(2082))).toMatch(/^2082-04-01 to 2083-03-\d{2}$/);
  });
});
