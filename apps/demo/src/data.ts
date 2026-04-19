// ─── Sample FI Trading Data ──────────────────────────────────────────────────

export interface Order {
  id: string;
  time: string;
  security: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  yield: number;
  spread: number;
  filled: number;
  status: 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED';
  venue: string;
  counterparty: string;
  account: string;
  desk: string;
  trader: string;
  settlementDate: string;
  currency: string;
  notional: number;
}

const SECURITIES = [
  'UST 2Y 4.25 03/26', 'UST 5Y 4.00 03/29', 'UST 10Y 3.875 02/34',
  'UST 30Y 4.125 02/54', 'TIPS 10Y 1.75 01/34', 'FN 6.0 TBA',
  'FN 5.5 TBA', 'GN 5.0 TBA', 'T-BILL 3M', 'T-BILL 6M',
  'IG CDX 5Y', 'HY CDX 5Y', 'BUND 10Y 2.50', 'JGB 10Y 0.75',
  'GILT 10Y 4.00', 'AAPL 3.85 08/46', 'MSFT 2.40 08/26',
  'JPM 4.25 11/27', 'GS 3.50 01/28', 'WFC 4.10 06/26',
];

const VENUES = ['Bloomberg', 'Tradeweb', 'MarketAxess', 'ICE', 'Direct', 'Voice'];
const COUNTERPARTIES = ['Goldman Sachs', 'Morgan Stanley', 'JPMorgan', 'Barclays', 'Citi', 'BofA', 'Deutsche Bank', 'UBS'];
const ACCOUNTS = ['MAIN-001', 'HEDGE-002', 'PROP-003', 'CLIENT-004', 'REPO-005'];
const DESKS = ['Rates', 'Credit', 'Structured', 'MBS', 'Munis'];
const TRADERS = ['A. Smith', 'J. Chen', 'M. Williams', 'S. Patel', 'K. Johnson', 'R. Garcia'];
const STATUSES: Order['status'][] = ['OPEN', 'PARTIAL', 'FILLED', 'CANCELLED'];

function rand(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateOrder(index: number): Order {
  const quantity = Math.round(rand(100, 50000) / 100) * 100;
  const filled = pick(STATUSES) === 'FILLED' ? quantity : Math.round(Math.random() * quantity / 100) * 100;
  const price = rand(85, 115);
  return {
    id: `ORD-${String(index + 1).padStart(5, '0')}`,
    time: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString(),
    security: pick(SECURITIES),
    side: Math.random() > 0.5 ? 'BUY' : 'SELL',
    quantity,
    price,
    yield: rand(0.5, 6.5),
    spread: rand(-20, 150),
    filled,
    status: filled >= quantity ? 'FILLED' : filled > 0 ? 'PARTIAL' : pick(['OPEN', 'CANCELLED']),
    venue: pick(VENUES),
    counterparty: pick(COUNTERPARTIES),
    account: pick(ACCOUNTS),
    desk: pick(DESKS),
    trader: pick(TRADERS),
    settlementDate: new Date(Date.now() + rand(1, 5) * 86400000).toISOString().slice(0, 10),
    currency: 'USD',
    notional: Math.round(quantity * price * 10) / 10,
  };
}

export function generateOrders(count: number = 200): Order[] {
  return Array.from({ length: count }, (_, i) => generateOrder(i));
}

// ─── Second dataset for the two-grid dashboard ─────────────────────────
//
// Uses the same `Order` shape so we can share columnDefs, but skews the
// security list towards equities + names the ids / accounts / desks
// differently so users can see at a glance that the two grids render
// independent data.

const EQUITY_SECURITIES = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD',
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BK', 'SCHW',
  'XOM', 'CVX', 'COP', 'SLB',
  'JNJ', 'PFE', 'MRK', 'LLY',
  'WMT', 'COST', 'TGT', 'HD', 'LOW',
];

const EQUITY_VENUES = ['NYSE', 'NASDAQ', 'ARCA', 'BATS', 'IEX'];
const EQUITY_DESKS = ['Cash Equities', 'Program Trading', 'ETF Desk', 'Prime Brokerage'];

function generateEquityOrder(index: number): Order {
  const quantity = Math.round(rand(50, 25000) / 50) * 50;
  const filledStatus = pick(STATUSES);
  const filled =
    filledStatus === 'FILLED' ? quantity : Math.round(Math.random() * quantity / 50) * 50;
  const price = rand(10, 500);
  return {
    id: `EQ-${String(index + 1).padStart(5, '0')}`,
    time: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString(),
    security: pick(EQUITY_SECURITIES),
    side: Math.random() > 0.5 ? 'BUY' : 'SELL',
    quantity,
    price,
    yield: rand(0.1, 4.5), // dividend yield proxy
    spread: rand(-5, 20), // bid-ask cents
    filled,
    status: filled >= quantity ? 'FILLED' : filled > 0 ? 'PARTIAL' : pick(['OPEN', 'CANCELLED']),
    venue: pick(EQUITY_VENUES),
    counterparty: pick(COUNTERPARTIES),
    account: pick(ACCOUNTS),
    desk: pick(EQUITY_DESKS),
    trader: pick(TRADERS),
    settlementDate: new Date(Date.now() + rand(1, 2) * 86400000).toISOString().slice(0, 10),
    currency: 'USD',
    notional: Math.round(quantity * price * 10) / 10,
  };
}

export function generateEquityOrders(count: number = 300): Order[] {
  return Array.from({ length: count }, (_, i) => generateEquityOrder(i));
}
