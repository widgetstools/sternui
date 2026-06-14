/**
 * FIELD_FORMAT_CATALOG — curated repository of common fixed-income (FI) and
 * equity trading-blotter field names, with the format, alignment and
 * semantic colour they are conventionally displayed with.
 *
 * Field ids, captions and format/type hints are sourced from
 * `docs/blotter-field-catalog.md` (Identification, Reference, Order, Trade,
 * Position, Pricing, Risk, P&L, RFQ, Settlement sections) and its section-13
 * display conventions:
 *   - Signed change  → green up / red down  (change-value / signed-value)
 *   - Side           → Buy blue/green, Sell red  (side)
 *   - Status         → chip/pill by enum  (status-badge / rfq-status)
 *   - Ratings        → badge  (rating-badge)
 *   - Yield / % / numeric → right-aligned, fixed decimals
 *   - Dates / timestamps  → localised (date / datetime presets)
 *
 * Matching is by full field id (`aliases`) or the field's last element
 * (`suffixes`) — see {@link matchFieldToCatalog} — both normalised
 * (lowercased, non-alphanumerics stripped) so `unrealizedPnl`,
 * `unrealized_pnl` and `unrealPnl` collapse to one entry.
 *
 * Notes on formatting choices:
 *   - Percent/yield/coupon fields are rendered as plain right-aligned
 *     decimals (NOT the Intl `percent` preset, which would multiply by 100)
 *     because trading systems store these as the percentage number itself
 *     (e.g. coupon `4.500`), not a fraction. The header caption conveys the
 *     unit.
 *   - Sign-colouring value renderers (`pnl-value`, `signed-value`,
 *     `change-value`) format AND colour their own cell, so those entries
 *     omit `format` to avoid double-formatting.
 */
import type { FieldFormatEntry } from './types.js';

/** Number preset (decimals + optional grouping). */
const num = (decimals: number, thousands = true): FieldFormatEntry['format'] => ({
  kind: 'preset',
  preset: 'number',
  options: { decimals, thousands },
});

