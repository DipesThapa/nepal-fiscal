/**
 * nepal-fiscal — fiscal primitives for Nepali billing software.
 *
 * Bikram Sambat dates, fiscal years, exact VAT arithmetic, PAN validation and
 * CBMS payloads. Zero runtime dependencies. No floating-point money.
 *
 * @packageDocumentation
 */

export {
  NepalFiscalError,
  InvalidBsDateError,
  InvalidAdDateError,
  MoneyError,
  ValidationError,
} from "./errors.js";

export {
  type BsDate,
  type AdDate,
  BS_MONTHS,
  BS_MONTHS_NP,
  SUPPORTED_BS_YEARS,
  isProvisionalYear,
  daysInBsMonth,
  daysInBsYear,
  assertValidBsDate,
  isValidBsDate,
  bsToDayNumber,
  bsToAd,
  adToBs,
  dateToBs,
  bsToDate,
  formatBs,
  parseBs,
  addBsDays,
  todayBs,
  toNepalCalendarDay,
} from "./bs-date.js";

export {
  EPOCH_AD,
  VERIFIED_YEAR_COUNT,
  PROVISIONAL_BS_YEARS,
} from "./calendar-data.js";

export {
  type FiscalYear,
  FISCAL_YEAR_START_MONTH,
  FISCAL_YEAR_END_MONTH,
  fiscalYear,
  fiscalYearOf,
  fiscalYearOfAd,
  currentFiscalYear,
  parseFiscalYear,
  labelFor,
  isInFiscalYear,
  fiscalQuarterOf,
  fiscalYearRangeAd,
  fiscalYearMonths,
  describeFiscalYear,
} from "./fiscal-year.js";

export { Money, type RoundingMode } from "./money.js";

export {
  type VatTreatment,
  type VatBreakdown,
  type VatLineInput,
  type VatLine,
  type VatTotals,
  STANDARD_VAT_RATE,
  STANDARD_VAT_PERCENT,
  addVat,
  extractVat,
  computeVat,
  netVatPayable,
} from "./vat.js";

export {
  type TaxpayerMode,
  PAN_LENGTH,
  isWellFormedPan,
  normalisePan,
  parsePan,
  buyerPanRequired,
  canIssueTaxInvoice,
} from "./pan.js";

export {
  type InvoiceNumber,
  type InvoiceNumberOptions,
  formatInvoiceNumber,
  assertInvoiceDateInFiscalYear,
  InvoiceSequence,
  parseInvoiceNumber,
} from "./invoice.js";

export {
  type CbmsAmounts,
  type CbmsInvoiceInput,
  type CbmsPayload,
  buildCbmsPayload,
  cbmsAmountsFromVat,
} from "./cbms.js";
