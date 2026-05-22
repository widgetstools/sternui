/**
 * STOMP positions schema + FI blotter formatting for star-spg-starter config.
 *
 * Field paths match `apps/stomp-view-server/src/data/fiRecords.ts`.
 * Header names and Excel formats are inferred from the **last path segment**
 * (industry FI trading conventions).
 */

import {
  buildFiAutoFormatAssignments,
  buildFiConditionalStylingRules,
} from '@starui/engine';
import type { ColumnDefinition } from '@starui/shared-types';

const RESERVED_DEFAULT_PROFILE_ID = '__default__';
export const SCAFFOLD_BLOTTER_GRID_ID = 'openfin-scaffold-blotter';

/** Curated blotter columns — nested paths use dot notation. */
export const STOMP_POSITION_COLUMN_PATHS: readonly string[] = [
  'positionId',
  'cusip',
  'isin',
  'ticker',
  'instrumentName',
  'instrumentType',
  'productFamily',
  'bookName',
  'desk',
  'trader',
  'portfolio',
  'region',
  'country',
  'currency',
  'quantity',
  'notionalAmount',
  'marketValue',
  'bookValue',
  'accruedInterest',
  'totalValue',
  'averagePrice',
  'currentPrice',
  'priceSource',
  'pnl',
  'unrealizedPnl',
  'realizedPnl',
  'dailyPnl',
  'mtdPnl',
  'ytdPnl',
  'maturityDate',
  'issueDate',
  'couponRate',
  'couponFrequency',
  'nextCouponDate',
  'yield',
  'yieldToMaturity',
  'modifiedDuration',
  'effectiveDuration',
  'convexity',
  'spread',
  'assetSwapSpread',
  'zSpread',
  'oas',
  'dv01',
  'pv01',
  'cs01',
  'rating.composite',
  'rating.sp',
  'rating.moody',
  'issuer.name',
  'issuer.sector',
  'issuer.country',
  'issuer.creditRating',
  'marketData.bidPrice',
  'marketData.midPrice',
  'marketData.askPrice',
  'marketData.lastTradePrice',
  'marketData.lastTradeTime',
  'marketData.volume',
  'riskMetrics.var95',
  'riskMetrics.var99',
  'liquidity.bidAskSpread',
  'liquidity.liquidityScore',
  'performance.dailyReturn',
  'performance.mtdReturn',
  'performance.ytdReturn',
  'asOfDate',
];

const FI_HEADERS: Record<string, string> = {
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
  macaulayDuration: 'Mac Dur',
  convexity: 'Convexity',
  effectiveConvexity: 'Eff Cvx',
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

const fmt = {
  px3: '#,##0.000',
  pxArrow: '[Green]▲ #,##0.000;[Red]▼ #,##0.000;[Blue]— 0.000',
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
};

function leafOf(path: string): string {
  const i = path.lastIndexOf('.');
  return i >= 0 ? path.slice(i + 1) : path;
}

function headerFor(path: string): string {
  const leaf = leafOf(path);
  return FI_HEADERS[leaf] ?? leaf.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}

type FiKind =
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

function classifyFiField(path: string): FiKind {
  const leaf = leafOf(path);
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
    if (/dv01|pv01|cs01/.test(l)) return 'number';
    return 'number';
  }
  if (/amount|value|notional|accrued|interest$|volume|capital|rwa|consideration|principal|fee|commission|haircut|collateral|marketdepth|marketcap/.test(l)) return 'money';
  if (/quantity|count|freq|frequency|warf|was/.test(l)) return /quantity|count/.test(l) ? 'qty' : 'number';
  if (/rating|sector|name|type|status|index|source|parent|mic|lei|tranche|convention/.test(l)) return 'set';
  return 'number';
}

export interface FiColumnMeta {
  field: string;
  headerName: string;
  cellDataType: NonNullable<ColumnDefinition['cellDataType']>;
  filter: string;
  width: number;
  type?: string;
  excelFormat?: string;
  align: 'left' | 'right' | 'center';
  pinned?: 'left';
}

