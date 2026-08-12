# nepal-fiscal

[![npm](https://img.shields.io/npm/v/nepal-fiscal)](https://www.npmjs.com/package/nepal-fiscal)
[![ci](https://github.com/DipesThapa/nepal-fiscal/actions/workflows/ci.yml/badge.svg)](https://github.com/DipesThapa/nepal-fiscal/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/nepal-fiscal)](https://nodejs.org)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://www.npmjs.com/package/nepal-fiscal?activeTab=dependencies)
[![licence](https://img.shields.io/npm/l/nepal-fiscal)](./LICENSE)

Fiscal primitives for Nepali billing software: Bikram Sambat dates, fiscal years, exact VAT arithmetic, PAN validation and CBMS invoice payloads.

Zero runtime dependencies. No floating-point money. TypeScript, ESM, Node 20+.

```bash
npm install nepal-fiscal
```

---

## Why this exists

npm has a dozen good Bikram Sambat date converters. It has nothing for the rest of what a Nepali billing system needs — the fiscal year that starts in Shrawan, VAT extraction from tax-inclusive prices, invoice numbering that resets each fiscal year, and the payload shape the Inland Revenue Department's Central Billing Monitoring System expects.

So every team building billing software in Nepal writes that layer again, usually inline, usually with floating-point money and a fiscal year that quietly assumes Baishakh.

This library is that layer, extracted and tested.

It is written from the rules — the VAT Act, the VAT Rules, and the Electronic Billing Directive 2074 — not from any one company's implementation.

---

## The calendar data, and why it is worth reading this section

A Bikram Sambat month can be 29, 30, 31 or 32 days, and there is no formula. Every implementation ships a lookup table, and those tables come from somewhere.

This library's table was **derived by consensus of three independent implementations** — [`bikram-sambat`](https://www.npmjs.com/package/bikram-sambat), [`nepali-date-converter`](https://www.npmjs.com/package/nepali-date-converter), and [`@nakarmi23/bikram-sambat`](https://www.npmjs.com/package/@nakarmi23/bikram-sambat) — rather than transcribed from one source.

That process found something worth knowing:

> **The three sources disagree about BS 2084, 2085, 2086 and 2090.**

Not by a day here or there — by entire month lengths. For BS 2085, one source has Jestha at 30 days and another has it at 31. Those years are AD 2027–2030. Not distant: inside the planning horizon of software being written now.

Where all three agree (87 of the 91 supported years), the data is used directly. Where two of three agree, the majority is taken and the year is **flagged provisional**:

```ts
import { isProvisionalYear, bsToAd } from "nepal-fiscal";

isProvisionalYear(2083); // false — all three sources agree
isProvisionalYear(2085); // true  — two of three; verify before relying on it

bsToAd({ year: 2085, month: 2, day: 15 }); // still converts, does not throw
```

Provisional years convert normally rather than throwing, because refusing would be worse than a documented caveat. This library will tell you when to be careful; it will not pretend to certainty it does not have.

### Why those years cannot simply be looked up

There is a reason the sources disagree, and it is worth stating, because the obvious advice — *check it against the official calendar* — does not yet work for these years.

Bikram Sambat month lengths are not computed from a rule. They are **determined** by the [नेपाल पञ्चाङ्ग निर्णायक विकास समिति](https://npns.gov.np/), the government committee that publishes the official patro. As of Shrawan 2083 (August 2026), that committee has published through **BS 2083** — the current year. There is no official patro for 2084, 2085, 2086 or 2090 to consult.

So the three reference implementations do not disagree because two are careless and one is right. They disagree because **all three are extrapolating a calendar no authority has fixed yet**. No source can settle these years today; the committee publishes year by year, so 2084 resolves around AD 2027, 2085 around 2028, and 2090 not until 2033.

If you are computing a statutory deadline that falls in a provisional year, that is the situation to plan around: not a gap in this library's research, but a date the authority itself has not yet declared.

Supported range: **BS 2000 – 2090** (AD 1943-04-14 onward). Outside it, conversion throws rather than extrapolating.

---

## Quick start

### Dates

```ts
import { adToBs, bsToAd, parseBs, formatBs, todayBs, addBsDays } from "nepal-fiscal";

adToBs({ year: 2025, month: 4, day: 14 });   // { year: 2082, month: 1, day: 1 }
bsToAd(parseBs("2082-01-01"));                // { year: 2025, month: 4, day: 14 }

formatBs(todayBs());                          // today in Nepal Time (UTC+05:45)
addBsDays(parseBs("2082-01-01"), 45);         // arithmetic stays in the BS calendar
```

`todayBs()` uses Nepal Standard Time, not the host timezone. A server in London computing "today" from its own clock will be wrong for five hours and forty-five minutes of every day — which is exactly the window in which end-of-day sales get filed into the wrong date.

### Fiscal years

Nepal's fiscal year runs 1 Shrawan to the last day of Ashadh, spanning two BS years.

```ts
import { currentFiscalYear, fiscalYearOf, parseFiscalYear, parseBs } from "nepal-fiscal";

const fy = parseFiscalYear("2082/83");
fy.start;   // { year: 2082, month: 4, day: 1 }   — 1 Shrawan
fy.end;     // { year: 2083, month: 3, day: 31 }  — last day of Ashadh

// The trap this exists to prevent:
fiscalYearOf(parseBs("2083-01-01")).label; // "2082/83", not "2083/84"
```

Baishakh 2083 is the *first month of BS year 2083* but the *tenth month of fiscal year 2082/83*. Getting this backwards is the single most common bug in Nepali accounting software, and it does not surface until the annual return fails to reconcile.

`parseFiscalYear` accepts `"2082/83"`, `"2082/2083"`, `"2082-83"`, `"2082.83"` and `"2082"`, and rejects `"2082/84"` rather than guessing.

### Money

```ts
import { Money } from "nepal-fiscal";

const price = Money.parse("1234.56");   // exact, held as integer paisa
price.add(Money.parse("0.10")).toString();  // "1234.66"
price.format();                              // "Rs 1,234.56"  (Nepali 2-2-3 grouping)

Money.parse("10.00").allocate(3).map(String);  // ["3.34", "3.33", "3.33"] — sums exactly
```

`Money.parse` rejects a third decimal place rather than silently rounding it away. Converting from a JS number is possible but named `unsafeFromNumber`, so it shows up in a code review.

### VAT

```ts
import { Money, addVat, extractVat, computeVat } from "nepal-fiscal";

addVat(Money.parse("100.00")).vat.toString();      // "13.00"
extractVat(Money.parse("113.00")).net.toString();  // "100.00"  — exact 13/113

const totals = computeVat([
  { unitPrice: Money.parse("19.99"), quantity: 3 },
  { unitPrice: Money.parse("45.00"), quantity: 1, treatment: "exempt" },
  { unitPrice: Money.parse("30.00"), quantity: 1, treatment: "zero-rated" },
]);

totals.totalVat;      // rounded per line, then summed — so the printed column adds up
totals.exemptNet;     // reported separately from...
totals.zeroRatedNet;  // ...zero-rated supplies
```

Exempt and zero-rated are kept apart deliberately. Both produce no output tax, but they go in different boxes on the return, and input tax is recoverable on one and not the other. Libraries that collapse them into a boolean lose information the filing needs.

### Invoice numbering

```ts
import { InvoiceSequence, fiscalYear, parseBs } from "nepal-fiscal";

const seq = new InvoiceSequence(fiscalYear(2082), { startAt: 501 });
seq.issue(parseBs("2082-04-01")).formatted;  // "2082/83-000501"

seq.issue(parseBs("2083-04-01"));  // throws — that date is in FY 2083/84
```

The sequence resets each fiscal year, as the Directive requires, and a cancelled invoice keeps its number. `InvoiceSequence` is in-memory and single-process — a correctness helper to drive or test against, not a distributed sequence. In production the authoritative counter belongs in your database behind a unique constraint on `(fiscal_year, sequence)`.

### CBMS payloads

```ts
import { buildCbmsPayload, cbmsAmountsFromVat, computeVat, fiscalYear, parseBs, Money } from "nepal-fiscal";

const totals = computeVat([{ unitPrice: Money.parse("100.00"), quantity: 1 }]);

const payload = buildCbmsPayload({
  sellerPan: "123456789",
  buyerPan: "987654321",
  buyerName: "Some Buyer Pvt. Ltd.",
  fiscalYear: fiscalYear(2082),
  invoiceNumber: "2082/83-000001",
  invoiceDate: parseBs("2082-04-01"),
  amounts: cbmsAmountsFromVat(totals),
  realTime: true,
  billPrinted: true,
});
```

`buildCbmsPayload` throws if the component amounts do not reconstruct the total exactly, so a payload that would fail an IRD reconciliation months later fails here instead.

**It builds the body. It does not send it.** That is deliberate: the Directive treats an unacknowledged invoice as un-issued, so the transmit path needs your own persistence, and a retry loop that forgets what it already sent creates duplicates the IRD will not let you delete. The shape that works:

1. Persist the invoice with `synced = false`.
2. Build the payload and POST it.
3. On success only, set `synced = true` and store the response.
4. Sweep unsynced invoices on a schedule with bounded backoff.

---

## What this library deliberately does not do

Stated plainly, because a library that overstates its scope costs you more than one that admits its edges.

**No PAN checksum.** A Nepali PAN is nine digits. The IRD has not published a check-digit algorithm, and several libraries in other languages invent one — which means they reject real PANs. `isWellFormedPan` checks structure only. The authoritative check is the IRD taxpayer portal.

**No baked-in thresholds.** The transaction value above which a buyer's PAN must appear on an invoice is set administratively and has changed more than once. `buyerPanRequired(amount, threshold)` takes it as a parameter. Silently applying last year's figure would be worse than making you look it up.

**No HTTP client, no credentials.** See above.

**No claim that floating point breaks VAT.** This gets asserted a lot, so it was tested: over every paisa value up to Rs 20,000, computing `gross - gross / 1.13` in a double and rounding at the end gives the same answer as the exact 13/113 ratio. Zero divergences. The case for exact arithmetic here is accumulation across many operations, reproducibility across runtimes, and being able to show an auditor exact arithmetic rather than argue about a tolerance — not that a single multiplication goes wrong.

**Not a substitute for reading the Directive.** This encodes rules as they are published. Where a rule is ambiguous or has changed, the library exposes a parameter rather than picking for you.

---

## Testing

```bash
npm test
```

128 tests, including:

- **Every day in the supported range** converted BS → AD → BS, asserting the Gregorian dates advance by exactly one day with no gap or repeat — 33,000+ dates. A uniformly wrong table would pass a round-trip test; this catches a bad month length.
- A **drift guard** asserting the committed calendar table is exactly what the generator produces from the pinned sources — so a hand-edit, a botched regeneration, or an upstream revision to a disputed year cannot pass unnoticed.
- **Differential tests against all three reference implementations**, on month lengths and on sampled dates across every unanimous year, plus a continuous 44-year AD sweep.
- A test that **fails loudly if the sources ever stop disagreeing** about BS 2084–2086, so the provisional flags get revisited rather than going stale.
- Exhaustive VAT reconciliation: for every gross amount up to Rs 200, net + VAT is asserted to equal the gross exactly.
- Allocation invariants: splitting any amount 1 to 100 ways always sums back to the original.

The three reference implementations are `devDependencies`. Nothing in `src/` imports them, and they are not published.

---

## API

| Area | Exports |
|---|---|
| Dates | `adToBs` `bsToAd` `parseBs` `formatBs` `todayBs` `addBsDays` `daysInBsMonth` `daysInBsYear` `isValidBsDate` `dateToBs` `bsToDate` `isProvisionalYear` `BS_MONTHS` `BS_MONTHS_NP` `SUPPORTED_BS_YEARS` |
| Fiscal year | `fiscalYear` `fiscalYearOf` `fiscalYearOfAd` `currentFiscalYear` `parseFiscalYear` `isInFiscalYear` `fiscalQuarterOf` `fiscalYearMonths` `fiscalYearRangeAd` |
| Money | `Money` |
| VAT | `addVat` `extractVat` `computeVat` `netVatPayable` `STANDARD_VAT_RATE` |
| PAN | `isWellFormedPan` `normalisePan` `parsePan` `buyerPanRequired` `canIssueTaxInvoice` |
| Invoicing | `InvoiceSequence` `formatInvoiceNumber` `parseInvoiceNumber` `assertInvoiceDateInFiscalYear` |
| CBMS | `buildCbmsPayload` `cbmsAmountsFromVat` |

All errors extend `NepalFiscalError`.

---

## Contributing

Corrections to the calendar data are especially welcome, and the bar is evidence: a citation to the official patro for the year in question beats another library agreeing with you. Most Nepali calendar sites derive from the same handful of datasets these reference implementations do, so three of them agreeing is one source counted three times.

The provisional years — 2084, 2085, 2086, 2090 — cannot be settled from any source today, for the reason given [above](#why-those-years-cannot-simply-be-looked-up): the committee has not published them. The useful contribution is therefore **timed**: when the committee publishes the patro for one of those years, open an issue with the citation. That is the moment the flag can come off, and it is easy to miss.

`npm run calendar` regenerates the table from the reference implementations, and a test asserts the committed file still matches what that produces — so an upstream revision to a disputed year shows up as a failing build rather than a silent change.

Bug reports that come with a failing test are the fastest route to a fix.

## Licence

MIT
