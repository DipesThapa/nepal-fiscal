import { describe, it, expect } from "vitest";
// @ts-expect-error — dev-only .mjs helper, no type declarations and none wanted
import { deriveCalendar } from "../scripts/derive-calendar.mjs";
import {
  EPOCH_AD,
  FIRST_BS_YEAR,
  LAST_BS_YEAR,
  VERIFIED_YEAR_COUNT,
  PROVISIONAL_BS_YEARS,
  monthLengths,
} from "../src/calendar-data.js";

/**
 * Guards the generated calendar table against silent drift.
 *
 * src/calendar-data.ts is written by scripts/generate-calendar.mjs from three
 * upstream implementations. Nothing otherwise checks that the committed file
 * still matches what those sources say — so a hand-edit, a botched
 * regeneration, or an upstream release that revises a disputed year would all
 * pass unnoticed. The round-trip and differential suites would not catch a
 * hand-edit either: they prove the table is internally consistent and matches
 * the oracles on unanimous years, which a subtly wrong table can also do.
 *
 * This asserts the stronger property: the committed file is exactly what the
 * generator produces from the pinned oracle versions, today.
 *
 * When this fails, it is a question, not a bug. Either someone edited the
 * generated file by hand — regenerate it — or an upstream source changed its
 * mind about a year. If it changed its mind about 2084, 2085, 2086 or 2090,
 * that is the disagreement this library documents finally moving, and the
 * provisional flags need revisiting rather than the test silencing.
 */

const derived = deriveCalendar() as {
  epoch: { year: number; month: number; day: number };
  first: number;
  last: number;
  verified: number[];
  provisional: number[];
  excluded: number[];
  monthLengths: Map<number, number[]>;
};

describe("generated calendar data matches its sources", () => {
  it("agrees on the epoch", () => {
    expect(derived.epoch).toEqual({
      year: EPOCH_AD.year,
      month: EPOCH_AD.month,
      day: EPOCH_AD.day,
    });
  });

  it("agrees on the supported range", () => {
    expect({ first: derived.first, last: derived.last }).toEqual({
      first: FIRST_BS_YEAR,
      last: LAST_BS_YEAR,
    });
  });

  it("agrees on which years are unanimous", () => {
    expect(derived.verified.length).toBe(VERIFIED_YEAR_COUNT);
  });

  it("agrees on which years are provisional", () => {
    expect(derived.provisional).toEqual([...PROVISIONAL_BS_YEARS]);
  });

  it("excludes no year in the supported range", () => {
    // An excluded year would leave a hole the committed table cannot represent,
    // since monthLengths indexes by offset from FIRST_BS_YEAR.
    expect(derived.excluded).toEqual([]);
  });

  it("agrees on every month length, year by year", () => {
    const mismatches: string[] = [];
    for (let year = FIRST_BS_YEAR; year <= LAST_BS_YEAR; year++) {
      const committed = monthLengths(year);
      const fresh = derived.monthLengths.get(year);
      if (committed === undefined || fresh === undefined) {
        mismatches.push(`BS ${year}: committed=${committed}, derived=${fresh}`);
        continue;
      }
      if (committed.join(",") !== fresh.join(",")) {
        mismatches.push(
          `BS ${year}: committed [${committed.join(",")}] vs derived [${fresh.join(",")}]`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});
