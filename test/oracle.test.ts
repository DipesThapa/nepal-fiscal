import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { bsToAd, adToBs, daysInBsMonth, SUPPORTED_BS_YEARS } from "../src/bs-date.js";
import { PROVISIONAL_BS_YEARS } from "../src/calendar-data.js";

/**
 * Differential tests against the three independent implementations the calendar
 * table was derived from.
 *
 * These are the tests that would actually catch a regression in the generated
 * data — the round-trip tests only prove the table is internally consistent,
 * which a uniformly wrong table would also be.
 *
 * The oracles are devDependencies. They are not shipped, and nothing in src/
 * imports them.
 */

const require = createRequire(import.meta.url);
const bikramSambat = require("bikram-sambat");
const NepaliDate = require("nepali-date-converter").default;
const { BikramSambat } = require("@nakarmi23/bikram-sambat");

/** Years all three sources agreed on. Provisional years are excluded. */
const UNANIMOUS_YEARS: number[] = [];
for (let y = SUPPORTED_BS_YEARS.first; y <= SUPPORTED_BS_YEARS.last; y++) {
  if (!PROVISIONAL_BS_YEARS.includes(y)) UNANIMOUS_YEARS.push(y);
}

/** Sample the 1st, 15th and last day of every month, in every year. */
function* sampleDates() {
  for (const year of UNANIMOUS_YEARS) {
    for (let month = 1; month <= 12; month++) {
      const last = daysInBsMonth(year, month);
      for (const day of [1, 15, last]) yield { year, month, day };
    }
  }
}

describe("differential: bikram-sambat", () => {
  it("agrees on month lengths for every unanimous year", () => {
    const mismatches: string[] = [];
    for (const year of UNANIMOUS_YEARS) {
      for (let month = 1; month <= 12; month++) {
        const ours = daysInBsMonth(year, month);
        const theirs = bikramSambat.daysInMonth(year, month);
        if (ours !== theirs) mismatches.push(`BS ${year}-${month}: ours ${ours}, theirs ${theirs}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on BS -> AD for sampled dates", () => {
    const mismatches: string[] = [];
    for (const bs of sampleDates()) {
      const ours = bsToAd(bs);
      const theirs = bikramSambat.toGreg(bs.year, bs.month, bs.day);
      if (ours.year !== theirs.year || ours.month !== theirs.month || ours.day !== theirs.day) {
        mismatches.push(
          `BS ${bs.year}-${bs.month}-${bs.day}: ours ${JSON.stringify(ours)}, theirs ${JSON.stringify(theirs)}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("differential: nepali-date-converter", () => {
  it("agrees on BS -> AD for sampled dates", () => {
    const mismatches: string[] = [];
    for (const bs of sampleDates()) {
      const ours = bsToAd(bs);
      const g = new NepaliDate(bs.year, bs.month - 1, bs.day).toJsDate();
      const theirs = { year: g.getFullYear(), month: g.getMonth() + 1, day: g.getDate() };
      if (ours.year !== theirs.year || ours.month !== theirs.month || ours.day !== theirs.day) {
        mismatches.push(
          `BS ${bs.year}-${bs.month}-${bs.day}: ours ${JSON.stringify(ours)}, theirs ${JSON.stringify(theirs)}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("differential: @nakarmi23/bikram-sambat", () => {
  it("agrees on BS -> AD for sampled dates", () => {
    const mismatches: string[] = [];
    for (const bs of sampleDates()) {
      const ours = bsToAd(bs);
      const iso = `${bs.year}-${String(bs.month).padStart(2, "0")}-${String(bs.day).padStart(2, "0")}`;
      const g = new Date(Date.parse(BikramSambat.parse(iso).adDate));
      const theirs = { year: g.getUTCFullYear(), month: g.getUTCMonth() + 1, day: g.getUTCDate() };
      if (ours.year !== theirs.year || ours.month !== theirs.month || ours.day !== theirs.day) {
        mismatches.push(
          `BS ${bs.year}-${bs.month}-${bs.day}: ours ${JSON.stringify(ours)}, theirs ${JSON.stringify(theirs)}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("differential: AD -> BS", () => {
  it("agrees with bikram-sambat across a long continuous AD span", () => {
    const mismatches: string[] = [];
    // 1990-01-01 through 2033-12-31 — inside every source's range, and safely
    // short of where BS 2090 (the last supported year) ends in early 2034.
    const start = Date.UTC(1990, 0, 1);
    const end = Date.UTC(2033, 11, 31);
    for (let ms = start; ms <= end; ms += 86_400_000) {
      const d = new Date(ms);
      const iso = d.toISOString().slice(0, 10);
      const ours = adToBs({
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
      });
      if (PROVISIONAL_BS_YEARS.includes(ours.year)) continue;
      const t = bikramSambat.toBik(iso);
      if (ours.year !== t.year || ours.month !== t.month || ours.day !== t.day) {
        mismatches.push(`${iso}: ours ${JSON.stringify(ours)}, theirs ${JSON.stringify(t)}`);
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });
});

describe("the disagreement this library documents", () => {
  it("still has the three sources disagreeing on 2084-2086", () => {
    // If a future release of any oracle fixes this, the provisional flag should
    // be revisited — so this test is deliberately written to fail loudly then.
    const disputed = [2084, 2085, 2086];
    for (const year of disputed) {
      const a = Array.from({ length: 12 }, (_, i) => bikramSambat.daysInMonth(year, i + 1)).join(",");
      const b = Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const s = new NepaliDate(year, m - 1, 1).toJsDate();
        const n = m === 12 ? new NepaliDate(year + 1, 0, 1).toJsDate() : new NepaliDate(year, m, 1).toJsDate();
        return Math.round(
          (Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) -
            Date.UTC(s.getFullYear(), s.getMonth(), s.getDate())) /
            86_400_000,
        );
      }).join(",");
      expect(a, `BS ${year} — sources now agree; revisit PROVISIONAL_BS_YEARS`).not.toBe(b);
    }
  });
});
