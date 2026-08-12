import { describe, it, expect } from "vitest";
import {
  adToBs,
  bsToAd,
  parseBs,
  formatBs,
  addBsDays,
  daysInBsMonth,
  daysInBsYear,
  isValidBsDate,
  isProvisionalYear,
  dateToBs,
  bsToDate,
  todayBs,
  SUPPORTED_BS_YEARS,
} from "../src/bs-date.js";
import { EPOCH_AD } from "../src/calendar-data.js";
import { InvalidAdDateError, InvalidBsDateError } from "../src/errors.js";

describe("known anchor dates", () => {
  // Nepali New Year. These are the dates the whole table hangs off; if any of
  // them drift, every other conversion is wrong too.
  const anchors: [string, string][] = [
    ["2000-01-01", "1943-04-14"],
    ["2070-01-01", "2013-04-14"],
    ["2080-01-01", "2023-04-14"],
    ["2081-01-01", "2024-04-13"],
    ["2082-01-01", "2025-04-14"],
    ["2083-01-01", "2026-04-14"],
  ];

  it.each(anchors)("BS %s = AD %s", (bs, ad) => {
    const [y, m, d] = ad.split("-").map(Number) as [number, number, number];
    expect(bsToAd(parseBs(bs))).toEqual({ year: y, month: m, day: d });
    expect(formatBs(adToBs({ year: y, month: m, day: d }))).toBe(bs);
  });

  it("places the epoch where the calendar data says", () => {
    expect(bsToAd({ year: SUPPORTED_BS_YEARS.first, month: 1, day: 1 })).toEqual({
      year: EPOCH_AD.year,
      month: EPOCH_AD.month,
      day: EPOCH_AD.day,
    });
  });
});

describe("round-trip across the entire supported range", () => {
  it("converts every day BS -> AD -> BS without drift", () => {
    let checked = 0;
    let previousAdMs = -Infinity;

    for (let year = SUPPORTED_BS_YEARS.first; year <= SUPPORTED_BS_YEARS.last; year++) {
      for (let month = 1; month <= 12; month++) {
        const days = daysInBsMonth(year, month);
        for (let day = 1; day <= days; day++) {
          const bs = { year, month, day };
          const ad = bsToAd(bs);
          expect(adToBs(ad)).toEqual(bs);

          // AD dates must advance by exactly one day, every day, with no gap
          // and no repeat. This is what actually catches a bad month length.
          const ms = Date.UTC(ad.year, ad.month - 1, ad.day);
          if (previousAdMs !== -Infinity) {
            expect(ms - previousAdMs).toBe(86_400_000);
          }
          previousAdMs = ms;
          checked++;
        }
      }
    }

    // 91 years of roughly 365 days.
    expect(checked).toBeGreaterThan(33_000);
  });
});

describe("month and year lengths", () => {
  it("keeps every month within the range a BS month can take", () => {
    for (let year = SUPPORTED_BS_YEARS.first; year <= SUPPORTED_BS_YEARS.last; year++) {
      for (let month = 1; month <= 12; month++) {
        const days = daysInBsMonth(year, month);
        expect(days).toBeGreaterThanOrEqual(29);
        expect(days).toBeLessThanOrEqual(32);
      }
    }
  });

  it("keeps every year within the range a BS year can take", () => {
    for (let year = SUPPORTED_BS_YEARS.first; year <= SUPPORTED_BS_YEARS.last; year++) {
      const total = daysInBsYear(year);
      expect(total).toBeGreaterThanOrEqual(353);
      expect(total).toBeLessThanOrEqual(368);
    }
  });

  it("tracks the Gregorian year closely enough not to have slipped", () => {
    // Over 91 years a systematic off-by-one would accumulate visibly.
    const first = bsToAd({ year: SUPPORTED_BS_YEARS.first, month: 1, day: 1 });
    const last = bsToAd({ year: SUPPORTED_BS_YEARS.last, month: 1, day: 1 });
    const bsYears = SUPPORTED_BS_YEARS.last - SUPPORTED_BS_YEARS.first;
    expect(last.year - first.year).toBe(bsYears);
  });
});

