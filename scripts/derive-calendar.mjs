/**
 * Derives Bikram Sambat month lengths by consensus of three independent
 * implementations. Dev-only; never shipped, and nothing in src/ imports it.
 *
 * Rule: a year is VERIFIED only when all three sources agree.
 * Where exactly two agree, the year is PROVISIONAL and recorded as such.
 * Where all three differ, the year is excluded entirely.
 *
 * This module holds the derivation and nothing else, so that both
 * scripts/generate-calendar.mjs (which writes src/calendar-data.ts) and
 * test/calendar-drift.test.ts (which asserts the committed file still matches)
 * run the same code. A test that re-implemented this would only prove the two
 * copies agree with each other.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const A = require("bikram-sambat");
const B = require("nepali-date-converter").default;
const { BikramSambat: C } = require("@nakarmi23/bikram-sambat");

const DAY = 86_400_000;
const utc = (y, m, d) => Date.UTC(y, m - 1, d);

const lensA = (y) => Array.from({ length: 12 }, (_, i) => A.daysInMonth(y, i + 1));

// Both B and C hand back a Date at local midnight, so calendar fields are read
// locally and rebuilt as UTC. Month lengths are differences between two such
// points, which makes them timezone-independent either way.
const startB = (y, m) => { const g = new B(y, m - 1, 1).toJsDate(); return utc(g.getFullYear(), g.getMonth() + 1, g.getDate()); };
const lensB = (y) => Array.from({ length: 12 }, (_, i) => {
  const m = i + 1;
  return Math.round(((m === 12 ? startB(y + 1, 1) : startB(y, m + 1)) - startB(y, m)) / DAY);
});

const startC = (y, m) => Date.parse(C.parse(`${y}-${String(m).padStart(2, "0")}-01`).adDate);
const lensC = (y) => Array.from({ length: 12 }, (_, i) => {
  const m = i + 1;
  return Math.round(((m === 12 ? startC(y + 1, 1) : startC(y, m + 1)) - startC(y, m)) / DAY);
});

const safe = (fn, y) => { try { const r = fn(y); return r.every((v) => v >= 28 && v <= 32) ? r.join(",") : null; } catch { return null; } };

/**
 * Run the consensus over the given BS year range.
 *
 * @returns {{
 *   epoch: {year: number, month: number, day: number},
 *   first: number,
 *   last: number,
 *   verified: number[],
 *   provisional: number[],
 *   excluded: number[],
 *   monthLengths: Map<number, number[]>,
 * }}
 */
export function deriveCalendar({ from = 2000, to = 2090 } = {}) {
  const verified = [], provisional = [], excluded = [];
  const table = new Map();

  for (let y = from; y <= to; y++) {
    const a = safe(lensA, y), b = safe(lensB, y), c = safe(lensC, y);
    const votes = [a, b, c].filter(Boolean);
    if (votes.length < 2) { excluded.push(y); continue; }
    const tally = new Map();
    for (const v of votes) tally.set(v, (tally.get(v) ?? 0) + 1);
    const [best, count] = [...tally.entries()].sort((x, z) => z[1] - x[1])[0];
    if (count === 3) { verified.push(y); table.set(y, best); }
    else if (count === 2) { provisional.push(y); table.set(y, best); }
    else excluded.push(y);
  }

  // Epoch: AD date of BS 2000/01/01, which all three sources must agree on.
  const epochA = A.toGreg(from, 1, 1);
  const epochB = new B(from, 0, 1).toJsDate();
  const epochC = new Date(Date.parse(C.parse(`${from}-01-01`).adDate));
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const eA = `${epochA.year}-${String(epochA.month).padStart(2, "0")}-${String(epochA.day).padStart(2, "0")}`;
  if (eA !== isoLocal(epochB) || eA !== isoLocal(epochC)) {
    throw new Error(`epoch disagreement: ${eA} / ${isoLocal(epochB)} / ${isoLocal(epochC)}`);
  }

  const years = [...table.keys()].sort((x, z) => x - z);
  const first = years[0], last = years[years.length - 1];
  for (let y = first; y <= last; y++) {
    if (!table.has(y)) throw new Error(`gap at BS ${y} — range must be contiguous`);
  }

  const monthLengths = new Map(
    years.map((y) => [y, table.get(y).split(",").map(Number)]),
  );

  return {
    epoch: { year: epochA.year, month: epochA.month, day: epochA.day },
    first,
    last,
    verified,
    provisional,
    excluded,
    monthLengths,
  };
}
