/**
 * The mock book: 20,000 positions x 52 columns — the shape that makes the
 * 2nd and 3rd CSRM blotter slow (~1M cells materialized per window).
 *
 * Shared by the SharedWorker (which builds and ticks the Table) and by the
 * blotter windows (which build AG Grid column defs from the same schema), so
 * the two can never drift.
 *
 * Data is generated from a seeded PRNG: every window and every run sees the
 * identical book, which is what makes timings comparable between runs.
 */

export const BOOK_NAME = 'blotter';
export const BOOK_ROWS = 20_000;

const STRING_COLUMNS = [
  'positionId',
  'symbol',
  'side',
  'trader',
  'book',
  'currency',
  'sector',
  'exchange',
  'status',
];

const FLOAT_COLUMNS = [
  'quantity', 'price', 'notional', 'marketValue', 'pnl', 'dayPnl', 'mtdPnl',
  'ytdPnl', 'delta', 'gamma', 'vega', 'theta', 'rho', 'bid', 'ask', 'mid',
  'spread', 'high', 'low', 'open', 'close', 'volume', 'vwap', 'duration',
  'convexity', 'yieldPct', 'coupon', 'accrued', 'dv01', 'beta', 'alpha',
  'sharpe', 'var95', 'var99', 'exposure', 'margin', 'fees', 'commission',
  'slippage', 'weight', 'target', 'drift', 'score',
];

/** `[{ name, type }]` — 52 columns, the AG Grid column defs derive from this. */
export const BOOK_COLUMNS = [
  ...STRING_COLUMNS.map((name) => ({ name, type: 'string' })),
  ...FLOAT_COLUMNS.map((name) => ({ name, type: 'float' })),
];

/** Perspective table schema — explicit so column types never depend on the
 *  first batch of data. */
export function bookSchema() {
  const schema = {};
  for (const { name, type } of BOOK_COLUMNS) schema[name] = type;
  return schema;
}