describe("range and validity enforcement", () => {
  it("refuses a BS year below the supported range", () => {
    expect(() => bsToAd({ year: 1999, month: 1, day: 1 })).toThrow(InvalidBsDateError);
  });

  it("refuses a BS year above the supported range", () => {
    expect(() => bsToAd({ year: 2091, month: 1, day: 1 })).toThrow(InvalidBsDateError);
  });

  it("refuses a day past the end of its month", () => {
    const days = daysInBsMonth(2082, 1);
    expect(() => bsToAd({ year: 2082, month: 1, day: days + 1 })).toThrow(InvalidBsDateError);
    expect(isValidBsDate({ year: 2082, month: 1, day: days + 1 })).toBe(false);
    expect(isValidBsDate({ year: 2082, month: 1, day: days })).toBe(true);
  });

  it("refuses month 0 and month 13", () => {
    expect(() => daysInBsMonth(2082, 0)).toThrow(InvalidBsDateError);
    expect(() => daysInBsMonth(2082, 13)).toThrow(InvalidBsDateError);
  });

  it("refuses non-integer components", () => {
    expect(() => bsToAd({ year: 2082.5, month: 1, day: 1 })).toThrow(InvalidBsDateError);
    expect(() => bsToAd({ year: 2082, month: 1, day: 1.5 })).toThrow(InvalidBsDateError);
  });

  it("refuses an AD date before the epoch", () => {
    expect(() => adToBs({ year: 1943, month: 4, day: 13 })).toThrow(InvalidAdDateError);
  });

  it("refuses an AD date that does not exist", () => {
    expect(() => adToBs({ year: 2025, month: 2, day: 30 })).toThrow(InvalidAdDateError);
    expect(() => adToBs({ year: 2025, month: 13, day: 1 })).toThrow(InvalidAdDateError);
  });

  it("refuses an Invalid Date", () => {
    expect(() => dateToBs(new Date("nope"))).toThrow(InvalidAdDateError);
  });

  it("accepts 29 February in a leap year", () => {
    expect(() => adToBs({ year: 2024, month: 2, day: 29 })).not.toThrow();
    expect(() => adToBs({ year: 2025, month: 2, day: 29 })).toThrow(InvalidAdDateError);
  });
});

describe("parsing and formatting", () => {
  it("accepts both separators", () => {
    expect(parseBs("2082-01-01")).toEqual({ year: 2082, month: 1, day: 1 });
    expect(parseBs("2082/01/01")).toEqual({ year: 2082, month: 1, day: 1 });
    expect(parseBs("2082/1/1")).toEqual({ year: 2082, month: 1, day: 1 });
    expect(parseBs("  2082-01-01  ")).toEqual({ year: 2082, month: 1, day: 1 });
  });

  it("always pads to two digits when formatting", () => {
    expect(formatBs({ year: 2082, month: 1, day: 5 })).toBe("2082-01-05");
  });

  it("rejects malformed input rather than guessing", () => {
    expect(() => parseBs("2082")).toThrow(InvalidBsDateError);
    expect(() => parseBs("82-01-01")).toThrow(InvalidBsDateError);
    expect(() => parseBs("")).toThrow(InvalidBsDateError);
  });

  it("rejects a well-formed string that is not a real date", () => {
    expect(() => parseBs("2082-13-01")).toThrow(InvalidBsDateError);
    expect(() => parseBs("2082-01-99")).toThrow(InvalidBsDateError);
  });
});

describe("date arithmetic", () => {
  it("adds days across a month boundary", () => {
    const days = daysInBsMonth(2082, 1);
    expect(addBsDays({ year: 2082, month: 1, day: days }, 1)).toEqual({
      year: 2082,
      month: 2,
      day: 1,
    });
  });

  it("adds days across a year boundary", () => {
    const days = daysInBsMonth(2082, 12);
    expect(addBsDays({ year: 2082, month: 12, day: days }, 1)).toEqual({
      year: 2083,
      month: 1,
      day: 1,
    });
  });

  it("subtracts", () => {
    expect(addBsDays({ year: 2083, month: 1, day: 1 }, -1)).toEqual({
      year: 2082,
      month: 12,
      day: daysInBsMonth(2082, 12),
    });
  });

  it("is its own inverse", () => {
    const start = { year: 2082, month: 6, day: 15 };
    for (const n of [1, 7, 30, 365, 1000]) {
      expect(addBsDays(addBsDays(start, n), -n)).toEqual(start);
    }
  });
});

describe("Date interop", () => {
  it("round-trips through a JS Date", () => {
    const bs = { year: 2082, month: 5, day: 12 };
    expect(dateToBs(bsToDate(bs))).toEqual(bs);
  });

  it("uses Nepal Time for today, not the host timezone", () => {
    // 18:00 UTC on 13 April 2025 is already 23:45 on the 13th in Nepal.
    const evening = new Date("2025-04-13T18:00:00Z");
    expect(todayBs(evening)).toEqual(adToBs({ year: 2025, month: 4, day: 13 }));

    // 19:00 UTC has crossed midnight in Nepal (00:45 on the 14th).
    const night = new Date("2025-04-13T19:00:00Z");
    expect(todayBs(night)).toEqual(adToBs({ year: 2025, month: 4, day: 14 }));
  });
});

describe("provisional years", () => {
  it("flags the years where reference implementations disagreed", () => {
    expect(isProvisionalYear(2084)).toBe(true);
    expect(isProvisionalYear(2085)).toBe(true);
    expect(isProvisionalYear(2086)).toBe(true);
    expect(isProvisionalYear(2082)).toBe(false);
    expect(isProvisionalYear(2083)).toBe(false);
  });

  it("still converts provisional years rather than refusing", () => {
    expect(() => bsToAd({ year: 2084, month: 1, day: 1 })).not.toThrow();
  });
});
