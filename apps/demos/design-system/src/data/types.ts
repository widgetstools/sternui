export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'working' | 'filled' | 'cancelled';
export type Direction = 'up' | 'down' | 'flat';

export interface Instrument {
  id: string;          // stable row id
  cusip: string;
  ticker: string;
  description: string;
  coupon: number;      // %
  maturity: string;    // ISO date
  rating: string;      // e.g. 'AA', 'BBB+'
  sector: string;
  currency: string;    // 'USD'
}

export interface Quote {
  id: string;          // === Instrument.id
  bid: number;
  mid: number;
  ask: number;
  last: number;
  ytm: number;         // yield to maturity, %
  oas: number;         // bps
  dv01: number;
  changePct: number;   // session % change
  dir: Direction;      // last tick direction (drives flash)
}

export interface Order {
  id: string;
  instrumentId: string;
  ticker: string;
  side: OrderSide;
  qty: number;
  price: number;
  status: OrderStatus;
  ts: number;          // epoch ms (passed in, never Date.now() in reducers)
}

export interface Position {
  instrumentId: string;
  ticker: string;
  qty: number;
  avgCost: number;
  marketValue: number;
  unrealizedPnl: number;
  dv01: number;
}

export interface TerminalState {
  instruments: Instrument[];
  quotes: Record<string, Quote>;   // keyed by id
  orders: Order[];
  positions: Position[];
  /** Yield-curve points {tenorYears, yield%} for the Analytics chart. */
  curve: { tenor: number; yield: number }[];
  /** Rolling price history per instrument id (last N mids) for PriceChart. */
  history: Record<string, number[]>;
}
