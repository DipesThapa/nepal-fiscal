# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the major version is `0`, a minor bump may narrow what the package
supports — see `0.2.0`.

Entries describe what changed for someone **installing this package**. Changes
to CI, tests and tooling are listed under *Internal*, and do not affect the
published tarball, which contains only `dist/`, `README.md` and `LICENSE`.

## [Unreleased]

_Nothing yet._

## [0.2.1] — 2026-08-12

No functional change. Documentation and packaging only; the compiled output in
`dist/` is byte-identical to `0.2.0`.

### Added

- `CHANGELOG.md` is now included in the published package.

### Documentation

- The README explains **why** BS 2084, 2085, 2086 and 2090 cannot be settled
  from any source today. Month lengths are determined by the
  [Nepal Panchanga Nirnayak Bikash Samiti](https://npns.gov.np/), which
  publishes year by year and has reached BS 2083 — the current year. The three
  reference implementations disagree because all three are extrapolating, not
  because one holds the answer.

  Previously the README advised checking provisional years against the official
  calendar, which for these years does not yet exist. The contributing ask is
  retimed to match: cite the official patro *when the committee publishes* a
  given year.

### Internal

- The generated Bikram Sambat table is now guarded against silent drift. The
  consensus derivation moved into `scripts/derive-calendar.mjs`, shared by the
  generator and a new test asserting that the committed `src/calendar-data.ts`
  is exactly what that derivation produces from the pinned sources — epoch,
  range, unanimous count, provisional list, and every month length. A
  hand-edit, a botched regeneration, or an upstream revision to a disputed
  year now fails loudly instead of passing unnoticed.
- Fixed the epoch check in the calendar generator, which read UTC fields from
  `Date`s at local midnight and so threw `epoch disagreement` on any host not
  on UTC. `npm run calendar` only ever worked in UTC.

## [0.2.0] — 2026-08-12

### Changed

- **Minimum Node is now 20** (`engines: >=20`, previously `>=18`). Node 18
  reached end of life in April 2025. Installing on Node 18 now produces an
  `EBADENGINE` warning.

  Nothing in the library uses an API newer than Node 18, so the code itself
  would still run there — what changed is the supported-runtime claim, not the
  compatibility. This is a minor rather than a patch because it changes who can
  install cleanly.

### Internal

- CI runs the suite on Node 20, 22 and 24 against `UTC`, `Asia/Kathmandu` and
  `America/Los_Angeles`. The timezone axis is deliberate: a date bug in this
  library can be invisible in UTC and wrong everywhere else.

## [0.1.2] — 2026-08-12

No functional change. Identical in content to `0.1.0`; released to verify the
tag-triggered publishing pipeline end to end while a fallback credential was
still available.

`0.1.1` was tagged but **never published** — the release workflow failed before
reaching the publish step, so the version does not exist on npm. The tag has
since been removed. Nothing was ever installable as `0.1.1`.

### Internal

- Releases now publish from a version tag via npm trusted publishing (OIDC), so
  no long-lived token exists on any machine or in repository secrets.

## [0.1.0] — 2026-08-12

Initial release.

### Added

- **Bikram Sambat dates** — `adToBs`, `bsToAd`, `parseBs`, `formatBs`,
  `todayBs`, `addBsDays`, `daysInBsMonth`, `daysInBsYear`, `isValidBsDate`,
  `dateToBs`, `bsToDate`, `isProvisionalYear`. Supported range BS 2000–2090.
  `todayBs()` uses Nepal Standard Time (UTC+05:45) rather than the host clock.
- **Fiscal years** — `fiscalYear`, `fiscalYearOf`, `fiscalYearOfAd`,
  `currentFiscalYear`, `parseFiscalYear`, `isInFiscalYear`, `fiscalQuarterOf`,
  `fiscalYearMonths`, `fiscalYearRangeAd`. Shrawan to Ashadh, spanning two BS
  years.
- **Money** — exact arithmetic on integer paisa held in a `bigint`. Parsing
  rejects a third decimal place; conversion from a JS number is named
  `unsafeFromNumber` so it is greppable in review. `allocate` and `allocateBy`
  split without losing a paisa.
- **VAT** — `addVat`, `extractVat` (exact 13/113 for tax-inclusive prices),
  `computeVat`, `netVatPayable`. Exempt and zero-rated supplies are tracked
  separately, as the return requires. VAT is rounded per line then summed.
- **PAN** — `isWellFormedPan`, `normalisePan`, `parsePan`, `buyerPanRequired`,
  `canIssueTaxInvoice`. Structural validation only; no invented checksum, and
  the buyer-PAN threshold is a parameter rather than a baked-in figure.
- **Invoicing** — `InvoiceSequence`, `formatInvoiceNumber`,
  `parseInvoiceNumber`, `assertInvoiceDateInFiscalYear`. Sequences reset per
  fiscal year.
- **CBMS** — `buildCbmsPayload`, `cbmsAmountsFromVat`. Builds and validates the
  payload body; it does not transmit, hold credentials, or retry.

### Known limitations

- BS 2084, 2085, 2086 and 2090 rest on a two-of-three majority between the
  reference implementations, which disagree by whole month lengths. These years
  convert normally but are flagged by `isProvisionalYear`. Verify against the
  official Nepali calendar before relying on a statutory deadline that falls in
  one of them.
- `computeVat` takes whole-number quantities only; scale the unit price for
  fractional quantities.
- `buildCbmsPayload` sends `0.00` for the HST and ESF fields, and excise is
  accepted but not derived from line data. Adequate for VAT-only retail.
- `InvoiceSequence` is in-memory and single-process. In production the
  authoritative counter belongs in your database behind a unique constraint on
  `(fiscal_year, sequence)`.

[Unreleased]: https://github.com/DipesThapa/nepal-fiscal/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/DipesThapa/nepal-fiscal/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/DipesThapa/nepal-fiscal/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/DipesThapa/nepal-fiscal/releases/tag/v0.1.2
<!-- 0.1.0 was published by hand before the tag-triggered pipeline existed, so
     it has no tag; this points at the tree it was built from. -->
[0.1.0]: https://github.com/DipesThapa/nepal-fiscal/tree/0151e7b
