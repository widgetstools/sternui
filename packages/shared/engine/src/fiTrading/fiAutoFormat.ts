/**
 * Fixed-income blotter auto-format presets.
 *
 * Infers column treatment from the **last path segment** of each `colId`
 * (e.g. `marketData.bidPrice` → `bidPrice`), matching conventions used
 * across Bloomberg, Tradeweb, MarketAxess, and internal desk blotters:
 *   - Identifiers / enums: left-aligned, text filters
 *   - Prices, yields, spreads, money, P&amp;L, quantities: right-aligned
 *     cells **and headers**, Excel-style format strings, bold on key measures
 *   - Dates: center-aligned
 *
 * Consumed by the formatting toolbar **Auto FI Format** action and by
 * scaffold/starter config generators.
 */
import type { CellStyleOverrides, ValueFormatterTemplate } from '../colDef/types.js';
import type { ColumnAssignment } from '../customizer/modules/column-customization/state.js';

/** Well-known FI column header labels by leaf field name. */
export const FI_TRADING_HEADERS: Record<string, string> = {
  positionId: 'Position ID',
  cusip: 'CUSIP',
  isin: 'ISIN',
  sedol: 'SEDOL',
  ticker: 'Tkr',
  instrumentName: 'Instrument',
  instrumentType: 'Product',
  productFamily: 'Family',
  bookName: 'Book',
  desk: 'Desk',
  trader: 'Trader',
  portfolio: 'Portfolio',
  region: 'Region',
  country: 'Country',
  currency: 'Ccy',
  quantity: 'Qty',
  notionalAmount: 'Notional',
  marketValue: 'Mkt Value',
  bookValue: 'Book Value',
  accruedInterest: 'Accrued',
  totalValue: 'Total Value',
  averagePrice: 'Avg Px',
  currentPrice: 'Px',
  priceSource: 'Px Src',
  pnl: 'P&L',
  unrealizedPnl: 'Unreal P&L',
  realizedPnl: 'Real P&L',
  dailyPnl: 'P&L (D)',
  mtdPnl: 'P&L (MTD)',
  ytdPnl: 'P&L (YTD)',
  maturityDate: 'Maturity',
  issueDate: 'Issue',
  couponRate: 'Cpn %',
  couponFrequency: 'Cpn Freq',
  nextCouponDate: 'Next Cpn',
  yield: 'Yield',
  yieldToMaturity: 'YTM',
  modifiedDuration: 'Mod Dur',
  effectiveDuration: 'Eff Dur',
  convexity: 'Convex',
  spread: 'Spread',
  assetSwapSpread: 'ASW',
  zSpread: 'Z-Spread',
  oas: 'OAS',
  dv01: 'DV01',
  pv01: 'PV01',
  cs01: 'CS01',
  composite: 'Rating',
  sp: 'S&P',
  moody: "Moody's",
  fitch: 'Fitch',
  internal: 'Int Rtg',
  name: 'Issuer',
  sector: 'Sector',
  creditRating: 'Issuer Rtg',
  bidPrice: 'Bid',
  midPrice: 'Mid',
  askPrice: 'Ask',
  lastTradePrice: 'Last',
  lastTradeTime: 'Last Trade',
  volume: 'Volume',
  var95: 'VaR 95%',
  var99: 'VaR 99%',
  bidAskSpread: 'Bid-Ask',
  liquidityScore: 'Liq Score',
  dailyReturn: 'Ret (D)',
  mtdReturn: 'Ret (MTD)',
  ytdReturn: 'Ret (YTD)',
  asOfDate: 'As Of',
  bid: 'Bid',
  ask: 'Ask',
};

const EXCEL = {
  px3: '#,##0.000',
  yieldPct: '#,##0.000"%"',
  spreadBps: '[Green]+#,##0" bps";[Red]#,##0" bps";[Blue]0" bps"',
  money: '#,##0',
  pnl: '[Green]+#,##0;[Red]−#,##0;[Blue]0',
  qty: '#,##0',
  dur: '#,##0.00',
  dv01: '#,##0.00',
  pct2: '0.00"%"',
  date: 'yyyy-mm-dd',
  intRate: '#,##0.00',
} as const;

export type FiFieldKind =
  | 'id'
  | 'text'
  | 'set'
  | 'price'
  | 'yield'
  | 'spread'
  | 'money'
  | 'pnl'
  | 'qty'
  | 'duration'
  | 'date'
  | 'datetime'
  | 'percent'
  | 'number';

export type FiHorizontalAlign = 'left' | 'right' | 'center';

