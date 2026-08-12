/**
 * Generates src/calendar-data.ts from a consensus of three independent
 * Bikram Sambat implementations. Dev-only; never shipped.
 *
 * The consensus itself lives in ./derive-calendar.mjs, which test/
 * calendar-drift.test.ts also imports — so the committed file can be checked
 * against the same code that produced it.
 */
import { writeFileSync } from "node:fs";
import { deriveCalendar } from "./derive-calendar.mjs";

const { epoch, first, last, verified, provisional, excluded, monthLengths } = deriveCalendar();

const rows = [...monthLengths.entries()]
  .map(([y, lens]) => `  "${lens.map((n) => n.toString(36)).join("")}", // ${y}`)
  .join("\n");

const out = `/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: node scripts/generate-calendar.mjs
 *
 * Month lengths for the Bikram Sambat calendar, derived by consensus of three
 * independent implementations (bikram-sambat, nepali-date-converter,
 * @nakarmi23/bikram-sambat). Each year is encoded as 12 base-36 digits.
 *
 * Of BS ${first}-${last}: ${verified.length} years have full three-source agreement.
 * ${provisional.length} years (${provisional.join(", ")}) have only two-of-three agreement
 * and are flagged provisional — see README.
 */

/** AD date corresponding to BS ${first}/01/01. */
export const EPOCH_AD = { year: ${epoch.year}, month: ${epoch.month}, day: ${epoch.day} } as const;

export const FIRST_BS_YEAR = ${first};
export const LAST_BS_YEAR = ${last};

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
console.log(`epoch BS ${first}/01/01 = ${epoch.year}-${String(epoch.month).padStart(2, "0")}-${String(epoch.day).padStart(2, "0")} (all three sources agree)`);
console.log(`verified   : BS ${verified[0]}-${verified[verified.length - 1]} (${verified.length} years, 3/3 agreement)`);
console.log(`provisional: ${provisional.length ? `BS ${provisional.join(", ")}` : "none"} (2/3 agreement)`);
console.log(`excluded   : ${excluded.length ? excluded.join(", ") : "none"}`);
console.log(`written    : src/calendar-data.ts — BS ${first}-${last}`);
