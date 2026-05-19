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
  'FN 6.0 TBA', 'T-BILL 3M', 'AAPL 3.85 08/46',
];

const VENUES = ['Bloomberg', 'Tradeweb', 'MarketAxess', 'Voice'];
const COUNTERPARTIES = ['Goldman Sachs', 'JPMorgan', 'Barclays', 'Citi'];
const STATUSES: Order['status'][] = ['OPEN', 'PARTIAL', 'FILLED', 'CANCELLED'];

function rand(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generateOrder(index: number): Order {
  const quantity = Math.round(rand(100, 20000) / 100) * 100;
  const price = rand(85, 115);
  return {
    id: `ORD-${String(index + 1).padStart(5, '0')}`,
    time: new Date(Date.now() - Math.random() * 86400000).toISOString(),
    security: pick(SECURITIES),
    side: Math.random() > 0.5 ? 'BUY' : 'SELL',
    quantity,
    price,
    yield: rand(0.5, 6.5),
    spread: rand(-20, 150),
    filled: 0,
    status: pick(STATUSES),
    venue: pick(VENUES),
    counterparty: pick(COUNTERPARTIES),
    account: 'MAIN-001',
    desk: 'Rates',
    trader: 'A. Smith',
    settlementDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    currency: 'USD',
    notional: Math.round(quantity * price * 10) / 10,
  };
}

export function generateOrders(count = 200): Order[] {
  return Array.from({ length: count }, (_, i) => generateOrder(i));
}