export interface FiFormatMeta {
  kind: FiFieldKind;
  leaf: string;
  headerName: string;
  excelFormat?: string;
  /** Cell body alignment (FI desks: numerics right, text left). */
  cellAlign: FiHorizontalAlign;
  /** Header alignment — kept in sync with cell alignment for numerics. */
  headerAlign: FiHorizontalAlign;
  boldCell: boolean;
}

export function leafOfFieldPath(path: string): string {
  const i = path.lastIndexOf('.');
  return i >= 0 ? path.slice(i + 1) : path;
}

export function headerLabelForFieldPath(path: string): string {
  const leaf = leafOfFieldPath(path);
  return (
    FI_TRADING_HEADERS[leaf]
    ?? leaf.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()
  );
}

/** Classify a column from its field path (last segment drives FI semantics). */
export function classifyFiFieldFromPath(path: string): FiFieldKind {
  const leaf = leafOfFieldPath(path);
  const l = leaf.toLowerCase();

  if (/(^id$|positionid|cusip|isin|sedol|ticker|bookname|desk|trader|portfolio|region|country|currency|instrumenttype|productfamily|pricesource|instrumentname|breachstatus)/.test(l)) {
    if (l === 'currency' || l === 'ccy') return 'set';
    if (/(cusip|isin|sedol|ticker|positionid|bookname|desk|trader)/.test(l)) return 'id';
    return 'set';
  }
  if (/pnl|return/.test(l)) return /return/.test(l) ? 'percent' : 'pnl';
  if (/date$/.test(l) && !/update|modified|created|trade/.test(l)) return 'date';
  if (/time$/.test(l) || l === 'asofdate') return /time$/.test(l) ? 'datetime' : 'date';
  if (/yield|coupon|cpr|psa|rate$/.test(l) && !/frequency|spread/.test(l)) return 'yield';
  if (/price|px$/.test(l) || l === 'bid' || l === 'ask' || l === 'mid') return 'price';
  if (/spread|oas|zspread|assetswap|wal|warf|was/.test(l)) return 'spread';
  if (/duration|convexity|beta|correlation|dv01|pv01|cs01|var|cvar|sharpe|tracking|liquidityscore|bidask/.test(l)) {
    if (/duration|convexity/.test(l)) return 'duration';
    return 'number';
  }
  if (/amount|value|notional|accrued|interest$|volume|capital|rwa|consideration|principal|fee|commission|haircut|collateral|marketdepth|marketcap/.test(l)) {
    return 'money';
  }
  if (/quantity|count|freq|frequency/.test(l)) return /quantity|count/.test(l) ? 'qty' : 'number';
  if (/rating|sector|name|type|status|index|source|parent|mic|lei|tranche|convention/.test(l)) return 'set';
  if (/^(sp|moody|fitch|composite|internal)$/.test(l)) return 'set';
  return 'number';
}

const NUMERIC_KINDS = new Set<FiFieldKind>([
  'price',
  'yield',
  'spread',
  'money',
  'pnl',
  'qty',
  'duration',
  'percent',
  'number',
]);

function isNumericKind(kind: FiFieldKind): boolean {
  return NUMERIC_KINDS.has(kind);
}

/** Refine classification using AG-Grid `cellDataType` when the path is ambiguous. */
export function refineFiKindWithCellDataType(
  kind: FiFieldKind,
  cellDataType: string | undefined,
): FiFieldKind {
  if (!cellDataType) return kind;
  if (cellDataType === 'number' && !isNumericKind(kind) && kind !== 'date' && kind !== 'datetime') {
    return 'number';
  }
  if ((cellDataType === 'date' || cellDataType === 'dateString') && kind !== 'datetime') {
    return 'date';
  }
  if ((cellDataType === 'text' || cellDataType === 'string') && isNumericKind(kind)) {
    return 'set';
  }
  return kind;
}

