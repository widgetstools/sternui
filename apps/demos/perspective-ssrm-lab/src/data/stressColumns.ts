import type { ColDef, ValueFormatterParams } from 'ag-grid-community';
import type { LabRow } from './types';
import { defaultColDef, fmt } from './columns';

/**
 * The stress book: 50,000 rows x 120 REAL columns.
 *
 * ## Why this file was rewritten
 *
 * It used to build 400 columns — 34 bound to fields and 366 synthetic `sNNN`
 * columns computed in the window by a `valueGetter` from `id` and `midPrice`.
 * That made every measurement taken on this tab wrong in the same direction.
 * MEASURED (`perspective-grid/scripts/columnPayloadProbe.mjs`) on the old
 * shape: AG reported 404 columns while a block carried **56**, because a
 * Perspective View carries the columns of the TABLE and the Table only ever had
 * the ~53 fields the lab declared. "400 columns" was a property of the grid, not
 * of the book, and a 284x read-cost figure was built on the confusion.
 *
 * Every column here binds to a field the mock position row actually produces,
 * so the number of columns, the width of the Table and the width of a block are
 * ONE number. There is no `valueGetter` in this file and there should never be:
 * a computed column costs the renderer and nothing else, which is the opposite
 * of what a stress book is for.
 *
 * ## Choosing the fields
 *
 * `buildPosition` emits 274 flat paths, of which 109 are numbers and 93 are
 * strings. The list below is the first 121 top-level scalars, with the fields
 * the seeded profiles, style rules and alerts name hoisted to the front so they
 * cannot be lost by a later trim — a rule naming a field the Table does not
 * carry does not fail, it silently answers null.
 *
 * Dotted paths (`ratings.sp.rating`, `keyRateDurations.1Y`) are excluded on
 * purpose: a dot in a Perspective column name is a needless hazard and every
 * one of them has a flat twin (`spRating`, `krd1Y`).
 */

/** Rows in the stress book. */
export const STRESS_ROW_COUNT = 50_000;

/** RENDERED columns. The Table carries these plus {@link STRESS_KEY_FIELD}. */
export const STRESS_COL_COUNT = 120;

/** Index column. Declared and carried, but not rendered as a column. */
export const STRESS_KEY_FIELD = 'id';

/**
 * Every field the stress Table declares, with its type.
 *
 * This is what the provider is built from, so it is also exactly what a block
 * carries. Types are stated rather than inferred because Perspective COERCES a
 * wrong-typed value instead of rejecting it — declaring `id` as a number once
 * turned every `POS-…` string into `0` and collapsed the whole book onto one
 * row, with nothing logged anywhere.
 */
export const STRESS_FIELD_TYPES: Record<string, 'string' | 'number'> = {
  id: 'string',
  assetClass: 'string',
  issuerSector: 'string',
  marketValue: 'number',
  dailyPnL: 'number',
  unrealizedPnL: 'number',
  quantityFace: 'number',
  oas: 'number',
  dv01: 'number',
  modifiedDuration: 'number',
  positionKey: 'string',
  cusip: 'string',
  isin: 'string',
  sedol: 'string',
  ticker: 'string',
  figi: 'string',
  internalId: 'string',
  issuerName: 'string',
  issuerLei: 'string',
  issuerCountry: 'string',
  issuerCountryCode: 'string',
  issuerSubSector: 'string',
  issuerIndustryGroup: 'string',
  ultimateParent: 'string',
  issuerType: 'string',
  esgScore: 'number',
  securityType: 'string',
  securitySubType: 'string',
  assetSubClass: 'string',
  currency: 'string',
  issueDate: 'string',
  firstSettleDate: 'string',
  maturityDate: 'string',
  originalMaturity: 'number',
  workoutDate: 'string',
  workoutPrice: 'number',
  seniority: 'string',
  instrumentDescription: 'string',
  cfiCode: 'string',
  micCode: 'string',
  exchange: 'string',
  listingStatus: 'string',
  couponType: 'string',
  couponRate: 'number',
  couponFrequency: 'number',
  dayCount: 'string',
  accrualBasis: 'string',
  businessDayConvention: 'string',
  paymentDelay: 'number',
  interestAccrualMethod: 'string',
  firstCouponDate: 'string',
  nextCouponDate: 'string',
  lastCouponDate: 'string',
  exDivDays: 'number',
  bidPrice: 'number',
  askPrice: 'number',
  midPrice: 'number',
  lastPrice: 'number',
  evalPrice: 'number',
  closePrice: 'number',
  openPrice: 'number',
  highPrice: 'number',
  lowPrice: 'number',
  priceDate: 'string',
  priceTime: 'string',
  priceSource: 'string',
  priceQuality: 'string',
  bidYield: 'number',
  askYield: 'number',
  midYield: 'number',
  bidSize: 'number',
  askSize: 'number',
  bidSpread: 'number',
  askSpread: 'number',
  quotedSpread: 'number',
  priceChange: 'number',
  priceChangePct: 'number',
  yieldChange: 'number',
  quoteCount24h: 'number',
  yieldToMaturity: 'number',
  yieldToWorst: 'number',
  currentYield: 'number',
  bondEquivalentYield: 'number',
  zSpread: 'number',
  iSpread: 'number',
  assetSwapSpread: 'number',
  gSpread: 'number',
  nominalSpread: 'number',
  benchmark: 'string',
  benchmarkPrice: 'number',
  benchmarkYield: 'number',
  benchmarkSpreadBps: 'number',
  benchmarkTenor: 'string',
  macaulayDuration: 'number',
  effectiveDuration: 'number',
  spreadDuration: 'number',
  oad: 'number',
  oac: 'number',
  convexity: 'number',
  effectiveConvexity: 'number',
  pv01: 'number',
  cs01: 'number',
  ir01: 'number',
  theta: 'number',
  ttmYears: 'number',
  krd1Y: 'number',
  krd2Y: 'number',
  krd5Y: 'number',
  krd10Y: 'number',
  krd30Y: 'number',
  compositeRating: 'string',
  ratingsBucket: 'string',
  impliedRating: 'string',
  ratingDate: 'string',
  ratingOutlook: 'string',
  watchStatus: 'string',
  probabilityOfDefault: 'number',
  lossGivenDefault: 'number',
  recoveryRate: 'number',
  distanceToDefault: 'number',
  moodysRating: 'string',
};