const SYMBOLS = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM', 'BAC', 'GS',
  'XOM', 'CVX', 'PFE', 'MRK', 'KO', 'PEP', 'WMT', 'HD', 'BA', 'CAT',
];
const TRADERS = ['ARao', 'BChen', 'CDiaz', 'DEvans', 'EFischer', 'FGupta', 'GHall', 'HIto'];
const BOOKS = ['EQ-CASH', 'EQ-DERIV', 'FI-GOVT', 'FI-CREDIT', 'FX-SPOT', 'CMD-ENERGY'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF'];
const SECTORS = ['Technology', 'Financials', 'Energy', 'Healthcare', 'Consumer', 'Industrials'];
const EXCHANGES = ['NYSE', 'NASDAQ', 'LSE', 'TSE', 'XETRA'];
const STATUSES = ['Filled', 'Partial', 'Working', 'Cancelled'];

/** mulberry32 — small, fast, deterministic. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build the book column-oriented.
 *
 * Columnar is both cheaper to build in JS and cheaper for Perspective to
 * ingest than an array of 20,000 row objects — the row-object form spends
 * most of its time allocating 1M short-lived property slots.
 */
export function makeBookColumns(rows = BOOK_ROWS, seed = 1) {
  const rand = seeded(seed);
  const columns = {};
  for (const { name } of BOOK_COLUMNS) columns[name] = new Array(rows);

  for (let i = 0; i < rows; i++) {
    const price = 20 + rand() * 480;
    const qty = Math.round((rand() * 20_000 - 10_000) / 10) * 10;
    const spread = price * (0.0002 + rand() * 0.001);
    const pnl = (rand() - 0.5) * 250_000;

    columns.positionId[i] = `POS-${String(i).padStart(6, '0')}`;
    columns.symbol[i] = SYMBOLS[i % SYMBOLS.length];
    columns.side[i] = qty >= 0 ? 'Buy' : 'Sell';
    columns.trader[i] = TRADERS[i % TRADERS.length];
    columns.book[i] = BOOKS[i % BOOKS.length];
    columns.currency[i] = CURRENCIES[i % CURRENCIES.length];
    columns.sector[i] = SECTORS[i % SECTORS.length];
    columns.exchange[i] = EXCHANGES[i % EXCHANGES.length];
    columns.status[i] = STATUSES[i % STATUSES.length];

    columns.quantity[i] = qty;
    columns.price[i] = price;
    columns.notional[i] = qty * price;
    columns.marketValue[i] = qty * price * (1 + (rand() - 0.5) * 0.02);
    columns.pnl[i] = pnl;
    columns.dayPnl[i] = pnl * 0.1 * rand();
    columns.mtdPnl[i] = pnl * 0.6 * rand();
    columns.ytdPnl[i] = pnl * 1.8 * rand();
    columns.delta[i] = rand() * 2 - 1;
    columns.gamma[i] = rand() * 0.2;
    columns.vega[i] = rand() * 50;
    columns.theta[i] = -rand() * 25;
    columns.rho[i] = rand() * 10 - 5;
    columns.bid[i] = price - spread / 2;
    columns.ask[i] = price + spread / 2;
    columns.mid[i] = price;
    columns.spread[i] = spread;
    columns.high[i] = price * (1 + rand() * 0.03);
    columns.low[i] = price * (1 - rand() * 0.03);
    columns.open[i] = price * (1 + (rand() - 0.5) * 0.02);
    columns.close[i] = price;
    columns.volume[i] = Math.round(rand() * 5_000_000);
    columns.vwap[i] = price * (1 + (rand() - 0.5) * 0.004);
    columns.duration[i] = rand() * 12;
    columns.convexity[i] = rand() * 2;
    columns.yieldPct[i] = rand() * 8;
    columns.coupon[i] = rand() * 6;
    columns.accrued[i] = rand() * 1_000;
    columns.dv01[i] = rand() * 500;
    columns.beta[i] = 0.4 + rand() * 1.4;
    columns.alpha[i] = (rand() - 0.5) * 0.1;
    columns.sharpe[i] = (rand() - 0.3) * 3;
    columns.var95[i] = rand() * 80_000;
    columns.var99[i] = rand() * 140_000;
    columns.exposure[i] = Math.abs(qty * price);
    columns.margin[i] = Math.abs(qty * price) * 0.15;
    columns.fees[i] = rand() * 400;
    columns.commission[i] = rand() * 250;
    columns.slippage[i] = (rand() - 0.5) * 0.5;
    columns.weight[i] = rand();
    columns.target[i] = price * (1 + (rand() - 0.5) * 0.15);
    columns.drift[i] = (rand() - 0.5) * 0.05;
    columns.score[i] = rand() * 100;
  }

  return columns;
}

/**
 * A tick: `count` existing positions repriced.
 *
 * Only the index plus the columns that actually move are sent — Perspective
 * partial-updates by index, so an omitted column keeps its value. This is the
 * shape the STOMP feed will produce.
 */
export function makeTickColumns(count, tick, totalRows = BOOK_ROWS) {
  const rand = seeded(0x9e3779b9 ^ tick);
  const positionId = new Array(count);
  const price = new Array(count);
  const bid = new Array(count);
  const ask = new Array(count);
  const dayPnl = new Array(count);
  const volume = new Array(count);

  for (let i = 0; i < count; i++) {
    const row = Math.floor(rand() * totalRows);
    const px = 20 + rand() * 480;
    positionId[i] = `POS-${String(row).padStart(6, '0')}`;
    price[i] = px;
    bid[i] = px * 0.9995;
    ask[i] = px * 1.0005;
    dayPnl[i] = (rand() - 0.5) * 40_000;
    volume[i] = Math.round(rand() * 5_000_000);
  }

  return { positionId, price, bid, ask, dayPnl, volume };
}