export function fiFormatMetaForColId(
  colId: string,
  opts?: { cellDataType?: string },
): FiFormatMeta {
  const leaf = leafOfFieldPath(colId);
  const kind = refineFiKindWithCellDataType(classifyFiFieldFromPath(colId), opts?.cellDataType);
  const headerName = headerLabelForFieldPath(colId);

  const base: FiFormatMeta = {
    kind,
    leaf,
    headerName,
    cellAlign: 'left',
    headerAlign: 'left',
    boldCell: false,
  };

  switch (kind) {
    case 'id':
    case 'text':
    case 'set':
      return { ...base };
    case 'price':
      return {
        ...base,
        cellAlign: 'right',
        headerAlign: 'right',
        boldCell: true,
        excelFormat: EXCEL.px3,
      };
    case 'yield':
      return {
        ...base,
        cellAlign: 'right',
        headerAlign: 'right',
        excelFormat: EXCEL.yieldPct,
      };
    case 'spread':
      return {
        ...base,
        cellAlign: 'right',
        headerAlign: 'right',
        excelFormat: EXCEL.spreadBps,
      };
    case 'money':
      return {
        ...base,
        cellAlign: 'right',
        headerAlign: 'right',
        boldCell: true,
        excelFormat: EXCEL.money,
      };
    case 'pnl':
      return {
        ...base,
        cellAlign: 'right',
        headerAlign: 'right',
        boldCell: true,
        excelFormat: EXCEL.pnl,
      };
    case 'qty':
      return {
        ...base,
        cellAlign: 'right',
        headerAlign: 'right',
        excelFormat: EXCEL.qty,
      };
    case 'duration':
      return {
        ...base,
        cellAlign: 'right',
        headerAlign: 'right',
        excelFormat: /dv01|pv01|cs01/.test(leaf) ? EXCEL.dv01 : EXCEL.dur,
      };
    case 'percent':
      return {
        ...base,
        cellAlign: 'right',
        headerAlign: 'right',
        excelFormat: EXCEL.pct2,
      };
    case 'date':
      return {
        ...base,
        cellAlign: 'center',
        headerAlign: 'center',
        excelFormat: EXCEL.date,
      };
    case 'datetime':
      return {
        ...base,
        cellAlign: 'center',
        headerAlign: 'center',
      };
    case 'number':
    default:
      return {
        ...base,
        cellAlign: 'right',
        headerAlign: 'right',
        excelFormat: EXCEL.intRate,
      };
  }
}

function alignmentOverrides(align: FiHorizontalAlign) {
  return { alignment: { horizontal: align } };
}

/**
 * Build a column-customization assignment for one `colId`.
 * Returns `null` when the column has no FI formatter (pure text/id).
 */
export function buildColumnAssignmentForColId(
  colId: string,
  opts?: { cellDataType?: string },
): ColumnAssignment {
  const meta = fiFormatMetaForColId(colId, opts);
  const assignment: ColumnAssignment = { colId };

  if (meta.excelFormat) {
    assignment.valueFormatterTemplate = {
      kind: 'excelFormat',
      format: meta.excelFormat,
    } satisfies ValueFormatterTemplate;
  }

  const cellPatch: CellStyleOverrides = {
    ...alignmentOverrides(meta.cellAlign),
    ...(meta.boldCell ? { typography: { bold: true } } : {}),
  };
  const headerPatch = alignmentOverrides(meta.headerAlign);
  // Write both theme slots so auto-format is stable regardless of active theme at click time.
  assignment.cellStyleOverrides = { dark: cellPatch, light: cellPatch };
  assignment.headerStyleOverrides = { dark: headerPatch, light: headerPatch };

  return assignment;
}

/** Merge patch into an existing assignment without dropping unrelated keys. */
function mergeAssignment(existing: ColumnAssignment, patch: ColumnAssignment): ColumnAssignment {
  const next: ColumnAssignment = { ...existing, colId: existing.colId };

  if (patch.valueFormatterTemplate) next.valueFormatterTemplate = patch.valueFormatterTemplate;
  if (patch.headerName) next.headerName = patch.headerName;

  if (patch.cellStyleOverrides) {
    next.cellStyleOverrides = mergeThemedOverrides(
      existing.cellStyleOverrides,
      patch.cellStyleOverrides,
    );
  }
  if (patch.headerStyleOverrides) {
    next.headerStyleOverrides = mergeThemedOverrides(
      existing.headerStyleOverrides,
      patch.headerStyleOverrides,
    );
  }
  return next;
}

function mergeThemedOverrides(
  existing: ColumnAssignment['cellStyleOverrides'],
  patch: ColumnAssignment['cellStyleOverrides'],
): ColumnAssignment['cellStyleOverrides'] {
  const out = { ...(existing ?? {}) };
  for (const slot of ['dark', 'light'] as const) {
    const p = patch?.[slot];
    if (!p) continue;
    const e = out[slot] ?? {};
    out[slot] = {
      ...e,
      ...p,
      alignment: p.alignment ?? e.alignment,
      typography: { ...e.typography, ...p.typography },
    };
  }
  return out;
}

/** Build assignments for every visible column id. */
export function buildFiAutoFormatAssignments(
  colIds: readonly string[],
  cellDataTypes?: Readonly<Record<string, string | undefined>>,
): Record<string, ColumnAssignment> {
  const out: Record<string, ColumnAssignment> = {};
  for (const colId of colIds) {
    const patch = buildColumnAssignmentForColId(colId, {
      cellDataType: cellDataTypes?.[colId],
    });
    if (patch) out[colId] = patch;
  }
  return out;
}