export function fiMetaForPath(path: string): FiColumnMeta {
  const kind = classifyFiField(path);
  const leaf = leafOf(path);
  const base: FiColumnMeta = {
    field: path,
    headerName: headerFor(path),
    cellDataType: 'text',
    filter: 'agTextColumnFilter',
    width: 110,
    align: 'left',
  };

  switch (kind) {
    case 'id':
      return {
        ...base,
        width: path === 'cusip' ? 108 : path === 'positionId' ? 120 : 90,
        filter: 'agTextColumnFilter',
        pinned: ['positionId', 'cusip', 'ticker'].includes(path) ? 'left' : undefined,
      };
    case 'set':
      return { ...base, filter: 'agSetColumnFilter', width: path === 'instrumentName' ? 220 : 100 };
    case 'price':
      return {
        ...base,
        cellDataType: 'number',
        type: 'numericColumn',
        filter: 'agNumberColumnFilter',
        width: 88,
        align: 'right',
        excelFormat: /current|mid|last/i.test(leaf) ? fmt.pxArrow : fmt.px3,
      };
    case 'yield':
      return {
        ...base,
        cellDataType: 'number',
        type: 'numericColumn',
        filter: 'agNumberColumnFilter',
        width: 82,
        align: 'right',
        excelFormat: fmt.yieldPct,
      };
    case 'spread':
      return {
        ...base,
        cellDataType: 'number',
        type: 'numericColumn',
        filter: 'agNumberColumnFilter',
        width: 86,
        align: 'right',
        excelFormat: fmt.spreadBps,
      };
    case 'money':
      return {
        ...base,
        cellDataType: 'number',
        type: 'numericColumn',
        filter: 'agNumberColumnFilter',
        width: 120,
        align: 'right',
        excelFormat: fmt.money,
      };
    case 'pnl':
      return {
        ...base,
        cellDataType: 'number',
        type: 'numericColumn',
        filter: 'agNumberColumnFilter',
        width: 108,
        align: 'right',
        excelFormat: fmt.pnl,
      };
    case 'qty':
      return {
        ...base,
        cellDataType: 'number',
        type: 'numericColumn',
        filter: 'agNumberColumnFilter',
        width: 96,
        align: 'right',
        excelFormat: fmt.qty,
      };
    case 'duration':
      return {
        ...base,
        cellDataType: 'number',
        type: 'numericColumn',
        filter: 'agNumberColumnFilter',
        width: /dv01|pv01|cs01/.test(leaf) ? 88 : 80,
        align: 'right',
        excelFormat: /dv01|pv01|cs01/.test(leaf) ? fmt.dv01 : fmt.dur,
      };
    case 'percent':
      return {
        ...base,
        cellDataType: 'number',
        type: 'numericColumn',
        filter: 'agNumberColumnFilter',
        width: 90,
        align: 'right',
        excelFormat: fmt.pct2,
      };
    case 'date':
      return {
        ...base,
        cellDataType: 'dateString',
        filter: 'agDateColumnFilter',
        width: 108,
        align: 'center',
        excelFormat: fmt.date,
      };
    case 'datetime':
      return {
        ...base,
        cellDataType: 'dateString',
        filter: 'agTextColumnFilter',
        width: 160,
        align: 'center',
      };
    case 'number':
    default:
      return {
        ...base,
        cellDataType: 'number',
        type: 'numericColumn',
        filter: 'agNumberColumnFilter',
        width: 90,
        align: 'right',
        excelFormat: fmt.intRate,
      };
  }
}

export function buildStompPositionColumnDefinitions(): ColumnDefinition[] {
  return STOMP_POSITION_COLUMN_PATHS.map((path) => {
    const m = fiMetaForPath(path);
    const col: ColumnDefinition = {
      field: m.field,
      headerName: m.headerName,
      cellDataType: m.cellDataType,
      width: m.width,
      filter: m.filter,
      sortable: true,
      resizable: true,
    };
    if (m.type) col.type = m.type;
    return col;
  });
}

export interface ColumnCustomizationAssignment {
  colId: string;
  valueFormatterTemplate?: { kind: 'excelFormat'; format: string };
  cellStyleOverrides?: {
    alignment?: { horizontal: 'left' | 'right' | 'center' };
    typography?: { bold?: boolean };
  };
}

/** Profile assignments — same rules as formatting toolbar **Auto FI**. */
export function buildColumnCustomizationAssignments(): Record<string, ColumnCustomizationAssignment> {
  return buildFiAutoFormatAssignments(STOMP_POSITION_COLUMN_PATHS) as Record<
    string,
    ColumnCustomizationAssignment
  >;
}

/** Visible FI paints (complements Excel formatters in column-customization). */
export function buildConditionalStylingState() {
  return { rules: buildFiConditionalStylingRules(STOMP_POSITION_COLUMN_PATHS) };
}

export function buildDefaultProfileSnapshot(gridId: string) {
  const now = Date.now();
  return {
    id: RESERVED_DEFAULT_PROFILE_ID,
    gridId,
    name: 'Default',
    createdAt: now,
    updatedAt: now,
    state: {
      'column-customization': {
        v: 1,
        data: { assignments: buildColumnCustomizationAssignments() },
      },
      'conditional-styling': {
        v: 1,
        data: buildConditionalStylingState(),
      },
    },
  };
}

/** Stomp provider payload fragment for positions.dp */
export function buildPositionsDpProviderPayload() {
  return {
    providerType: 'stomp',
    websocketUrl: 'ws://localhost:8081',
    listenerTopic: '/snapshot/positions/TRADER001',
    requestMessage: '/snapshot/positions/TRADER001/1000/50',
    requestBody: '',
    snapshotEndToken: 'Success',
    snapshotTimeoutMs: 60_000,
    dataType: 'positions',
    keyColumn: 'positionId',
    autoStart: false,
    columnDefinitions: buildStompPositionColumnDefinitions(),
    __providerMeta: {
      description: 'Positions snapshot + live deltas from stomp-view-server (npm run dev:stomp)',
      tags: ['stomp', 'positions', 'local'],
      isDefault: false,
      public: true,
    },
  };
}
