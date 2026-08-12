/**
 * Generates src/calendar-data.ts from a consensus of three independent
 * Bikram Sambat implementations. Dev-only; never shipped.
 *
 * Rule: a year is VERIFIED only when all three sources agree.
 * Where exactly two agree, the year is PROVISIONAL and recorded as such.
 * Where all three differ, the year is excluded entirely.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);

const A = require("bikram-sambat");
const B = require("nepali-date-converter").default;
const { BikramSambat: C } = require("@nakarmi23/bikram-sambat");

const DAY = 86_400_000;
const utc = (y, m, d) => Date.UTC(y, m - 1, d);

const lensA = (y) => Array.from({ length: 12 }, (_, i) => A.daysInMonth(y, i + 1));

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

const verified = [], provisional = [], excluded = [];
const table = new Map();

for (let y = 2000; y <= 2090; y++) {
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

// Epoch: AD date of BS 2000/01/01, agreed by all sources.
const epochA = A.toGreg(2000, 1, 1);
const epochB = new B(2000, 0, 1).toJsDate();
const epochC = new Date(Date.parse(C.parse("2000-01-01").adDate));
const iso = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const eA = `${epochA.year}-${String(epochA.month).padStart(2, "0")}-${String(epochA.day).padStart(2, "0")}`;
if (eA !== iso(epochB) || eA !== iso(epochC)) throw new Error(`epoch disagreement: ${eA} / ${iso(epochB)} / ${iso(epochC)}`);

const years = [...table.keys()].sort((x, z) => x - z);
const min = years[0], max = years[years.length - 1];
for (let y = min; y <= max; y++) if (!table.has(y)) throw new Error(`gap at BS ${y} — range must be contiguous`);

const rows = years.map((y) => `  "${table.get(y).split(",").map((n) => Number(n).toString(36)).join("")}", // ${y}`).join("\n");

const out = `/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: node scripts/generate-calendar.mjs
 *
 * Month lengths for the Bikram Sambat calendar, derived by consensus of three
 * independent implementations (bikram-sambat, nepali-date-converter,
 * @nakarmi23/bikram-sambat). Each year is encoded as 12 base-36 digits.
 *
 * Of BS ${min}-${max}: ${verified.length} years have full three-source agreement.
 * ${provisional.length} years (${provisional.join(", ")}) have only two-of-three agreement
 * and are flagged provisional — see README.
 */

/** AD date corresponding to BS ${min}/01/01. */
export const EPOCH_AD = { year: ${epochA.year}, month: ${epochA.month}, day: ${epochA.day} } as const;

export const FIRST_BS_YEAR = ${min};
export const LAST_BS_YEAR = ${max};

/** Count of years with full three-source agreement. */
export const VERIFIED_YEAR_COUNT = ${verified.length};

/** Years where sources disagreed and a two-of-three majority was taken. */
export const PROVISIONAL_BS_YEARS: readonly number[] = [${provisional.join(", ")}];

const ENCODED: readonly string[] = [
${rows}
];

export function monthLengths(bsYear: number): readonly number[] | undefined {
  const row = ENCODED[bsYear - FIRST_BS_YEAR];
  if (row === undefined) return undefined;
  const out: number[] = [];
  for (let i = 0; i < 12; i++) out.push(parseInt(row[i]!, 36));
  return out;
}
`;

writeFileSync(new URL("../src/calendar-data.ts", import.meta.url), out);
console.log(`epoch BS ${min}/01/01 = ${eA} (all three sources agree)`);
console.log(`verified   : BS ${verified[0]}-${verified[verified.length - 1]} (${verified.length} years, 3/3 agreement)`);
console.log(`provisional: ${provisional.length ? `BS ${provisional.join(", ")}` : "none"} (2/3 agreement)`);
console.log(`excluded   : ${excluded.length ? excluded.join(", ") : "none"}`);
console.log(`written    : src/calendar-data.ts — BS ${min}-${max}`);