/** The 120 rendered fields, in display order. */
export const STRESS_COLUMN_FIELDS: readonly string[] = Object.keys(
  STRESS_FIELD_TYPES,
).filter((field) => field !== STRESS_KEY_FIELD);

/**
 * Low-cardinality strings worth grouping by. Everything else is left
 * un-groupable: grouping a 50,000-value column produces 50,000 groups and is
 * only ever a mistake.
 */
const GROUPABLE = new Set([
  'assetClass',
  'assetSubClass',
  'issuerSector',
  'issuerSubSector',
  'issuerCountryCode',
  'issuerCountry',
  'currency',
  'compositeRating',
  'ratingsBucket',
  'securityType',
  'securitySubType',
  'seniority',
  'issuerType',
  'couponType',
  'exchange',
  'listingStatus',
  'priceSource',
  'priceQuality',
  'benchmark',
  'ratingOutlook',
  'watchStatus',
  'moodysRating',
]);

/** Fields that read as a date rather than a number or a name. */
const DATE_FIELDS = new Set([
  'issueDate',
  'firstSettleDate',
  'maturityDate',
  'workoutDate',
  'firstCouponDate',
  'nextCouponDate',
  'lastCouponDate',
  'priceDate',
  'ratingDate',
]);

/** Numeric fields whose natural unit is basis points. */
const BPS_FIELDS = new Set([
  'bidSpread',
  'askSpread',
  'quotedSpread',
  'zSpread',
  'iSpread',
  'gSpread',
  'oas',
  'nominalSpread',
  'assetSwapSpread',
  'benchmarkSpreadBps',
]);

/** Numeric fields large enough to want thousands separators and no decimals. */
const MONEY_FIELDS = new Set([
  'quantityFace',
  'originalFace',
  'currentFace',
  'marketValue',
  'bookValue',
  'amortizedCost',
  'avgCost',
  'unrealizedPnL',
  'realizedPnL',
  'dailyPnL',
  'mtdPnL',
  'ytdPnL',
  'inceptionPnL',
  'avgDailyVolume30d',
  'tradingVolumeMtd',
]);

const SIGNED_FIELDS = new Set([
  'unrealizedPnL',
  'realizedPnL',
  'dailyPnL',
  'mtdPnL',
  'ytdPnL',
  'inceptionPnL',
]);

function formatterFor(field: string): ((p: ValueFormatterParams) => string) | undefined {
  if (DATE_FIELDS.has(field)) return fmt.date;
  if (field === 'lastUpdate') return fmt.time;
  if (SIGNED_FIELDS.has(field)) return fmt.signedMoney;
  if (MONEY_FIELDS.has(field)) return fmt.money;
  if (BPS_FIELDS.has(field)) return fmt.bps;
  return fmt.num4;
}

/** `bidPrice` -> `Bid Price`. Nothing in the mock row needs a hand-written label. */
function headerNameFor(field: string): string {
  const spaced = field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Build the stress column defs — exactly {@link STRESS_COL_COUNT} of them, each
 * bound to a real Table field.
 */
export function buildStressColumnDefs(): ColDef<LabRow>[] {
  return STRESS_COLUMN_FIELDS.map((field) => {
    const numeric = STRESS_FIELD_TYPES[field] === 'number';
    const isDate = DATE_FIELDS.has(field);
    return {
      field,
      colId: field,
      headerName: headerNameFor(field),
      width: numeric ? 110 : 140,
      minWidth: 72,
      ...(numeric && !isDate
        ? {
            type: 'numericColumn' as const,
            filter: 'agNumberColumnFilter',
            enableValue: true,
            valueFormatter: formatterFor(field),
            // Cheap charting surface for wide-book stress.
            chartDataType: 'series' as const,
          }
        : {
            filter: 'agTextColumnFilter',
            ...(isDate ? { valueFormatter: fmt.date } : {}),
          }),
      ...(GROUPABLE.has(field) ? { enableRowGroup: true } : {}),
      enablePivot: true,
      floatingFilter: true,
    } satisfies ColDef<LabRow>;
  });
}

/** Default column behaviour for the stress tab — grouping + pivot ready. */
export const stressDefaultColDef: ColDef = {
  ...defaultColDef,
  floatingFilter: true,
  enableRowGroup: true,
  enableValue: true,
  enablePivot: true,
  minWidth: 72,
};