export const FIELD_FORMAT_CATALOG: readonly FieldFormatEntry[] = [
  // ─── Tickers / symbols ────────────────────────────────────────────────
  {
    id: 'ticker',
    category: 'identifier',
    aliases: ['ticker', 'symbol', 'issuerticker', 'underlyingticker'],
    cellRendererId: 'ticker',
    alignment: 'left',
  },

  // ─── Prices (dec / 32nds) ─────────────────────────────────────────────
  {
    id: 'price',
    category: 'price',
    aliases: [
      'price', 'bidprice', 'askprice', 'midprice', 'lastprice', 'cleanprice',
      'dirtyprice', 'theoprice', 'evalprice', 'priorclose', 'openprice',
      'highprice', 'lowprice', 'vwap', 'avgpx', 'avgcost', 'mark', 'limitprice',
      'stopprice', 'nextcallprice', 'coverprice', 'bestbid', 'bestoffer',
      'bid', 'ask', 'mid', 'last',
    ],
    suffixes: ['price'],
    format: num(4, false),
    alignment: 'right',
  },

  // ─── Yields / rates (pct) ─────────────────────────────────────────────
  {
    id: 'yield',
    category: 'yield',
    aliases: [
      'yield', 'ytm', 'ytw', 'ytc', 'currentyield', 'bondequivyield', 'bey',
      'bidyield', 'askyield',
    ],
    suffixes: ['yield'],
    format: num(3, false),
    alignment: 'right',
  },
  {
    id: 'rate',
    category: 'rate',
    aliases: [
      'coupon', 'couponrate', 'rate', 'interestrate', 'wac', 'tbacoupon',
      'weightedloanrate', 'wlr', 'dividendyield', 'divyield', 'borrowrate',
      'participationrate', 'povrate',
    ],
    format: num(3, false),
    alignment: 'right',
  },

  // ─── Spreads (bps) ────────────────────────────────────────────────────
  {
    id: 'spread',
    category: 'spread',
    aliases: [
      'spread', 'oas', 'asw', 'gspread', 'ispread', 'zspread', 'discountmargin',
      'dm', 'benchspread', 'nominalspread', 'swapspread', 'tedspread',
      'assetswaplevel', 'bidspread', 'askspread', 'markup', 'benchmarkspread',
    ],
    suffixes: ['spread'],
    format: num(1, false),
    alignment: 'right',
  },

  // ─── P&L (sign-coloured) ──────────────────────────────────────────────
  {
    id: 'pnl',
    category: 'pnl',
    aliases: [
      'pnl', 'pl', 'realizedpnl', 'unrealizedpnl', 'daypnl', 'dailypnl',
      'mtdpnl', 'ytdpnl', 'qtdpnl', 'inceptionpnl', 'itdpnl', 'carrypnl',
      'pricepnl', 'priceepnl', 'spreadpnl', 'ratepnl', 'fxpnl', 'financingpnl',
      'commissionpnl', 'stresspnl', 'unrealpnl', 'totalpnl',
    ],
    suffixes: ['pnl', 'pandl'],
    cellRendererId: 'pnl-value',
    alignment: 'right',
  },

  // ─── Change / return (sign-coloured) ──────────────────────────────────
  {
    id: 'change-pct',
    category: 'change',
    aliases: ['pctchange', 'pctchg', 'changepct', 'daychgpct', 'daychangepct', 'pricechangepct', 'returnpct', 'ytdreturn'],
    suffixes: ['chgpct', 'changepct', 'returnpct', 'pctchange'],
    cellRendererId: 'change-value',
    alignment: 'right',
  },
  {
    id: 'change',
    category: 'change',
    aliases: ['change', 'netchange', 'pricechange', 'daychange', 'daychg'],
    suffixes: ['change', 'netchg'],
    cellRendererId: 'signed-value',
    alignment: 'right',
  },

  // ─── Quantities / sizes (int / ccy MM) ────────────────────────────────
  {
    id: 'quantity',
    category: 'quantity',
    aliases: [
      'qty', 'quantity', 'orderqty', 'leavesqty', 'cumqty', 'displayqty',
      'minqty', 'longqty', 'shortqty', 'netqty', 'position', 'sodposition',
      'bidsize', 'asksize', 'rfqsize', 'axesize', 'sharesout', 'floatshares',
      'adv', 'lotsize', 'boughttoday', 'soldtoday', 'tradedtoday', 'origface',
      'currentface', 'currentfacepos', 'issuesize', 'amtoutstanding', 'volume',
      'filled', 'openqty', 'quantityface', 'facevalue', 'shares',
    ],
    suffixes: ['qty', 'size', 'face'],
    format: num(0, true),
    alignment: 'right',
  },

  // ─── Money / value (ccy) ──────────────────────────────────────────────
  {
    id: 'value',
    category: 'value',
    aliases: [
      'marketvalue', 'mktval', 'notional', 'principal', 'accruedint',
      'accruedinterest', 'netmoney', 'commission', 'fees', 'secfee',
      'costbasis', 'bookvalue', 'netsettleamt', 'minpiece', 'increment',
      'marketcap', 'amount', 'avgcostbasis',
    ],
    suffixes: ['value', 'money', 'amount', 'amt'],
    format: num(2, true),
    alignment: 'right',
  },

  // ─── Risk analytics ───────────────────────────────────────────────────
  {
    id: 'duration',
    category: 'risk',
    aliases: ['duration', 'modduration', 'macduration', 'effduration', 'spreadduration', 'oad', 'wal', 'walrisk'],
    suffixes: ['duration'],
    format: num(2, false),
    alignment: 'right',
  },
  {
    id: 'risk-sensitivity',
    category: 'risk',
    aliases: ['dv01', 'pv01', 'cs01', 'ir01', 'spreaddv01', 'netdv01', 'jtd', 'var95', 'vega', 'theta', 'rho'],
    suffixes: ['dv01', 'pv01', 'cs01'],
    format: num(2, true),
    alignment: 'right',
  },
  {
    id: 'greeks-ratio',
    category: 'risk',
    aliases: ['convexity', 'effconvexity', 'oac', 'delta', 'gamma', 'beta', 'dscr', 'hedgeratio', 'indexratio', 'accruedfactor', 'fxrate', 'factor'],
    format: num(4, false),
    alignment: 'right',
  },
  {
    id: 'count',
    category: 'count',
    aliases: ['wam', 'wala', 'seasoning', 'accrueddays', 'ratingnumeric', 'vintage', 'quotecount', 'responsetime', 'faildays', 'version', 'messageseq'],
    format: num(0, true),
    alignment: 'right',
  },

  // ─── Percentages (neutral) ────────────────────────────────────────────
  {
    id: 'percent',
    category: 'percent',
    aliases: [
      'cpr', 'psa', 'smm', 'subordination', 'attachpoint', 'detachpoint', 'ltv',
      'originalltv', 'delinq30', 'delinq60', 'delinq90', 'cdr', 'severity',
      'watchlist', 'creditenh', 'weight', 'allocation', 'percent',
    ],
    suffixes: ['pct', 'percent', 'weight', 'ratio'],
    format: num(2, false),
    alignment: 'right',
  },

  // ─── Ratings (badge) ──────────────────────────────────────────────────
  {
    id: 'rating',
    category: 'rating',
    aliases: ['rating', 'ratingsp', 'ratingmoody', 'ratingfitch', 'ratingcomposite', 'compositerating', 'moodysrating', 'sprating', 'fitchrating', 'moody', 'moodys', 'sp', 'fitch', 'ighy', 'ratingoutlook'],
    suffixes: ['rating'],
    cellRendererId: 'rating-badge',
    alignment: 'center',
  },

  // ─── Side (badge) ─────────────────────────────────────────────────────
  {
    id: 'side',
    category: 'categorical',
    aliases: ['side', 'rfqside', 'direction', 'buysell', 'way', 'axeflag'],
    cellRendererId: 'side',
    alignment: 'center',
  },

  // ─── Status (badge) ───────────────────────────────────────────────────
  {
    id: 'rfq-status',
    category: 'categorical',
    aliases: ['rfqstatus'],
    cellRendererId: 'rfq-status',
    alignment: 'center',
  },
  {
    id: 'status',
    category: 'categorical',
    aliases: ['status', 'ordstatus', 'orderstatus', 'tradestatus', 'allocstatus', 'settlestatus', 'settlementstatus', 'confirmstatus', 'state', 'rowstate'],
    suffixes: ['status'],
    cellRendererId: 'status-badge',
    alignment: 'center',
  },

  // ─── Timestamps (localised date + time) ───────────────────────────────
  {
    id: 'datetime',
    category: 'datetime',
    aliases: [
      'tradetime', 'ordertime', 'expiretime', 'marktime', 'pricetime',
      'quotetime', 'enteredtime', 'lastmodtime', 'lastticktime', 'tracetimestamp',
      'timestamp', 'lastupdate', 'lastupdated', 'updatedat', 'createdat', 'asoftime',
    ],
    suffixes: ['time', 'timestamp', 'datetime'],
    format: { kind: 'preset', preset: 'datetime' },
    alignment: 'left',
  },

  // ─── Dates (localised) ────────────────────────────────────────────────
  {
    id: 'date',
    category: 'date',
    aliases: [
      'date', 'maturity', 'maturitydate', 'tradedate', 'settledate',
      'settlementdate', 'issuedate', 'dateddate', 'firstcpndate', 'nextcpndate',
      'nextcalldate', 'workoutdate', 'auctiondate', 'ratingdate', 'exdivdate',
      'valuedate', 'effectivedate', 'expiry', 'expirydate',
    ],
    suffixes: ['date', 'maturity'],
    format: { kind: 'preset', preset: 'date' },
    alignment: 'left',
  },
];
